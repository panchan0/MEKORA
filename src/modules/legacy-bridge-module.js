export const legacyBridgeModule = {
  start(runtime) {
    const progression = runtime.services.get('progression');
    const ui = runtime.services.get('ui');
    const runConfig = runtime.services.get('runConfig');

    ui?.setReleaseStamp?.();
    progression?.syncCounters?.();
    runConfig?.apply?.();

    const onClick = (event) => {
      const control = event.target.closest('button, [role="button"]');
      if (!control) return;
      const actionId = control.id
        || control.dataset.tab
        || control.dataset.storeTab
        || control.dataset.mission
        || control.dataset.buy
        || control.dataset.storeBuy
        || control.textContent?.trim().slice(0, 48)
        || 'unknown';
      runtime.events.emit('ui:action', {
        actionId,
        phase: runtime.store.getState().appState
      });
    };

    document.addEventListener('click', onClick, true);
    const timer = window.setInterval(() => {
      progression?.syncCounters?.();
      ui?.setReleaseStamp?.();
      runtime.services.get('developer')?.attachArchitectureTab?.();
    }, 900);

    const api = {
      legacy: {
        v340: () => window.mekoraV340,
        v342: () => window.mekoraV342
      },
      stop() {
        document.removeEventListener('click', onClick, true);
        window.clearInterval(timer);
      }
    };
    runtime.services.set('legacyBridge', api);
    return api;
  },
  stop(runtime, api) {
    api?.stop?.();
  }
};
