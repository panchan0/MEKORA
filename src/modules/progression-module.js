import { deepClone } from '../utils/clone.js';
import { setText } from '../utils/dom.js';

function normalizeProgression(raw = {}) {
  const progression = { ...raw };
  progression.cores = Math.max(0, Math.floor(Number(progression.cores) || 0));
  progression.unlockedMechs = Array.from(new Set(progression.unlockedMechs || ['vanguard']));
  progression.mechBlueprints = { ...(progression.mechBlueprints || {}) };
  progression.v340 = progression.v340 || {};
  progression.v340.activeMech = progression.v340.activeMech || 'vanguard';
  progression.v340.unlockedMechs = Array.from(new Set(
    progression.v340.unlockedMechs || progression.unlockedMechs || ['vanguard']
  ));
  progression.v340.inventory = {
    skins: [], effects: [], boxesOpened: 0, parts: {},
    ...(progression.v340.inventory || {})
  };
  return progression;
}

export const progressionModule = {
  start(runtime) {
    const persistence = runtime.services.get('persistence');
    const legacy = () => window.__mekoraV340Internal || null;

    const load = () => {
      const live = legacy()?.getProgression?.();
      return normalizeProgression(deepClone(live || persistence.loadProgression()));
    };

    const announce = (cores, source) => {
      const safeCores = Math.max(0, Math.floor(Number(cores) || 0));
      runtime.store.patch({ cores: safeCores }, { source });
      runtime.events.emit('progression:changed', { progression: load(), source });
      return safeCores;
    };

    const persistFallback = (progression, source) => {
      const normalized = normalizeProgression(progression);
      persistence.saveProgression(normalized);
      announce(normalized.cores, source);
      return normalized;
    };

    const api = {
      snapshot: load,
      getCores() {
        return legacy()?.getCores?.() ?? load().cores;
      },
      setCores(value) {
        const safeValue = Math.max(0, Math.floor(Number(value) || 0));
        const bridge = legacy();
        if (bridge?.setCores) {
          const cores = bridge.setCores(safeValue);
          announce(cores, 'progression:set-cores');
          return load();
        }
        const progression = load();
        progression.cores = safeValue;
        return persistFallback(progression, 'progression:set-cores');
      },
      addCores(amount) {
        const delta = Math.floor(Number(amount) || 0);
        const bridge = legacy();
        if (bridge?.addCores) {
          const cores = bridge.addCores(delta);
          announce(cores, 'progression:add-cores');
          return load();
        }
        const progression = load();
        progression.cores = Math.max(0, progression.cores + delta);
        return persistFallback(progression, 'progression:add-cores');
      },
      spendCores(amount) {
        const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
        const bridge = legacy();
        if (bridge?.spendCores) {
          const spent = bridge.spendCores(safeAmount);
          announce(this.getCores(), 'progression:spend-cores');
          return spent;
        }
        const progression = load();
        if (progression.cores < safeAmount) return false;
        progression.cores -= safeAmount;
        persistFallback(progression, 'progression:spend-cores');
        return true;
      },
      syncCounters() {
        const cores = this.getCores();
        legacy()?.refreshCoreCountersV340?.();
        setText('#core-wallet-count, #v340-core-count, #v342-dev-core-balance, [data-core-counter]', cores);
        runtime.store.patch({ cores }, { source: 'progression:sync' });
        return cores;
      }
    };

    runtime.store.patch({ cores: api.getCores() }, { source: 'progression:init' });
    runtime.services.set('progression', api);
    return api;
  }
};
