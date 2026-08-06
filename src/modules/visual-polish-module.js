const RELEASE = '1.4.2';

function ensureReleaseBadge() {
  let badge = document.getElementById('v130-release-badge');
  if (badge) return badge;
  badge = document.createElement('div');
  badge.id = 'v130-release-badge';
  badge.textContent = `BUILD ${RELEASE}`;
  document.body.appendChild(badge);
  return badge;
}

function decorateVisiblePanel() {
  const activeOverlay = document.querySelector('.v340-overlay:not(.hidden)');
  const phase = document.body.dataset.phase || 'menu';
  document.body.dataset.activePanelV130 = activeOverlay?.id || phase;
}

export const visualPolishModule = {
  start(runtime) {
    document.body.dataset.visualRelease = RELEASE;
    document.documentElement.style.setProperty('--mk-release', `'${RELEASE}'`);
    ensureReleaseBadge();
    decorateVisiblePanel();

    const observer = new MutationObserver(decorateVisiblePanel);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-phase']
    });

    const api = {
      release: RELEASE,
      refresh() {
        ensureReleaseBadge();
        decorateVisiblePanel();
        return { release: RELEASE, panel: document.body.dataset.activePanelV130 };
      },
      stop() { observer.disconnect(); }
    };

    runtime.services.set('visualPolish', api);
    runtime.events.emit('visual:ready', api.refresh());
    return api;
  },
  stop(runtime, api) { api?.stop?.(); }
};
