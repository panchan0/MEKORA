import { CHEST_WEAPON_IDS_V140, WEAPON_BY_ID_V140 } from '../data/weapons-v140.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function registerWorldDrawer(drawer) {
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

function ensureHud() {
  let root = document.getElementById('v140-expedition-hud');
  if (root) return root;
  root = document.createElement('section');
  root.id = 'v140-expedition-hud';
  root.innerHTML = `
    <div class="v140-scrap-readout" aria-label="Chatarra"><span>▰</span><b id="v140-scrap-count">0</b></div>
    <button id="v140-pause-button" type="button" aria-label="Pausar">Ⅱ</button>`;
  document.body.appendChild(root);
  return root;
}

function ensureMinimap() {
  let root = document.getElementById('v140-minimap-shell');
  if (root) return root;
  root = document.createElement('section');
  root.id = 'v140-minimap-shell';
  root.setAttribute('aria-label', 'Minimapa táctico');
  root.innerHTML = `<canvas id="v140-minimap" width="128" height="128"></canvas>`;
  document.body.appendChild(root);
  return root;
}

function ensureInteractionUi() {
  let prompt = document.getElementById('v140-interaction-prompt');
  if (!prompt) {
    prompt = document.createElement('div');
    prompt.id = 'v140-interaction-prompt';
    prompt.className = 'hidden';
    prompt.innerHTML = `<i id="v140-interaction-icon">◇</i><b id="v140-interaction-title">E</b>`;
    document.body.appendChild(prompt);
  }
  return { prompt };
}

function ensureWeaponCompare() {
  let root = document.getElementById('v141-weapon-compare');
  if (root) return root;
  root = document.createElement('section');
  root.id = 'v141-weapon-compare';
  root.className = 'hidden';
  root.innerHTML = `
    <span class="v141-compare-weapon"><i>✦</i><b id="v141-compare-short">--</b></span>
    <span><i>DMG</i><b id="v141-compare-damage">0</b></span>
    <span><i>AM</i><b id="v141-compare-ammo">0</b></span>
    <span><i>CRIT</i><b id="v142-compare-crit">0</b></span>`;
  document.body.appendChild(root);
  return root;
}

function ensureVendorModal() {
  let root = document.getElementById('v140-loot-modal');
  if (root) {
    root.innerHTML = '';
  } else {
    root = document.createElement('section');
    root.id = 'v140-loot-modal';
    root.className = 'hidden';
    document.body.appendChild(root);
  }
  root.innerHTML = `
    <div class="v141-vendor-card">
      <header>
        <div><p><b id="v141-vendor-scrap">0</b> ▰</p></div>
        <button id="v140-loot-close" type="button" aria-label="Cerrar">×</button>
      </header>
      <div class="v141-vendor-layout">
        <div id="v140-loot-options" class="v141-vendor-options"></div>
        <aside class="v141-vendor-portrait" aria-label="Vendedor mecánico">
          <div class="v141-vendor-antenna"></div>
          <div class="v141-vendor-head"><i></i><i></i></div>
          <div class="v141-vendor-neck"></div>
          <div class="v141-vendor-body"><span></span></div>
          <div class="v141-vendor-counter"></div>
        </aside>
      </div>
    </div>`;
  return root;
}

function vendorArt(action, weapon = null) {
  if (action === 'repair') return `<svg viewBox="0 0 120 84" aria-hidden="true"><path d="M24 61 60 19l36 42"/><path d="M38 50h44M60 29v31M49 43h22"/><circle cx="60" cy="66" r="7"/></svg>`;
  if (action === 'supply') return `<svg viewBox="0 0 120 84" aria-hidden="true"><path d="M28 24h64v42H28z"/><path d="M42 24v42M78 24v42M34 33h52M34 57h52"/><circle cx="60" cy="45" r="8"/></svg>`;
  const kind = weapon?.visual?.kind || 'rifle';
  return `<svg viewBox="0 0 120 84" aria-hidden="true" data-kind="${kind}"><path d="M18 43h61l14-8 10 8-10 8-14-5H18z"/><path d="m40 47-5 18h15l8-18M73 38v-8h23"/></svg>`;
}

