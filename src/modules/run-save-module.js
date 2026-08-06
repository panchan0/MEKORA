const RUN_KEY = 'mekora_v140_active_run';

function safeRead() {
  try { return JSON.parse(localStorage.getItem(RUN_KEY) || 'null'); } catch (error) { return null; }
}
function safeWrite(value) {
  try { localStorage.setItem(RUN_KEY, JSON.stringify(value)); return true; } catch (error) { return false; }
}
function safeRemove() {
  try { localStorage.removeItem(RUN_KEY); } catch (error) {}
}

function ensureContinueButton() {
  const actions = document.querySelector('.menu-actions-v333');
  if (!actions) return null;
  let button = document.getElementById('v140-continue-run');
  if (!button) {
    button = document.createElement('button');
    button.id = 'v140-continue-run';
    button.type = 'button';
    button.innerHTML = '<b>CONTINUAR RUN</b><span id="v140-continue-detail">SECTOR 1 · OLEADA 1</span>';
    actions.insertBefore(button, actions.children[1] || null);
  }
  return button;
}

function ensureSaveExitButton() {
  const buttons = document.getElementById('pause-normal-buttons');
  if (!buttons) return null;
  let button = document.getElementById('v140-save-exit');
  if (!button) {
    button = document.createElement('button');
    button.id = 'v140-save-exit';
    button.className = 'w-full text-white font-title text-xs py-1.5 rounded-lg border transition-all duration-200';
    button.type = 'button';
    button.textContent = 'GUARDAR Y SALIR';
    buttons.insertBefore(button, document.getElementById('btn-exit'));
  }
  return button;
}

