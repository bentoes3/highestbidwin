import {
  createRoomState,
  applyRoomAction,
  advanceRoomTime,
  publicRoomState,
} from '../../online/engine.mjs';
import { PLAYER_POOLS } from '../_shared/player-pools.mjs';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const ROOM_LIFETIME_MS = 3 * 60 * 60 * 1000;
const MAX_BODY_LENGTH = 2048;
let schemaPromise;

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function fail(message, status) {
  return json({ error: message }, status);
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, byte => CODE_ALPHABET[byte & 31]).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function secureRandom() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
}

async function hashToken(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeCode(value) {
  const code = typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : '';
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code) ? code : null;
}

function validToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function validVersion(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

async function ensureSchema(db) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        sport TEXT NOT NULL,
        mode TEXT NOT NULL,
        seat1_hash TEXT NOT NULL,
        seat2_hash TEXT,
        state TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS rooms_expires_at ON rooms(expires_at)').run();
    })().catch(error => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

async function readRoom(db, code, now) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
    if (!row) return { error: fail('Room not found. Check the code and try again.', 404) };
    if (row.expires_at <= now) return { error: fail('This room has expired. Create a new room to play.', 410) };

    const state = JSON.parse(row.state);
    advanceRoomTime(state, now);
    const nextState = JSON.stringify(state);
    if (nextState === row.state) return { row, state };

    const updated = await db.prepare(`UPDATE rooms
      SET state = ?, version = version + 1
      WHERE code = ? AND version = ?`)
      .bind(nextState, code, row.version).run();
    if (updated.meta.changes === 1) {
      return { row: { ...row, state: nextState, version: row.version + 1 }, state };
    }
  }
  return { error: fail('The room changed just now. Please try again.', 409) };
}

function roomResponse(row, state, seat, token) {
  const result = {
    code: row.code,
    seat,
    joined: !!row.seat2_hash,
    version: row.version,
    state: publicRoomState(state),
  };
  if (token) result.token = token;
  return json(result);
}

async function authenticatedRoom(db, body, now) {
  const code = normalizeCode(body.code);
  if (!code) return { error: fail('Enter a valid room code.', 400) };
  if (!validToken(body.token)) return { error: fail('Your player session is missing. Rejoin with the room code.', 403) };
  const loaded = await readRoom(db, code, now);
  if (loaded.error) return loaded;
  const hash = await hashToken(body.token);
  const seat = hash === loaded.row.seat1_hash ? 1 : hash === loaded.row.seat2_hash ? 2 : null;
  if (!seat) return { error: fail('This player session does not belong to the room.', 403) };
  return { ...loaded, seat };
}

async function create(db, body, now) {
  const { sport, mode } = body;
  const pool = PLAYER_POOLS[sport]?.[mode];
  if (!pool) return fail('Choose a valid sport and game mode.', 400);

  // A new room is a natural opportunity to clear old private tokens and game state.
  await db.prepare('DELETE FROM rooms WHERE expires_at <= ?').bind(now).run();
  const state = createRoomState({ sport, mode, pool, now, rng: secureRandom });
  const token = randomToken();
  const tokenHash = await hashToken(token);

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    const result = await db.prepare(`INSERT OR IGNORE INTO rooms
      (code, sport, mode, seat1_hash, seat2_hash, state, version, created_at, expires_at)
      VALUES (?, ?, ?, ?, NULL, ?, 0, ?, ?)`)
      .bind(code, sport, mode, tokenHash, JSON.stringify(state), now, now + ROOM_LIFETIME_MS).run();
    if (result.meta.changes === 1) {
      return roomResponse({ code, seat2_hash: null, version: 0 }, state, 1, token);
    }
  }
  return fail('Could not create a room right now. Please try again.', 503);
}