function vendorOffer({ action, price, title, detail, weapon = null, disabled = false }) {
  return `<button class="v141-vendor-offer" type="button" data-vendor-action="${action}" ${disabled ? 'disabled' : ''}>
    <span class="v141-vendor-offer-icon">${vendorArt(action, weapon)}</span>
    <div><b>${title}</b><small>${detail}</small></div>
    <strong>${disabled ? 'AGOTADO' : `${price} ▰`}</strong>
  </button>`;
}

function drawDroppedWeapon(ctx, weapon) {
  const accent = weapon?.visual?.accent || weapon?.color || '#f1b84d';
  const length = Math.min(34, weapon?.visual?.length || 28);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = '#26323a';
  ctx.strokeStyle = '#080b0e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-length * .42, -5, length, 10, 3);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(length * .28, -4, 8, 8);
  ctx.fillStyle = '#10161b';
  ctx.beginPath(); ctx.moveTo(-4, 5); ctx.lineTo(5, 5); ctx.lineTo(1, 13); ctx.lineTo(-6, 10); ctx.closePath(); ctx.fill();
}

export const expeditionModule = {
  start(runtime) {
    const legacy = window.__mekoraLegacyV1;
    if (!legacy) throw new Error('Legacy bridge unavailable for expedition system');
    const hud = ensureHud();
    const minimapShell = ensureMinimap();
    const minimap = minimapShell.querySelector('#v140-minimap');
    const minimapCtx = minimap.getContext('2d');
    const interaction = ensureInteractionUi();
    const compare = ensureWeaponCompare();
    const modal = ensureVendorModal();
    const off = [];
    let nearestInteractable = null;
    let lastMinimapAt = 0;
    let openVendorObject = null;

    function stateRef() { return legacy.getState?.(); }
    function worldSize() { return Number(legacy.getWorldSizeV140?.()) || 4600; }

    function randomPoint(state, minDistance = 330, maxDistance = 900) {
      const size = worldSize();
      const angle = Math.random() * Math.PI * 2;
      const distance = minDistance + Math.random() * (maxDistance - minDistance);
      return {
        x: clamp(state.mecha.x + Math.cos(angle) * distance, 100, size - 100),
        y: clamp(state.mecha.y + Math.sin(angle) * distance, 100, size - 100)
      };
    }

    function randomWeaponId() {
      return CHEST_WEAPON_IDS_V140[Math.floor(Math.random() * CHEST_WEAPON_IDS_V140.length)];
    }

    function createSectorObjects(state, sector = 1) {
      const first = randomPoint(state, 360, 760);
      const second = randomPoint(state, 620, 1050);
      const vendor = randomPoint(state, 460, 980);
      state.v140Expedition = {
        sector,
        objects: [
          { id: `chest_${sector}_a`, type: 'chest', x: first.x, y: first.y, opened: false, label: 'COFRE' },
          { id: `chest_${sector}_b`, type: 'chest', x: second.x, y: second.y, opened: false, label: 'COFRE' },
          { id: `vendor_${sector}`, type: 'vendor', x: vendor.x, y: vendor.y, opened: false, purchased: false, weaponId: randomWeaponId(), label: 'MERCADER' }
        ],
        discovered: []
      };
      runtime.events.emit('expedition:sector-objects', { sector, objects: state.v140Expedition.objects });
      return state.v140Expedition;
    }

    function getObjects(state = stateRef()) {
      return state?.v140Expedition?.objects || [];
    }

    function updateDiscovery(state) {
      if (!state?.v140Expedition) return;
      for (const object of getObjects(state)) {
        if (Math.hypot(object.x - state.mecha.x, object.y - state.mecha.y) <= 720) {
          if (!state.v140Expedition.discovered.includes(object.id)) state.v140Expedition.discovered.push(object.id);
        }
      }
    }

    function interactionRadius(object) {
      if (object.type === 'weapon-drop') return 46;
      if (object.type === 'vendor') return 74;
      return 60;
    }

    function findNearest(state, timestamp = performance.now()) {
      let nearest = null;
      let best = 90;
      for (const object of getObjects(state)) {
        if (object.opened && object.type !== 'weapon-drop') continue;
        if (object.picked) continue;
        if (object.type === 'weapon-drop' && timestamp < (object.availableAt || 0)) continue;
        const distance = Math.hypot(object.x - state.mecha.x, object.y - state.mecha.y);
        const allowed = interactionRadius(object);
        if (distance <= allowed && distance < best) { nearest = object; best = distance; }
      }
      return nearest;
    }

    function showWeaponComparison(object) {
      const weapon = object?.type === 'weapon-drop' ? WEAPON_BY_ID_V140.get(object.weaponId) : null;
      compare.classList.toggle('hidden', !weapon);
      if (!weapon) return;
      compare.querySelector('#v141-compare-short').textContent = weapon.short;
      compare.querySelector('#v141-compare-damage').textContent = String(weapon.damage);
      compare.querySelector('#v141-compare-ammo').textContent = weapon.magazine <= 0 ? '∞' : String(weapon.ammoPerShot);
      compare.querySelector('#v142-compare-crit').textContent = String(Math.round((weapon.damage || 0) * 1.5));
      compare.style.setProperty('--v141-weapon-color', weapon.color || '#f1b84d');
    }

    function updateInteraction(state, timestamp) {
      nearestInteractable = findNearest(state, timestamp);
      state.v141NearestInteractable = nearestInteractable || null;
      const normalPrompt = nearestInteractable && nearestInteractable.type !== 'weapon-drop' && state.phase === 'playing' && !state.paused;
      interaction.prompt.classList.toggle('hidden', !normalPrompt);
      if (normalPrompt) {
        interaction.prompt.querySelector('#v140-interaction-icon').textContent = nearestInteractable.type === 'vendor' ? '▣' : '◇';
        interaction.prompt.querySelector('#v140-interaction-title').textContent = 'E';
      }
      showWeaponComparison(nearestInteractable);
      runtime.events.emit('expedition:interaction-availability', { object: nearestInteractable });
    }

    function openChest(object, forcedWeaponId = null) {
      const state = stateRef();
      if (!state || !object || object.opened) return false;
      const now = performance.now();
      const weaponId = forcedWeaponId || randomWeaponId();
      object.opened = true;
      object.openedAt = now;
      const drop = {
        id: `weapon_${object.id}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'weapon-drop',
        weaponId,
        x: object.x,
        y: object.y - 28,
        spawnedAt: now,
        availableAt: now + 760,
        picked: false,
        label: 'ARMA'
      };
      state.v140Expedition.objects.push(drop);
      state.particles = state.particles || [];
      for (let index = 0; index < 18; index += 1) {
        state.particles.push({ x: object.x, y: object.y, vx: (Math.random() - .5) * 5, vy: -1 - Math.random() * 4, life: 20 + Math.random() * 12, color: '#eeb24d' });
      }
      runtime.events.emit('chest:opened', { object, weapon: weaponId, drop });
      return drop;
    }

    function pickupWeapon(object) {
      const state = stateRef();
      if (!state || !object || object.type !== 'weapon-drop' || object.picked) return false;
      const equipped = runtime.services.get('weaponSystem')?.equipWeapon(object.weaponId);
      if (!equipped) return false;
      object.picked = true;
      compare.classList.add('hidden');
      nearestInteractable = null;
      state.v141NearestInteractable = null;
      runtime.events.emit('weapon:world-picked', { id: object.weaponId, object });
      return true;
    }

    function closeVendor() {
      document.getElementById('v140-loot-modal')?.classList.remove('departing');
      const state = stateRef();
      modal.classList.add('hidden');
      modal.classList.remove('vendor-open');
      document.body.dataset.vendorOpenV141 = 'false';
      if (state) { state.paused = false; state.isFiring = false; }
      openVendorObject = null;
    }

    function finishVendorPurchase(object, action) {
      object.purchased = true;
      object.opened = true;
      object.purchase = action;
      runtime.events.emit('vendor:purchased', { object, action });
      modal.classList.add('departing');
      window.setTimeout(() => {
        modal.classList.remove('departing');
        closeVendor();
      }, 620);
    }

    function openVendor(object) {
      const state = stateRef();
      if (!state || !object || object.opened) return false;
      state.paused = true;
      state.isFiring = false;
      openVendorObject = object;
      const weapon = WEAPON_BY_ID_V140.get(object.weaponId || randomWeaponId());
      object.weaponId = weapon.id;
      modal.querySelector('#v141-vendor-scrap').textContent = String(Math.floor(state.scrap || 0));
      const list = modal.querySelector('#v140-loot-options');
      list.innerHTML = [
        vendorOffer({ action: 'repair', price: 45, title: 'REPARACIÓN', detail: '+55 blindaje · +20 escudo' }),
        vendorOffer({ action: 'supply', price: 35, title: 'SUMINISTROS', detail: 'Munición y +12 escudo' }),
        vendorOffer({ action: 'weapon', price: 120, title: weapon.name, detail: `${weapon.damage} daño · ${weapon.magazine > 0 ? `${weapon.magazine} cargador` : 'sin munición'}`, weapon })
      ].join('');
      list.querySelectorAll('[data-vendor-action]').forEach((button) => {
        button.addEventListener('click', () => {
          const action = button.dataset.vendorAction;
          const price = action === 'repair' ? 45 : action === 'supply' ? 35 : 120;
          if ((state.scrap || 0) < price || object.opened) {
            button.classList.add('insufficient');
            window.setTimeout(() => button.classList.remove('insufficient'), 350);
            return;
          }
          state.scrap -= price;
          if (action === 'repair') {
            state.mecha.hp = Math.min(state.mecha.maxHp, state.mecha.hp + 55);
            state.mecha.shield = Math.min(state.mecha.maxShield, state.mecha.shield + 20);
          } else if (action === 'supply') {
            runtime.services.get('weaponSystem')?.addAmmo(48);
            state.mecha.shield = Math.min(state.mecha.maxShield, state.mecha.shield + 12);
          } else {
            runtime.services.get('weaponSystem')?.equipWeapon(weapon.id);
          }
          finishVendorPurchase(object, action);
        }, { once: true });
      });
      modal.classList.remove('hidden');
      modal.classList.add('vendor-open');
      document.body.dataset.vendorOpenV141 = 'true';
      return true;
    }

    function interact() {
      if (!nearestInteractable) return false;
      if (nearestInteractable.type === 'vendor') return openVendor(nearestInteractable);
      if (nearestInteractable.type === 'weapon-drop') return pickupWeapon(nearestInteractable);
      return openChest(nearestInteractable);
    }

    function drawFloorDetails(ctx, state) {
      const sector = state.v140Wave?.sector || state.sector || 1;
      const spacing = sector === 3 ? 170 : 220;
      const radius = 1100;
      const minX = Math.floor((state.mecha.x - radius) / spacing) * spacing;
      const maxX = state.mecha.x + radius;
      const minY = Math.floor((state.mecha.y - radius) / spacing) * spacing;
      const maxY = state.mecha.y + radius;
      ctx.save();
      ctx.globalAlpha = .13;
      ctx.strokeStyle = sector === 5 ? '#f06b3f' : sector === 3 ? '#98a7aa' : '#b68a56';
      ctx.lineWidth = 2;
      for (let x = minX; x < maxX; x += spacing) {
        for (let y = minY; y < maxY; y += spacing) {
          ctx.strokeRect(x + 8, y + 8, spacing - 16, spacing - 16);
          if ((x / spacing + y / spacing + sector) % 3 === 0) {
            ctx.beginPath(); ctx.moveTo(x + 24, y + spacing * .55); ctx.lineTo(x + spacing - 24, y + spacing * .55); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = .22;
      if (sector === 2 || sector === 4) {
        ctx.fillStyle = '#d7a54f';
        for (let x = minX; x < maxX; x += spacing * 2) ctx.fillRect(x, state.mecha.y - radius, 8, radius * 2);
      }
      if (sector === 3) {
        ctx.strokeStyle = '#839096'; ctx.lineWidth = 5;
        for (let y = minY; y < maxY; y += spacing * 3) {
          ctx.beginPath(); ctx.moveTo(state.mecha.x - radius, y); ctx.lineTo(state.mecha.x + radius, y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(state.mecha.x - radius, y + 24); ctx.lineTo(state.mecha.x + radius, y + 24); ctx.stroke();
        }
      }
      ctx.restore();
    }

    function drawVendor(ctx, object, discovered) {
      ctx.shadowColor = '#65d9dd'; ctx.shadowBlur = discovered ? 16 : 7;
      ctx.strokeStyle = '#65d9dd'; ctx.lineWidth = 2.5;
      ctx.fillStyle = '#1b3035';
      ctx.beginPath(); ctx.roundRect(-22, -31, 44, 31, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0b1115'; ctx.beginPath(); ctx.roundRect(-13, -48, 26, 20, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#65d9dd'; ctx.fillRect(-8, -42, 5, 3); ctx.fillRect(3, -42, 5, 3);
      ctx.strokeStyle = '#8da4a8'; ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(0, -58); ctx.lineTo(7, -63); ctx.stroke();
      ctx.fillStyle = '#34464b'; ctx.beginPath(); ctx.roundRect(-31, -5, 62, 13, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d7aa57'; ctx.fillRect(-5, 0, 10, 5);
    }

    function drawObjects(ctx, state, timestamp) {
      drawFloorDetails(ctx, state);
      for (const object of getObjects(state)) {
        if (object.picked || (object.type === 'vendor' && object.opened)) continue;
        const discovered = state.v140Expedition?.discovered?.includes(object.id);
        const pulse = 1 + Math.sin(timestamp * .004 + object.x * .01) * .04;
        ctx.save();
        if (object.type === 'weapon-drop') {
          const weapon = WEAPON_BY_ID_V140.get(object.weaponId);
          const progress = clamp((timestamp - object.spawnedAt) / 760, 0, 1);
          const jump = Math.sin(progress * Math.PI) * 38;
          const spin = progress < 1 ? progress * Math.PI * 2 : Math.sin(timestamp * .002) * .06;
          ctx.translate(object.x, object.y - jump);
          ctx.rotate(spin);
          ctx.scale(.9, .9);
          ctx.shadowColor = weapon?.color || '#f0b34e'; ctx.shadowBlur = 16;
          drawDroppedWeapon(ctx, weapon);
          ctx.restore();
          continue;
        }
        ctx.translate(object.x, object.y); ctx.scale(pulse, pulse);
        if (object.type === 'chest') {
          ctx.shadowColor = '#eeb24d'; ctx.shadowBlur = discovered ? 18 : 8;
          ctx.fillStyle = object.opened ? '#40311e' : '#6c4a24'; ctx.strokeStyle = '#eeb24d'; ctx.lineWidth = 3;
          if (object.opened) {
            ctx.save(); ctx.translate(0, -9); ctx.rotate(-.45); ctx.beginPath(); ctx.roundRect(-19, -10, 38, 13, 4); ctx.fill(); ctx.stroke(); ctx.restore();
            ctx.beginPath(); ctx.roundRect(-19, -2, 38, 20, 5); ctx.fill(); ctx.stroke();
          } else {
            ctx.beginPath(); ctx.roundRect(-19, -14, 38, 28, 5); ctx.fill(); ctx.stroke();
          }
          ctx.fillStyle = '#eeb24d'; ctx.fillRect(-3, object.opened ? -1 : -14, 6, object.opened ? 18 : 28);
        } else {
          drawVendor(ctx, object, discovered);
        }
        ctx.restore();
      }
    }

    function updateMinimap(state, timestamp) {
      if (timestamp - lastMinimapAt < 85) return;
      lastMinimapAt = timestamp;
      const visible = state.phase === 'playing' && !state.paused;
      minimapShell.style.display = visible ? 'block' : 'none';
      if (!visible) return;
      const w = minimap.width, h = minimap.height;
      const range = 720;
      const scale = (w * .46) / range;
      minimapCtx.clearRect(0, 0, w, h);
      minimapCtx.fillStyle = 'rgba(6,10,13,.58)'; minimapCtx.fillRect(0, 0, w, h);
      minimapCtx.strokeStyle = 'rgba(115,145,154,.18)'; minimapCtx.lineWidth = 1;
      for (let i = 1; i < 4; i += 1) {
        minimapCtx.beginPath(); minimapCtx.arc(w / 2, h / 2, i * 14, 0, Math.PI * 2); minimapCtx.stroke();
      }
      const plot = (x, y, color, radius = 2.2) => {
        const px = w / 2 + (x - state.mecha.x) * scale;
        const py = h / 2 + (y - state.mecha.y) * scale;
        if (px < 3 || px > w - 3 || py < 3 || py > h - 3) return;
        minimapCtx.fillStyle = color; minimapCtx.beginPath(); minimapCtx.arc(px, py, radius, 0, Math.PI * 2); minimapCtx.fill();
      };
      for (const enemy of state.enemies || []) {
        if (!enemy || enemy.hp <= 0) continue;
        plot(enemy.x, enemy.y, enemy.isBossV31 ? '#ff503c' : enemy.isMinibossV31 ? '#ff9f43' : '#d86b4a', enemy.isBossV31 ? 4 : 2);
      }
      for (const object of getObjects(state)) {
        if (!state.v140Expedition?.discovered?.includes(object.id) || object.picked || (object.type === 'vendor' && object.opened)) continue;
        if (object.type === 'chest' && object.opened) continue;
        const color = object.type === 'vendor' ? '#65d9dd' : object.type === 'weapon-drop' ? '#ffffff' : '#f0b34e';
        plot(object.x, object.y, color, 3);
      }
      for (const poi of state.sectorPoisV33 || []) if (!poi.collected) plot(poi.x, poi.y, '#9fc96b', 2.5);
      minimapCtx.save(); minimapCtx.translate(w / 2, h / 2); minimapCtx.rotate(state.v140AimAngle || 0);
      minimapCtx.fillStyle = '#ffffff'; minimapCtx.beginPath(); minimapCtx.moveTo(6, 0); minimapCtx.lineTo(-4, -3); minimapCtx.lineTo(-4, 3); minimapCtx.closePath(); minimapCtx.fill(); minimapCtx.restore();
      minimapCtx.strokeStyle = 'rgba(111,226,226,.34)'; minimapCtx.strokeRect(.5, .5, w - 1, h - 1);
    }

    function updateHud(state) {
      const visible = state.phase === 'playing' && !state.paused;
      hud.style.display = visible ? 'flex' : 'none';
      const scrap = hud.querySelector('#v140-scrap-count');
      if (scrap) scrap.textContent = String(Math.floor(state.scrap || 0));
    }

    function snapshot(state = stateRef()) {
      return state?.v140Expedition ? JSON.parse(JSON.stringify(state.v140Expedition)) : null;
    }

    function restore(data) {
      const state = stateRef();
      if (!state || !data) return false;
      state.v140Expedition = JSON.parse(JSON.stringify(data));
      return true;
    }

    const removeDrawer = registerWorldDrawer(drawObjects);
    hud.querySelector('#v140-pause-button')?.addEventListener('click', () => document.getElementById('btn-control-pause')?.click());
    modal.querySelector('#v140-loot-close')?.addEventListener('click', closeVendor);
    const onKey = (event) => {
      if (event.repeat || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (event.code === 'KeyE') interact();
    };
    window.addEventListener('keydown', onKey);

    off.push(legacy.on('run:start', ({ state }) => createSectorObjects(state, 1)));
    off.push(legacy.on('frame:before', ({ state, timestamp }) => {
      if (!state?.v140WaveMode) return;
      updateDiscovery(state);
      updateInteraction(state, timestamp);
      updateMinimap(state, timestamp);
      updateHud(state);
    }));
    off.push(runtime.events.on('sector:v140-entered', ({ sector }) => {
      const state = stateRef(); if (state) createSectorObjects(state, sector);
    }));

    const api = {
      interact,
      openChest,
      openVendor,
      pickupWeapon,
      createSectorObjects,
      snapshot,
      restore,
      getObjects: () => getObjects(stateRef()),
      showChestPreview() {
        const state = stateRef();
        if (!state?.v140Expedition) createSectorObjects(state, state?.sector || 1);
        const chest = getObjects(state).find((object) => object.type === 'chest' && !object.opened);
        return openChest(chest, CHEST_WEAPON_IDS_V140[0]);
      },
      showVendorPreview() {
        const state = stateRef();
        if (!state?.v140Expedition) createSectorObjects(state, state?.sector || 1);
        const vendor = getObjects(state).find((object) => object.type === 'vendor' && !object.opened);
        return openVendor(vendor);
      },
      forceWeaponDrop(id = CHEST_WEAPON_IDS_V140[0]) {
        const state = stateRef();
        if (!state?.v140Expedition) createSectorObjects(state, state?.sector || 1);
        const drop = { id: `proof_${Date.now()}`, type: 'weapon-drop', weaponId: id, x: state.mecha.x + 34, y: state.mecha.y, spawnedAt: performance.now() - 900, availableAt: 0, picked: false, label: 'ARMA' };
        state.v140Expedition.objects.push(drop);
        return drop;
      }
    };
    runtime.services.set('expedition', api);
    return {
      ...api,
      stop() {
        off.splice(0).forEach((unsubscribe) => unsubscribe?.());
        removeDrawer();
        window.removeEventListener('keydown', onKey);
      }
    };
  },
  stop(runtime, api) { api?.stop?.(); }
};
