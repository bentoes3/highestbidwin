import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onRequestPost } from '../functions/api/room.js';

class FakeD1 {
  rooms = new Map();
  presence = new Map();

  prepare(sql) {
    const db = this;
    const query = sql.replace(/\s+/g, ' ').trim().toUpperCase();
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() {
        if (query.startsWith('SELECT * FROM ROOM_PRESENCE WHERE CODE = ?')) {
          const row = db.presence.get(args[0]);
          return row ? { ...row } : null;
        }
        assert.match(query, /^SELECT \* FROM ROOMS WHERE CODE = \?/);
        const row = db.rooms.get(args[0]);
        return row ? { ...row } : null;
      },
      async run() {
        if (query.startsWith('CREATE TABLE') || query.startsWith('CREATE INDEX')) return { meta: { changes: 0 } };
        if (query.startsWith('INSERT INTO ROOM_PRESENCE')) {
          const [code, seat1_seen_at] = args;
          db.presence.set(code, { code, seat1_seen_at, seat2_seen_at: null });
          return { meta: { changes: 1 } };
        }
        if (query.startsWith('INSERT OR IGNORE INTO ROOM_PRESENCE')) {
          const [code, seat1_seen_at, seat2_seen_at] = args;
          if (db.presence.has(code)) return { meta: { changes: 0 } };
          db.presence.set(code, { code, seat1_seen_at, seat2_seen_at });
          return { meta: { changes: 1 } };
        }
        if (query === 'UPDATE ROOM_PRESENCE SET SEAT2_SEEN_AT = ? WHERE CODE = ?') {
          const [seen, code] = args;
          const row = db.presence.get(code);
          if (!row) return { meta: { changes: 0 } };
          row.seat2_seen_at = seen;
          return { meta: { changes: 1 } };
        }
        if (query.startsWith('UPDATE ROOM_PRESENCE SET SEAT1_SEEN_AT')) {
          const [seen, code, before] = args;
          const row = db.presence.get(code);
          if (!row || row.seat1_seen_at >= before) return { meta: { changes: 0 } };
          row.seat1_seen_at = seen;
          return { meta: { changes: 1 } };
        }
        if (query.startsWith('UPDATE ROOM_PRESENCE SET SEAT2_SEEN_AT')) {
          const [seen, code, before] = args;
          const row = db.presence.get(code);
          if (!row || (row.seat2_seen_at != null && row.seat2_seen_at >= before)) return { meta: { changes: 0 } };
          row.seat2_seen_at = seen;
          return { meta: { changes: 1 } };
        }
        if (query.startsWith('DELETE FROM ROOM_PRESENCE WHERE CODE IN')) {
          let changes = 0;
          for (const [code, row] of db.rooms) {
            if (row.expires_at <= args[0] && db.presence.delete(code)) changes++;
          }
          return { meta: { changes } };
        }
        if (query.startsWith('DELETE FROM ROOM_PRESENCE WHERE NOT EXISTS')) {
          let changes = 0;
          for (const code of db.presence.keys()) {
            if (!db.rooms.has(code)) { db.presence.delete(code); changes++; }
          }
          return { meta: { changes } };
        }
        if (query.startsWith('DELETE FROM ROOM_PRESENCE WHERE CODE = ?')) {
          return { meta: { changes: db.presence.delete(args[0]) ? 1 : 0 } };
        }
        if (query.startsWith('INSERT OR IGNORE INTO ROOMS')) {
          const [code, sport, mode, seat1_hash, state, created_at, expires_at] = args;
          if (db.rooms.has(code)) return { meta: { changes: 0 } };
          db.rooms.set(code, { code, sport, mode, seat1_hash, seat2_hash: null, state, version: 0, created_at, expires_at });
          return { meta: { changes: 1 } };
        }
        if (query.startsWith('DELETE FROM ROOMS WHERE EXPIRES_AT')) {
          const [now, hostCutoff, guestCutoff] = args;
          let changes = 0;
          for (const [code, row] of db.rooms) {
            const presence = db.presence.get(code);
            if (row.expires_at <= now || (presence && (presence.seat1_seen_at <= hostCutoff ||
              (row.seat2_hash && (presence.seat2_seen_at ?? row.created_at) <= guestCutoff)))) {
              db.rooms.delete(code); changes++;
            }
          }
          return { meta: { changes } };
        }
        if (query.startsWith('DELETE FROM ROOMS WHERE CODE = ? AND VERSION = ? AND EXISTS')) {
          const [code, version, hostCutoff, guestCutoff] = args;
          const row = db.rooms.get(code);
          const presence = db.presence.get(code);
          if (!row || row.version !== version || !presence ||
            !(presence.seat1_seen_at <= hostCutoff ||
              (row.seat2_hash && (presence.seat2_seen_at ?? row.created_at) <= guestCutoff))) {
            return { meta: { changes: 0 } };
          }
          db.rooms.delete(code);
          return { meta: { changes: 1 } };
        }
        if (query.startsWith('DELETE FROM ROOMS WHERE CODE = ? AND (SEAT1_HASH')) {
          const [code, hostHash, guestHash] = args;
          const row = db.rooms.get(code);
          if (!row || (row.seat1_hash !== hostHash && row.seat2_hash !== guestHash)) {
            return { meta: { changes: 0 } };
          }
          db.rooms.delete(code);
          return { meta: { changes: 1 } };
        }
        if (query.startsWith('DELETE FROM ROOMS')) {
          const [code, hash, version] = args;
          const row = db.rooms.get(code);
          if (!row || row.seat1_hash !== hash || row.seat2_hash !== null || row.version !== version) return { meta: { changes: 0 } };
          db.rooms.delete(code);
          return { meta: { changes: 1 } };
        }
        if (query.startsWith('UPDATE ROOMS') && query.includes('SET SEAT2_HASH')) {
          const [hash, state, code, version] = args;
          const row = db.rooms.get(code);
          if (!row || row.seat2_hash !== null || row.version !== version) return { meta: { changes: 0 } };
          Object.assign(row, { seat2_hash: hash, state, version: version + 1 });
          return { meta: { changes: 1 } };
        }
        if (query.startsWith('UPDATE ROOMS SET EXPIRES_AT = ? WHERE CODE = ? AND EXPIRES_AT < ?')) {
          const [expires_at, code, before] = args;
          const row = db.rooms.get(code);
          if (!row || row.expires_at >= before) return { meta: { changes: 0 } };
          row.expires_at = expires_at;
          return { meta: { changes: 1 } };
        }
        if (query.startsWith('UPDATE ROOMS') && query.includes('EXPIRES_AT =')) {
          const [state, expires_at, code, version] = args;
          const row = db.rooms.get(code);
          if (!row || row.version !== version) return { meta: { changes: 0 } };
          Object.assign(row, { state, expires_at, version: version + 1 });
          return { meta: { changes: 1 } };
        }
        if (query.startsWith('UPDATE ROOMS') && query.includes('SET STATE =')) {
          const [state, code, version] = args;
          const row = db.rooms.get(code);
          if (!row || row.version !== version) return { meta: { changes: 0 } };
          Object.assign(row, { state, version: version + 1 });
          return { meta: { changes: 1 } };
        }
        throw Error(`Unexpected D1 statement: ${query}`);
      },
    };
  }
}