async function join(db, body, now) {
  const code = normalizeCode(body.code);
  if (!code) return fail('Enter a valid room code.', 400);
  const token = randomToken();
  const tokenHash = await hashToken(token);

  for (let attempt = 0; attempt < 5; attempt++) {
    const loaded = await readRoom(db, code, now);
    if (loaded.error) return loaded.error;
    const { row, state } = loaded;
    if (row.seat2_hash) return fail('This room already has two players.', 409);
    state.version = row.version + 1;
    const nextState = JSON.stringify(state);
    const result = await db.prepare(`UPDATE rooms
      SET seat2_hash = ?, state = ?, version = version + 1
      WHERE code = ? AND seat2_hash IS NULL AND version = ?`)
      .bind(tokenHash, nextState, code, row.version).run();
    if (result.meta.changes === 1) {
      return roomResponse({ ...row, seat2_hash: tokenHash, state: nextState, version: row.version + 1 }, state, 2, token);
    }
  }
  return fail('The room changed just now. Please try again.', 409);
}

async function sync(db, body, now) {
  const loaded = await authenticatedRoom(db, body, now);
  if (loaded.error) return loaded.error;
  return roomResponse(loaded.row, loaded.state, loaded.seat);
}

async function action(db, body, now) {
  if (!validVersion(body.version) || !body.action || typeof body.action !== 'object' || Array.isArray(body.action)) {
    return fail('This move is invalid. Refresh the room and try again.', 400);
  }
  const loaded = await authenticatedRoom(db, body, now);
  if (loaded.error) return loaded.error;
  const { row, state, seat } = loaded;
  if (!row.seat2_hash) return fail('Wait for your friend to join before starting.', 409);
  if (body.version !== row.version) {
    return json({ error: 'The room has moved on. Your screen is updating.',
      code: row.code, seat, joined: true, version: row.version, state: publicRoomState(state) }, 409);
  }

  try {
    applyRoomAction(state, seat - 1, body.action, { now, rng: secureRandom });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'This move is not available now.', 409);
  }

  const nextState = JSON.stringify(state);
  if (nextState === row.state) return roomResponse(row, state, seat);
  const result = await db.prepare(`UPDATE rooms
    SET state = ?, version = version + 1, expires_at = ?
    WHERE code = ? AND version = ?`)
    .bind(nextState, now + ROOM_LIFETIME_MS, row.code, row.version).run();
  if (result.meta.changes !== 1) {
    const latest = await readRoom(db, row.code, now);
    if (latest.error) return latest.error;
    return json({ error: 'The room has moved on. Your screen is updating.',
      code: row.code, seat, joined: true, version: latest.row.version,
      state: publicRoomState(latest.state) }, 409);
  }
  return roomResponse({ ...row, state: nextState, version: row.version + 1 }, state, seat);
}

async function leave(db, body, now) {
  const loaded = await authenticatedRoom(db, body, now);
  if (loaded.error) return loaded.error;
  const { row, seat } = loaded;
  if (seat === 1 && !row.seat2_hash) {
    await db.prepare(`DELETE FROM rooms
      WHERE code = ? AND seat1_hash = ? AND seat2_hash IS NULL AND version = ?`)
      .bind(row.code, row.seat1_hash, row.version).run();
  }
  return json({ left: true });
}

export async function onRequestPost({ request, env }) {
  if (!env?.ROOMS_DB) return fail('Online rooms are not configured yet.', 503);
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_LENGTH) return fail('This request is too large.', 413);
    let body;
    try { body = JSON.parse(raw); }
    catch { return fail('Send a valid room request.', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Send a valid room request.', 400);

    await ensureSchema(env.ROOMS_DB);
    const now = Date.now();
    if (body.op === 'create') return await create(env.ROOMS_DB, body, now);
    if (body.op === 'join') return await join(env.ROOMS_DB, body, now);
    if (body.op === 'sync') return await sync(env.ROOMS_DB, body, now);
    if (body.op === 'action') return await action(env.ROOMS_DB, body, now);
    if (body.op === 'leave') return await leave(env.ROOMS_DB, body, now);
    return fail('Choose a valid room request.', 400);
  } catch {
    return fail('Online rooms are temporarily unavailable. Please try again.', 503);
  }
}
