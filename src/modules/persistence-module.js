import { readJson, writeJson } from '../utils/json.js';

const KEYS = Object.freeze({
  runtime: 'mekora_v1_runtime',
  progression: 'mekora_v3_progression',
  runConfig: 'mekora_v1_run_config',
  debug: 'mekora_v1_debug'
});

export const persistenceModule = {
  start(runtime) {
    const api = {
      keys: KEYS,
      readJson,
      writeJson,
      loadRuntime() {
        return readJson(KEYS.runtime, { version: runtime.version, notes: [], counters: {} });
      },
      saveRuntime(value) {
        const next = { ...this.loadRuntime(), ...value, version: runtime.version, updatedAt: Date.now() };
        writeJson(KEYS.runtime, next);
        return next;
      },
      loadProgression() {
        return readJson(KEYS.progression, {});
      },
      saveProgression(value) {
        writeJson(KEYS.progression, value);
        return value;
      },
      loadRunConfig() {
        return readJson(KEYS.runConfig, { difficulty: runtime.data.difficulties[0].id, map: runtime.data.maps[0].id });
      },
      saveRunConfig(value) {
        const next = { difficulty: runtime.data.difficulties[0].id, map: runtime.data.maps[0].id, ...value, updatedAt: Date.now() };
        writeJson(KEYS.runConfig, next);
        return next;
      }
    };
    runtime.services.set('persistence', api);
    return api;
  }
};
