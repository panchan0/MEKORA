import { WAVE_BY_SECTOR_V140, SECTOR_WAVES_V140 } from '../data/waves-v140.js';

function ensureWaveHud() {
  let root = document.getElementById('v140-wave-hud');
  if (root) root.remove();
  root = document.createElement('section');
  root.id = 'v140-wave-hud';
  root.setAttribute('aria-label', 'Oleada y sector');
  root.innerHTML = `<span id="v141-wave-index"><b id="v141-wave-number">1</b><i>-</i><em>◇</em><b id="v141-sector-number">1</b></span>`;
  document.body.appendChild(root);
  return root;
}

function ensureSectorPresentation() {
  let landing = document.getElementById('v141-sector-landing');
  if (!landing) {
    landing = document.createElement('section');
    landing.id = 'v141-sector-landing';
    landing.className = 'hidden';
    landing.innerHTML = `
      <div class="v141-sector-title"><span id="v142-landing-index">SECTOR 1 / 5</span><h2 id="v141-landing-name">PATIO DE RECUPERACIÓN</h2></div>
      <div class="v141-landing-stage">
        <div class="v142-landing-thrusters"><span></span><span></span></div>
        <img src="./assets/mechas/axiom-placeholder.png" alt="Mecha descendiendo">
        <i></i><i></i><i></i><i></i><i></i><i></i>
      </div>`;
    document.body.appendChild(landing);
  }
  let transfer = document.getElementById('v141-sector-transfer');
  if (!transfer) {
    transfer = document.createElement('section');
    transfer.id = 'v141-sector-transfer';
    transfer.className = 'hidden';
    transfer.innerHTML = `
      <div class="v141-clouds"><i></i><i></i><i></i><i></i></div>
      <div class="v141-flight-mecha"><img src="./assets/mechas/axiom-placeholder.png" alt="Mecha en tránsito"><span></span><span></span></div>
      <div class="v141-transfer-copy"><span>RUTA EN CURSO</span><b id="v141-transfer-sector">CORREDOR INDUSTRIAL</b></div>
      <div class="v142-transfer-loader" aria-hidden="true"></div>`;
    document.body.appendChild(transfer);
  }
  return { landing, transfer };
}

