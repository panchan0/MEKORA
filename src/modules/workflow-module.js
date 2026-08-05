import { deepClone } from '../utils/clone.js';

export const workflowModule = {
  start(runtime) {
    const api = {
      listSchemas() {
        return Object.keys(runtime.data.schemas);
      },
      createEntry(type, overrides = {}) {
        const schema = runtime.data.schemas[type];
        if (!schema) throw new Error(`Unknown content schema: ${type}`);
        return {
          ...deepClone(schema),
          ...deepClone(overrides),
          tags: Array.from(new Set([...(schema.tags || []), ...(overrides.tags || [])]))
        };
      },
      register(collection, item) {
        runtime.content.add(collection, item);
        runtime.events.emit('content:registered', { collection, item });
        return item;
      },
      exportProjectState() {
        return {
          version: runtime.version,
          snapshot: runtime.snapshot(),
          progression: runtime.services.get('progression')?.snapshot?.() ?? {},
          runConfig: runtime.services.get('runConfig')?.get?.() ?? {},
          collections: runtime.content.listCollections()
        };
      },
      saveNote(text) {
        const persistence = runtime.services.get('persistence');
        const current = persistence.loadRuntime();
        const notes = Array.isArray(current.notes) ? current.notes.slice(0, 49) : [];
        notes.unshift({ text: String(text || '').slice(0, 500), at: Date.now() });
        persistence.saveRuntime({ ...current, notes });
        return notes;
      }
    };
    runtime.services.set('workflow', api);
    return api;
  }
};
