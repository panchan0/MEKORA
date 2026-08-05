export class ModuleRegistry {
  #modules = new Map();
  #order = [];

  constructor(runtime) {
    this.runtime = runtime;
  }

  register(name, definition) {
    if (this.#modules.has(name)) throw new Error(`Module already registered: ${name}`);
    const entry = {
      name,
      definition,
      api: null,
      status: 'registered',
      error: null,
      startedAt: null
    };
    this.#modules.set(name, entry);
    this.#order.push(name);
    return entry;
  }

  start(name) {
    const entry = this.#modules.get(name);
    if (!entry) throw new Error(`Unknown module: ${name}`);
    if (entry.status === 'running') return entry.api;
    try {
      entry.api = entry.definition.start?.(this.runtime, entry) ?? {};
      entry.status = 'running';
      entry.startedAt = Date.now();
      this.runtime.events.emit('module:started', { name, api: entry.api });
      return entry.api;
    } catch (error) {
      entry.status = 'error';
      entry.error = String(error?.message ?? error);
      this.runtime.events.emit('module:error', { name, error });
      console.error(`[MEKORA ModuleRegistry] ${name}`, error);
      return null;
    }
  }

  startAll() {
    this.#order.forEach((name) => this.start(name));
  }

  stop(name) {
    const entry = this.#modules.get(name);
    if (!entry || entry.status !== 'running') return;
    try {
      entry.definition.stop?.(this.runtime, entry.api);
    } finally {
      entry.status = 'stopped';
      this.runtime.events.emit('module:stopped', { name });
    }
  }

  get(name) {
    return this.#modules.get(name)?.api ?? null;
  }

  list() {
    return [...this.#order];
  }

  info() {
    return this.#order.map((name) => {
      const entry = this.#modules.get(name);
      return {
        name,
        status: entry.status,
        startedAt: entry.startedAt,
        error: entry.error
      };
    });
  }
}
