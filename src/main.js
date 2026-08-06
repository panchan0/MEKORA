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
import { contentServiceModule } from './modules/content-service-module.js';
import { contentAuditModule } from './modules/content-audit-module.js';
import { gameplayProfileModule } from './modules/gameplay-profile-module.js';
import { cosmeticsModule } from './modules/cosmetics-module.js';
import { visualPolishModule } from './modules/visual-polish-module.js';
import { weaponSystemModule } from './modules/weapon-system-module.js';
import { waveDirectorModule } from './modules/wave-director-module.js';
import { expeditionModule } from './modules/expedition-module.js';
import { runSaveModule } from './modules/run-save-module.js';
import { combatUiModule } from './modules/combat-ui-module.js';
import { interfaceRevisionModule } from './modules/interface-revision-module.js';

const runtime = createRuntime();
runtime.modules.register('persistence', persistenceModule);
runtime.modules.register('progression', progressionModule);
runtime.modules.register('runConfig', runConfigModule);
runtime.modules.register('stateMachine', stateMachineModule);
runtime.modules.register('input', inputModule);
runtime.modules.register('ui', uiModule);
runtime.modules.register('developer', developerModule);
runtime.modules.register('workflow', workflowModule);
runtime.modules.register('contentService', contentServiceModule);
runtime.modules.register('contentAudit', contentAuditModule);
runtime.modules.register('gameplayProfile', gameplayProfileModule);
runtime.modules.register('cosmetics', cosmeticsModule);
runtime.modules.register('visualPolish', visualPolishModule);
runtime.modules.register('weaponSystem', weaponSystemModule);
runtime.modules.register('waveDirector', waveDirectorModule);
runtime.modules.register('expedition', expeditionModule);
runtime.modules.register('runSave', runSaveModule);
runtime.modules.register('combatUi', combatUiModule);
runtime.modules.register('interfaceRevision', interfaceRevisionModule);
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
  content: {
    summary: () => runtime.services.get('contentService')?.summary(),
    find: (id) => runtime.services.get('contentService')?.find(id),
    audit: () => runtime.services.get('contentAudit')?.run()
  },
  cosmetics: {
    getEquipped: () => runtime.services.get('cosmetics')?.getEquipped(),
    equipSkin: (id) => runtime.services.get('cosmetics')?.equipSkin(id),
    equipEffect: (id) => runtime.services.get('cosmetics')?.equipEffect(id)
  },
  gameplay: {
    getMechaProfile: () => runtime.services.get('gameplayProfile')?.getActiveProfile(),
    getMapModifier: () => runtime.services.get('gameplayProfile')?.getActiveMapModifier()
  },
  weapons: {
    list: () => runtime.services.get('weaponSystem')?.list(),
    getActive: () => runtime.services.get('weaponSystem')?.getActiveWeapon(),
    switch: (slot) => runtime.services.get('weaponSystem')?.switchWeapon(slot),
    equip: (id, slot) => runtime.services.get('weaponSystem')?.equipWeapon(id, slot),
    snapshot: () => runtime.services.get('weaponSystem')?.snapshot()
  },
  waves: {
    snapshot: () => runtime.services.get('waveDirector')?.snapshot(),
    enterSector: (sector) => runtime.services.get('waveDirector')?.enterSector?.(window.__mekoraLegacyV1?.getState?.(), sector)
  },
  expedition: {
    interact: () => runtime.services.get('expedition')?.interact(),
    showChest: () => runtime.services.get('expedition')?.showChestPreview(),
    showVendor: () => runtime.services.get('expedition')?.showVendorPreview(),
    objects: () => runtime.services.get('expedition')?.getObjects()
  },
  runSave: {
    save: (reason) => runtime.services.get('runSave')?.save(reason),
    load: () => runtime.services.get('runSave')?.load(),
    clear: () => runtime.services.get('runSave')?.clear(),
    continue: () => runtime.services.get('runSave')?.continueRun()
  },
  combatUi: {
    dash: () => runtime.services.get('combatUi')?.performDash(),
    refresh: () => runtime.services.get('combatUi')?.updateVisibility(window.__mekoraLegacyV1?.getState?.()),
    openSettings: () => runtime.services.get('combatUi')?.openPauseSettings()
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