export const runSaveModule = {
  start(runtime) {
    const legacy = window.__mekoraLegacyV1;
    if (!legacy) throw new Error('Legacy bridge unavailable for run save');
    const off = [];
    let pendingRestore = null;
    let lastAutoSaveAt = 0;
    let menuTimer = null;

    function stateRef() { return legacy.getState?.(); }

    function serialize(state = stateRef()) {
      if (!state?.v140WaveMode || state.phase === 'gameover') return null;
      return {
        schema: 1,
        version: '1.4.2',
        savedAt: Date.now(),
        mecha: {
          x: state.mecha.x, y: state.mecha.y,
          hp: state.mecha.hp, maxHp: state.mecha.maxHp,
          shield: state.mecha.shield, maxShield: state.mecha.maxShield
        },
        run: {
          scrap: state.scrap || 0,
          score: state.score || 0,
          level: state.level || 1,
          xp: state.xp || 0,
          xpNeeded: state.xpNeeded || 30,
          playTime: state.playTime || 0,
          credits: state.credits || 0,
          passives: [...(state.passives || [])],
          passiveLevels: { ...(state.passiveLevels || {}) },
          sector: state.v140Wave?.sector || state.sector || 1
        },
        weapons: runtime.services.get('weaponSystem')?.snapshot?.(),
        wave: runtime.services.get('waveDirector')?.snapshot?.(),
        expedition: runtime.services.get('expedition')?.snapshot?.(),
        runConfig: runtime.services.get('runConfig')?.get?.() || null
      };
    }

    function save(reason = 'auto') {
      const data = serialize();
      if (!data) return false;
      data.reason = reason;
      const written = safeWrite(data);
      if (written) runtime.events.emit('run:save-written', { reason, data });
      refreshContinueButton();
      return written;
    }

    function clear(reason = 'manual') {
      safeRemove();
      runtime.events.emit('run:save-cleared', { reason });
      refreshContinueButton();
      return true;
    }

    function restoreIntoState(state, data) {
      if (!state || !data) return false;
      const run = data.run || {};
      const mecha = data.mecha || {};
      state.mecha.x = Number(mecha.x) || state.mecha.x;
      state.mecha.y = Number(mecha.y) || state.mecha.y;
      state.mecha.maxHp = Number(mecha.maxHp) || state.mecha.maxHp;
      state.mecha.hp = Math.max(1, Math.min(state.mecha.maxHp, Number(mecha.hp) || state.mecha.hp));
      state.mecha.maxShield = Math.max(0, Number(mecha.maxShield) || state.mecha.maxShield);
      state.mecha.shield = Math.max(0, Math.min(state.mecha.maxShield, Number(mecha.shield) || 0));
      state.scrap = Math.max(0, Number(run.scrap) || 0);
      state.score = Math.max(0, Number(run.score) || 0);
      state.level = Math.max(1, Number(run.level) || 1);
      state.xp = Math.max(0, Number(run.xp) || 0);
      state.xpNeeded = Math.max(1, Number(run.xpNeeded) || 30);
      state.playTime = Math.max(0, Number(run.playTime) || 0);
      state.credits = Math.max(0, Number(run.credits) || 0);
      state.passives = [...(run.passives || [])];
      state.passiveLevels = { ...(run.passiveLevels || {}) };
      runtime.services.get('weaponSystem')?.restore?.(data.weapons);
      runtime.services.get('waveDirector')?.restore?.(data.wave);
      runtime.services.get('expedition')?.restore?.(data.expedition);
      state.paused = false;
      state.phase = 'playing';
      legacy.refreshUi?.();
      runtime.events.emit('run:save-restored', { data });
      return true;
    }

    function continueRun() {
      const data = safeRead();
      if (!data) return false;
      pendingRestore = data;
      legacy.startAuthorizedRunV140?.();
      return true;
    }

    function refreshContinueButton() {
      const button = ensureContinueButton();
      if (!button) return;
      const data = safeRead();
      button.hidden = !data;
      button.style.display = data ? '' : 'none';
      if (data) {
        const detail = button.querySelector('#v140-continue-detail');
        const sector = data.wave?.sector || data.run?.sector || 1;
        const wave = data.wave?.wave || 1;
        if (detail) detail.textContent = `SECTOR ${sector} · OLEADA ${Math.max(1, wave)} · ${Math.floor(data.run?.scrap || 0)} CHATARRA`;
      }
      button.onclick = continueRun;
    }

    function ensurePauseControl() {
      const button = ensureSaveExitButton();
      if (!button || button.dataset.readyV140) return;
      button.dataset.readyV140 = 'true';
      button.addEventListener('click', () => {
        save('pause-exit');
        const state = stateRef();
        if (state) { state.paused = false; state.isFiring = false; }
        document.getElementById('pause-modal')?.classList.add('hidden');
        legacy.goToMenuV140?.();
      });
    }

    const onDocumentClick = (event) => {
      const launch = event.target.closest('#v340-launch');
      if (launch && !pendingRestore) clear('new-run');
    };
    document.addEventListener('click', onDocumentClick, true);

    off.push(legacy.on('run:start', ({ state }) => {
      if (pendingRestore) {
        const data = pendingRestore;
        pendingRestore = null;
        window.setTimeout(() => restoreIntoState(state, data), 120);
      } else {
        window.setTimeout(() => save('run-start'), 500);
      }
    }));
    off.push(legacy.on('frame:before', ({ state, timestamp }) => {
      if (state.phase === 'gameover' || state.deathSequenceV331?.active) {
        clear('run-ended');
        return;
      }
      if (state.v140WaveMode && (state.phase === 'playing' || state.paused) && timestamp - lastAutoSaveAt >= 4500) {
        lastAutoSaveAt = timestamp;
        save('auto');
      }
      ensurePauseControl();
    }));
    off.push(runtime.events.on('run:v140-completed', () => clear('completed')));

    menuTimer = window.setInterval(() => {
      refreshContinueButton();
      ensurePauseControl();
    }, 700);
    refreshContinueButton();
    ensurePauseControl();

    const api = { save, clear, load: safeRead, continueRun, serialize, restoreIntoState };
    runtime.services.set('runSave', api);
    return {
      ...api,
      stop() {
        off.splice(0).forEach((unsubscribe) => unsubscribe?.());
        document.removeEventListener('click', onDocumentClick, true);
        if (menuTimer) window.clearInterval(menuTimer);
      }
    };
  },
  stop(runtime, api) { api?.stop?.(); }
};
