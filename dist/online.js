/* Optional two-device rooms. The server owns the draw and every game decision. */
(() => {
  'use strict';
  const sport = document.body.dataset.sport;
  const storageKey = `hbw-online-room-${sport}`;
  const recoveryKey = `hbw-online-sessions-${sport}`;
  const pausedKey = `hbw-online-paused-${sport}`;
  const pendingJoinKey = `hbw-online-pending-join-${sport}`;
  const $ = id => document.getElementById(id);
  let code = '', token = '', seat = 0, version = -1, joined = false;
  let connected = true, busy = false, pollTimer = null, spinLoop = null;

  function error(message = '') {
    const box = $('online-error');
    box.textContent = message;
    box.hidden = !message;
  }
  function status(message) { $('online-dialog-status').textContent = message; }
  function roomLink() { return `${location.origin}/${sport}/?join=${encodeURIComponent(code)}`; }
  function readRecovery() {
    try {
      const entries = JSON.parse(localStorage.getItem(recoveryKey));
      return Array.isArray(entries) ? entries.filter(entry =>
        /^[A-HJ-NP-Z2-9]{6}$/.test(entry.code) &&
        typeof entry.token === 'string' && [1, 2].includes(entry.seat)) : [];
    } catch { return []; }
  }
  function remember(entry, key = recoveryKey) {
    try {
      const entries = key === recoveryKey ? readRecovery() : JSON.parse(localStorage.getItem(key) || '[]');
      const remaining = (Array.isArray(entries) ? entries : []).filter(saved =>
        saved.code !== entry.code || saved.seat !== entry.seat);
      localStorage.setItem(key, JSON.stringify([{...entry, savedAt: Date.now()}, ...remaining].slice(0, 6)));
    } catch {}
  }
  function forget(entry, key = recoveryKey) {
    try {
      const entries = key === recoveryKey ? readRecovery() : JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify((Array.isArray(entries) ? entries : []).filter(saved =>
        saved.code !== entry.code || saved.seat !== entry.seat || saved.token !== entry.token)));
    } catch {}
  }
  function save() {
    const entry = {code, token, seat};
    try { sessionStorage.setItem(storageKey, JSON.stringify(entry)); } catch {}
    try { localStorage.removeItem(pausedKey); } catch {}
    remember(entry);
  }
  function joinToken(roomCode) {
    try {
      const pending = JSON.parse(sessionStorage.getItem(pendingJoinKey));
      if (pending?.code === roomCode && /^[A-Za-z0-9_-]{43}$/.test(pending.token)) return pending.token;
    } catch {}
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const next = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    try { sessionStorage.setItem(pendingJoinKey, JSON.stringify({code: roomCode, token: next})); } catch {}
    return next;
  }
  function clear(forgetSeat = true) {
    if (forgetSeat && code && token) forget({code, token, seat});
    try { sessionStorage.removeItem(storageKey); } catch {}
    clearTimeout(pollTimer);
    clearInterval(spinLoop);
    pollTimer = spinLoop = null;
    code = token = ''; seat = 0; version = -1; joined = false;
    connected = true; busy = false;
    api.active = false;
  }
  async function request(body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/room', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body), cache: 'no-store', signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const failure = new Error(data.error || 'Could not reach the online room. Try again.');
        failure.status = response.status;
        failure.data = data;
        throw failure;
      }
      return data;
    } catch (cause) {
      if (cause.name === 'AbortError') throw Error('The room is taking too long to respond. Try again.');
      throw cause;
    } finally { clearTimeout(timeout); }
  }

  function showDialog() {
    error();
    const hasRoom = !!code;
    $('online-entry').hidden = hasRoom;
    $('online-room-waiting').hidden = !hasRoom;
    $('online-dialog-title').textContent = hasRoom ? `Room ${code}` : 'Play online.';
    $('online-dialog-copy').textContent = hasRoom
      ? `You are Player ${seat}. ${joined ? 'Your friend is in the room.' : 'Send your friend this code or link.'}`
      : 'One room. Two devices. Choose your era, then invite a friend or enter their code.';
    if (hasRoom) {
      $('online-room-code').textContent = `${code.slice(0, 3)} ${code.slice(3)}`;
      $('online-invite-link').value = roomLink();
      $('online-leave').textContent = joined ? 'Back to game' : 'Cancel room';
      $('online-exit').hidden = !joined;
      status(joined ? `Player ${seat} · Connected` : 'Waiting for Player 2 to join…');
    } else { status(''); renderRecovery(); }
    if (!$('online-dialog').open) $('online-dialog').showModal();
  }
  function renderRecovery() {
    const invite = new URLSearchParams(location.search).get('join')?.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
    const entries = readRecovery().filter(entry => !invite || entry.code === invite);
    let box = $('online-recovery');
    if (!entries.length) { box?.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'online-recovery';
      box.className = 'online-recovery';
      $('online-entry').prepend(box);
    }
    box.replaceChildren();
    const label = document.createElement('span');
    label.textContent = 'CONTINUE YOUR ROOM';
    box.append(label);
    for (const entry of entries) {
      const button = document.createElement('button');
      button.className = 'quiet';
      button.type = 'button';
      button.textContent = `${entry.code.slice(0, 3)} ${entry.code.slice(3)} · Player ${entry.seat}`;
      button.onclick = () => restore(entry);
      box.append(button);
    }
  }
  function roomBadge() {
    const badge = $('online-room-status');
    badge.hidden = !api.active;
    if (!api.active) return;
    badge.dataset.state = connected ? (joined ? 'connected' : 'waiting') : 'disconnected';
    $('online-room-label').textContent = `${code} · YOU P${seat}`;
    badge.title = connected ? `Room ${code}. You are Player ${seat}. Open invite details.` : 'Connection lost. Retrying…';
  }
  function nextSpinner() {
    if (state.phase === 'free-ready') return state.freeTurn;
    const opener = (state.firstBidder + state.lot) % 2;
    const canBuy = t => state.teams[t].money > 0 && state.teams[t].squad.length < 5;
    return canBuy(opener) ? opener : canBuy(1 - opener) ? 1 - opener : null;
  }
  function ownsControl() {
    if (!joined || !connected || busy) return false;
    if (state.phase === 'toss-ready') return seat === 1;
    if (['ready', 'sold', 'unsold', 'free-ready'].includes(state.phase)) return nextSpinner() === seat - 1;
    if (state.phase === 'bidding') return state.turn === seat - 1;
    return true;
  }
  function afterRender() {
    if (!api.active) return;
    roomBadge();
    const ownTurn = ownsControl();
    for (const id of ['toss', 'spin', 'bid', 'pass', 'all-in', 'final-lineups']) {
      const button = $(id);
      if (button && !ownTurn) button.disabled = true;
    }
    if (!ownTurn) {
      const hint = document.querySelector('#auction-controls .control-hint');
      if (hint) hint.textContent = !connected ? 'Reconnecting to the room…' : !joined ? 'Waiting for your friend to join…' : busy ? 'Sending your move…' : `Waiting for Player ${state.phase === 'bidding' ? state.turn + 1 : state.phase === 'free-ready' ? state.freeTurn + 1 : state.phase === 'toss-ready' ? 1 : (nextSpinner() ?? 0) + 1}…`;
    }
    if (state.phase === 'lineup') {
      for (let i = 0; i < 2; i++) {
        const button = $(`ready-${i}`);
        if (!button) continue;
        if (i !== seat - 1) {
          button.disabled = true;
          button.textContent = state.teams[i].ready ? `✓ Player ${i + 1} locked` : `Waiting for Player ${i + 1}`;
        } else if (!connected || busy) button.disabled = true;
      }
    }
  }
  function stopFakeSpin() { clearInterval(spinLoop); spinLoop = null; }
  function startFakeSpin() {
    stopFakeSpin();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frames = 0;
    spinLoop = setInterval(() => {
      if (!api.active || !['spinning', 'free-spinning'].includes(state.phase)) return stopFakeSpin();
      const candidates = playerPool();
      const fake = candidates[Math.floor(Math.random() * candidates.length)];
      $('card-zone').innerHTML = card(fake, true);
      if (++frames % 2 === 0 && frames < 18) window.HBW_SOUND?.tick(frames / 18);
    }, 100);
  }
  function cues(previous, incoming) {
    if (!previous) return;
    if (incoming.phase === 'tossing' && previous.phase !== 'tossing') window.HBW_SOUND?.toss();
    if (incoming.phase === 'ready' && previous.phase === 'tossing') window.HBW_SOUND?.start();
    if (['spinning', 'free-spinning'].includes(incoming.phase) && previous.phase !== incoming.phase) {
      window.HBW_SOUND?.tick(0); startFakeSpin();
    }
    if (previous.phase === 'spinning' && incoming.phase === 'bidding') { stopFakeSpin(); window.HBW_SOUND?.settle(); }
    if (previous.phase === 'free-spinning' && incoming.phase !== 'free-spinning') stopFakeSpin();
    const signedBefore = previous.teams.reduce((n, team) => n + team.squad.length, 0);
    const signedAfter = incoming.teams.reduce((n, team) => n + team.squad.length, 0);
    if (signedAfter > signedBefore) window.HBW_SOUND?.sign();
    else if (incoming.bid > previous.bid && incoming.lot === previous.lot) window.HBW_SOUND?.bid();
    else if (incoming.phase === 'unsold' && previous.phase === 'bidding') window.HBW_SOUND?.pass();
  }
  function hydrate(data, force = false) {
    if (data.state?.sport && data.state.sport !== sport) {
      const destination = data.state.sport;
      const entry = {code: data.code, token: data.token || token, seat: data.seat || seat};
      forget({code, token, seat});
      try {
        sessionStorage.removeItem(storageKey);
        sessionStorage.setItem(`hbw-online-room-${destination}`, JSON.stringify(entry));
      } catch {}
      remember(entry, `hbw-online-sessions-${destination}`);
      location.assign(`/${data.state.sport}/`);
      return;
    }
    const wasConnected = connected;
    connected = true;
    if (!force && data.version <= version) { if (wasConnected) roomBadge(); else render(); return; }
    const previous = api.active && version >= 0 ? state : null;
    joined = !!data.joined;
    version = data.version;
    selectedMode = data.state.mode;
    state = {...data.state, revealed: false, revealing: false};
    $('home').hidden = true;
    $('game').hidden = false;
    render();
    cues(previous, state);
    if (['spinning', 'free-spinning'].includes(state.phase) && !spinLoop) startFakeSpin();
    if (joined && $('online-dialog').open) $('online-dialog').close();
    if (!joined && seat === 1) showDialog();
    if (state.phase === 'done' && previous?.phase !== 'done') queueMicrotask(() => showResults());
  }
  function schedulePoll(delay = 1100) {
    clearTimeout(pollTimer);
    if (api.active) pollTimer = setTimeout(poll, delay);
  }
  async function poll() {
    if (!api.active) return;
    if (busy) return schedulePoll(650);
    if (document.hidden) return schedulePoll(3500);
    try {
      const data = await request({op: 'sync', code, token});
      hydrate(data);
      schedulePoll(state.phase === 'bidding' ? 850 : 1200);
    } catch (cause) {
      connected = false;
      if ([403, 404, 410].includes(cause.status)) {
        const message = cause.message;
        clear(); reset(); showHome(); showDialog(); error(message);
        return;
      }
      render();
      schedulePoll(2500);
    }
  }
  async function connect(data) {
    code = data.code; token = data.token; seat = data.seat;
    try { sessionStorage.removeItem(pendingJoinKey); } catch {}
    api.active = true; version = -1; save();
    hydrate(data, true);
    schedulePoll(700);
    window.HBW_SOUND?.start();
  }
  async function restore(entry) {
    if (busy) return;
    busy = true; error(); status('Rejoining your room…');
    code = entry.code; token = entry.token; seat = entry.seat;
    api.active = true; version = -1; save();
    try {
      hydrate(await request({op: 'sync', code, token}), true);
      schedulePoll(800);
    } catch (cause) {
      const message = cause.message;
      clear([403, 404, 410].includes(cause.status));
      reset(); showHome(); showDialog(); error(message);
    } finally { busy = false; if (api.active) render(); }
  }
  async function makeRoom() {
    if (busy) return;
    busy = true; error(); status('Creating your room…');
    $('online-create').disabled = true;
    try { await connect(await request({op: 'create', sport, mode: selectedMode})); }
    catch (cause) { error(cause.message); status(''); }
    finally { busy = false; $('online-create').disabled = false; afterRender(); }
  }
  async function joinRoom(event) {
    event?.preventDefault();
    if (busy) return;
    const input = $('online-code-input');
    const roomCode = input.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
    input.value = roomCode;
    if (roomCode.length !== 6) { error('Enter the six-character code your friend sent.'); return; }
    busy = true; error(); status('Joining your friend…');
    $('online-join').disabled = true;
    try { await connect(await request({op: 'join', code: roomCode, token: joinToken(roomCode)})); }
    catch (cause) { error(cause.message); status(''); }
    finally { busy = false; $('online-join').disabled = false; afterRender(); }
  }
  async function leaveRoom() {
    if (joined) { $('online-dialog').close(); return; }
    const oldCode = code, oldToken = token;
    clear();
    $('online-dialog').close();
    roomBadge();
    try { await request({op: 'leave', code: oldCode, token: oldToken}); } catch {}
    location.assign(`/${sport}/`);
  }
  function exitRoom() {
    if (!api.active) return;
    // Keep a recovery token so a player can resume the same seat if their
    // friend is still playing, but do not force them back into this room.
    clear(false);
    try { localStorage.setItem(pausedKey, '1'); } catch {}
    if ($('online-dialog').open) $('online-dialog').close();
    if (location.search) history.replaceState(null, '', location.pathname);
    reset(selectedMode);
    showHome();
    roomBadge();
  }
  async function copyLink() {
    const field = $('online-invite-link');
    try { await navigator.clipboard.writeText(field.value); }
    catch { field.select(); document.execCommand('copy'); }
    $('online-copy').textContent = 'Copied ✓';
    setTimeout(() => { if ($('online-copy')) $('online-copy').textContent = 'Copy link'; }, 1800);
  }
  async function action(command, expectedSeat) {
    if (!api.active || !joined) throw Error('Wait for your friend to join first.');
    if (expectedSeat && expectedSeat !== seat) throw Error('You can only move your own team.');
    if (!connected || busy) return readState();
    busy = true; afterRender();
    let actionError = '';
    try {
      hydrate(await request({op: 'action', code, token, version, action: command}));
      schedulePoll(600);
      return readState();
    } catch (cause) {
      if (cause.status === 409) {
        if (cause.data?.state) hydrate(cause.data);
        else schedulePoll(0);
      }
      actionError = cause.message;
      return readState();
    } finally {
      busy = false;
      if (api.active) render();
      if (actionError) $('announcement').textContent = actionError;
    }
  }
  function restart() {
    clear();
    reset(selectedMode);
    showHome();
    showDialog();
    return readState();
  }
  function mount() {
    const badge = $('online-room-status');
    badge.tabIndex = 0;
    badge.setAttribute('role', 'button');
    badge.setAttribute('aria-label', 'Open online room details');
    badge.addEventListener('click', showDialog);
    badge.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showDialog(); } });
    $('online-open').onclick = () => { window.HBW_SOUND?.ui(); showDialog(); };
    $('online-close').onclick = () => $('online-dialog').close();
    $('online-create').onclick = makeRoom;
    $('online-join-form').onsubmit = joinRoom;
    $('online-code-input').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6); });
    $('online-copy').onclick = copyLink;
    $('online-leave').onclick = leaveRoom;
    $('online-exit').onclick = exitRoom;
    document.addEventListener('visibilitychange', () => { if (!document.hidden && api.active) schedulePoll(0); });
    const invite = new URLSearchParams(location.search).get('join');
    if (invite) { $('online-code-input').value = invite.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6); showDialog(); }
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
    // Browsers may clone sessionStorage into a new tab opened from the host.
    // An invite must not silently reclaim that host seat instead of joining.
    const matchingTab = saved?.code && saved?.token && [1, 2].includes(saved.seat) &&
      (!invite || (saved.seat === 2 && saved.code === invite.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6)));
    if (matchingTab) restore(saved);
    else if (!invite) {
      const entries = readRecovery();
      let paused = false;
      try { paused = !!localStorage.getItem(pausedKey); } catch {}
      if (entries.length === 1 && !paused) restore(entries[0]);
      else if (entries.length > 1) showDialog();
    }
  }
  const api = {active: false, get seat() { return seat; }, canArrange: team => joined && connected && !busy && seat === team + 1, action, afterRender, mount, restart};
  window.HBW_ONLINE = api;
})();
