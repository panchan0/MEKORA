import { WEAPON_BY_ID_V140, STARTER_WEAPON_BY_MECHA_V140 } from '../data/weapons-v140.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const angleDelta = (from, to) => {
  let delta = to - from;
  while (delta < -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
};

function ensureWorldDrawer(drawer) {
  window.__mekoraV140WorldDrawers = window.__mekoraV140WorldDrawers || [];
  window.__mekoraV140WorldDrawers.push(drawer);
  window.__mekoraV140DrawWorld = (ctx, state, timestamp) => {
    for (const fn of window.__mekoraV140WorldDrawers || []) {
      try { fn(ctx, state, timestamp); } catch (error) { console.error('[MEKORA v1.4.2 world drawer]', error); }
    }
  };
  return () => {
    const index = window.__mekoraV140WorldDrawers?.indexOf(drawer) ?? -1;
    if (index >= 0) window.__mekoraV140WorldDrawers.splice(index, 1);
  };
}

function ensureWeaponHud() {
  let root = document.getElementById('v140-loadout-hud');
  if (root) return root;
  root = document.createElement('section');
  root.id = 'v140-loadout-hud';
  root.setAttribute('aria-label', 'Munición del arma activa');
  root.innerHTML = `
    <div class="v142-weapon-outline"><canvas id="v142-weapon-canvas" width="180" height="96"></canvas></div>
    <div class="v142-ammo-copy"><b id="v142-ammo-current">0</b><i id="v142-ammo-pip"></i><span id="v142-ammo-reserve">0</span></div>
    <button id="v140-switch-weapon" type="button" aria-label="Cambiar arma">⇄</button>`;
  document.body.appendChild(root);
  return root;
}

function drawHudWeaponIcon(canvas, weapon) {
  if (!canvas || !weapon) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(22, canvas.height / 2 - 2);
  ctx.scale(2.55, 2.55);
  drawWeaponShape(ctx, weapon);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#f4f2eb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function createAmmoState(weapon, fill = 1) {
  if (!weapon || weapon.magazine <= 0) return { magazine: 0, reserve: 0, reloading: false, reloadAt: 0, reloadStartedAt: 0, reloadDuration: 0 };
  return {
    magazine: weapon.magazine,
    reserve: Math.round(weapon.reserveMax * fill),
    reloading: false,
    reloadAt: 0,
    reloadStartedAt: 0,
    reloadDuration: 0
  };
}

function drawWeaponShape(ctx, weapon) {
  const v = weapon.visual || {};
  const accent = v.accent || weapon.color || '#f1b84d';
  const length = v.length || 32;
  const width = v.width || 8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = accent;
  ctx.shadowBlur = 7;
  ctx.strokeStyle = '#090c0f';
  ctx.fillStyle = '#26323a';
  ctx.lineWidth = 3;

  if (v.kind === 'blade') {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(8, -2); ctx.lineTo(length + 10, -4); ctx.lineTo(length + 18, 0); ctx.lineTo(length + 10, 4); ctx.lineTo(8, 2); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#26323a'; ctx.fillRect(-4, -6, 15, 12);
    return;
  }
  if (v.kind === 'maul') {
    ctx.fillRect(-4, -4, length, 8);
    ctx.fillStyle = accent; ctx.fillRect(length - 4, -width, 14, width * 2);
    ctx.strokeRect(length - 4, -width, 14, width * 2);
    return;
  }
  if (v.kind === 'dual') {
    ctx.fillRect(-4, -9, length, 6); ctx.fillRect(-4, 3, length, 6);
    ctx.fillStyle = accent; ctx.fillRect(length - 6, -8, 8, 4); ctx.fillRect(length - 6, 4, 8, 4);
    return;
  }
  if (v.kind === 'thrower') {
    ctx.fillRect(-5, -5, length, 10);
    ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(length + 7, 0, 7, -.8, .8); ctx.stroke();
    return;
  }

  ctx.beginPath();
  ctx.roundRect(-5, -width / 2, length, width, 3);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(length - 8, -width / 2 + 1, 10, Math.max(2, width - 2));
  ctx.fillStyle = '#12191e';
  ctx.beginPath(); ctx.moveTo(5, width / 2); ctx.lineTo(13, width / 2); ctx.lineTo(9, width / 2 + 10); ctx.lineTo(2, width / 2 + 8); ctx.closePath(); ctx.fill();
  if (v.kind === 'sniper' || v.kind === 'rail' || v.kind === 'lance') {
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(9, -width / 2 - 4); ctx.lineTo(length - 4, -width / 2 - 4); ctx.stroke();
  }
  if (v.kind === 'launcher' || v.kind === 'flame') {
    ctx.fillStyle = '#11171b'; ctx.beginPath(); ctx.arc(length * .45, 0, width * .58, 0, Math.PI * 2); ctx.fill();
  }
}