async function call(db, body) {
  const request = new Request('https://example.test/api/room', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const response = await onRequestPost({ request, env: db ? { ROOMS_DB: db } : {} });
  return { status: response.status, body: await response.json() };
}

test('a room requires a configured backend and valid input', async () => {
  const unavailable = await call(null, { op: 'create', sport: 'football', mode: 'current' });
  assert.equal(unavailable.status, 503);
  const db = new FakeD1();
  const invalid = await call(db, { op: 'create', sport: 'cricket', mode: 'current' });
  assert.equal(invalid.status, 400);
});

test('database failures return a controlled error', async () => {
  const db = { prepare() { throw Error('Database unavailable'); } };
  const result = await call(db, { op: 'create', sport: 'football', mode: 'current' });
  assert.equal(result.status, 503);
  assert.match(result.body.error, /temporarily unavailable/);
});

test('two private seats join one room; a third player and wrong token cannot enter', async () => {
  const db = new FakeD1();
  const host = await call(db, { op: 'create', sport: 'basketball', mode: 'prime' });
  assert.equal(host.status, 200);
  assert.match(host.body.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(host.body.seat, 1);
  assert.equal(host.body.joined, false);
  assert.equal(host.body.version, 0);
  assert.equal(host.body.state.sport, 'basketball');
  assert.equal(host.body.state.mode, 'prime');
  assert.equal(host.body.state.pool, undefined);
  assert.equal(host.body.state.deck, undefined);
  assert.equal(host.body.state.version, host.body.version);

  const guest = await call(db, { op: 'join', code: host.body.code.toLowerCase() });
  assert.equal(guest.status, 200);
  assert.equal(guest.body.seat, 2);
  assert.equal(guest.body.joined, true);
  assert.equal(guest.body.version, 1);
  assert.equal(guest.body.state.version, guest.body.version);
  assert.notEqual(guest.body.token, host.body.token);
  assert.equal((await call(db, { op: 'join', code: host.body.code })).status, 409);

  const synced = await call(db, { op: 'sync', code: host.body.code, token: host.body.token });
  assert.equal(synced.status, 200);
  assert.equal(synced.body.joined, true);
  assert.equal(synced.body.token, undefined);
  assert.equal((await call(db, { op: 'sync', code: host.body.code, token: guest.body.token })).body.seat, 2);
  assert.equal((await call(db, { op: 'sync', code: host.body.code, token: 'x'.repeat(43) })).status, 403);
});

test('a guest can retry the same join after a lost response without taking another seat', async () => {
  const db = new FakeD1();
  const host = (await call(db, { op: 'create', sport: 'football', mode: 'current' })).body;
  const token = 'A'.repeat(43);
  const first = await call(db, { op: 'join', code: host.code, token });
  const retry = await call(db, { op: 'join', code: host.code, token });
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(first.body.seat, 2);
  assert.equal(retry.body.seat, 2);
  assert.equal(retry.body.version, first.body.version);
  assert.equal(retry.body.token, token);
  assert.equal((await call(db, { op: 'join', code: host.code, token: 'B'.repeat(43) })).status, 409);
  assert.equal((await call(db, { op: 'join', code: host.code, token: 'invalid' })).status, 400);
});

test('the server enforces action seats, versions, and delayed reveal phases', async () => {
  const db = new FakeD1();
  const host = (await call(db, { op: 'create', sport: 'football', mode: 'current' })).body;
  const guest = (await call(db, { op: 'join', code: host.code })).body;
  const base = { code: host.code, token: host.token, version: guest.version };

  const guestToss = await call(db, { op: 'action', code: host.code, token: guest.token, version: guest.version, action: { type: 'toss' } });
  assert.equal(guestToss.status, 409);
  assert.equal(guestToss.body.token, undefined);

  const toss = await call(db, { op: 'action', ...base, action: { type: 'toss' } });
  assert.equal(toss.status, 200);
  assert.equal(toss.body.state.phase, 'tossing');
  assert.equal(toss.body.state.firstBidder, null);
  assert.equal(toss.body.state.version, toss.body.version);
  const stale = await call(db, { op: 'action', ...base, action: { type: 'toss' } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.version, toss.body.version);

  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 10_000;
    const ready = await call(db, { op: 'sync', code: host.code, token: guest.token });
    assert.equal(ready.status, 200);
    assert.equal(ready.body.state.phase, 'ready');
    assert.equal(ready.body.state.version, ready.body.version);
    const spinner = ready.body.state.firstBidder === 0 ? host : guest;
    const spinning = await call(db, { op: 'action', code: host.code, token: spinner.token,
      version: ready.body.version, action: { type: 'spin' } });
    assert.equal(spinning.status, 200);
    assert.equal(spinning.body.state.phase, 'spinning');
    assert.equal(spinning.body.state.current, null);
    Date.now = () => originalNow() + 20_000;
    const bidding = await call(db, { op: 'sync', code: host.code, token: guest.token });
    assert.equal(bidding.status, 200);
    assert.equal(bidding.body.state.phase, 'bidding');
    assert.equal(bidding.body.state.version, bidding.body.version);
  } finally {
    Date.now = originalNow;
  }
});

test('two actions at the same version cannot overwrite each other', async () => {
  const db = new FakeD1();
  const host = (await call(db, { op: 'create', sport: 'football', mode: 'prime' })).body;
  const guest = (await call(db, { op: 'join', code: host.code })).body;
  const body = { op: 'action', code: host.code, token: host.token, version: guest.version, action: { type: 'toss' } };
  const results = await Promise.all([call(db, body), call(db, body)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(db.rooms.get(host.code).version, guest.version + 1);
});

test('the host can close a waiting room, while leaving a joined room keeps reconnect possible', async () => {
  const db = new FakeD1();
  const waiting = (await call(db, { op: 'create', sport: 'football', mode: 'current' })).body;
  assert.equal((await call(db, { op: 'leave', code: waiting.code, token: waiting.token })).status, 200);
  assert.equal((await call(db, { op: 'sync', code: waiting.code, token: waiting.token })).status, 410);

  const host = (await call(db, { op: 'create', sport: 'football', mode: 'current' })).body;
  await call(db, { op: 'join', code: host.code });
  assert.equal((await call(db, { op: 'leave', code: host.code, token: host.token })).status, 200);
  assert.equal((await call(db, { op: 'sync', code: host.code, token: host.token })).status, 200);
});

test('expired rooms cannot be resumed and are cleared when a new room is created', async () => {
  const db = new FakeD1();
  const host = (await call(db, { op: 'create', sport: 'football', mode: 'current' })).body;
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 4 * 60 * 60 * 1000;
    assert.equal((await call(db, { op: 'sync', code: host.code, token: host.token })).status, 410);
    assert.equal((await call(db, { op: 'join', code: host.code })).status, 410);
    assert.equal((await call(db, { op: 'create', sport: 'basketball', mode: 'current' })).status, 200);
    assert.equal(db.rooms.has(host.code), false);
  } finally {
    Date.now = originalNow;
  }
});

test('a hidden or closed player pauses a joined room after one minute and reconnecting resumes it', async () => {
  const db = new FakeD1();
  const originalNow = Date.now;
  const start = originalNow();
  try {
    Date.now = () => start;
    const host = (await call(db, { op: 'create', sport: 'football', mode: 'current' })).body;
    const guest = (await call(db, { op: 'join', code: host.code })).body;
    assert.deepEqual(guest.presence, { inactive: [false, false], paused: false });
    assert.equal(db.rooms.get(host.code).version, guest.version);

    Date.now = () => start + 59_000;
    const before = await call(db, { op: 'sync', code: host.code, token: host.token, visible: true });
    assert.deepEqual(before.body.presence, { inactive: [false, false], paused: false });
    assert.equal(before.body.version, guest.version);
    assert.equal(db.rooms.get(host.code).version, guest.version);

    Date.now = () => start + 60_000;
    const away = await call(db, { op: 'sync', code: host.code, token: host.token, visible: true });
    assert.deepEqual(away.body.presence, { inactive: [false, true], paused: true });
    const hidden = await call(db, { op: 'sync', code: host.code, token: guest.token, visible: false });
    assert.deepEqual(hidden.body.presence, away.body.presence);
    const stopped = await call(db, { op: 'action', code: host.code, token: host.token,
      version: guest.version, action: { type: 'toss' } });
    assert.equal(stopped.status, 409);
    assert.match(stopped.body.error, /paused/i);
    assert.deepEqual(stopped.body.presence, away.body.presence);
    assert.equal(stopped.body.version, guest.version);
    assert.equal(stopped.body.state.phase, 'toss-ready');
    assert.deepEqual(stopped.body.state.teams.map(team => team.money), [20, 20]);
    assert.equal(db.rooms.get(host.code).version, guest.version);

    const back = await call(db, { op: 'sync', code: host.code, token: guest.token, visible: true });
    assert.deepEqual(back.body.presence, { inactive: [false, false], paused: false });
    assert.equal(back.body.version, guest.version);
    const resumed = await call(db, { op: 'action', code: host.code, token: host.token,
      version: guest.version, action: { type: 'toss' } });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.state.phase, 'tossing');
    assert.deepEqual(resumed.body.state.teams.map(team => team.money), [20, 20]);
  } finally {
    Date.now = originalNow;
  }
});

test('inactivity can pause either seat; legacy visible polls and joining again restore presence', async () => {
  const db = new FakeD1();
  const originalNow = Date.now;
  const start = originalNow();
  try {
    Date.now = () => start;
    const host = (await call(db, { op: 'create', sport: 'basketball', mode: 'current' })).body;
    const guest = (await call(db, { op: 'join', code: host.code })).body;
    Date.now = () => start + 45_000;
    // Old clients omit `visible`; they still count as active until upgraded.
    await call(db, { op: 'sync', code: host.code, token: host.token });
    await call(db, { op: 'sync', code: host.code, token: guest.token, visible: true });

    Date.now = () => start + 91_000;
    const activeGuest = await call(db, { op: 'sync', code: host.code, token: guest.token, visible: true });
    assert.deepEqual(activeGuest.body.presence, { inactive: [false, false], paused: false });
    Date.now = () => start + 105_000;
    const hostGone = await call(db, { op: 'sync', code: host.code, token: guest.token, visible: true });
    assert.deepEqual(hostGone.body.presence, { inactive: [true, false], paused: true });
    assert.equal(hostGone.body.version, guest.version);

    // A retry with the same private token restores the seat, without
    // changing its identity or the room's action version.
    const returned = await call(db, { op: 'sync', code: host.code, token: host.token });
    assert.deepEqual(returned.body.presence, { inactive: [false, false], paused: false });
    assert.equal(returned.body.version, guest.version);
    Date.now = () => start + 166_000;
    await call(db, { op: 'sync', code: host.code, token: host.token });
    const guestGone = await call(db, { op: 'sync', code: host.code, token: guest.token, visible: false });
    assert.deepEqual(guestGone.body.presence, { inactive: [false, true], paused: true });
    const rejoined = await call(db, { op: 'join', code: host.code, token: guest.token });
    assert.equal(rejoined.status, 200);
    assert.deepEqual(rejoined.body.presence, { inactive: [false, false], paused: false });
    assert.equal(rejoined.body.version, guest.version);
  } finally {
    Date.now = originalNow;
  }
});

test('existing rooms gain presence on first sync without changing game state', async () => {
  const db = new FakeD1();
  const host = (await call(db, { op: 'create', sport: 'football', mode: 'prime' })).body;
  const guest = (await call(db, { op: 'join', code: host.code })).body;
  db.presence.delete(host.code);
  const restored = await call(db, { op: 'sync', code: host.code, token: host.token });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.version, guest.version);
  assert.deepEqual(restored.body.presence, { inactive: [false, false], paused: false });
  assert.deepEqual(restored.body.state.teams.map(team => team.money), [20, 20]);
});

test('rejoining an existing seat repairs a missing guest heartbeat', async () => {
  const db = new FakeD1();
  const host = (await call(db, { op: 'create', sport: 'football', mode: 'current' })).body;
  const guest = (await call(db, { op: 'join', code: host.code })).body;
  db.presence.get(host.code).seat2_seen_at = null;
  const retry = await call(db, { op: 'join', code: host.code, token: guest.token });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.version, guest.version);
  assert.deepEqual(retry.body.presence, { inactive: [false, false], paused: false });
  assert.equal(typeof db.presence.get(host.code).seat2_seen_at, 'number');
});

