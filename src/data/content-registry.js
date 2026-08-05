import { deepClone } from '../utils/clone.js';

export class ContentRegistry {
  #collections = new Map();

  registerCollection(name, items = []) {
    const collection = new Map();
    items.forEach((item) => collection.set(item.id, deepClone(item)));
    this.#collections.set(name, collection);
    return this;
  }

  add(collectionName, item) {
    if (!item?.id) throw new Error(`Content in ${collectionName} requires an id`);
    if (!this.#collections.has(collectionName)) this.registerCollection(collectionName);
    this.#collections.get(collectionName).set(item.id, deepClone(item));
    return item;
  }

  get(collectionName, id) {
    return deepClone(this.#collections.get(collectionName)?.get(id) ?? null);
  }

  all(collectionName) {
    return [...(this.#collections.get(collectionName)?.values() ?? [])].map(deepClone);
  }

  listCollections() {
    return [...this.#collections.keys()];
  }
}
