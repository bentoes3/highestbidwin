'use strict';
(function () {
  const key = 'hbw-game-motion';
  const root = document.documentElement;
  const system = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let preference = 'system';
  try {
    const saved = window.localStorage?.getItem(key);
    if (saved === 'full' || saved === 'reduced') preference = saved;
  } catch {}

  function reduced() { return preference === 'reduced' || (preference === 'system' && !!system?.matches); }
  function paint() {
    const reduce = reduced();
    root.classList.toggle('motion-reduced', reduce);
    root.setAttribute('data-motion', reduce ? 'reduced' : 'full');
    const button = document.getElementById('motion-toggle');
    if (!button) return;
    button.classList.toggle('motion-off', reduce);
    button.setAttribute('aria-pressed', String(!reduce));
    button.setAttribute('aria-label', reduce ? 'Animation effects off' : 'Animation effects on');
    button.title = reduce ? 'Motion: Reduced. Turn full effects on' : 'Motion: Full. Reduce effects';
  }
  function announce() {
    paint();
    if (typeof window.CustomEvent === 'function') window.dispatchEvent(new window.CustomEvent('hbw-motion-change', { detail: { reduced: reduced(), preference } }));
  }
  function set(value) {
    if (!['system', 'full', 'reduced'].includes(value)) return;
    preference = value;
    try {
      if (value === 'system') window.localStorage?.removeItem(key);
      else window.localStorage?.setItem(key, value);
    } catch {}
    announce();
  }
  function mount() {
    paint();
    const button = document.getElementById('motion-toggle');
    if (button) button.addEventListener('click', () => set(reduced() ? 'full' : 'reduced'));
  }
  if (system?.addEventListener) system.addEventListener('change', announce);
  else system?.addListener?.(announce);
  window.addEventListener?.('storage', event => {
    if (event.key !== key) return;
    preference = event.newValue === 'full' || event.newValue === 'reduced' ? event.newValue : 'system';
    announce();
  });
  window.HBW_MOTION = { reduced, set, preference: () => preference };
  paint();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
