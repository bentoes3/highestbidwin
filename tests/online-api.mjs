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
          let changes = 0;
          for (const [code, row] of db.rooms) {
            if (row.expires_at <= args[0]) { db.rooms.delete(code); changes++; }
          }
          return { meta: { changes } };
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
  assert.equal((await call(db, { op: 'sync', code: waiting.code, token: waiting.token })).status, 404);

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
