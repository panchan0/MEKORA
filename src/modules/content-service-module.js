export const contentServiceModule = {
  start(runtime) {
    const api = {
      getArsenal() { return runtime.content.all('arsenal'); },
      getWeapons() { return this.getArsenal().filter((item) => item.type === 'weapon'); },
      getPassives() { return this.getArsenal().filter((item) => item.type === 'passive'); },
      getSynergies() { return runtime.content.all('synergies'); },
      getMechas() { return runtime.content.all('mechas'); },
      getEnemies() { return runtime.content.all('enemies'); },
      getMissions() { return runtime.content.all('missions'); },
      getBosses() { return runtime.content.all('bosses'); },
      find(id) {
        for (const collection of runtime.content.listCollections()) {
          const item = runtime.content.get(collection, id);
          if (item) return { collection, item };
        }
        return null;
      },
      summary() {
        return Object.fromEntries(runtime.content.listCollections().map((name) => [name, runtime.content.all(name).length]));
      }
    };
    runtime.services.set('contentService', api);
    return api;
  }
};
