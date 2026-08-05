import { deepClone } from '../utils/clone.js';

export class Store {
  #state;
  #subscribers = new Set();

  constructor(initialState, events) {
    this.#state = deepClone(initialState);
    this.events = events;
  }

  getState() {
    return this.#state;
  }

  setState(updater, meta = {}) {
    const previous = this.#state;
    const next = typeof updater === 'function'
      ? updater(previous)
      : { ...previous, ...updater };
    this.#state = next;
    this.#subscribers.forEach((subscriber) => {
      try {
        subscriber(next, previous, meta);
      } catch (error) {
        console.error('[MEKORA Store]', error);
      }
    });
    this.events?.emit('store:changed', { state: next, previous, meta });
    return next;
  }

  patch(partial, meta = {}) {
    return this.setState((current) => ({ ...current, ...partial }), meta);
  }

  subscribe(callback) {
    this.#subscribers.add(callback);
    return () => this.#subscribers.delete(callback);
  }
}