function ensureCompletionModal() {
  let root = document.getElementById('v140-run-complete');
  if (root) return root;
  root = document.createElement('section');
  root.id = 'v140-run-complete';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="v140-complete-card">
      <span>EXPEDICIÓN COMPLETADA</span>
      <h2>NÚCLEO DE LA FORJA ASEGURADO</h2>
      <p>Las cinco rutas fueron limpiadas. El guardado de la run ha sido cerrado.</p>
      <div class="v140-complete-stats"><b id="v140-complete-waves">25</b><span>OLEADAS</span><b id="v140-complete-scrap">0</b><span>CHATARRA</span></div>
      <button id="v140-complete-menu" type="button">VOLVER AL MENÚ</button>
    </div>`;
  document.body.appendChild(root);
  return root;
}

export const waveDirectorModule = {
  start(runtime) {
    const legacy = window.__mekoraLegacyV1;
    if (!legacy) throw new Error('Legacy bridge unavailable for wave director');
    const off = [];
    const timers = new Set();
    const hud = ensureWaveHud();
    const presentation = ensureSectorPresentation();
    const completeModal = ensureCompletionModal();

    const later = (callback, delay) => {
      const timer = window.setTimeout(() => { timers.delete(timer); callback(); }, delay);
      timers.add(timer);
      return timer;
    };

    function stateRef() { return legacy.getState?.(); }

    function aliveRegular(state) {
      return (state.enemies || []).filter((enemy) => enemy && enemy.hp > 0 && !enemy.isDummy).length;
    }

    function getConfig(state) {
      return WAVE_BY_SECTOR_V140.get(state?.v140Wave?.sector || 1) || SECTOR_WAVES_V140[0];
    }

    function updateHud(state) {
      const system = state?.v140Wave;
      const visible = state?.phase === 'playing' && !state?.paused && document.body.dataset.sectorPresentationV141 !== 'true';
      hud.style.display = visible ? 'block' : 'none';
      if (!system) return;
      const config = getConfig(state);
      const wave = Math.max(1, Math.min(config.waveCount, system.wave || 1));
      hud.querySelector('#v141-wave-number').textContent = String(wave);
      hud.querySelector('#v141-sector-number').textContent = String(system.sector || 1);
      hud.title = `Oleada ${wave} de ${config.waveCount} · Sector ${system.sector}`;
    }

    function addLandingParticles(state) {
      state.particles = state.particles || [];
      for (let index = 0; index < 58; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 6;
        state.particles.push({
          x: state.mecha.x + Math.cos(angle) * (8 + Math.random() * 18),
          y: state.mecha.y + 18 + Math.random() * 8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * .45 - Math.random() * 2,
          life: 22 + Math.random() * 20,
          color: Math.random() > .35 ? '#d9b16d' : '#87979c'
        });
      }
      state.shockwaves?.push({ x: state.mecha.x, y: state.mecha.y + 10, radius: 8, maxRadius: 92, damage: 0, life: 16, maxLife: 16, color: '#d9b16d', pushBack: false, hitEnemies: [] });
    }

    function playLanding(state, sector) {
      const config = WAVE_BY_SECTOR_V140.get(sector) || SECTOR_WAVES_V140[0];
      state.paused = true;
      state.isFiring = false;
      state.v141SectorIntro = true;
      document.body.dataset.sectorPresentationV141 = 'true';
      presentation.landing.querySelector('#v142-landing-index').textContent = `SECTOR ${sector} / ${SECTOR_WAVES_V140.length}`;
      presentation.landing.querySelector('#v141-landing-name').textContent = config.name.toUpperCase();
      presentation.landing.classList.remove('hidden', 'impact');
      presentation.landing.classList.add('active');
      updateHud(state);
      later(() => {
        presentation.landing.classList.add('impact');
        document.querySelector('.screen[data-show-on="playing"] .virtual-screen')?.classList.add('screen-shake');
        addLandingParticles(state);
      }, 840);
      later(() => document.querySelector('.screen[data-show-on="playing"] .virtual-screen')?.classList.remove('screen-shake'), 1120);
      later(() => {
        presentation.landing.classList.add('hidden');
        presentation.landing.classList.remove('active', 'impact');
        state.v141SectorIntro = false;
        state.paused = false;
        state.v140Wave.waiting = true;
        state.v140Wave.nextWaveAt = performance.now() + 900;
        document.body.dataset.sectorPresentationV141 = 'false';
        updateHud(state);
        runtime.events.emit('sector:v141-ready', { sector });
      }, 1560);
    }

    function enterSector(state, sector, timestamp = performance.now()) {
      const clamped = Math.max(1, Math.min(5, Number(sector) || 1));
      state.enemies.length = 0;
      state.enemyBullets.length = 0;
      state.enemyMinesV31.length = 0;
      state.v140Wave = {
        sector: clamped,
        wave: 0,
        waiting: true,
        nextWaveAt: Number.POSITIVE_INFINITY,
        spawnedThisWave: 0,
        completed: false,
        transitioning: false,
        runCompleted: false
      };
      state.v140WaveMode = true;
      state.sector = clamped;
      state.sectorCurrentV33 = clamped;
      state.nextSectorEventAtV33 = Number.POSITIVE_INFINITY;
      legacy.setSectorV140?.(clamped);
      runtime.events.emit('sector:v140-entered', { sector: clamped, config: getConfig(state) });
      playLanding(state, clamped);
      updateHud(state, timestamp);
    }

    function playTransfer(state, nextSector) {
      if (state.v140Wave.transitioning) return;
      state.v140Wave.transitioning = true;
      state.paused = true;
      state.isFiring = false;
      document.body.dataset.sectorPresentationV141 = 'true';
      const nextConfig = WAVE_BY_SECTOR_V140.get(nextSector) || SECTOR_WAVES_V140[nextSector - 1] || SECTOR_WAVES_V140[0];
      presentation.transfer.querySelector('#v141-transfer-sector').textContent = nextConfig.name.toUpperCase();
      presentation.transfer.classList.remove('hidden');
      presentation.transfer.classList.add('active');
      updateHud(state);
      later(() => {
        presentation.transfer.classList.add('hidden');
        presentation.transfer.classList.remove('active');
        enterSector(state, nextSector, performance.now());
      }, 2100);
      runtime.events.emit('sector:v141-transfer', { from: nextSector - 1, to: nextSector });
    }

    function selectType(config, index, wave) {
      const pool = config.pool;
      const weightedIndex = (index + wave + Math.floor(Math.random() * pool.length)) % pool.length;
      return pool[weightedIndex];
    }

    function spawnWave(state, timestamp) {
      const system = state.v140Wave;
      const config = getConfig(state);
      system.wave += 1;
      system.waiting = false;
      system.completed = false;
      const isFinal = system.wave >= config.waveCount;
      let count = config.baseEnemies + (system.wave - 1) * 2 + Math.floor(system.sector * 1.25);
      if (isFinal && config.final === 'boss') count = Math.max(7, count - 5);
      if (isFinal && config.final === 'miniboss') count = Math.max(6, count - 3);
      system.spawnedThisWave = count;
      system.startedAt = timestamp;
      for (let index = 0; index < count; index += 1) {
        const type = selectType(config, index, system.wave);
        const elite = isFinal && config.final === 'elite' && index === 0;
        legacy.spawnEnemy?.(type, 430 + index * 12, elite ? { elite: true } : {});
      }
      if (isFinal && config.final === 'miniboss') {
        legacy.spawnEnemy?.('drill_bastion', 620, { elite: false });
        system.spawnedThisWave += 1;
      }
      if (isFinal && config.final === 'boss') {
        legacy.spawnEnemy?.('forge_titan', 680, { elite: false });
        system.spawnedThisWave += 1;
      }
      runtime.events.emit('wave:started', { sector: system.sector, wave: system.wave, count: system.spawnedThisWave });
      updateHud(state);
    }

    function completeRun(state) {
      state.v140Wave.runCompleted = true;
      state.v140Wave.completed = true;
      state.paused = true;
      state.isFiring = false;
      const scrap = completeModal.querySelector('#v140-complete-scrap');
      if (scrap) scrap.textContent = String(Math.floor(state.scrap || 0));
      completeModal.classList.remove('hidden');
      runtime.events.emit('run:v140-completed', { state });
      runtime.services.get('runSave')?.clear?.();
    }

    function completeSector(state) {
      const system = state.v140Wave;
      if (system.completed) return;
      system.completed = true;
      system.waiting = true;
      if (system.sector >= 5) {
        later(() => completeRun(state), 700);
        return;
      }
      later(() => playTransfer(state, system.sector + 1), 650);
      runtime.events.emit('sector:v140-completed', { sector: system.sector, next: system.sector + 1 });
    }

    function update(state, timestamp) {
      const system = state?.v140Wave;
      if (!system || state.phase !== 'playing' || state.paused || state.deathSequenceV331?.active) {
        updateHud(state);
        return;
      }
      const config = getConfig(state);
      const alive = aliveRegular(state);
      if (system.completed || system.transitioning) {
        updateHud(state);
        return;
      }
      if (system.waiting) {
        if (timestamp >= system.nextWaveAt) spawnWave(state, timestamp);
        updateHud(state);
        return;
      }
      if (alive === 0) {
        if (system.wave >= config.waveCount) completeSector(state);
        else {
          system.waiting = true;
          system.nextWaveAt = timestamp + 2600;
          runtime.events.emit('wave:cleared', { sector: system.sector, wave: system.wave });
        }
      }
      updateHud(state);
    }

    function snapshot(state = stateRef()) {
      return state?.v140Wave ? JSON.parse(JSON.stringify(state.v140Wave)) : null;
    }

    function restore(data) {
      const state = stateRef();
      if (!state || !data) return false;
      state.v140Wave = JSON.parse(JSON.stringify(data));
      state.v140WaveMode = true;
      state.sector = state.v140Wave.sector;
      state.sectorCurrentV33 = state.v140Wave.sector;
      state.v140Wave.completed = false;
      state.v140Wave.transitioning = false;
      state.v140Wave.waiting = true;
      state.v140Wave.nextWaveAt = Number.POSITIVE_INFINITY;
      state.v140Wave.spawnedThisWave = 0;
      legacy.setSectorV140?.(state.v140Wave.sector);
      playLanding(state, state.v140Wave.sector);
      updateHud(state);
      return true;
    }

    off.push(legacy.on('run:start', ({ state }) => enterSector(state, 1)));
    off.push(legacy.on('frame:before', ({ state, timestamp }) => update(state, timestamp)));

    completeModal.querySelector('#v140-complete-menu')?.addEventListener('click', () => {
      completeModal.classList.add('hidden');
      const state = stateRef();
      if (state) state.paused = false;
      legacy.goToMenuV140?.();
    });

    const api = { enterSector, spawnWave, snapshot, restore, playLanding, playTransfer, getConfig: () => getConfig(stateRef()) };
    runtime.services.set('waveDirector', api);
    return {
      ...api,
      stop() {
        off.splice(0).forEach((unsubscribe) => unsubscribe?.());
        timers.forEach((timer) => window.clearTimeout(timer));
        timers.clear();
      }
    };
  },
  stop(runtime, api) { api?.stop?.(); }
};