test('either joined player can end a room, and the other player cannot recover or act in it', async () => {
  const db = new FakeD1();
  for (const endingSeat of [1, 2]) {
    const host = (await call(db, { op: 'create', sport: 'football', mode: 'current' })).body;
    const guest = (await call(db, { op: 'join', code: host.code })).body;
    const toss = await call(db, { op: 'action', code: host.code, token: host.token,
      version: guest.version, action: { type: 'toss' } });
    assert.equal(toss.status, 200);
    // Cover both a game in progress and its final result screen.
    if (endingSeat === 2) {
      const row = db.rooms.get(host.code);
      row.state = JSON.stringify({ ...JSON.parse(row.state), phase: 'done' });
    }
    const endingPlayer = endingSeat === 1 ? host : guest;
    const otherPlayer = endingSeat === 1 ? guest : host;
    const wrongToken = await call(db, { op: 'end', code: host.code, token: 'x'.repeat(43) });
    assert.equal(wrongToken.status, 403);
    assert.equal(db.rooms.has(host.code), true);

    const ended = await call(db, { op: 'end', code: host.code, token: endingPlayer.token });
    assert.equal(ended.status, 200);
    assert.deepEqual(ended.body, { ended: true });
    assert.equal(db.rooms.has(host.code), false);
    assert.equal(db.presence.has(host.code), false);
    assert.equal((await call(db, { op: 'end', code: host.code, token: endingPlayer.token })).status, 200);

    for (const body of [
      { op: 'sync', code: host.code, token: otherPlayer.token },
      { op: 'join', code: host.code },
      { op: 'action', code: host.code, token: otherPlayer.token, version: toss.body.version, action: { type: 'toss' } },
    ]) {
      const response = await call(db, body);
      assert.equal(response.status, 410);
      assert.match(response.body.error, /ended or expired/i);
    }
  }
});

