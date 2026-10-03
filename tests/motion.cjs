const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('dist/motion.js', 'utf8');

function setup({ saved = null, systemReduced = false, blockedStorage = false } = {}) {
  const stored = new Map(saved ? [['hbw-game-motion', saved]] : []);
  const classes = new Set(['glass-design', 'motion-reduced']), attributes = {};
  let mediaReads = 0;
  const document = {
    documentElement: { classList: { remove: name => classes.delete(name) }, setAttribute: (name, value) => attributes[name] = value },
    readyState: 'loading'
  };
  const window = {
    matchMedia() { mediaReads++; return { matches: systemReduced }; },
    get localStorage() { if (blockedStorage) throw Error('Storage blocked'); return { getItem: key => stored.get(key), removeItem: key => stored.delete(key) }; }
  };
  vm.runInNewContext(source, { window, document });
  return { window, stored, classes, attributes, mediaReads };
}

for (const systemReduced of [false, true]) for (const saved of [null, 'reduced', 'full', 'invalid']) {
  const page = setup({ systemReduced, saved });
  assert.equal(page.window.HBW_MOTION.reduced(), false, `OS reduce ${systemReduced}, saved ${saved}: full effects remain enabled`);
  assert.equal(page.window.HBW_MOTION.preference(), 'full');
  assert.equal(page.attributes['data-motion'], 'full');
  assert(!page.classes.has('motion-reduced'), 'Stale suppression must be cleared before the body loads');
  assert(page.classes.has('glass-design'), 'Clearing motion suppression must preserve the design class');
  assert(!page.stored.has('hbw-game-motion'), 'The old saved setting must be retired across page loads');
  assert(Object.isFrozen(page.window.HBW_MOTION), 'The full-motion policy cannot be changed by a stale control');
  assert.equal(page.window.HBW_MOTION.set, undefined);
  assert.equal(page.mediaReads, 0, 'Device preference must not control the game effects');
}
const restricted = setup({ saved: 'reduced', systemReduced: true, blockedStorage: true });
assert.equal(restricted.window.HBW_MOTION.reduced(), false, 'Blocked storage cannot suppress effects');
assert.equal(restricted.attributes['data-motion'], 'full');
assert(!restricted.classes.has('motion-reduced'));
for (const page of ['index.html', 'football/index.html', 'basketball/index.html']) {
  const html = fs.readFileSync('dist/' + page, 'utf8');
  assert(!html.includes('motion-toggle'), `The retired effects control must be removed from ${page}`);
  assert(html.includes('<script src="/motion.js"></script>'), `The full policy must run before styles on ${page}`);
}
console.log('PASS motion: full effects across OS preferences, retired saved preferences, early class cleanup, blocked storage and all three page headers.');
