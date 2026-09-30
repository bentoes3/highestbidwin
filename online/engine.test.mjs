import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyRoomAction, advanceRoomTime, createRoomState, publicRoomState, SPIN_MS, TOSS_MS} from './engine.mjs';

function poolFor(sport, mode) {
  const positions = sport === 'football' ? ['GK', 'ATT', 'MID', 'DEF'] : ['PG', 'SG', 'SF', 'PF', 'C'];
  return Array.from({length: 15}, (_, i) => ({
    id: `${sport}-${mode}-${i}`,
    name: `${mode} player ${i}`,
    pos: positions[i % positions.length],
    positions: [positions[i % positions.length]],
    rating: 75 + i,
    gkScore: 10 + i,
    stats: [40 + i, 50 + i],
    kind: mode === 'current' ? 'Season' : 'Prime'
  }));
}
function room(sport, mode = 'current') {
  return createRoomState({sport, mode, pool: poolFor(sport, mode), now: 100, rng: () => .5});
}
function act(state, seat, type, now, extra = {}) {
  return applyRoomAction(state, seat, {type, ...extra}, {now, rng: () => .15});
}
function finishSpin(state, now) {
  assert.equal(state.revealAt, now + SPIN_MS);
  advanceRoomTime(state, now + SPIN_MS);
}

for (const sport of ['football', 'basketball']) for (const mode of ['current', 'prime']) {
  test(`${sport} ${mode}: server-only RNG, two seats, solo skips, free picks, lineups and rating privacy`, () => {
    const state = room(sport, mode);
    assert.doesNotThrow(() => JSON.stringify(state));
    assert.equal(state.pool.length, 15);
    assert.equal(state.teams[0].money, 20);
    assert.equal(state.teams[1].money, 20);
    assert.equal(publicRoomState(state).pool, undefined);
    assert.equal(publicRoomState(state).deck, undefined);

    const initial = JSON.stringify(state);
    assert.throws(() => act(state, 1, 'toss', 200), /host/);
    assert.equal(JSON.stringify(state), initial);
    act(state, 0, 'toss', 200);
    assert.equal(state.phase, 'tossing');
    assert.equal(state.firstBidder, 0);
    assert.equal(publicRoomState(state).firstBidder, null);
    assert.equal(state.revealAt, 200 + TOSS_MS);
    assert.throws(() => act(state, 0, 'spin', 250), /Finish/);
    advanceRoomTime(state, 200 + TOSS_MS - 1);
    assert.equal(state.phase, 'tossing');
    advanceRoomTime(state, 200 + TOSS_MS);
    assert.equal(state.phase, 'ready');
    assert.equal(publicRoomState(state).firstBidder, 0);

    assert.throws(() => act(state, 1, 'spin', 2000), /not your turn/);
    act(state, 0, 'spin', 2000);
    assert.equal(state.phase, 'spinning');
    assert.equal(publicRoomState(state).current, null);
    assert.throws(() => act(state, 0, 'bid', 2001), /not your bidding turn/);
    finishSpin(state, 2000);
    const seen = publicRoomState(state);
    assert.equal(seen.phase, 'bidding');
    assert.equal(seen.current.name, state.current.name);
    assert.equal(seen.current.rating, undefined);
    assert.equal(seen.current.stats, undefined);
    assert.equal(seen.current.gkScore, undefined);
    assert.throws(() => act(state, 1, 'bid', 4000), /not your bidding turn/);
    assert.throws(() => act(state, 0, 'bid', 4000, {amount: 21}), /budget/);
    assert.throws(() => act(state, 0, 'bid', 4000, {amount: 1.5}), /whole dollar/);
    act(state, 0, 'bid', 4000, {amount: 20});
    assert.equal(state.turn, 1);
    act(state, 1, 'pass', 4001);
    assert.equal(state.teams[0].money, 0);
    assert.equal(state.teams[0].squad.length, 1);
    assert.equal(publicRoomState(state).teams[0].squad[0].player.rating, undefined);

    // The paid manager can reject three solo draws, then must sign the fourth.
    for (let i = 0; i < 3; i++) {
      const now = 5000 + i * 3000;
      assert.throws(() => act(state, 0, 'spin', now), /not your turn/);
      act(state, 1, 'spin', now);
      finishSpin(state, now);
      act(state, 1, 'pass', now + SPIN_MS + 1);
      assert.equal(state.phase, 'unsold');
      assert.equal(state.teams[1].soloSkips, i + 1);
    }
    act(state, 1, 'spin', 14000);
    finishSpin(state, 14000);
    const beforeDenied = JSON.stringify(state);
    assert.throws(() => act(state, 1, 'pass', 16000), /No solo skips/);
    assert.equal(JSON.stringify(state), beforeDenied);
    act(state, 1, 'bid', 16000, {amount: 20});
    assert.equal(state.teams[1].money, 0);
    assert.equal(state.teams[1].squad.length, 1);
    assert.equal(state.phase, 'free-ready');

    const moveFrom = state.teams[0].order.findIndex(id => id != null);
    const moved = state.teams[0].order[moveFrom];
    act(state, 0, 'move', 16100, {from: moveFrom, to: (moveFrom + 1) % 5});
    assert.equal(state.teams[0].customized, true);
    assert.equal(state.teams[0].order[(moveFrom + 1) % 5], moved);
    assert.throws(() => act(state, 0, 'bid', 16101), /not your bidding turn/);

    let now = 17000;
    while (state.phase === 'free-ready') {
      const seat = state.freeTurn;
      assert.throws(() => act(state, 1 - seat, 'spin', now), /not your free-pick turn/);
      act(state, seat, 'spin', now);
      assert.equal(publicRoomState(state).current, null);
      finishSpin(state, now);
      now += 2000;
    }
    assert.equal(state.phase, 'final-signing');
    assert.equal(state.teams[0].squad.length, 5);
    assert.equal(state.teams[1].squad.length, 5);
    assert.equal(new Set(state.teams.flatMap(team => team.squad.map(signing => signing.player.id))).size, 10);
    assert(state.teams.every(team => team.squad.reduce((sum, signing) => sum + signing.price, 0) + team.money === 20));
    assert.equal(publicRoomState(state).outcome, null);
    assert.throws(() => act(state, 0, 'ready', now), /not open/);
    act(state, 1, 'advance', now);
    assert.equal(state.phase, 'lineup');
    assert.throws(() => act(state, 0, 'move', now + 1, {from: 99, to: 1}), /cannot be changed/);
    act(state, 0, 'ready', now + 2);
    assert.equal(state.teams[0].ready, true);
    assert.throws(() => act(state, 0, 'move', now + 3, {from: 0, to: 1}), /cannot be changed/);
    act(state, 0, 'ready', now + 4);
    assert.equal(state.teams[0].ready, false);
    act(state, 0, 'ready', now + 5);
    act(state, 1, 'ready', now + 6);
    assert.equal(state.phase, 'done');
    assert.equal(typeof state.outcome.ratings[0], 'number');
    assert.equal(typeof publicRoomState(state).teams[0].squad[0].player.rating, 'number');
    assert.deepEqual(publicRoomState(state).outcome, state.outcome);
    assert.throws(() => act(state, 1, 'move', now + 7, {from: 0, to: 1}), /cannot be changed/);
  });
}