test('the host can end a waiting room without a guest', async () => {
  const db = new FakeD1();
  const host = (await call(db, { op: 'create', sport: 'basketball', mode: 'current' })).body;
  assert.equal((await call(db, { op: 'end', code: host.code, token: host.token })).status, 200);
  assert.equal((await call(db, { op: 'join', code: host.code })).status, 410);
});

test('a joined room retires after one player is away for fifteen minutes, not after the one-minute pause', async () => {
  const db = new FakeD1();
  const originalNow = Date.now;
  const start = originalNow();
  try {
    Date.now = () => start;
    const host = (await call(db, { op: 'create', sport: 'football', mode: 'current' })).body;
    const guest = (await call(db, { op: 'join', code: host.code })).body;
    Date.now = () => start + 60_000;
    const paused = await call(db, { op: 'sync', code: host.code, token: host.token });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.presence.paused, true);
    Date.now = () => start + 15 * 60_000 - 1;
    const waiting = await call(db, { op: 'sync', code: host.code, token: host.token });
    assert.equal(waiting.status, 200);
    assert.equal(db.rooms.has(host.code), true);
    Date.now = () => start + 15 * 60_000;
    const retired = await call(db, { op: 'sync', code: host.code, token: host.token });
    assert.equal(retired.status, 410);
    assert.match(retired.body.error, /away too long/i);
    assert.equal(db.rooms.has(host.code), false);
    assert.equal(db.presence.has(host.code), false);
    assert.equal((await call(db, { op: 'sync', code: host.code, token: guest.token })).status, 410);
  } finally {
    Date.now = originalNow;
  }
});

