// Authoritative, DOM-free game rules for a two-device room. All exported state is
// JSON-serializable. Actions mutate and return the supplied state; only the server
// should call them. Send publicRoomState(state), never the private state, to clients.
export const TOSS_MS = 1600;
export const SPIN_MS = 1800;
const SOLO_SKIP_LIMIT = 3;
const SLOT_MAP = {football: ['ATT', 'MID', 'MID', 'DEF', 'GK'], basketball: ['PG', 'SG', 'SF', 'PF', 'C']};

function fail(message) { throw new Error(message); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function clock(now) {
  if (!Number.isFinite(now) || now < 0) fail('A valid server timestamp is required.');
  return now;
}
function random(rng) {
  const n = rng();
  if (!Number.isFinite(n) || n < 0 || n >= 1) fail('Random source must return a number from 0 up to 1.');
  return n;
}
function slots(state) { return SLOT_MAP[state.sport]; }
function playerById(state, id) { return state.pool.find(player => player.id === id); }
function paidEligible(team) { return team.money > 0 && team.squad.length < 5; }
function active(state, seat) { return paidEligible(state.teams[seat]) && !state.passed[seat]; }
function soloAuction(state, seat) {
  return state.bid === 0 && !paidEligible(state.teams[1 - seat]);
}
function soloSkipsLeft(state, seat) { return SOLO_SKIP_LIMIT - state.teams[seat].soloSkips; }
function maxBid(state, seat) { return state.teams[seat].squad.length === 5 ? 0 : state.teams[seat].money; }
function draw(state, ids, rng) {
  if (!ids.length) fail('No eligible players remain.');
  const total = ids.reduce((n, id) => n + (state.sport === 'football' && playerById(state, id).pos === 'GK' ? 2 : 1), 0);
  let ticket = random(rng) * total;
  for (const id of ids) {
    ticket -= state.sport === 'football' && playerById(state, id).pos === 'GK' ? 2 : 1;
    if (ticket < 0) return playerById(state, id);
  }
  return playerById(state, ids[ids.length - 1]);
}
function shuffle(ids, rng) {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random(rng) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function fitScore(state, player, slot) {
  if (state.sport === 'football') {
    if ((player.positions || [player.pos]).includes(slot)) return player.rating;
    if (slot === 'GK') return player.gkScore;
    if (player.pos === 'GK') return Math.round(player.rating * .35);
    return Math.round(player.rating * (player.pos === 'MID' || slot === 'MID' ? .8 : .6));
  }
  const positions = player.positions || [player.pos];
  const distance = Math.min(...positions.map(pos => Math.abs(slots(state).indexOf(pos) - slots(state).indexOf(slot))));
  return Math.round(player.rating * [1, .92, .8, .62, .45][distance]);
}
function bestLineup(state, squad) {
  let best = {total: -1, rows: Array(5).fill(null)};
  function visit(index, rows, total) {
    if (index === squad.length) {
      if (total > best.total) best = {total, rows: [...rows]};
      return;
    }
    const signing = squad[index];
    for (let i = 0; i < 5; i++) {
      if (rows[i]) continue;
      rows[i] = {...signing, slot: slots(state)[i], score: fitScore(state, signing.player, slots(state)[i])};
      visit(index + 1, rows, total + rows[i].score);
      rows[i] = null;
    }
  }
  visit(0, Array(5).fill(null), 0);
  return {...best, rating: best.total / 5};
}
function lineupFor(state, team) {
  const ids = team.order;
  if (!Array.isArray(ids) || ids.length !== 5) return bestLineup(state, team.squad);
  const signings = new Map(team.squad.map(signing => [signing.player.id, signing]));
  const used = new Set();
  let total = 0;
  const rows = ids.map((id, i) => {
    const signing = signings.get(id);
    if (id == null || !signing || used.has(id)) return null;
    used.add(id);
    const score = fitScore(state, signing.player, slots(state)[i]);
    total += score;
    return {...signing, slot: slots(state)[i], score};
  });
  if (used.size !== team.squad.length) return bestLineup(state, team.squad);
  return {rows, total, rating: total / 5};
}
function syncLineup(state, team) {
  if (!team.customized) {
    team.order = bestLineup(state, team.squad).rows.map(row => row?.player.id ?? null);
    return;
  }
  if (!Array.isArray(team.order)) team.order = Array(5).fill(null);
  const used = new Set(team.order.filter(id => id != null));
  for (const signing of team.squad) {
    if (used.has(signing.player.id)) continue;
    const open = team.order.map((id, i) => id == null ? i : -1).filter(i => i >= 0);
    const target = open.reduce((best, i) => fitScore(state, signing.player, slots(state)[i]) > fitScore(state, signing.player, slots(state)[best]) ? i : best, open[0]);
    team.order[target] = signing.player.id;
    used.add(signing.player.id);
  }
}
function canArrange(state, seat) {
  return state.teams[seat].squad.length > 0 &&
    (['bidding', 'sold', 'unsold', 'free-ready'].includes(state.phase) ||
      (state.phase === 'lineup' && !state.teams[seat].ready));
}
function nextPaidSpinner(state) {
  const opener = (state.firstBidder + state.lot) % 2;
  if (paidEligible(state.teams[opener])) return opener;
  if (paidEligible(state.teams[1 - opener])) return 1 - opener;
  return null;
}
function nextPhase(state) {
  if (state.teams.every(team => team.squad.length === 5)) {
    state.phase = 'final-signing';
    state.teams.forEach(team => { team.ready = false; });
  } else if (state.teams.some(paidEligible)) {
    state.phase = 'sold';
  } else {
    state.phase = 'free-ready';
    state.freeTurn = state.teams.findIndex(team => team.squad.length < 5);
  }
}
function award(state) {
  const seat = state.leader;
  const team = state.teams[seat];
  team.money -= state.bid;
  team.squad.push({player: state.current, price: state.bid});
  syncLineup(state, team);
  nextPhase(state);
  state.message = `SOLD! ${state.current.name} joins Player ${seat + 1} for $${state.bid}.`;
  if (team.money === 0 && team.squad.length < 5) state.message += ' Your remaining signings will spin after paid bidding ends.';
  if (state.phase === 'final-signing') state.message += ' Review the last signing before final lineups.';
  if (state.phase === 'free-ready') state.message += ' Paid bidding is over. Time for free picks!';
}
function outcome(state) {
  const ratings = state.teams.map(team => lineupFor(state, team));
  const winner = ratings[0].total === ratings[1].total ? null : ratings[0].total > ratings[1].total ? 0 : 1;
  return {winner, ratings: ratings.map(team => team.rating)};
}

export function createRoomState({sport, mode, pool, now = Date.now(), rng = Math.random}) {
  clock(now);
  if (!Object.hasOwn(SLOT_MAP, sport)) fail('Unknown sport.');
  if (!['current', 'prime'].includes(mode)) fail('Unknown game mode.');
  if (!Array.isArray(pool) || pool.length < 10) fail('At least ten players are required.');
  const ids = new Set();
  for (const player of pool) {
    if (player == null || !['string', 'number'].includes(typeof player.id) || ids.has(player.id) ||
      typeof player.name !== 'string' || !SLOT_MAP[sport].includes(player.pos) ||
      !Array.isArray(player.positions) || !player.positions.length ||
      player.positions.some(pos => !SLOT_MAP[sport].includes(pos)) ||
      !Number.isFinite(player.rating) ||
      (sport === 'football' && !Number.isFinite(player.gkScore))) fail('Invalid or duplicate player in pool.');
    ids.add(player.id);
  }
  const players = clone(pool);
  return {
    sport, mode, pool: players, deck: shuffle(players.map(player => player.id), rng),
    teams: [0, 1].map(() => ({money: 20, squad: [], soloSkips: 0, order: Array(5).fill(null), customized: false, ready: false})),
    phase: 'toss-ready', firstBidder: null, lot: 0, current: null, bid: 0, leader: null,
    turn: 0, passed: [false, false], freeTurn: null, message: 'A 50/50 toss decides who opens the first auction.',
    revealAt: null, outcome: null, version: 0
  };
}

// Call on room alarms and before each action. A later action also catches up a
// room whose alarm was delayed. The caller should broadcast if version changes.
export function advanceRoomTime(state, now = Date.now()) {
  clock(now);
  if (state.revealAt == null || now < state.revealAt) return state;
  if (state.phase === 'tossing') {
    state.phase = 'ready';
    state.message = `Player ${state.firstBidder + 1} won the toss and bids first. Spin to reveal the ${state.sport === 'football' ? 'footballer' : 'basketball player'}.`;
  } else if (state.phase === 'spinning') {
    state.phase = 'bidding';
    state.turn = (state.firstBidder + state.lot - 1) % 2;
    if (!active(state, state.turn)) state.turn = 1 - state.turn;
    state.message = `${state.current.name} is up for bid.`;
  } else if (state.phase === 'free-spinning') {
    const seat = state.freeTurn;
    state.teams[seat].squad.push({player: state.current, price: 0});
    syncLineup(state, state.teams[seat]);
    state.deck = state.deck.filter(id => id !== state.current.id);
    nextPhase(state);
    state.message = `FREE SIGNING! ${state.current.name} joins Player ${seat + 1}.` +
      (state.phase === 'free-ready' ? ` Player ${state.freeTurn + 1}, spin your next free pick.` : ' Last signing complete. Review the card, then set final lineups.');
  } else {
    fail('Invalid timed room phase.');
  }
  state.revealAt = null;
  state.version++;
  return state;
}

export function applyRoomAction(state, seat, action, {now = Date.now(), rng = Math.random} = {}) {
  advanceRoomTime(state, now);
  if (seat !== 0 && seat !== 1) fail('You are not a player in this room.');
  if (!action || typeof action.type !== 'string') fail('Invalid room action.');
  const team = state.teams[seat];
  switch (action.type) {
    case 'toss': {
      if (seat !== 0) fail('Only the host can start the toss.');
      if (state.phase !== 'toss-ready') fail('The toss has already started.');
      state.firstBidder = random(rng) < .5 ? 0 : 1;
      state.phase = 'tossing';
      state.revealAt = now + TOSS_MS;
      state.message = 'Heads for Player 1. Tails for Player 2.';
      break;
    }
    case 'spin': {
      if (state.phase === 'free-ready') {
        if (seat !== state.freeTurn) fail('It is not your free-pick turn.');
        const signed = new Set(state.teams.flatMap(t => t.squad.map(signing => signing.player.id)));
        const available = state.pool.filter(player => !signed.has(player.id)).map(player => player.id);
        state.current = draw(state, available, rng);
        state.phase = 'free-spinning';
        state.message = `Player ${seat + 1}, this next free signing is yours.`;
      } else {
        if (!['ready', 'sold', 'unsold'].includes(state.phase)) fail('Finish the current auction first.');
        if (seat !== nextPaidSpinner(state)) fail('It is not your turn to spin.');
        if (!state.deck.length) {
          const signed = new Set(state.teams.flatMap(t => t.squad.map(signing => signing.player.id)));
          state.deck = shuffle(state.pool.filter(player => !signed.has(player.id)).map(player => player.id), rng);
        }
        state.current = draw(state, state.deck, rng);
        state.deck = state.deck.filter(id => id !== state.current.id);
        state.phase = 'spinning';
        state.lot++;
        state.bid = 0;
        state.leader = null;
        state.passed = [false, false];
        state.message = 'Scouting the stars. Who’s coming out next?';
      }
      state.revealAt = now + SPIN_MS;
      break;
    }
    case 'bid': {
      if (state.phase !== 'bidding' || state.turn !== seat || !active(state, seat)) fail('It is not your bidding turn.');
      const amount = action.amount ?? state.bid + 1;
      if (!Number.isInteger(amount) || amount <= state.bid) fail('Bid must be a whole dollar above the current bid.');
      if (amount > maxBid(state, seat)) fail('Bid exceeds your available budget.');
      state.bid = amount;
      state.leader = seat;
      if (!active(state, 1 - seat)) award(state);
      else {
        state.turn = 1 - seat;
        state.message = `Player ${seat + 1} bids $${amount} for ${state.current.name}.`;
      }
      break;
    }
    case 'pass': {
      if (state.phase !== 'bidding' || state.turn !== seat || !active(state, seat)) fail('It is not your bidding turn.');
      const solo = soloAuction(state, seat);
      if (solo && soloSkipsLeft(state, seat) <= 0) fail('No solo skips left. You must sign this player.');
      if (solo) team.soloSkips++;
      state.passed[seat] = true;
      if (state.leader !== null) award(state);
      else if (active(state, 1 - seat)) {
        state.turn = 1 - seat;
        state.message = `Player ${seat + 1} passes. Player ${2 - seat}, open at $1 or pass.`;
      } else {
        state.phase = 'unsold';
        state.message = `No bids for ${state.current.name}. Spin again for a new player.`;
      }
      break;
    }
    case 'move': {
      const {from, to} = action;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 4 || to < 0 || to > 4 || !canArrange(state, seat)) fail('This lineup cannot be changed now.');
      if (team.order[from] == null) fail('Select a signed player to move.');
      if (from === to) return state;
      const moved = team.squad.find(signing => signing.player.id === team.order[from]);
      [team.order[from], team.order[to]] = [team.order[to], team.order[from]];
      team.customized = true;
      state.message = `Player ${seat + 1} moves ${moved.player.name} to ${slots(state)[to]}.`;
      break;
    }
    case 'advance': {
      if (state.phase !== 'final-signing') fail('Review the last signing first.');
      state.phase = 'lineup';
      state.message = 'Make final changes, then both managers lock in.';
      break;
    }
    case 'ready': {
      if (state.phase !== 'lineup') fail('Final lineup changes are not open.');
      team.ready = !team.ready;
      if (state.teams.every(t => t.ready)) {
        state.phase = 'done';
        state.outcome = outcome(state);
        state.message = 'Both managers are locked in. The final verdict is coming!';
      } else {
        state.message = `Player ${seat + 1} ${team.ready ? 'locked in' : 'is editing again'}. Both managers must be ready.`;
      }
      break;
    }
    default: fail('Unknown room action.');
  }
  state.version++;
  return state;
}

function publicPlayer(player, reveal) {
  if (player == null) return null;
  if (reveal) return clone(player);
  return {id: player.id, name: player.name, pos: player.pos, positions: [...player.positions], kind: player.kind};
}

export function publicRoomState(state) {
  const reveal = state.phase === 'done';
  const currentHidden = ['spinning', 'free-spinning'].includes(state.phase);
  return {
    sport: state.sport, mode: state.mode, phase: state.phase,
    firstBidder: state.phase === 'tossing' ? null : state.firstBidder,
    lot: state.lot, current: currentHidden ? null : publicPlayer(state.current, reveal),
    bid: state.bid, leader: state.leader, turn: state.turn, passed: [...state.passed],
    freeTurn: state.freeTurn, message: state.message, revealAt: state.revealAt,
    version: state.version,
    teams: state.teams.map(team => ({
      money: team.money, squad: team.squad.map(signing => ({player: publicPlayer(signing.player, reveal), price: signing.price})),
      soloSkips: team.soloSkips, order: [...team.order], customized: team.customized, ready: team.ready
    })),
    outcome: reveal ? clone(state.outcome) : null
  };
}
