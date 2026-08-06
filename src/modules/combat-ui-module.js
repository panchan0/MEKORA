import { BUFFS_V140 } from '../data/buffs-v140.js';

const BUFF_BY_ID = new Map(BUFFS_V140.map((buff) => [buff.id, buff]));
const BUFF_ICONS = Object.freeze({
  projectile: '➶', weapon: '✦', ammo: '◉', elemental: 'ϟ', damage: '◆',
  ability: '⌁', mobility: '»', defense: '⬡', melee: '✧', summon: '◇', meta: '◎'
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function ensureActionCluster() {
  let root = document.getElementById('v141-action-cluster');
  if (root) return root;
  root = document.createElement('section');
  root.id = 'v141-action-cluster';
  root.setAttribute('aria-label', 'Controles de combate');
  root.innerHTML = `
    <button id="v141-fire" class="v141-action v141-action-fire" type="button" aria-label="Disparar"><span>●</span></button>
    <button id="v141-dash" class="v141-action v141-action-dash" type="button" aria-label="Esquivar"><span>»</span></button>
    <button id="v141-switch" class="v141-action v141-action-switch" type="button" aria-label="Cambiar arma"><span>⇄</span></button>
    <button id="v141-interact" class="v141-action v141-action-interact" type="button" aria-label="Interactuar"><span>◇</span></button>`;
  document.body.appendChild(root);
  return root;
}

function ensureBuffDock() {
  let root = document.getElementById('v141-buff-dock');
  if (root) return root;
  root = document.createElement('section');
  root.id = 'v141-buff-dock';
  root.setAttribute('aria-label', 'Mejoras equipadas');
  document.body.appendChild(root);
  return root;
}

function ensurePauseSettingsButton() {
  const buttons = document.getElementById('pause-normal-buttons');
  if (!buttons) return null;
  let button = document.getElementById('v141-pause-settings-button');
  if (!button) {
    button = document.createElement('button');
    button.id = 'v141-pause-settings-button';
    button.type = 'button';
    button.textContent = 'CONFIGURACIÓN';
    buttons.insertBefore(button, document.getElementById('v140-save-exit') || document.getElementById('btn-exit'));
  }
  return button;
}

function ensurePauseSettingsPanel() {
  let root = document.getElementById('v141-pause-settings');
  if (root) return root;
  root = document.createElement('section');
  root.id = 'v141-pause-settings';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="v141-pause-settings-card">
      <aside class="v142-pause-settings-identity">
        <span>PERFIL COMPARTIDO</span>
        <h2>AJUSTES</h2>
        <p>Los cambios se guardan para el menú y para todas las expediciones futuras.</p>
      </aside>
      <main class="v142-pause-settings-controls">
        <header><span>SISTEMAS DE PARTIDA</span><button id="v141-settings-close" type="button" aria-label="Volver">×</button></header>
        <label><span>MÚSICA <b id="v141-bgm-value">0%</b></span><input id="v141-bgm" type="range" min="0" max="100" value="80"></label>
        <label><span>EFECTOS <b id="v141-sfx-value">0%</b></span><input id="v141-sfx" type="range" min="0" max="100" value="90"></label>
        <div class="v141-language-row" role="group" aria-label="Idioma">
          <button type="button" data-v141-lang="es">ES</button>
          <button type="button" data-v141-lang="en">EN</button>
          <button type="button" data-v141-lang="pt">PT</button>
        </div>
      </main>
    </div>`;
  document.body.appendChild(root);
  return root;
}

function hidden(element) {
  return !element || element.classList.contains('hidden') || getComputedStyle(element).display === 'none';
}

export const combatUiModule = {
  start(runtime) {
    const legacy = window.__mekoraLegacyV1;
    if (!legacy) throw new Error('Legacy bridge unavailable for combat UI');
    const cluster = ensureActionCluster();
    const dock = ensureBuffDock();
    const settingsPanel = ensurePauseSettingsPanel();
    const settingsButton = ensurePauseSettingsButton();
    const off = [];
    document.getElementById('xp-progress-bar')?.parentElement?.classList.add('v141-hidden-xp');
    let lastBuffSignature = '';
    let dashReadyAt = 0;
    let firePointer = null;

    const stateRef = () => legacy.getState?.();

    function isPc() {
      const body = document.body;
      return body.dataset.platformV342 === 'pc'
        || body.dataset.inputDevice === 'keyboard_mouse'
        || (window.innerWidth >= 900 && !matchMedia('(pointer:coarse)').matches)
        || (matchMedia('(pointer:fine)').matches && !matchMedia('(pointer:coarse)').matches);
    }

    function modalBlocking(state) {
      return !!state?.paused
        || state?.phase === 'draft'
        || state?.phase === 'gameover'
        || document.body.dataset.sectorPresentationV141 === 'true'
        || !hidden(document.getElementById('pause-modal'))
        || !hidden(document.getElementById('roguelike-draft-modal'))
        || !hidden(document.getElementById('v140-loot-modal'))
        || !hidden(document.getElementById('v141-pause-settings'))
        || !hidden(document.getElementById('v140-run-complete'));
    }

    function updateVisibility(state) {
      const playing = state?.phase === 'playing';
      const blocked = playing && modalBlocking(state);
      document.body.dataset.combatUiV141 = !playing ? 'hidden' : blocked ? 'blocked' : 'active';
      document.body.dataset.controlLayoutV141 = isPc() ? 'pc' : 'touch';
      cluster.setAttribute('aria-hidden', !playing || blocked || isPc() ? 'true' : 'false');
      if (!playing || blocked) state.isFiring = false;
    }

    function updateBuffDock(state, force = false) {
      const ids = [...new Set(state?.passives || [])].slice(0, 8);
      const levels = state?.passiveLevels || {};
      const signature = JSON.stringify({ ids, levels });
      if (!force && signature === lastBuffSignature) return;
      lastBuffSignature = signature;
      dock.innerHTML = ids.map((id) => {
        const buff = BUFF_BY_ID.get(id);
        const icon = BUFF_ICONS[buff?.category] || '•';
        const level = Math.max(1, Number(levels[id]) || 1);
        return `<span class="v141-buff" title="${buff?.name || id}" data-buff-id="${id}"><i>${icon}</i>${level > 1 ? `<b>${level}</b>` : ''}</span>`;
      }).join('');
      dock.classList.toggle('empty', ids.length === 0);
    }

    function performDash() {
      const state = stateRef();
      const now = performance.now();
      if (!state || state.phase !== 'playing' || state.paused || now < dashReadyAt) return false;
      let dx = state.moveJoystick?.active ? Number(state.moveJoystick.x) || 0 : 0;
      let dy = state.moveJoystick?.active ? Number(state.moveJoystick.y) || 0 : 0;
      if (Math.hypot(dx, dy) < .16) {
        const angle = Number(state.v140AimAngle) || (state.v140Facing === -1 ? Math.PI : 0);
        dx = Math.cos(angle); dy = Math.sin(angle);
      }
      const length = Math.max(.001, Math.hypot(dx, dy));
      dx /= length; dy /= length;
      const world = Number(legacy.getWorldSizeV140?.()) || 4600;
      const distance = 145;
      state.mecha.x = clamp(state.mecha.x + dx * distance, 52, world - 52);
      state.mecha.y = clamp(state.mecha.y + dy * distance, 52, world - 52);
      state.mecha.shieldActiveUntil = Math.max(state.mecha.shieldActiveUntil || 0, now + 230);
      state.particles = state.particles || [];
      for (let index = 0; index < 18; index += 1) {
        state.particles.push({
          x: state.mecha.x - dx * (18 + Math.random() * 28),
          y: state.mecha.y - dy * (18 + Math.random() * 28),
          vx: -dx * (2 + Math.random() * 3) + (Math.random() - .5) * 2,
          vy: -dy * (2 + Math.random() * 3) + (Math.random() - .5) * 2,
          life: 18 + Math.random() * 10,
          color: '#79dfe3'
        });
      }
      if (state.passives?.includes('p-dash-wave')) {
        state.shockwaves?.push({ x: state.mecha.x, y: state.mecha.y, radius: 8, maxRadius: 78, damage: 28, life: 12, maxLife: 12, color: '#79dfe3', pushBack: true, hitEnemies: [] });
      }
      dashReadyAt = now + 1250;
      cluster.querySelector('#v141-dash')?.classList.add('cooling');
      window.setTimeout(() => cluster.querySelector('#v141-dash')?.classList.remove('cooling'), 1250);
      runtime.events.emit('mecha:dash-v141', { x: state.mecha.x, y: state.mecha.y });
      return true;
    }

    function syncPauseSettings() {
      const originalBgm = document.getElementById('slider-bgm');
      const originalSfx = document.getElementById('slider-sfx');
      const bgm = settingsPanel.querySelector('#v141-bgm');
      const sfx = settingsPanel.querySelector('#v141-sfx');
      if (originalBgm && bgm) bgm.value = originalBgm.value;
      if (originalSfx && sfx) sfx.value = originalSfx.value;
      settingsPanel.querySelector('#v141-bgm-value').textContent = `${bgm?.value || 0}%`;
      settingsPanel.querySelector('#v141-sfx-value').textContent = `${sfx?.value || 0}%`;
      const selected = document.querySelector('.lang-btn.border-cyan-400')?.dataset.lang || 'es';
      settingsPanel.querySelectorAll('[data-v141-lang]').forEach((button) => button.classList.toggle('active', button.dataset.v141Lang === selected));
    }

    function relayRange(sourceId, targetId, valueId) {
      const source = settingsPanel.querySelector(sourceId);
      const target = document.querySelector(targetId);
      if (!source || !target) return;
      source.addEventListener('input', () => {
        target.value = source.value;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        settingsPanel.querySelector(valueId).textContent = `${source.value}%`;
      });
    }

    function openPauseSettings() {
      syncPauseSettings();
      settingsPanel.classList.remove('hidden');
      document.body.dataset.pauseSettingsV141 = 'true';
      updateVisibility(stateRef());
    }
    function closePauseSettings() {
      settingsPanel.classList.add('hidden');
      document.body.dataset.pauseSettingsV141 = 'false';
      updateVisibility(stateRef());
    }

    relayRange('#v141-bgm', '#slider-bgm', '#v141-bgm-value');
    relayRange('#v141-sfx', '#slider-sfx', '#v141-sfx-value');
    settingsPanel.querySelectorAll('[data-v141-lang]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelector(`.lang-btn[data-lang="${button.dataset.v141Lang}"]`)?.click();
        syncPauseSettings();
      });
    });
    settingsPanel.querySelector('#v141-settings-close')?.addEventListener('click', closePauseSettings);
    settingsButton?.addEventListener('click', openPauseSettings);

    const fireDown = (event) => {
      event.preventDefault();
      const state = stateRef();
      if (!state || state.phase !== 'playing' || state.paused) return;
      firePointer = event.pointerId;
      state.isFiring = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const fireUp = (event) => {
      if (firePointer != null && event.pointerId !== firePointer) return;
      const state = stateRef();
      if (state) state.isFiring = false;
      firePointer = null;
    };
    cluster.querySelector('#v141-fire')?.addEventListener('pointerdown', fireDown);
    cluster.querySelector('#v141-fire')?.addEventListener('pointerup', fireUp);
    cluster.querySelector('#v141-fire')?.addEventListener('pointercancel', fireUp);
    cluster.querySelector('#v141-dash')?.addEventListener('pointerdown', (event) => { event.preventDefault(); performDash(); });
    cluster.querySelector('#v141-switch')?.addEventListener('click', () => runtime.services.get('weaponSystem')?.switchWeapon?.());
    cluster.querySelector('#v141-interact')?.addEventListener('click', () => runtime.services.get('expedition')?.interact?.());

    const keyHandler = (event) => {
      if (event.repeat || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') performDash();
    };
    window.addEventListener('keydown', keyHandler);

    off.push(legacy.on('run:start', ({ state }) => {
      updateBuffDock(state, true);
      updateVisibility(state);
    }));
    off.push(legacy.on('frame:before', ({ state }) => {
      updateVisibility(state);
      updateBuffDock(state);
      const hasInteraction = !!state.v141NearestInteractable;
      cluster.querySelector('#v141-interact')?.classList.toggle('available', hasInteraction);
    }));

    const timer = window.setInterval(() => {
      ensurePauseSettingsButton();
      updateVisibility(stateRef());
    }, 500);

    const api = { performDash, updateVisibility, updateBuffDock, openPauseSettings, closePauseSettings };
    runtime.services.set('combatUi', api);
    return {
      ...api,
      stop() {
        off.splice(0).forEach((unsubscribe) => unsubscribe?.());
        window.removeEventListener('keydown', keyHandler);
        window.clearInterval(timer);
      }
    };
  },
  stop(runtime, api) { api?.stop?.(); }
};