test('active heartbeats keep a room alive without bidding or changing the action version', async () => {
  const db = new FakeD1();
  const originalNow = Date.now;
  const start = originalNow();
  try {
    Date.now = () => start;
    const host = (await call(db, { op: 'create', sport: 'basketball', mode: 'prime' })).body;
    const guest = (await call(db, { op: 'join', code: host.code })).body;
    for (let minute = 10; minute <= 190; minute += 10) {
      Date.now = () => start + minute * 60_000;
      const hostPoll = await call(db, { op: 'sync', code: host.code, token: host.token });
      const guestPoll = await call(db, { op: 'sync', code: host.code, token: guest.token });
      assert.equal(hostPoll.status, 200);
      assert.equal(guestPoll.status, 200);
      assert.equal(hostPoll.body.version, guest.version);
      assert.equal(guestPoll.body.version, guest.version);
      assert.equal(guestPoll.body.presence.paused, false);
    }
    assert.equal(db.rooms.has(host.code), true);
  } finally {
    Date.now = originalNow;
  }
});

test('waiting rooms retire after fifteen minutes; creating another room cleans abandoned rooms', async () => {
  const db = new FakeD1();
  const originalNow = Date.now;
  const start = originalNow();
  try {
    Date.now = () => start;
    const waiting = (await call(db, { op: 'create', sport: 'football', mode: 'current' })).body;
    const joined = (await call(db, { op: 'create', sport: 'basketball', mode: 'current' })).body;
    await call(db, { op: 'join', code: joined.code });
    Date.now = () => start + 15 * 60_000;
    const fresh = await call(db, { op: 'create', sport: 'football', mode: 'prime' });
    assert.equal(fresh.status, 200);
    for (const code of [waiting.code, joined.code]) {
      assert.equal(db.rooms.has(code), false);
      assert.equal(db.presence.has(code), false);
      assert.equal((await call(db, { op: 'join', code })).status, 410);
    }
    assert.equal(db.rooms.has(fresh.body.code), true);
  } finally {
    Date.now = originalNow;
  }
});

