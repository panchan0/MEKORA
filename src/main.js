import './legacy/bootstrap.js';
import './legacy/legacy-game.js';

import { createRuntime } from './core/runtime.js';
import { persistenceModule } from './modules/persistence-module.js';
import { progressionModule } from './modules/progression-module.js';
import { runConfigModule } from './modules/run-config-module.js';
import { stateMachineModule } from './modules/state-machine-module.js';
import { inputModule } from './modules/input-module.js';
import { uiModule } from './modules/ui-module.js';
import { developerModule } from './modules/developer-module.js';
import { workflowModule } from './modules/workflow-module.js';
import { legacyBridgeModule } from './modules/legacy-bridge-module.js';

const runtime = createRuntime();
runtime.modules.register('persistence', persistenceModule);
runtime.modules.register('progression', progressionModule);
runtime.modules.register('runConfig', runConfigModule);
runtime.modules.register('stateMachine', stateMachineModule);
runtime.modules.register('input', inputModule);
runtime.modules.register('ui', uiModule);
runtime.modules.register('developer', developerModule);
runtime.modules.register('workflow', workflowModule);
runtime.modules.register('legacyBridge', legacyBridgeModule);

const publicApi = {
  version: runtime.version,
  events: runtime.events,
  snapshot: () => runtime.snapshot(),
  command: (name, payload) => runtime.command(name, payload),
  modules: {
    list: () => runtime.modules.list(),
    info: () => runtime.modules.info(),
    get: (name) => runtime.modules.get(name)
  },
  services: {
    list: () => runtime.services.list(),
    get: (name) => runtime.services.get(name)
  },
  state: {
    get: () => runtime.store.getState(),
    subscribe: (callback) => runtime.store.subscribe(callback)
  },
  progression: {
    getCores: () => runtime.services.get('progression')?.getCores(),
    addCores: (amount) => runtime.services.get('progression')?.addCores(amount),
    setCores: (amount) => runtime.services.get('progression')?.setCores(amount),
    syncCounters: () => runtime.services.get('progression')?.syncCounters()
  },
  runConfig: {
    get: () => runtime.services.get('runConfig')?.get(),
    setDifficulty: (id) => runtime.services.get('runConfig')?.setDifficulty(id),
    setMap: (id) => runtime.services.get('runConfig')?.setMap(id)
  },
  workflow: {
    listSchemas: () => runtime.services.get('workflow')?.listSchemas(),
    createEntry: (type, overrides) => runtime.services.get('workflow')?.createEntry(type, overrides),
    register: (collection, item) => runtime.services.get('workflow')?.register(collection, item),
    exportProjectState: () => runtime.services.get('workflow')?.exportProjectState(),
    saveNote: (text) => runtime.services.get('workflow')?.saveNote(text)
  },
  ui: {
    openGarage: () => runtime.services.get('ui')?.openGarage(),
    openArsenal: (tab) => runtime.services.get('ui')?.openArsenal(tab),
    openMissions: () => runtime.services.get('ui')?.openMissions(),
    openStore: (tab) => runtime.services.get('ui')?.openStore(tab),
    openDeveloper: () => runtime.services.get('ui')?.openDeveloper(),
    openArchitecture: () => runtime.services.get('developer')?.openArchitecture()
  }
};

window.MEKORA = runtime;
window.mekora = publicApi;
window.MEKORA_V1 = runtime;
window.mekoraV1 = publicApi;

const boot = () => window.setTimeout(() => runtime.start(), 240);
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
