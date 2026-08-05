export const inputModule = {
  start(runtime) {
    const sync = () => {
      runtime.store.patch({
        inputDevice: document.body.dataset.inputDevice || 'touch',
        platform: document.body.dataset.platformV342 || 'mobile'
      }, { source: 'input:sync' });
    };

    const listeners = [
      ['mousemove', sync, { passive: true }],
      ['touchstart', sync, { passive: true }],
      ['gamepadconnected', sync, undefined],
      ['gamepaddisconnected', sync, undefined]
    ];
    listeners.forEach(([event, callback, options]) => window.addEventListener(event, callback, options));
    sync();

    const api = {
      current() {
        const state = runtime.store.getState();
        return { device: state.inputDevice, platform: state.platform };
      },
      isPc() {
        return this.current().platform === 'pc';
      },
      forceDevice(device) {
        document.body.dataset.inputDevice = device;
        sync();
        runtime.events.emit('input:forced', this.current());
        return this.current();
      },
      stop() {
        listeners.forEach(([event, callback, options]) => window.removeEventListener(event, callback, options));
      }
    };
    runtime.services.set('input', api);
    return api;
  },
  stop(runtime, api) {
    api?.stop?.();
  }
};
