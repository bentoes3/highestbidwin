const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('dist/motion.js', 'utf8');

function setup({ saved = null, systemReduced = false, blockedStorage = false, loading = false, legacyMedia = false } = {}) {
  const stored = new Map(saved ? [['hbw-game-motion', saved]] : []);
  const classes = new Set(), attributes = {}, buttonAttributes = {}, listeners = {}, mediaListeners = {};
  const root = { classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); } }, setAttribute(name, value) { attributes[name] = value; } };
  const button = { classList: { toggle() {} }, setAttribute(name, value) { buttonAttributes[name] = value; }, addEventListener(name, fn) { listeners[`button:${name}`] = fn; } };
  const media = { matches: systemReduced };
  if (legacyMedia) media.addListener = fn => mediaListeners.change = fn;
  else media.addEventListener = (name, fn) => mediaListeners[name] = fn;
  const document = { documentElement: root, readyState: loading ? 'loading' : 'complete', getElementById() { return loading ? null : button; }, addEventListener(name, fn) { listeners[name] = fn; } };
  const events = [];
  const window = {
    matchMedia: () => media,
    get localStorage() { if (blockedStorage) throw Error('Storage blocked'); return { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) }; },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    dispatchEvent(event) { events.push(event); },
    addEventListener(name, fn) { listeners[name] = fn; }
  };
  vm.runInNewContext(source, { window, document });
  return { window, media, stored, classes, attributes, buttonAttributes, listeners, mediaListeners, events,
    ready() { loading = false; document.readyState = 'complete'; listeners.DOMContentLoaded(); } };
}

const system = setup({ systemReduced: true, loading: true });
assert.equal(system.window.HBW_MOTION.reduced(), true);
assert(system.classes.has('motion-reduced'), 'The OS setting must apply before the page body loads');
system.ready();
assert.equal(system.buttonAttributes['aria-pressed'], 'false');
system.listeners['button:click']();
assert.equal(system.window.HBW_MOTION.reduced(), false, 'Full effects must explicitly override an OS reduced-motion setting');
assert.equal(system.stored.get('hbw-game-motion'), 'full');
assert.equal(system.attributes['data-motion'], 'full');
assert.equal(system.buttonAttributes['aria-pressed'], 'true');
system.media.matches = false; system.mediaListeners.change();
system.media.matches = true; system.mediaListeners.change();
assert.equal(system.window.HBW_MOTION.reduced(), false, 'An explicit choice must survive OS preference changes');
assert(system.events.some(event => event.type === 'hbw-motion-change' && event.detail.reduced === false));
assert.equal(setup({ saved: 'full', systemReduced: true }).window.HBW_MOTION.reduced(), false, 'Full motion persists across pages');
const reduced = setup({ saved: 'reduced' });
assert.equal(reduced.window.HBW_MOTION.reduced(), true, 'Reduced motion persists across pages');
reduced.window.HBW_MOTION.set('system');
assert.equal(reduced.stored.has('hbw-game-motion'), false);
assert.equal(reduced.window.HBW_MOTION.reduced(), false);
reduced.media.matches = true; reduced.mediaListeners.change();
assert.equal(reduced.window.HBW_MOTION.reduced(), true, 'System mode follows live preference changes');
reduced.listeners.storage({ key: 'hbw-game-motion', newValue: 'full' });
assert.equal(reduced.window.HBW_MOTION.reduced(), false, 'A choice in another tab updates the current tab');
assert.equal(setup({ saved: 'invalid', systemReduced: true }).window.HBW_MOTION.preference(), 'system');
const restricted = setup({ blockedStorage: true, systemReduced: true, legacyMedia: true });
restricted.listeners['button:click']();
assert.equal(restricted.window.HBW_MOTION.reduced(), false, 'Blocked storage must not disable the live control');
restricted.window.HBW_MOTION.set('system');
restricted.media.matches = false; restricted.mediaListeners.change();
assert.equal(restricted.window.HBW_MOTION.reduced(), false);
console.log('PASS motion: early system preference, explicit full/reduced choice, persistence, live OS changes, cross-tab changes and blocked storage.');
