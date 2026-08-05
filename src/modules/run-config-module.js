export const runConfigModule = {
  start(runtime) {
    const persistence = runtime.services.get('persistence');
    const saved = persistence.loadRunConfig();
    const difficultyIds = new Set(runtime.data.difficulties.map((item) => item.id));
    const mapIds = new Set(runtime.data.maps.map((item) => item.id));

    const normalizeDifficulty = (id) => difficultyIds.has(id) ? id : runtime.data.difficulties[0].id;
    const normalizeMap = (id) => mapIds.has(id) ? id : runtime.data.maps[0].id;

    runtime.store.patch({
      selectedDifficulty: normalizeDifficulty(saved.difficulty),
      selectedMap: normalizeMap(saved.map)
    }, { source: 'run-config:init' });

    const api = {
      get() {
        const state = runtime.store.getState();
        return { difficulty: state.selectedDifficulty, map: state.selectedMap };
      },
      setDifficulty(id) {
        const difficulty = normalizeDifficulty(id);
        window.mekoraV340?.setDifficulty?.(difficulty);
        runtime.store.patch({ selectedDifficulty: difficulty }, { source: 'run-config:difficulty' });
        persistence.saveRunConfig(this.get());
        runtime.events.emit('run-config:changed', this.get());
        return this.get();
      },
      setMap(id) {
        const map = normalizeMap(id);
        window.mekoraV340?.setMap?.(map);
        runtime.store.patch({ selectedMap: map }, { source: 'run-config:map' });
        persistence.saveRunConfig(this.get());
        runtime.events.emit('run-config:changed', this.get());
        return this.get();
      },
      apply() {
        const current = this.get();
        window.mekoraV340?.setDifficulty?.(current.difficulty);
        window.mekoraV340?.setMap?.(current.map);
        return current;
      }
    };

    runtime.services.set('runConfig', api);
    queueMicrotask(() => api.apply());
    return api;
  }
};
