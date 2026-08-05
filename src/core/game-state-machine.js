export class GameStateMachine {
  constructor({ initialState = 'boot', events, store }) {
    this.current = initialState;
    this.events = events;
    this.store = store;
  }

  normalize(state) {
    const aliases = {
      draft: 'playing',
      global_network: 'menu'
    };
    return aliases[state] ?? state ?? 'boot';
  }

  transition(nextState, meta = {}) {
    const previous = this.current;
    this.current = this.normalize(nextState);
    this.store?.patch({ appState: this.current }, { source: 'state-machine', ...meta });
    this.events?.emit('state:changed', { previous, state: this.current, meta });
    return this.current;
  }
}