test('a joined room with a missing guest heartbeat still retires after fifteen minutes', async () => {
  const db = new FakeD1();
  const originalNow = Date.now;
  const start = originalNow();
  try {
    Date.now = () => start;
    const first = (await call(db, { op: 'create', sport: 'football', mode: 'current' })).body;
    const second = (await call(db, { op: 'create', sport: 'basketball', mode: 'current' })).body;
    for (const room of [first, second]) {
      await call(db, { op: 'join', code: room.code });
      // Model a join interrupted after reserving seat 2 but before its
      // separate presence write completed.
      db.presence.get(room.code).seat2_seen_at = null;
    }
    Date.now = () => start + 14 * 60_000;
    for (const room of [first, second]) {
      const activeHost = await call(db, { op: 'sync', code: room.code, token: room.token });
      assert.equal(activeHost.status, 200);
      assert.equal(activeHost.body.presence.paused, true);
    }
    Date.now = () => start + 15 * 60_000;
    const retired = await call(db, { op: 'sync', code: first.code, token: first.token });
    assert.equal(retired.status, 410);
    assert.match(retired.body.error, /away too long/i);
    assert.equal(db.rooms.has(first.code), false);
    assert.equal((await call(db, { op: 'create', sport: 'football', mode: 'prime' })).status, 200);
    assert.equal(db.rooms.has(second.code), false);
    assert.equal(db.presence.has(second.code), false);
  } finally {
    Date.now = originalNow;
  }
});