export const weaponSystemModule = {
  start(runtime) {
    const legacy = window.__mekoraLegacyV1;
    if (!legacy) throw new Error('Legacy bridge unavailable for weapon system');
    const off = [];
    let lastHudSignature = '';
    let lastFireAt = 0;

    function activeProgression() {
      return legacy.getProgression?.() || {};
    }

    function getActiveMechaId() {
      const progression = activeProgression();
      return progression.v340?.activeMech || 'axiom';
    }

    function activeState() {
      return legacy.getState?.();
    }

    function getWeaponState(state = activeState()) {
      return state?.v140Weapons || null;
    }

    function getWeaponForSlot(slot, state = activeState()) {
      const system = getWeaponState(state);
      const id = system?.slots?.[slot];
      return id ? WEAPON_BY_ID_V140.get(id) : null;
    }

    function getActiveWeapon(state = activeState()) {
      const system = getWeaponState(state);
      return getWeaponForSlot(system?.activeSlot || 0, state);
    }

    function syncLegacyLoadout(state) {
      const system = getWeaponState(state);
      if (!system) return;
      const legacyIds = system.slots.map((id) => WEAPON_BY_ID_V140.get(id)?.legacyId).filter(Boolean);
      state.activeWeapons = legacyIds.length ? legacyIds : ['w-machinegun'];
      state.weaponLevels = state.weaponLevels || {};
      for (const id of legacyIds) state.weaponLevels[id] = Math.max(1, state.weaponLevels[id] || 1);
    }

    function initializeRun(state, options = {}) {
      const mechaId = options.mechaId || getActiveMechaId();
      const starter = STARTER_WEAPON_BY_MECHA_V140[mechaId] || STARTER_WEAPON_BY_MECHA_V140.axiom;
      const previous = state.v140Weapons;
      state.v140WeaponSystemActive = true;
      state.v140Facing = previous?.facing || 1;
      state.v140AimAngle = previous?.aimAngle || 0;
      state.v140ManualAimAt = 0;
      state.v140WorldDrops = [];
      state.v140Weapons = {
        slots: options.slots || [starter, null],
        activeSlot: clamp(options.activeSlot ?? 0, 0, 1),
        ammo: {},
        lastFireAt: 0,
        dryUntil: 0,
        aimAngle: 0,
        autoTargetId: null,
        mechaId
      };
      for (const id of state.v140Weapons.slots) {
        if (!id) continue;
        const weapon = WEAPON_BY_ID_V140.get(id);
        state.v140Weapons.ammo[id] = createAmmoState(weapon, options.reserveFill ?? .72);
      }
      syncLegacyLoadout(state);
      updateHud(state, true);
      runtime.events.emit('weapon-system:initialized', snapshot(state));
      return state.v140Weapons;
    }

    function ensureAmmo(state, weapon) {
      const system = getWeaponState(state);
      if (!system.ammo[weapon.id]) system.ammo[weapon.id] = createAmmoState(weapon, .65);
      return system.ammo[weapon.id];
    }

    function startReload(state, weapon, timestamp) {
      if (!weapon || weapon.magazine <= 0) return false;
      const ammo = ensureAmmo(state, weapon);
      if (ammo.reloading || ammo.reserve <= 0 || ammo.magazine >= weapon.magazine) return false;
      ammo.reloading = true;
      ammo.reloadDuration = weapon.reloadMs / Math.max(.35, state.stats?.reloadSpeedMult || 1);
      ammo.reloadStartedAt = timestamp;
      ammo.reloadAt = timestamp + ammo.reloadDuration;
      return true;
    }

    function updateReload(state, timestamp) {
      const weapon = getActiveWeapon(state);
      if (!weapon) return;
      const ammo = ensureAmmo(state, weapon);
      if (ammo.reloading && timestamp >= ammo.reloadAt) {
        const needed = weapon.magazine - ammo.magazine;
        const moved = Math.min(needed, ammo.reserve);
        ammo.magazine += moved;
        ammo.reserve -= moved;
        ammo.reloading = false;
        ammo.reloadAt = 0;
        ammo.reloadStartedAt = 0;
        ammo.reloadDuration = 0;
        runtime.events.emit('weapon:reloaded', { weapon: weapon.id, moved });
      }
      if (!ammo.reloading && ammo.magazine <= 0 && ammo.reserve > 0) startReload(state, weapon, timestamp);
      state.mecha.ammo = ammo.magazine;
      state.mecha.maxAmmo = Math.max(1, weapon.magazine || 1);
      state.mecha.isReloading = ammo.reloading;
      state.mecha.reloadProgress = ammo.reloading ? clamp(1 - (ammo.reloadAt - timestamp) / Math.max(1, weapon.reloadMs), 0, 1) : 1;
    }

    function findAutoTarget(state, weapon) {
      if (!weapon) return null;
      let nearest = null;
      let best = weapon.range * weapon.range;
      for (const enemy of state.enemies || []) {
        if (!enemy || enemy.hp <= 0 || enemy.isDummy) continue;
        const dx = enemy.x - state.mecha.x;
        const dy = enemy.y - state.mecha.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < best) { best = distSq; nearest = enemy; }
      }
      return nearest;
    }

    function updateAim(state, timestamp) {
      const system = getWeaponState(state);
      const weapon = getActiveWeapon(state);
      if (!system || !weapon) return;
      const target = findAutoTarget(state, weapon);
      const manualFresh = state.manualAimV340 && timestamp - (state.v140ManualAimAt || 0) < 900;
      let desired = Number.isFinite(system.aimAngle) ? system.aimAngle : 0;
      if (manualFresh && Number.isFinite(state.manualAimAngleV340)) {
        desired = state.manualAimAngleV340;
      } else if (target) {
        desired = Math.atan2(target.y - state.mecha.y, target.x - state.mecha.x);
      } else if (state.moveJoystick?.active && Math.hypot(state.moveJoystick.x, state.moveJoystick.y) > .12) {
        desired = Math.atan2(state.moveJoystick.y, state.moveJoystick.x);
      }
      system.aimAngle += angleDelta(system.aimAngle || 0, desired) * (target && !manualFresh ? .22 : .45);
      system.autoTargetId = target?.id || null;
      state.v140AimAngle = system.aimAngle;
      // The mecha no longer rotates with the weapon. Its sprite only mirrors left/right.
      state.mecha.angle = 0;
      const moveX = state.moveJoystick?.active ? state.moveJoystick.x : 0;
      if (Math.abs(moveX) > .12) state.v140Facing = moveX < 0 ? -1 : 1;
      else if (Math.abs(Math.cos(system.aimAngle)) > .35) state.v140Facing = Math.cos(system.aimAngle) < 0 ? -1 : 1;
    }

    function applyBuffs(state, weapon, baseDamage, projectileCount) {
      let damage = baseDamage * (state.stats?.dpsMult || 1);
      let count = projectileCount;
      if (state.passives?.includes('p-extra-projectile') && weapon.projectile !== 'melee' && weapon.projectile !== 'melee-fast') {
        count += Math.min(2, state.passiveLevels?.['p-extra-projectile'] || 1);
      }
      return { damage: Math.max(1, Math.round(damage)), count };
    }

    function fireProjectile(state, weapon, timestamp) {
      const system = getWeaponState(state);
      const ammo = ensureAmmo(state, weapon);
      if (weapon.magazine > 0) {
        if (ammo.reloading) return false;
        if (ammo.magazine < weapon.ammoPerShot) {
          startReload(state, weapon, timestamp);
          system.dryUntil = timestamp + 260;
          return false;
        }
        ammo.magazine -= weapon.ammoPerShot;
      }

      const buffed = applyBuffs(state, weapon, weapon.damage, weapon.pellets || 1);
      if (weapon.projectile === 'melee' || weapon.projectile === 'melee-fast') {
        const reach = weapon.range;
        const x = state.mecha.x + Math.cos(system.aimAngle) * reach * .35;
        const y = state.mecha.y + Math.sin(system.aimAngle) * reach * .35;
        state.shockwaves.push({
          x, y, radius: 8, maxRadius: reach, damage: buffed.damage,
          life: weapon.projectile === 'melee-fast' ? 9 : 14,
          maxLife: weapon.projectile === 'melee-fast' ? 9 : 14,
          color: weapon.color, pushBack: true, hitEnemies: []
        });
        return true;
      }

      for (let index = 0; index < buffed.count; index += 1) {
        const spread = buffed.count > 1
          ? (-weapon.spread / 2) + (index / Math.max(1, buffed.count - 1)) * weapon.spread
          : (Math.random() - .5) * weapon.spread;
        const angle = system.aimAngle + spread;
        const muzzle = 29;
        state.bullets.push({
          x: state.mecha.x + Math.cos(angle) * muzzle,
          y: state.mecha.y + Math.sin(angle) * muzzle,
          vx: Math.cos(angle) * weapon.speed,
          vy: Math.sin(angle) * weapon.speed,
          damage: buffed.damage,
          type: weapon.projectile === 'boomerang' ? 'plasma' : weapon.projectile,
          radius: weapon.radius,
          color: weapon.color,
          bounces: state.passives?.includes('p-bounce') ? Math.max(1, state.passiveLevels?.['p-bounce'] || 1) : 0,
          pierces: (weapon.pierces || 0) + (state.passives?.includes('p-pierce') ? Math.max(1, state.passiveLevels?.['p-pierce'] || 1) : 0),
          hitEnemies: [],
          v140WeaponId: weapon.id
        });
      }
      if (weapon.magazine > 0 && ammo.magazine <= 0) startReload(state, weapon, timestamp);
      return true;
    }

    function updateFiring(state, timestamp) {
      const system = getWeaponState(state);
      const weapon = getActiveWeapon(state);
      if (!system || !weapon || !state.isFiring || state.paused || state.phase !== 'playing') return;
      let cooldown = weapon.cooldown;
      cooldown /= Math.max(.25, state.stats?.fireRateMult || 1);
      if (state.passives?.includes('p-cooldown')) cooldown *= Math.pow(.88, state.passiveLevels?.['p-cooldown'] || 1);
      if (timestamp - (system.lastFireAt || 0) < cooldown) return;
      if (fireProjectile(state, weapon, timestamp)) {
        system.lastFireAt = timestamp;
        lastFireAt = timestamp;
        runtime.events.emit('weapon:fired', { weapon: weapon.id, slot: system.activeSlot });
      }
    }

    function updateDrops(state, timestamp) {
      const drops = state.v140WorldDrops || [];
      for (let index = drops.length - 1; index >= 0; index -= 1) {
        const drop = drops[index];
        if (timestamp > drop.expiresAt) { drops.splice(index, 1); continue; }
        if (Math.hypot(drop.x - state.mecha.x, drop.y - state.mecha.y) > 35) continue;
        const system = getWeaponState(state);
        let restored = 0;
        for (const id of system.slots) {
          const weapon = WEAPON_BY_ID_V140.get(id);
          if (!weapon || weapon.reserveMax <= 0) continue;
          const ammo = ensureAmmo(state, weapon);
          const before = ammo.reserve;
          ammo.reserve = Math.min(weapon.reserveMax, ammo.reserve + drop.amount);
          restored += ammo.reserve - before;
        }
        if (restored > 0) {
          drops.splice(index, 1);
          runtime.events.emit('ammo:collected', { amount: restored });
        }
      }
    }

    function switchWeapon(slot = null) {
      const state = activeState();
      const system = getWeaponState(state);
      if (!system) return null;
      const next = slot == null ? (system.activeSlot === 0 ? 1 : 0) : clamp(Number(slot) || 0, 0, 1);
      if (!system.slots[next]) return getActiveWeapon(state);
      system.activeSlot = next;
      system.lastFireAt = 0;
      syncLegacyLoadout(state);
      updateHud(state, true);
      runtime.events.emit('weapon:switched', { slot: next, weapon: system.slots[next] });
      return getActiveWeapon(state);
    }

    function equipWeapon(id, slot = null) {
      const weapon = WEAPON_BY_ID_V140.get(id);
      const state = activeState();
      const system = getWeaponState(state);
      if (!weapon || !system) return false;
      let target = slot == null ? system.slots.findIndex((entry) => !entry) : clamp(Number(slot) || 0, 0, 1);
      if (target < 0) target = system.activeSlot;
      system.slots[target] = id;
      if (!system.ammo[id]) system.ammo[id] = createAmmoState(weapon, .65);
      system.activeSlot = target;
      syncLegacyLoadout(state);
      updateHud(state, true);
      runtime.events.emit('weapon:equipped', { id, slot: target });
      return true;
    }

    function addAmmo(amount = 12) {
      const state = activeState();
      const system = getWeaponState(state);
      if (!system) return 0;
      let total = 0;
      for (const id of system.slots) {
        const weapon = WEAPON_BY_ID_V140.get(id);
        if (!weapon || weapon.reserveMax <= 0) continue;
        const ammo = ensureAmmo(state, weapon);
        const before = ammo.reserve;
        ammo.reserve = Math.min(weapon.reserveMax, ammo.reserve + Math.max(0, Math.floor(amount)));
        total += ammo.reserve - before;
      }
      updateHud(state, true);
      return total;
    }

    function snapshot(state = activeState()) {
      const system = getWeaponState(state);
      if (!system) return null;
      return {
        slots: [...system.slots], activeSlot: system.activeSlot,
        ammo: JSON.parse(JSON.stringify(system.ammo)),
        aimAngle: system.aimAngle, facing: state.v140Facing || 1
      };
    }

    function restore(data) {
      const state = activeState();
      if (!state || !data) return false;
      initializeRun(state, { slots: data.slots, activeSlot: data.activeSlot, reserveFill: 0 });
      state.v140Weapons.ammo = JSON.parse(JSON.stringify(data.ammo || {}));
      state.v140Weapons.aimAngle = Number(data.aimAngle) || 0;
      state.v140Facing = data.facing === -1 ? -1 : 1;
      syncLegacyLoadout(state);
      updateHud(state, true);
      return true;
    }

    function updateHud(state, force = false) {
      if (!state?.v140Weapons) return;
      const root = ensureWeaponHud();
      const system = state.v140Weapons;
      const weapon = getActiveWeapon(state);
      const ammo = weapon ? ensureAmmo(state, weapon) : null;
      const now = performance.now();
      let displayed = weapon?.magazine <= 0 ? '∞' : String(ammo?.magazine ?? 0);
      if (weapon && weapon.magazine > 0 && ammo?.reloading) {
        const duration = Math.max(1, ammo.reloadDuration || weapon.reloadMs);
        const progress = clamp((now - (ammo.reloadStartedAt || now)) / duration, 0, 1);
        displayed = String(Math.min(weapon.magazine, Math.floor(progress * weapon.magazine)));
      }
      const signature = JSON.stringify({ weapon: weapon?.id, displayed, reserve: ammo?.reserve, reloading: ammo?.reloading, phase: state.phase, paused: state.paused });
      if (!force && signature === lastHudSignature) return;
      lastHudSignature = signature;
      root.style.display = state.phase === 'playing' && !state.paused ? 'grid' : 'none';
      const current = root.querySelector('#v142-ammo-current');
      const reserve = root.querySelector('#v142-ammo-reserve');
      const pip = root.querySelector('#v142-ammo-pip');
      if (current) current.textContent = displayed;
      if (reserve) reserve.textContent = weapon?.magazine <= 0 ? weapon?.short || '--' : `/ ${ammo?.reserve ?? 0}`;
      if (pip) pip.style.background = weapon?.color || '#e7ae4d';
      drawHudWeaponIcon(root.querySelector('#v142-weapon-canvas'), weapon);
    }

    function orientationForAim(angle) {
      const left = Math.cos(angle) < 0;
      return {
        left,
        facing: left ? -1 : 1,
        localAngle: left ? Math.PI - angle : angle
      };
    }

    function drawBackWeapon(ctx, state) {
      if (!state?.v140WeaponSystemActive || state.mecha.hiddenV331 || state.deathSequenceV331?.active) return;
      const system = getWeaponState(state);
      if (!system) return;
      const inactiveSlot = system.activeSlot === 0 ? 1 : 0;
      const weapon = getWeaponForSlot(inactiveSlot, state);
      if (!weapon) return;
      const facing = state.v140Facing === -1 ? -1 : 1;
      ctx.save();
      ctx.translate(state.mecha.x, state.mecha.y - 4);
      ctx.scale(facing, 1);
      // Keep the inactive weapon clearly visible across the back without detaching it.
      ctx.translate(-17, 8);
      ctx.rotate(-1.3);
      ctx.scale(.55, .55);
      ctx.globalAlpha = .82;
      ctx.shadowBlur = 4;
      drawWeaponShape(ctx, weapon);
      ctx.restore();
    }

    function drawWeapon(ctx, state, timestamp) {
      if (!state?.v140WeaponSystemActive || state.mecha.hiddenV331 || state.deathSequenceV331?.active) return;
      const weapon = getActiveWeapon(state);
      const system = getWeaponState(state);
      if (!weapon || !system) return;
      const angle = Number(system.aimAngle) || 0;
      const orientation = orientationForAim(angle);
      const recoil = timestamp - lastFireAt < 75 ? -1.5 : 0;
      ctx.save();
      ctx.translate(state.mecha.x, state.mecha.y - 13);
      // Mirror the whole weapon horizontally when aiming left, then rotate inside that mirrored space.
      // This keeps grips and details upright instead of turning the sprite upside down.
      ctx.scale(orientation.facing, 1);
      ctx.rotate(orientation.localAngle);
      ctx.scale(.58, .58);
      ctx.translate(4.5 + recoil, 0);
      drawWeaponShape(ctx, weapon);
      ctx.restore();
    }

    function drawAmmoDrops(ctx, state, timestamp) {
      for (const drop of state.v140WorldDrops || []) {
        const pulse = 1 + Math.sin(timestamp * .008 + drop.x) * .12;
        ctx.save(); ctx.translate(drop.x, drop.y); ctx.scale(pulse, pulse);
        ctx.shadowColor = '#f4c15a'; ctx.shadowBlur = 12;
        ctx.fillStyle = '#f4c15a'; ctx.strokeStyle = '#17120a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(-10, -7, 20, 14, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#17120a'; ctx.fillRect(-5, -3, 3, 6); ctx.fillRect(2, -3, 3, 6);
        ctx.restore();
      }
    }

    const removeWorldDrawer = ensureWorldDrawer(drawAmmoDrops);
    window.__mekoraV141DrawBackWeapon = drawBackWeapon;
    window.__mekoraV140DrawWeapon = drawWeapon;

    const root = ensureWeaponHud();
    root.querySelector('#v140-switch-weapon')?.addEventListener('click', () => switchWeapon());

    const onKey = (event) => {
      if (event.repeat || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (event.code === 'KeyQ' || event.code === 'Tab') {
        event.preventDefault(); switchWeapon();
      }
      if (event.code === 'Digit1') switchWeapon(0);
      if (event.code === 'Digit2') switchWeapon(1);
      if (event.code === 'KeyR') {
        const state = activeState(); const weapon = getActiveWeapon(state);
        if (state && weapon) startReload(state, weapon, performance.now());
      }
    };
    window.addEventListener('keydown', onKey);

    off.push(legacy.on('run:start', ({ state }) => initializeRun(state)));
    off.push(legacy.on('frame:before', ({ state, timestamp }) => {
      if (!state?.v140WeaponSystemActive) return;
      updateAim(state, timestamp);
      updateReload(state, timestamp);
      updateDrops(state, timestamp);
      updateFiring(state, timestamp);
      updateHud(state);
    }));
    off.push(legacy.on('enemy:defeated', ({ state, enemy }) => {
      if (!state?.v140WeaponSystemActive || !enemy || enemy.isDummy) return;
      const chance = enemy.isBossV31 ? 1 : enemy.isMinibossV31 ? .85 : .26;
      if (Math.random() > chance) return;
      state.v140WorldDrops = state.v140WorldDrops || [];
      state.v140WorldDrops.push({
        id: `ammo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        x: enemy.x, y: enemy.y, amount: enemy.isBossV31 ? 42 : enemy.isMinibossV31 ? 28 : 8,
        expiresAt: performance.now() + 30000
      });
    }));

    const api = {
      getActiveWeapon,
      getWeaponForSlot,
      switchWeapon,
      equipWeapon,
      addAmmo,
      snapshot,
      restore,
      initializeRun,
      list: () => [...WEAPON_BY_ID_V140.values()]
    };
    runtime.services.set('weaponSystem', api);
    return {
      ...api,
      stop() {
        off.splice(0).forEach((unsubscribe) => unsubscribe?.());
        removeWorldDrawer();
        window.removeEventListener('keydown', onKey);
        if (window.__mekoraV140DrawWeapon === drawWeapon) delete window.__mekoraV140DrawWeapon;
        if (window.__mekoraV141DrawBackWeapon === drawBackWeapon) delete window.__mekoraV141DrawBackWeapon;
      }
    };
  },
  stop(runtime, api) { api?.stop?.(); }
};