test('football doubles goalkeeper draw weight; basketball remains uniform', () => {
  for (const sport of ['football', 'basketball']) {
    const state = room(sport);
    const keeper = state.pool.find(player => player.pos === (sport === 'football' ? 'GK' : 'PG'));
    const other = state.pool.find(player => player.pos === (sport === 'football' ? 'ATT' : 'SG'));
    state.deck = [keeper.id, other.id];
    state.phase = 'ready';
    state.firstBidder = 0;
    applyRoomAction(state, 0, {type: 'spin'}, {now: 1000, rng: () => .6});
    assert.equal(state.current.id, sport === 'football' ? keeper.id : other.id);
  }
});

test('public snapshots are independent clones, including nested player and lineup data', () => {
  const state = room('football');
  state.phase = 'bidding';
  state.current = state.pool[0];
  state.teams[0].squad.push({player: state.pool[1], price: 3});
  state.teams[0].order[0] = state.pool[1].id;
  const publicState = publicRoomState(state);
  publicState.current.name = 'Changed';
  publicState.teams[0].squad[0].player.name = 'Changed';
  publicState.teams[0].order[0] = 'Changed';
  assert.notEqual(state.current.name, 'Changed');
  assert.notEqual(state.teams[0].squad[0].player.name, 'Changed');
  assert.notEqual(state.teams[0].order[0], 'Changed');
});