test('a returning heartbeat can win the race against automatic retirement', async () => {
  const db = new FakeD1();
  const originalNow = Date.now;
  const start = originalNow();
  try {
    Date.now = () => start;
    const host = (await call(db, { op: 'create', sport: 'football', mode: 'current' })).body;
    await call(db, { op: 'join', code: host.code });
    Date.now = () => start + 14 * 60_000;
    assert.equal((await call(db, { op: 'sync', code: host.code, token: host.token })).status, 200);
    Date.now = () => start + 15 * 60_000;
    let refreshed = false;
    const originalPrepare = db.prepare.bind(db);
    db.prepare = sql => {
      const statement = originalPrepare(sql);
      if (!sql.includes('DELETE FROM rooms') || !sql.includes('AND EXISTS')) return statement;
      const originalRun = statement.run.bind(statement);
      statement.run = async () => {
        if (!refreshed) {
          db.presence.get(host.code).seat2_seen_at = Date.now();
          refreshed = true;
        }
        return originalRun();
      };
      return statement;
    };
    const response = await call(db, { op: 'sync', code: host.code, token: host.token });
    assert.equal(refreshed, true);
    assert.equal(response.status, 200);
    assert.equal(db.rooms.has(host.code), true);
    assert.equal(response.body.presence.paused, false);
  } finally {
    Date.now = originalNow;
  }
});
