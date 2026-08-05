import { byId, clickById } from '../utils/dom.js';

export const uiModule = {
  start(runtime) {
    const api = {
      setReleaseStamp() {
        document.title = `MEKORA v${runtime.version}`;
        byId('settings-version-text')?.replaceChildren(document.createTextNode(`MEKORA v${runtime.version}`));
        document.body.dataset.release = runtime.version;
        document.body.dataset.runtimeVersion = runtime.version;
      },
      openGarage() {
        return window.mekoraV340?.openGarage?.() ?? { opened: clickById('btn-main-hangar') };
      },
      openArsenal(tab = 'weapons') {
        return window.mekoraV340?.openArsenal?.(tab) ?? { opened: false, tab };
      },
      openMissions() {
        return window.mekoraV340?.openMissions?.() ?? { opened: false };
      },
      openStore(tab = 'mechs') {
        return window.mekoraV340?.openStore?.(tab) ?? { opened: false, tab };
      },
      openDeveloper() {
        return window.mekoraV342?.developer?.open?.() ?? { opened: clickById('btn-main-dev') };
      }
    };
    api.setReleaseStamp();
    runtime.services.set('ui', api);
    return api;
  }
};
