(() => {
  const MAP_SELECTOR = 'svg[aria-label^="Interactive Nigeria state map"]';
  let releaseTimer = null;
  let lockedTransform = null;
  let lockedGroup = null;
  let transformObserver = null;

  function findTransformGroup(svg) {
    return [...svg.querySelectorAll('g[transform]')].find((group) => {
      const value = group.getAttribute('transform') || '';
      return value.includes('scale(') && value.includes('translate(');
    });
  }

  function releaseLock() {
    if (transformObserver) transformObserver.disconnect();
    transformObserver = null;
    lockedTransform = null;
    lockedGroup = null;
    if (releaseTimer) window.clearTimeout(releaseTimer);
    releaseTimer = null;
  }

  function lockCurrentView(svg) {
    releaseLock();
    const group = findTransformGroup(svg);
    if (!group) return;

    lockedGroup = group;
    lockedTransform = group.getAttribute('transform');
    group.style.transition = 'none';

    transformObserver = new MutationObserver(() => {
      if (!lockedGroup || !lockedTransform) return;
      if (lockedGroup.getAttribute('transform') !== lockedTransform) {
        lockedGroup.setAttribute('transform', lockedTransform);
      }
      lockedGroup.style.transition = 'none';
    });
    transformObserver.observe(group, {
      attributes: true,
      attributeFilter: ['transform', 'style'],
    });

    releaseTimer = window.setTimeout(() => {
      if (lockedGroup) lockedGroup.style.transition = '';
      releaseLock();
    }, 650);
  }

  function pulseState(target) {
    const path = target.closest?.('path[role="button"], path[tabindex="0"], path[aria-label]');
    if (!path) return;
    path.classList.remove('veritas-map-state-selected-pulse');
    void path.getBoundingClientRect();
    path.classList.add('veritas-map-state-selected-pulse');
    window.setTimeout(() => path.classList.remove('veritas-map-state-selected-pulse'), 520);
  }

  document.addEventListener(
    'pointerdown',
    (event) => {
      const svg = event.target?.closest?.(MAP_SELECTOR);
      if (!svg) return;
      const path = event.target?.closest?.('path[role="button"], path[tabindex="0"], path[aria-label]');
      if (!path || !path.getAttribute('aria-label')) return;
      lockCurrentView(svg);
      pulseState(path);
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const svg = event.target?.closest?.(MAP_SELECTOR);
      if (!svg) return;
      const path = event.target?.closest?.('path[role="button"], path[tabindex="0"], path[aria-label]');
      if (!path) return;
      lockCurrentView(svg);
      pulseState(path);
    },
    true,
  );
})();
