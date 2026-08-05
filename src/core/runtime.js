import { EventBus } from './event-bus.js';
import { Store } from './store.js';
import { ServiceContainer } from './service-container.js';
import { ModuleRegistry } from './module-registry.js';
import { ContentRegistry } from '../data/content-registry.js';
import { RELEASE, CONTENT_SCHEMAS } from '../data/defaults.js';
import { DIFFICULTIES_DATA } from '../data/difficulties.js';
import { MAPS_DATA } from '../data/maps.js';
import { MECHAS } from '../data/mechas.js';
import { ARSENAL_ITEMS } from '../data/arsenal.js';
import { SYNERGIES } from '../data/synergies.js';
import { ENEMIES } from '../data/enemies.js';
import { STORE_SKINS, STORE_EFFECTS, STORE_BOXES } from '../data/store.js';
import { MISSIONS } from '../data/missions.js';
import { BOSSES } from '../data/bosses.js';
import { MECHA_PROFILES } from '../data/mecha-profiles.js';
import { MAP_MODIFIERS } from '../data/map-modifiers.js';

export function createRuntime() {
  const events = new EventBus();
  const services = new ServiceContainer();
  const content = new ContentRegistry();

  const runtime = {
    version: RELEASE.version,
    release: RELEASE,
    events,
    services,
    content,
    data: {
      difficulties: DIFFICULTIES_DATA,
      maps: MAPS_DATA,
      schemas: CONTENT_SCHEMAS,
      mechaProfiles: MECHA_PROFILES,
      mapModifiers: MAP_MODIFIERS
    },
    started: false,
    startedAt: null
  };

  content
    .registerCollection('mechas', MECHAS)
    .registerCollection('arsenal', ARSENAL_ITEMS)
    .registerCollection('synergies', SYNERGIES)
    .registerCollection('enemies', ENEMIES)
    .registerCollection('skins', STORE_SKINS)
    .registerCollection('effects', STORE_EFFECTS)
    .registerCollection('boxes', STORE_BOXES)
    .registerCollection('maps', MAPS_DATA)
    .registerCollection('difficulties', DIFFICULTIES_DATA)
    .registerCollection('missions', MISSIONS)
    .registerCollection('bosses', BOSSES)
    .registerCollection('mechaProfiles', MECHA_PROFILES)
    .registerCollection('mapModifiers', MAP_MODIFIERS);

  runtime.store = new Store({
    appState: document.body.dataset.phase || 'boot',
    inputDevice: document.body.dataset.inputDevice || 'touch',
    platform: document.body.dataset.platformV342 || 'mobile',
    immersive: document.body.dataset.immersive === 'true',
    quality: document.body.dataset.quality || 'high',
    cores: 0,
    selectedDifficulty: runtime.data.difficulties[0].id,
    selectedMap: runtime.data.maps[0].id,
    activePanel: 'menu',
    modules: []
  }, events);

  runtime.modules = new ModuleRegistry(runtime);
  runtime.services.set('runtime', runtime);
  runtime.services.set('content', content);

  runtime.start = () => {
    if (runtime.started) return runtime;
    runtime.modules.startAll();
    runtime.started = true;
    runtime.startedAt = Date.now();
    runtime.store.patch({ modules: runtime.modules.list() }, { source: 'runtime:start' });
    runtime.events.emit('runtime:ready', {
      version: runtime.version,
      modules: runtime.modules.list()
    });
    return runtime;
  };

  runtime.snapshot = () => ({
    version: runtime.version,
    release: runtime.release,
    state: runtime.store.getState(),
    modules: runtime.modules.info(),
    services: runtime.services.list(),
    collections: runtime.content.listCollections(),
    progression: runtime.services.get('progression')?.snapshot?.() ?? {},
    runConfig: runtime.services.get('runConfig')?.get?.() ?? {}
  });

  runtime.command = (name, payload) => {
    const commands = {
      'open:garage': () => runtime.services.get('ui')?.openGarage?.(),
      'open:arsenal': () => runtime.services.get('ui')?.openArsenal?.(payload || 'weapons'),
      'open:missions': () => runtime.services.get('ui')?.openMissions?.(),
      'open:store': () => runtime.services.get('ui')?.openStore?.(payload || 'mechs'),
      'open:developer': () => runtime.services.get('ui')?.openDeveloper?.(),
      'open:architecture': () => runtime.services.get('developer')?.openArchitecture?.(),
      'dev:add-cores': () => runtime.services.get('developer')?.addCores?.(Number(payload) || 100),
      'dev:unlock-all': () => runtime.services.get('developer')?.unlockAll?.()
    };
    if (!commands[name]) throw new Error(`Unknown runtime command: ${name}`);
    return commands[name]();
  };

  return runtime;
}
