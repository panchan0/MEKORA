export class EventBus {
  #listeners = new Map();

  on(event, callback) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  once(event, callback) {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      callback(payload);
    });
    return unsubscribe;
  }

  off(event, callback) {
    this.#listeners.get(event)?.delete(callback);
  }

  emit(event, payload = {}) {
    this.#listeners.get(event)?.forEach((callback) => {
      try {
        callback(payload);
      } catch (error) {
        console.error(`[MEKORA EventBus] ${event}`, error);
      }
    });
    this.#listeners.get('*')?.forEach((callback) => {
      try {
        callback({ event, payload });
      } catch (error) {
        console.error('[MEKORA EventBus wildcard]', error);
      }
    });
  }

  clear(event) {
    if (event) this.#listeners.delete(event);
    else this.#listeners.clear();
  }

  count(event) {
    return this.#listeners.get(event)?.size ?? 0;
  }
}
