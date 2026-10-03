'use strict';
(function () {
  // Full game effects are always enabled, independent of device settings.
  const root = document.documentElement;
  root.classList.remove('motion-reduced');
  root.setAttribute('data-motion', 'full');
  try { window.localStorage?.removeItem('hbw-game-motion'); } catch {}
  window.HBW_MOTION = Object.freeze({ reduced: () => false, preference: () => 'full' });
})();
