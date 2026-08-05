export class ServiceContainer {
  #services = new Map();

  set(name, service) {
    this.#services.set(name, service);
    return service;
  }

  get(name) {
    return this.#services.get(name);
  }

  has(name) {
    return this.#services.has(name);
  }

  list() {
    return [...this.#services.keys()];
  }
}
