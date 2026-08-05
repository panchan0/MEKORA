import { MECHA_PROFILE_BY_ID } from '../data/mecha-profiles.js';
import { MAP_MODIFIER_BY_ID } from '../data/map-modifiers.js';

const EXPLOSIVE_DAMAGE_IDS = new Set(['w-missile','w-grenadelauncher','w-plasma','w-mines','w-orbital','p-explode','syn-napalm','syn-singularidad','syn-apocalipsis','syn-nova','syn-dragon']);
const SUPPORT_DAMAGE_IDS = new Set(['w-drones', 'w-turrets', 'w-mines', 'w-summons', 'w-repairdrones', 'syn-portamisiles', 'syn-centinela', 'syn-nanoenjambre', 'syn-helios', 'syn-dragon']);

export const gameplayProfileModule = {
  start(runtime) {
    let lastAppliedFactors = null;
    let lastDynamicDps = 1;
    let lastDynamicSpeed = 1;
    const legacy = window.__mekoraLegacyV1;
    const getProfile = () => {
      const progression = legacy?.getProgression?.() || runtime.services.get('progression')?.snapshot?.() || {};
      const activeId = progression.v340?.activeMech || 'axiom';
      return MECHA_PROFILE_BY_ID.get(activeId) || MECHA_PROFILE_BY_ID.get('axiom');
    };
    const getMap = () => {
      const id = legacy?.getState?.()?.runMapV340 || runtime.services.get('runConfig')?.get?.().map || 'scrap_prime';
      return MAP_MODIFIER_BY_ID.get(id) || MAP_MODIFIER_BY_ID.get('scrap_prime');
    };

    const applyRunProfile = ({ state, args = [] } = {}) => {
      const gameState = state || legacy?.getState?.();
      if (!gameState?.mecha) return null;
      const profile = getProfile();
      const map = getMap();
      const stats = profile.stats;
      const isDeveloperRun = Boolean(args?.[0]);
      if (isDeveloperRun && lastAppliedFactors) {
        gameState.stats.dpsMult = Math.max(0.1, (gameState.stats.dpsMult || 1) / lastDynamicDps / lastAppliedFactors.dps);
        gameState.stats.speedMult = Math.max(0.1, (gameState.stats.speedMult || 1) / lastDynamicSpeed / lastAppliedFactors.speed);
        gameState.stats.fireRateMult = Math.max(0.1, (gameState.stats.fireRateMult || 1) / lastAppliedFactors.fireRate);
        gameState.stats.reloadSpeedMult = Math.max(0.1, (gameState.stats.reloadSpeedMult || 1) / lastAppliedFactors.reload);
      }
      gameState.activeMechaProfileV11 = profile;
      gameState.activeMapModifierV11 = map;
      gameState.mekoraProfileDynamicDpsV11 = 1;
      gameState.mekoraProfileDynamicSpeedV11 = 1;
      gameState.mekoraProfileKillCountV11 = 0;
      gameState.mekoraProfileDamageBufferV11 = 0;
      gameState.mekoraProfileNextRegenAtV11 = performance.now() + 4000;
      gameState.mekoraProfilePhaseReadyAtV11 = performance.now();
      gameState.mecha.maxHp = stats.maxHp;
      gameState.mecha.hp = stats.maxHp;
      gameState.mecha.maxShield = stats.maxShield;
      gameState.mecha.shield = stats.maxShield;
      const appliedFactors = {
        dps: stats.dpsMult,
        speed: stats.speedMult,
        fireRate: stats.fireRateMult,
        reload: stats.reloadSpeedMult * (map.gameplay.reloadSpeedMult || 1)
      };
      gameState.stats.dpsMult = (gameState.stats.dpsMult || 1) * appliedFactors.dps;
      gameState.stats.speedMult = (gameState.stats.speedMult || 1) * appliedFactors.speed;
      gameState.stats.fireRateMult = (gameState.stats.fireRateMult || 1) * appliedFactors.fireRate;
      gameState.stats.reloadSpeedMult = (gameState.stats.reloadSpeedMult || 1) * appliedFactors.reload;
      gameState.appliedProfileFactorsV11 = appliedFactors;
      lastAppliedFactors = appliedFactors;
      lastDynamicDps = 1;
      lastDynamicSpeed = 1;
      gameState.mapVisibilityMultV11 = map.gameplay.visibilityMult || 1;
      document.body.dataset.activeMecha = profile.id;
      document.body.dataset.activeMapModifier = map.id;
      const runConfig = runtime.services.get('runConfig');
      if (gameState.runDifficultyV340) runConfig?.setDifficulty?.(gameState.runDifficultyV340);
      if (gameState.runMapV340) runConfig?.setMap?.(gameState.runMapV340);
      runtime.store.patch({ activeMecha: profile.id, activeMechaTrait: profile.trait.id, activeMapModifier: map.id }, { source: 'gameplay-profile:run-start' });
      runtime.events.emit('profile:applied', { profile, map });
      return { profile, map };
    };

    const off = [];
    if (legacy?.on) {
      off.push(legacy.on('run:start', applyRunProfile));
      off.push(legacy.on('frame:before', ({ state, timestamp }) => {
        const profile = state.activeMechaProfileV11;
        if (!profile || state.phase !== 'playing' || state.paused) return;
        if (profile.id === 'axiom' && timestamp >= (state.mekoraProfileNextRegenAtV11 || 0)) {
          state.mekoraProfileNextRegenAtV11 = timestamp + 4000;
          if (timestamp >= (state.mecha.damageFlashUntil || 0) + 1600) state.mecha.hp = Math.min(state.mecha.maxHp, state.mecha.hp + 1);
        }
        if (profile.id === 'lancer') {
          const moving = Math.hypot(state.mecha.vx || 0, state.mecha.vy || 0) > 0.3 || state.moveJoystick?.active;
          const target = moving ? 1.18 : 1;
          const previous = state.mekoraProfileDynamicDpsV11 || 1;
          if (Math.abs(previous - target) > 0.001) {
            state.stats.dpsMult = Math.max(0.1, (state.stats.dpsMult || 1) / previous * target);
            state.mekoraProfileDynamicDpsV11 = target;
            lastDynamicDps = target;
          }
        }
        const targetSpeed = profile.id === 'wraith' && timestamp < (state.mekoraProfilePhaseBoostUntilV11 || 0) ? 1.18 : 1;
        const previousSpeed = state.mekoraProfileDynamicSpeedV11 || 1;
        if (Math.abs(previousSpeed - targetSpeed) > 0.001) {
          state.stats.speedMult = Math.max(0.1, (state.stats.speedMult || 1) / previousSpeed * targetSpeed);
          state.mekoraProfileDynamicSpeedV11 = targetSpeed;
          lastDynamicSpeed = targetSpeed;
        }
      }));
      off.push(legacy.on('mecha:damage-before', (context) => {
        const state = context.state;
        const profile = state.activeMechaProfileV11;
        if (!profile) return;
        if (profile.id === 'bastion') {
          context.amount *= 0.78;
          state.mekoraProfileDamageBufferV11 = (state.mekoraProfileDamageBufferV11 || 0) + context.amount;
          if (state.mekoraProfileDamageBufferV11 >= 45) {
            state.mekoraProfileDamageBufferV11 = 0;
            state.shockwaves.push({ x: state.mecha.x, y: state.mecha.y, radius: 8, maxRadius: 105, damage: 55, life: 18, maxLife: 18, color: '#dcb269', pushBack: true, hitEnemies: [] });
          }
        }
        if (profile.id === 'wraith' && context.timestamp >= (state.mekoraProfilePhaseReadyAtV11 || 0)) {
          context.cancel = true;
          state.mekoraProfilePhaseReadyAtV11 = context.timestamp + 12000;
          state.mekoraProfilePhaseBoostUntilV11 = context.timestamp + 1800;
          state.particles.push(...Array.from({ length: 14 }, () => ({ x: state.mecha.x, y: state.mecha.y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, life: 24, color: '#9fd7e6' })));
        }
      }));
      off.push(legacy.on('enemy:defeated', ({ state }) => {
        const profile = state.activeMechaProfileV11;
        if (profile?.id !== 'origins') return;
        state.mekoraProfileKillCountV11 = (state.mekoraProfileKillCountV11 || 0) + 1;
        if (state.mekoraProfileKillCountV11 % 20 === 0) {
          state.mecha.shield = Math.min(state.mecha.maxShield, state.mecha.shield + 12);
          state.mecha.reactorOverloadUntil = Math.max(state.mecha.reactorOverloadUntil || 0, performance.now() + 1800);
        }
      }));
      off.push(legacy.on('weapon:stats', (context) => {
        const profile = context.state.activeMechaProfileV11;
        if (profile?.id === 'weaver' && SUPPORT_DAMAGE_IDS.has(context.weaponId)) context.damage *= 1.28;
        const map = context.state.activeMapModifierV11;
        if (map?.gameplay.explosionDamageMult && EXPLOSIVE_DAMAGE_IDS.has(context.weaponId)) context.damage *= map.gameplay.explosionDamageMult;
      }));
      off.push(legacy.on('enemy:spawn', (context) => {
        const map = context.state.activeMapModifierV11;
        if (!map || !context.enemy) return;
        const gameplay = map.gameplay;
        if (gameplay.enemyHpMult) {
          context.enemy.maxHp = Math.round((context.enemy.maxHp || context.enemy.hp || 1) * gameplay.enemyHpMult);
          context.enemy.hp = context.enemy.maxHp;
        }
        context.enemy.speed = (context.enemy.speed || 1) * (gameplay.enemySpeedMult || 1);
        context.enemy.contactDamage = Math.round((context.enemy.contactDamage || 1) * (gameplay.enemyDamageMult || 1));
        if (gameplay.rangedCadenceMult && ['scrap_gunner', 'magnet_controller'].includes(context.enemy.type)) {
          context.enemy.fireIntervalV332 = Math.max(300, (context.enemy.fireIntervalV332 || 1200) / gameplay.rangedCadenceMult);
        }
      }));
      off.push(legacy.on('scrap:before-add', (context) => {
        const map = context.state.activeMapModifierV11;
        context.amount = Math.max(0, Math.round(context.amount * (map?.gameplay.scrapMult || 1)));
      }));
    }

    const decorateGarage = () => {
      const root = document.getElementById('v340-garage');
      if (!root || root.classList.contains('hidden')) return;
      const title = root.querySelector('.v340-mech-info h3')?.textContent?.trim();
      const profile = [...MECHA_PROFILE_BY_ID.values()].find((item) => item.name === title);
      const info = root.querySelector('.v340-mech-info');
      if (!profile || !info) return;
      let panel = info.querySelector('.mecha-profile-v11');
      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'mecha-profile-v11';
        info.querySelector('.v340-mech-status')?.before(panel);
      }
      panel.innerHTML = `<div class="mecha-profile-v11__stats"><span>HP <b>${profile.stats.maxHp}</b></span><span>ESCUDO <b>${profile.stats.maxShield}</b></span><span>VELOCIDAD <b>${Math.round(profile.stats.speedMult * 100)}%</b></span><span>DAÑO <b>${Math.round(profile.stats.dpsMult * 100)}%</b></span></div><div class="mecha-profile-v11__trait"><strong>${profile.trait.name}</strong><span>${profile.trait.description}</span></div>`;
    };
    const garageInterval = window.setInterval(decorateGarage, 650);

    const api = {
      getActiveProfile: getProfile,
      getActiveMapModifier: getMap,
      applyRunProfile,
      listProfiles: () => [...MECHA_PROFILE_BY_ID.values()],
      stop: () => { clearInterval(garageInterval); off.splice(0).forEach((unsubscribe) => unsubscribe?.()); }
    };
    runtime.services.set('gameplayProfile', api);
    return api;
  },
  stop(runtime, api) {
    api?.stop?.();
  }
};
