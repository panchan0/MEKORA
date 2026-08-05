const SKIN_PALETTES = Object.freeze({
  'skin-axiom-ash': { armor: '#858a8e', dark: '#20282e', accent: '#555f64', energy: '#e4b95f', filter: 'saturate(.72) brightness(.88)' },
  'skin-origins-white': { armor: '#f0eee8', dark: '#344149', accent: '#b9d6d4', energy: '#ffffff', filter: 'saturate(.55) brightness(1.12)' },
  'skin-lancer-red': { armor: '#d4c9c1', dark: '#2b2529', accent: '#c63d39', energy: '#ffcf69', filter: 'saturate(1.25) contrast(1.05)' }
});

function ensureCosmeticState(progression) {
  progression.v1 = progression.v1 || {};
  progression.v1.cosmetics = progression.v1.cosmetics || { skin: null, effect: null };
  return progression.v1.cosmetics;
}

export const cosmeticsModule = {
  start(runtime) {
    const legacy = window.__mekoraLegacyV1;
    const internal = window.__mekoraV340Internal;
    const getProgression = () => legacy?.getProgression?.() || internal?.getProgression?.() || {};
    const save = () => legacy?.saveProgression?.();
    const owned = (category, id) => {
      const progression = getProgression();
      const inventory = progression.v340?.inventory || {};
      return (inventory[category] || []).includes(id);
    };
    const getEquipped = () => ensureCosmeticState(getProgression());
    const applyVisualState = () => {
      const equipped = getEquipped();
      document.body.dataset.equippedSkin = equipped.skin || 'none';
      document.body.dataset.equippedEffect = equipped.effect || 'none';
      const palette = SKIN_PALETTES[equipped.skin];
      document.documentElement.style.setProperty('--mk-mecha-filter', palette?.filter || 'none');
      return equipped;
    };
    const originalPaletteGetter = window.getActiveMechPaletteV340;
    window.getActiveMechPaletteV340 = () => {
      const base = originalPaletteGetter?.() || { armor: '#d7d0c2', dark: '#29343a', accent: '#a6523f', energy: '#e0ad4e' };
      return { ...base, ...(SKIN_PALETTES[getEquipped().skin] || {}) };
    };

    const api = {
      getEquipped,
      equipSkin(id) {
        if (id && !owned('skins', id)) return false;
        ensureCosmeticState(getProgression()).skin = id || null;
        save();
        applyVisualState();
        runtime.events.emit('cosmetic:equipped', { category: 'skin', id: id || null });
        return true;
      },
      equipEffect(id) {
        if (id && !owned('effects', id)) return false;
        ensureCosmeticState(getProgression()).effect = id || null;
        save();
        applyVisualState();
        runtime.events.emit('cosmetic:equipped', { category: 'effect', id: id || null });
        return true;
      },
      toggle(category, id) {
        const current = getEquipped()[category === 'skins' ? 'skin' : 'effect'];
        return category === 'skins' ? this.equipSkin(current === id ? null : id) : this.equipEffect(current === id ? null : id);
      },
      decorateStore() {
        const root = document.getElementById('v340-store');
        if (!root || root.classList.contains('hidden')) return;
        const progression = getProgression();
        const equipped = ensureCosmeticState(progression);
        const inventory = progression.v340?.inventory || {};
        const items = [...runtime.content.all('skins'), ...runtime.content.all('effects')];
        root.querySelectorAll('[data-store-buy]').forEach((button) => {
          const id = button.dataset.storeBuy;
          const item = items.find((entry) => entry.id === id);
          if (!item) return;
          const category = id.startsWith('skin-') ? 'skins' : 'effects';
          const isOwned = (inventory[category] || []).includes(id);
          const selected = category === 'skins' ? equipped.skin === id : equipped.effect === id;
          if (!isOwned) return;
          button.disabled = false;
          button.textContent = selected ? 'EQUIPADO' : 'EQUIPAR';
          button.dataset.cosmeticEquip = id;
          button.closest('.v340-card')?.classList.toggle('equipped-v11', selected);
        });
      },
      applyVisualState
    };

    const click = (event) => {
      const button = event.target.closest('[data-cosmetic-equip]');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = button.dataset.cosmeticEquip;
      api.toggle(id.startsWith('skin-') ? 'skins' : 'effects', id);
      internal?.toastV340?.(getEquipped()[id.startsWith('skin-') ? 'skin' : 'effect'] === id ? 'COSMÉTICO EQUIPADO' : 'COSMÉTICO RETIRADO');
      queueMicrotask(api.decorateStore);
    };
    document.addEventListener('click', click, true);

    const off = [];
    if (legacy?.on) {
      off.push(legacy.on('frame:before', ({ state, timestamp }) => {
        const effect = getEquipped().effect;
        if (effect === 'fx-trail-ghost' && state.phase === 'playing' && state.moveJoystick?.active && timestamp >= (state.nextGhostTrailV11 || 0)) {
          state.nextGhostTrailV11 = timestamp + 75;
          state.particles.push({ x: state.mecha.x, y: state.mecha.y, vx: -(state.mecha.vx || 0) * 0.15 + (Math.random() - 0.5), vy: -(state.mecha.vy || 0) * 0.15 + (Math.random() - 0.5), life: 22, color: '#9fd7e6' });
        }
      }));
      off.push(legacy.on('enemy:damaged', ({ state, enemy }) => {
        if (getEquipped().effect !== 'fx-impact-amber' || !enemy) return;
        state.particles.push(...Array.from({ length: 3 }, () => ({ x: enemy.x, y: enemy.y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 16, color: '#e0ad4e' })));
      }));
      off.push(legacy.on('enemy:defeated', ({ state, enemy }) => {
        if (getEquipped().effect !== 'fx-destruction-forge' || !enemy) return;
        state.particles.push(...Array.from({ length: 18 }, () => ({ x: enemy.x, y: enemy.y, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 28, color: Math.random() > 0.45 ? '#ff8a3d' : '#ffd27a' })));
      }));
    }

    applyVisualState();
    const decorateInterval = window.setInterval(api.decorateStore, 650);
    runtime.services.set('cosmetics', api);
    return {
      ...api,
      stop() {
        clearInterval(decorateInterval);
        document.removeEventListener('click', click, true);
        off.forEach((unsubscribe) => unsubscribe?.());
      }
    };
  },
  stop(runtime, api) {
    api?.stop?.();
  }
};
