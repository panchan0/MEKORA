import { GameStateMachine } from '../core/game-state-machine.js';

export const stateMachineModule = {
  start(runtime) {
    const machine = new GameStateMachine({
      initialState: document.body.dataset.phase || 'menu',
      events: runtime.events,
      store: runtime.store
    });

    const sync = () => {
      machine.transition(document.body.dataset.phase || 'menu', { source: 'body-dataset' });
      runtime.store.patch({
        inputDevice: document.body.dataset.inputDevice || runtime.store.getState().inputDevice,
        platform: document.body.dataset.platformV342 || runtime.store.getState().platform,
        immersive: document.body.dataset.immersive === 'true',
        quality: document.body.dataset.quality || runtime.store.getState().quality
      }, { source: 'body-dataset' });
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-phase', 'data-input-device', 'data-platform-v342', 'data-immersive', 'data-quality']
    });
    sync();

    const api = {
      get: () => machine.current,
      set: (state, meta) => machine.transition(state, meta),
      stop: () => observer.disconnect()
    };
    runtime.services.set('stateMachine', api);
    return api;
  },
  stop(runtime, api) {
    api?.stop?.();
  }
};
