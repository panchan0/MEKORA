// ===== legacy runtime segment 1 =====

const MEKORA_APP_STATES_KEY = 'mekora_app_states';
const MEKORA_RESULT_KEY = 'mekora_last_result';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

function getConfig(category, name, fallback) {
  const store = readJson('mekora_config', {});

  const fromObject = (obj) => {
    if (!obj || typeof obj !== 'object') return undefined;
    if (obj[category] && typeof obj[category] === 'object' && obj[category][name] !== undefined) {
      return obj[category][name];
    }
    if (obj[category] === name) return obj[category];
    return undefined;
  };

  const stored = fromObject(store);
  if (stored !== undefined) return stored;

  if (category === 'tune') {
    const tuneDefaults = {
      'bgm-volume': 0.8,
      'sfx-volume': 0.9,
      'camera-zoom': 0.7
    };
    if (tuneDefaults[name] !== undefined) return tuneDefaults[name];
  }

  return fallback !== undefined ? fallback : '';
}

function saveLastRunResult(result) {
  writeJson(MEKORA_RESULT_KEY, result ?? null);
}

function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) {}
}


//#region persistence · Global stats persistence
      // Local persistent data (app_states)
      async function loadGlobalStats() {
        try {
          const res = readJson(MEKORA_APP_STATES_KEY, { pageSettings: {} });
          if (res && res.pageSettings && res.pageSettings.globalStats) {
            return res.pageSettings.globalStats;
          }
        } catch (e) {
          console.error("Error loading global stats:", e);
        }
        return {
          totalEnemiesDefeated: 0,
          globalHighScore: 0,
          recentRuns: []
        };
      }
      function saveGlobalStats(stats) {
        try {
          const res = readJson(MEKORA_APP_STATES_KEY, { pageSettings: {} });
          const pageSettings = (res && res.pageSettings) || {};
          pageSettings.globalStats = stats;
          writeJson(MEKORA_APP_STATES_KEY, { pageSettings });
        } catch (e) {
          console.error("Error saving global stats:", e);
        }
      }

      async function updateGlobalStatsUI() {

        const stats = await loadGlobalStats();
        const totalKillsEl = document.getElementById('global-total-kills');
        const highScoreEl = document.getElementById('global-high-score');
        const recentRunsEl = document.getElementById('global-recent-runs');

        if (totalKillsEl) totalKillsEl.textContent = stats.totalEnemiesDefeated.toLocaleString();
        if (highScoreEl) highScoreEl.textContent = `${stats.globalHighScore.toLocaleString()} PTS`;

        if (recentRunsEl) {
          if (stats.recentRuns && stats.recentRuns.length > 0) {
            recentRunsEl.innerHTML = stats.recentRuns.map(run => {
              return `<div class="flex justify-between border-b border-gray-800 pb-0.5">
                <span class="text-cyan-400 truncate max-w-[120px]">${run.name}</span>
                <span class="text-gray-400">Niv ${run.sector}</span>
                <span class="text-amber-400 font-bold">${run.score}</span>
              </div>`;
            }).join('');
          } else {
            recentRunsEl.innerHTML = `<div class="text-gray-500 italic">Sin registros aún</div>`;
          }
        }
      }

      async function updateGlobalStatsOnEnd(score, sector, enemiesDefeated) {
        try {
          const stats = await loadGlobalStats();
          stats.totalEnemiesDefeated = (stats.totalEnemiesDefeated || 0) + enemiesDefeated;
          if (score > (stats.globalHighScore || 0)) {
            stats.globalHighScore = score;
          }

          let playerName = "MECHA-" + Math.floor(Math.random() * 9000 + 1000);
          try {
            const playerInfo = readJson('mekora_player_info', {});
            if (playerInfo && playerInfo.username) {
              playerName = playerInfo.username;
            }
          } catch (e) {}
stats.recentRuns = stats.recentRuns || [];
          stats.recentRuns.unshift({
            name: playerName,
            score: score,
            sector: sector,
            timestamp: Date.now()
          });
          stats.recentRuns = stats.recentRuns.slice(0, 5);

          saveGlobalStats(stats);
        } catch (e) {
          console.error("Error updating global stats on end:", e);
        }
      }
      //#endregion persistence

      //#region config · Runtime settings
// Configuration settings state
      const SETTINGS_STATE = {
        bgmVolume: getConfig('tune', 'bgm-volume', 0.8),
        sfxVolume: getConfig('tune', 'sfx-volume', 0.9),
        cameraZoom: getConfig('tune', 'camera-zoom', 0.7),
        language: getConfig('ui', 'language', 'es')
      };

      function saveRuntimeSettings() {
        const config = readJson('mekora_config', {});
        const tune = (config.tune && typeof config.tune === 'object') ? config.tune : {};
        config.tune = {
          ...tune,
          'bgm-volume': SETTINGS_STATE.bgmVolume,
          'sfx-volume': SETTINGS_STATE.sfxVolume,
          'camera-zoom': SETTINGS_STATE.cameraZoom
        };
        config.ui = { ...(config.ui && typeof config.ui === 'object' ? config.ui : {}), language: SETTINGS_STATE.language };
        writeJson('mekora_config', config);
      }

      function getSfxVol() {
        return typeof SETTINGS_STATE.sfxVolume === 'number' ? SETTINGS_STATE.sfxVolume : 0.9;
      }
//#endregion config

      //#region audio · Web audio context and procedural sound effects
      // Synthesized procedural Web Audio sound fallback so game is 100% playable out of the box
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      let audioCtx = null;

      function initAudio() {
        if (state && state.muted) return false;
        if (!AudioCtx) return false;
        try {
          if (!audioCtx) {
            audioCtx = new AudioCtx();
          }
          if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
            const resumeResult = audioCtx.resume();
            if (resumeResult && typeof resumeResult.catch === 'function') {
              resumeResult.catch(() => {});
            }
          }
          return true;
        } catch (e) {
          console.warn('Audio no disponible; los controles continúan funcionando.', e);
          audioCtx = null;
          return false;
        }
      }

      function playSound(type) {
        if (!audioCtx || state.muted) return;
        try {
          const now = audioCtx.currentTime;
          if (type === 'laser') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
            gain.gain.setValueAtTime(0.2 * getSfxVol(), now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.15);
          } else if (type === 'hit') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
            gain.gain.setValueAtTime(0.3 * getSfxVol(), now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.2);
          } else if (type === 'equip') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
            gain.gain.setValueAtTime(0.2 * getSfxVol(), now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.1);
          }
        } catch(e){}
      }
      //#endregion audio

      //#region content_database · Weapons, powers, passives and synergies
// Weapons/Powers and Passive Abilities database
      const UPGRADE_POOL = [
        // Weapons
        { id: 'w-machinegun', type: 'weapon', title: 'Ametralladora', desc: 'Dispara ráfagas rápidas de proyectiles cinéticos', icon: '✸' },
        { id: 'w-energycannon', type: 'weapon', title: 'Cañón de Energía', desc: 'Dispara esferas de energía de gran impacto', icon: '☄' },
        { id: 'w-laser', type: 'weapon', title: 'Láser Continuo', desc: 'Dispara un haz láser continuo perforante', icon: '⚡' },
        { id: 'w-shotgun', type: 'weapon', title: 'Escopeta de Metralla', desc: 'Dispara múltiples proyectiles en cono a corta distancia', icon: '⚏' },
        { id: 'w-missile', type: 'weapon', title: 'Misiles Teledirigidos', desc: 'Lanza misiles que buscan y explotan en los enemigos', icon: '🚀' },
        { id: 'w-grenadelauncher', type: 'weapon', title: 'Lanzagranadas', desc: 'Lanza granadas rebotadoras que causan daño en área', icon: '💥' },
        { id: 'w-railgun', type: 'weapon', title: 'Railgun Lineal', desc: 'Dispara un proyectil hipersónico que atraviesa todo', icon: '➔' },
        { id: 'w-sniper', type: 'weapon', title: 'Rifle de Precisión', desc: 'Disparo lento pero devastador a larga distancia', icon: '🎯' },
        { id: 'w-flamethrower', type: 'weapon', title: 'Lanzallamas', desc: 'Quema a los enemigos en un cono de fuego continuo', icon: '🔥' },
        { id: 'w-plasma', type: 'weapon', title: 'Cañón de Plasma', desc: 'Dispara esferas de plasma que explotan al impacto', icon: '⚛' },
        { id: 'w-energysword', type: 'weapon', title: 'Espada de Energía', desc: 'Ataque cuerpo a cuerpo rápido en arco', icon: '⚔' },
        { id: 'w-kinetichammer', type: 'weapon', title: 'Martillo Cinético', desc: 'Golpe pesado que genera una onda de choque expansiva', icon: '🔨' },
        { id: 'w-lance', type: 'weapon', title: 'Lanza de Plasma', desc: 'Estocada frontal de gran alcance y penetración', icon: '🔱' },
        { id: 'w-claws', type: 'weapon', title: 'Garras de Combate', desc: 'Ataques cuerpo a cuerpo dobles extremadamente rápidos', icon: '爪' },
        { id: 'w-boomerang', type: 'weapon', title: 'Búmeran de Energía', desc: 'Proyectil que va y vuelve dañando a los enemigos', icon: '⤳' },
        { id: 'w-drones', type: 'weapon', title: 'Drones de Apoyo', desc: 'Drones orbitales que disparan a los enemigos cercanos', icon: '🛸' },
        { id: 'w-repairdrones', type: 'weapon', title: 'Drones de Reparación', desc: 'Reparan periódicamente el blindaje y escudo del mecha', icon: '🔧' },
        { id: 'w-turrets', type: 'weapon', title: 'Torreta Desplegable', desc: 'Despliega torretas estáticas que disparan automáticamente', icon: '🗼' },
        { id: 'w-mines', type: 'weapon', title: 'Minas de Proximidad', desc: 'Sueltas minas que explotan cuando un enemigo se acerca', icon: '🛑' },
        { id: 'w-shield', type: 'weapon', title: 'Escudo de Fuerza', desc: 'Genera una burbuja protectora temporal invulnerable', icon: '🛡' },
        { id: 'w-gravityfield', type: 'weapon', title: 'Campo de Gravedad', desc: 'Crea una zona que atrae y ralentiza a los enemigos', icon: '🌀' },
        { id: 'w-emp', type: 'weapon', title: 'Pulso Electromagnético', desc: 'Desactiva y daña a todos los enemigos en pantalla', icon: '📡' },
        { id: 'w-teleport', type: 'weapon', title: 'Teletransporte', desc: 'Te transporta instantáneamente hacia adelante con una onda expansiva', icon: '🌌' },
        { id: 'w-dash', type: 'weapon', title: 'Impulso Táctico', desc: 'Desplazamiento rápido que daña y empuja a los enemigos', icon: '💨' },
        { id: 'w-reactor', type: 'weapon', title: 'Sobrecarga de Reactor', desc: 'Aumenta temporalmente la velocidad y cadencia de fuego', icon: '🔋' },
        { id: 'w-orbital', type: 'weapon', title: 'Ataque Orbital', desc: 'Solicita bombardeos láser desde la órbita', icon: '🌠' },
        { id: 'w-highbeam', type: 'weapon', title: 'Megahaz de Luz', desc: 'Dispara un haz de luz gigante devastador al frente', icon: '🔦' },
        { id: 'w-summons', type: 'weapon', title: 'Unidad de Apoyo', desc: 'Invoca mini-mechas aliados que combaten a tu lado', icon: '🤖' },


        // v3.0.2 · First renewed kinetic arsenal package
        { id: 'w-rotarycannon', type: 'weapon', title: 'Cañón rotatorio', desc: 'Aumenta su cadencia mientras mantiene fuego; la dispersión crece al alcanzar máxima velocidad.', icon: '✺' },
        { id: 'w-pistonshotgun', type: 'weapon', title: 'Escopeta de pistones', desc: 'Descarga cinética de corto alcance que empuja ligeramente al mecha en dirección contraria.', icon: '▰' },

        // Passive Abilities
        { id: 'p-bounce', type: 'passive', title: 'Rebote de Proyectiles', desc: 'Las balas rebotan entre enemigos cercanos', icon: '⤳' },
        { id: 'p-pierce', type: 'passive', title: 'Balas Perforantes', desc: 'Los proyectiles atraviesan a los objetivos', icon: '➔' },
        { id: 'p-explode', type: 'passive', title: 'Explosión al Morir', desc: 'Los enemigos explotan al ser eliminados', icon: '💥' },
        { id: 'p-fire-zone', type: 'passive', title: 'Zonas de Fuego', desc: 'Las explosiones dejan zonas de fuego dañinas', icon: '🔥' },
        { id: 'p-lightning', type: 'passive', title: 'Rayos Eléctricos', desc: 'Los disparos generan arcos eléctricos', icon: '⚡' },
        { id: 'p-extra-missile', type: 'passive', title: 'Misil Adicional', desc: 'Cada 5 disparos se lanza un misil teledirigido', icon: '🚀' },
        { id: 'p-crit-effect', type: 'passive', title: 'Golpes Críticos', desc: 'Los golpes críticos causan explosiones de energía', icon: '✨' },
        { id: 'p-drone-copy', type: 'passive', title: 'Sincronía de Drones', desc: 'Los drones copian el proyectil del arma principal', icon: '❖' },
        { id: 'p-kill-cooldown', type: 'passive', title: 'Reactor Táctico', desc: 'Eliminar enemigos reduce el enfriamiento de habilidades', icon: '⏱' },
        { id: 'p-dash-wave', type: 'passive', title: 'Dash Expansivo', desc: 'Los dash generan ondas expansivas masivas', icon: '💨' },
        { id: 'p-extra-projectile', type: 'passive', title: 'Disparos Adicionales', desc: 'El arma principal dispara proyectiles adicionales', icon: '⚏' },
        { id: 'p-elemental', type: 'passive', title: 'Efectos Elementales', desc: 'Los ataques queman, congelan o ralentizan enemigos', icon: '❄' },
        { id: 'p-shield-reflect', type: 'passive', title: 'Escudo Reflector', desc: 'Los escudos reflejan los proyectiles enemigos', icon: '🛡' },
        { id: 'p-melee-wave', type: 'passive', title: 'Ondas de Energía', desc: 'Los ataques cuerpo a cuerpo generan ondas de energía', icon: '🌊' },
        { id: 'p-evolve', type: 'passive', title: 'Evolución de Armas', desc: 'Combina armas y pasivas para desbloquear evoluciones', icon: '👑' },
        { id: 'p-cooldown', type: 'passive', title: 'Enfriamiento Rápido', desc: 'Reduce el tiempo de recarga de todas las armas', icon: '⏱' },

        { id: 'p-last-magazine', type: 'passive', title: 'Último cargador', desc: 'Las últimas tres balas del cargador principal causan daño adicional.', icon: '➉' },
        { id: 'p-first-impact', type: 'passive', title: 'Primer impacto', desc: 'El primer disparo después de recargar gana daño y penetración.', icon: 'Ⅰ' },
      ];

      // Synergy definitions
      const SYNERGIES = [
        { id: 'syn-napalm', name: 'Napalm MX-9', reqs: ['w-flamethrower', 'w-missile'], icon: '🔥', desc: 'Dispara misiles cargados de napalm que explotan y dejan enormes zonas incendiadas durante varios segundos.' },
        { id: 'syn-vulcan', name: 'Vulcan Gauss', reqs: ['w-machinegun', 'w-railgun'], icon: '⚡', desc: 'Dispara ráfagas extremadamente rápidas que acumulan energía y liberan un proyectil electromagnético gigante.' },
        { id: 'syn-prisma', name: 'Prisma Infinito', reqs: ['w-laser', 'p-bounce'], icon: '🔮', desc: 'El rayo se divide continuamente, rebota entre enemigos y atraviesa objetivos.' },
        { id: 'syn-tesla', name: 'Escopeta Tesla', reqs: ['w-shotgun', 'p-lightning'], icon: '⚡', desc: 'Cada perdigón genera rayos que saltan automáticamente entre enemigos cercanos.' },
        { id: 'syn-fantasma', name: 'Hoja Fantasma', reqs: ['w-energysword', 'w-dash'], icon: '👻', desc: 'Cada dash genera una copia espectral que repite todos los ataques realizados.' },
        { id: 'syn-singularidad', name: 'Martillo Singularidad', reqs: ['w-kinetichammer', 'w-gravityfield'], icon: '🕳️', desc: 'Cada impacto crea una pequeña singularidad que atrae enemigos antes de explotar.' },
        { id: 'syn-eclipse', name: 'Eclipse', reqs: ['w-sniper', 'p-crit-effect'], icon: '🌙', desc: 'Los disparos críticos atraviesan todo el escenario e infligen daño masivo.' },
        { id: 'syn-portamisiles', name: 'Portamisiles Autónomo', reqs: ['w-drones', 'w-missile'], icon: '🛸', desc: 'El dron dispara misiles inteligentes de forma independiente.' },
        { id: 'syn-centinela', name: 'Centinela Solar', reqs: ['w-turrets', 'w-laser'], icon: '☀️', desc: 'La torreta dispara un rayo continuo que sigue automáticamente a los enemigos.' },
        { id: 'syn-biotoxico', name: 'Campo Biotóxico', reqs: ['w-mines', 'p-elemental'], icon: '☣️', desc: 'Las minas liberan una nube tóxica persistente tras explotar.' },
        { id: 'syn-criogenico', name: 'Cañón Criogénico', reqs: ['w-railgun', 'p-elemental'], icon: '❄️', desc: 'Los proyectiles congelan completamente a todos los enemigos atravesados.' },
        { id: 'syn-arco-plasma', name: 'Arco de Plasma', reqs: ['w-plasma', 'p-lightning'], icon: '⚡', desc: 'Cada disparo crea descargas eléctricas que encadenan múltiples enemigos.' },
        { id: 'syn-represalia', name: 'Escudo de Represalia', reqs: ['w-shield', 'p-shield-reflect'], icon: '🛡️', desc: 'Bloquea proyectiles y devuelve el daño recibido con mayor potencia.' },
        { id: 'syn-nanoenjambre', name: 'Nanoenjambre', reqs: ['w-repairdrones', 'p-kill-cooldown'], icon: '🐝', desc: 'El dron se divide en múltiples microdrones que reparan y atacan simultáneamente.' },
        { id: 'syn-satelite', name: 'Satélite Exterminador', reqs: ['w-orbital', 'p-crit-effect'], icon: '🛰️', desc: 'Un satélite identifica automáticamente enemigos marcados y los bombardea desde la órbita.' },
        { id: 'syn-devorador', name: 'Devorador Celeste', reqs: ['w-gravityfield', 'w-missile'], icon: '🌌', desc: 'Los misiles son absorbidos por la singularidad y detonados todos al mismo tiempo.' },
        { id: 'syn-relampago', name: 'Hoja Relámpago', reqs: ['w-energysword', 'p-lightning'], icon: '⚡', desc: 'Cada golpe genera potentes arcos eléctricos alrededor del objetivo.' },
        { id: 'syn-incinerador', name: 'Incinerador Omega', reqs: ['w-flamethrower', 'p-fire-zone'], icon: '🔥', desc: 'Las llamas permanecen activas mientras existan enemigos dentro del área.' },
        { id: 'syn-ricochet', name: 'Escopeta Ricochet', reqs: ['w-shotgun', 'p-bounce'], icon: '↩️', desc: 'Los perdigones rebotan múltiples veces sin perder potencia.' },
        { id: 'syn-lanza-fotonica', name: 'Lanza Fotónica', reqs: ['w-railgun', 'w-laser'], icon: '🔱', desc: 'Combina un disparo perforante instantáneo con un rayo continuo de alta energía.' },
        { id: 'syn-sismico', name: 'Destructor Sísmico', reqs: ['w-kinetichammer', 'p-explode'], icon: '🌋', desc: 'Cada impacto produce terremotos que generan explosiones en cadena.' },
        { id: 'syn-dimensional', name: 'Cortador Dimensional', reqs: ['w-teleport', 'w-energysword'], icon: '🌀', desc: 'Cada teletransporte realiza automáticamente un corte que atraviesa todos los enemigos del recorrido.' },
        { id: 'syn-helios', name: 'Enjambre Helios', reqs: ['w-drones', 'w-laser', 'p-lightning'], icon: '☀️', desc: 'Tres drones orbitan al jugador disparando rayos conectados entre sí.' },
        { id: 'syn-apocalipsis', name: 'Tormenta Apocalipsis', reqs: ['w-orbital', 'w-missile', 'p-explode'], icon: '☄️', desc: 'Invoca una lluvia continua de misiles inteligentes sobre toda el área de combate.' },

        { id: 'syn-cyclonic', name: 'Cañón ciclónico', reqs: ['w-rotarycannon', 'p-bounce'], icon: '🌀', desc: 'La cadencia máxima perfora y rebota; cada ocho impactos libera una onda de presión.' },
        // Legendary Synergies
        { id: 'syn-celestial', name: 'Arsenal Celestial', reqs: ['w-machinegun', 'w-missile', 'w-drones', 'p-extra-projectile'], icon: '🌌', desc: 'Todas las armas disparan simultáneamente durante un periodo de tiempo, aumentando drásticamente la potencia ofensiva.' },
        { id: 'syn-nova', name: 'Nova Solar', reqs: ['w-laser', 'w-plasma', 'p-lightning', 'p-bounce'], icon: '💥', desc: 'Genera un gigantesco rayo prismático que atraviesa todo el escenario, rebota y aplica daño continuo.' },
        { id: 'syn-dragon', name: 'Dragón de Acero', reqs: ['w-flamethrower', 'w-missile', 'w-drones'], icon: '🐉', desc: 'El dron evoluciona en un dragón mecánico que sobrevuela el campo de batalla lanzando napalm continuamente.' },
        { id: 'syn-motor-vacio', name: 'Motor del Vacío', reqs: ['w-gravityfield', 'w-railgun'], icon: '🌀', desc: 'Dispara singularidades capaces de absorber grupos completos de enemigos antes de colapsar en una explosión devastadora.' },
        { id: 'syn-berserker', name: 'Titán Berserker', reqs: ['w-kinetichammer', 'w-energysword', 'w-dash', 'p-kill-cooldown'], icon: '🤖', desc: 'El mecha entra en un estado de combate cuerpo a cuerpo extremo, aumentando la velocidad, la resistencia y el daño de todos los ataques físicos mientras la habilidad permanezca activa.' }
      ];


      const UPGRADE_BY_ID = new Map(UPGRADE_POOL.map(item => [item.id, item]));
      const SYNERGY_BY_ID = new Map(SYNERGIES.map(item => [item.id, item]));
      const CONTENT_BY_ID = new Map([...UPGRADE_BY_ID, ...SYNERGY_BY_ID]);
      const WEAPON_UPGRADES = UPGRADE_POOL.filter(item => item.type === 'weapon');
      const PASSIVE_UPGRADES = UPGRADE_POOL.filter(item => item.type === 'passive');

      const DEV_SECTIONS = Object.freeze([
        { id: 'weapons', label: 'ARMAS' },
        { id: 'passives', label: 'PASIVAS' },
        { id: 'synergies', label: 'SINERGIAS' },
        { id: 'test', label: 'PRUEBAS' },
        { id: 'exit', label: 'SALIR' }
      ]);
      const TEST_WORLD_SIZE = 1000;

      const PROJECTILE_WEAPONS = new Set([
        'w-machinegun', 'w-energycannon', 'w-laser', 'w-shotgun', 'w-missile',
        'w-grenadelauncher', 'w-railgun', 'w-sniper', 'w-flamethrower', 'w-plasma',
        'w-rotarycannon', 'w-pistonshotgun'
      ]);

      //#endregion content_database

      //#region state · Game state factory and global variables
      // SINGLE RESETTABLE STATE OBJECT FACTORY
      function createState() {
        return {
          phase: 'playing',
          muted: false,
          started: false,
          paused: false,
          pauseSelection: 'resume',
          pauseConfirmState: false,
          score: 0,
          sector: 1,
          level: 1,
          xp: 0,
          xpNeeded: 30,
          waveProgress: 0,
          sectorEnemiesDefeated: 0,
          totalEnemiesDefeated: 0,
          credits: 50,
          scrap: 0,
          evolutionCores: 0,
          equipmentLayoutV3: { weapons: 3, powers: 2, centralModules: 1 },
          draftConfirming: false,
          draftInputLocked: false,
          draftReadyAt: 0,
          draftConfirmArmed: false,
          draftArmReadyAt: 0,
          draftOpenToken: 0,
          runEvolutionCores: 0,
          awardedEvolutionMilestones: [],

          // v3.2.0 · threat director and Chatarrero encounters
          threatDirectorV31: { budget: 0, lastTick: 0, lastSpawnAt: 0 },
          encounterMilestonesV31: { miniboss: false, boss: false },
          bossEncounterV31: { active: false, id: null, type: null, name: '', phase: 0 },
          eliteKillsV31: 0,
          minibossKillsV31: 0,
          bossKillsV31: 0,
          pendingRewardTierV31: null,

          // v3.2.0 · economy, missions and field shop
          fieldShopOpenV32: false,
          fieldShopSelectionV32: 0,
          fieldShopOffersV32: [],
          fieldShopVisitsV32: 0,
          nextFieldShopAtV32: 60000,
          runCoresAwardedV32: false,


          // v3.3.1 · sectors, points of interest, hazards, events and adaptive director
          sectorCurrentV33: 0,
          sectorEnteredAtV33: 0,
          sectorBannerUntilV33: 0,
          sectorPropsV33: [],
          sectorPoisV33: [],
          sectorDropsV33: [],
          sectorHazardsV33: [],
          nextSectorHazardAtV33: 0,
          sectorEventV33: null,
          nextSectorEventAtV33: 35000,
          lastSectorEventIdV33: null,
          directorSuppressedUntilV33: 0,
          overclockUntilV33: 0,
          threatDirectorV33: { budget: 0, lastTick: 0, lastSpawnAt: 0, intensity: 1, pressure: 0, squadCount: 0 },
          sectorStatsV33: { poisCollected: 0, eventsCompleted: 0, eventsFailed: 0, hazardsTriggered: 0 },

          // Developer/test flags
          devInfHp: false,
          devInfShield: false,
          devInfAmmo: false,
          devNoCooldown: false,
          devInvulnerable: false,
          devPauseEnemies: false,
          devSlowMo: false,
          devSpeedUp: false,
          devContinuousSpawn: true,
          isDevPlay: false,
          testMode: false,
          testDummyEnabled: true,
          testDummyMortal: false,
          testSpawnEnemies: false,
          testDummyRespawnAt: 0,
          dummyStats: { totalDamage: 0, hits: 0, firstHitTime: 0, lastDamage: 0 },

          // Compact developer menu navigation
          devSectionIndex: 0,
          devActiveSection: 'weapons',
          devFocus: 'tabs',
          devItemIndex: 0,
          devStatus: 'LISTO',

          // Active weapons (max 6) and passives lists
          activeWeapons: ['w-plasma'],
          weaponLevels: { 'w-plasma': 1 },
          passives: [],
          passiveLevels: {},
          activatedSynergies: [],
          spectralCopies: [],
          lightnings: [],
          shotCount: 0,
          weaponRuntime: {},

          // Computed mecha attributes
          mecha: {
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            angle: 0,
            hp: 160,
            maxHp: 160,
            shield: 0,
            maxShield: 0,
            ammo: 10,
            maxAmmo: 10,
            maxAmmoBonus: 0,
            isReloading: false,
            reloadProgress: 1.0,
            reloadStartTime: 0,
            reloadDuration: 1500,
            primaryFirstShotReady: true,
            weight: 0,
            energyMax: 100,
            energyCost: 0,
            baseDps: 0,
            stability: 100,
            mismatchedPenalty: false,
            penaltyDetails: ''
          },

          // Upgrade multipliers from roguelite choices
          stats: {
            dpsMult: 1.0,
            speedMult: 1.0,
            fireRateMult: 1.0,
            reloadSpeedMult: 1.0
          },

          // World entities
          bullets: [],
          enemyBullets: [],
          enemyMinesV31: [],
          enemies: [],
          particles: [],
          damageNumbers: [],
          activeTargets: [],
          fireZones: [],
          evolvedWeapons: [],

          // Custom entity arrays for new weapons/powers
          slashes: [],
          shockwaves: [],
          turrets: [],
          mines: [],
          orbitalStrikes: [],
          summons: [],
          gravityFields: [],
          boomerangs: [],
          orbs: [],

          // Controls
          moveJoystick: { active: false, x: 0, y: 0 },
          isFiring: false,
          lastShotTime: 0,
          lastSpawnTime: 0,
          playTime: 0,
          lastFrameTime: 0,
          settingsEditMode: false,
          settingsEditTarget: null,
          settingsJoystickInUse: false,
          gameoverSelectionIndex: 0,
          gameoverSelection: 'retry',
          gameoverJoystickInUse: false,
          gameoverMovePointerId: null,
          gameoverCenterClientX: 0,
          gameoverCenterClientY: 0,
        };
      }

      const WORLD_SIZE = 4600;
      const GRID_SIZE = 100;
      const MAX_PARTICLES = 1200;
      const MAX_DAMAGE_NUMBERS = 300;
      const MAX_LIGHTNINGS = 240;

      let state = createState();
      let rafId = null;
      let rewardDraftTokenV31 = 0;
      let canvas, ctx;

      const dom = {};
      const hudCache = {
        timerSecond: -1,
        loadoutSignature: '',
        enemyCount: -1,
        xpPct: -1,
        level: -1,
        xpText: ''
      };

      function cacheDomRefs() {
        dom.gameCanvas = document.getElementById('game-canvas');
        dom.orientationWarning = document.getElementById('orientation-warning');
        dom.hudTimer = document.getElementById('hud-timer');
        dom.hudActiveSlots = document.getElementById('hud-active-slots');
        dom.hudPassivesList = document.getElementById('hud-passives-list');
        dom.hudEnemyCount = document.getElementById('hud-enemy-count');
        dom.xpProgressBar = document.getElementById('xp-progress-bar');
        dom.hudLevel = document.getElementById('hud-level');
        dom.hudXpText = document.getElementById('hud-xp-text');
        dom.dummyDps = document.getElementById('dummy-dps');
        dom.dummyLastDamage = document.getElementById('dummy-last-dmg');
        dom.dummyHits = document.getElementById('dummy-hits');
        dom.dummyTotalDamage = document.getElementById('dummy-total-dmg');
        dom.bossHudV31 = document.getElementById('boss-hud-v31');
        dom.bossNameV31 = document.getElementById('boss-name-v31');
        dom.bossPhaseV31 = document.getElementById('boss-phase-v31');
        dom.bossHpFillV31 = document.getElementById('boss-hp-fill-v31');
        dom.encounterNoticeV31 = document.getElementById('encounter-notice-v31');
      }

      function trimOldest(array, maxItems) {
        const excess = array.length - maxItems;
        if (excess > 0) array.splice(0, excess);
      }

      function enforceTransientEntityLimits() {
        trimOldest(state.particles, MAX_PARTICLES);
        trimOldest(state.damageNumbers, MAX_DAMAGE_NUMBERS);
        trimOldest(state.lightnings, MAX_LIGHTNINGS);
      }
      //#endregion state

      //#region mecha_calculation · Mecha statistics and compatibility calculations
      const WEAPON_BASE_DAMAGE = Object.freeze({
          'w-machinegun': 15,
          'w-energycannon': 45,
          'w-laser': 25,
          'w-shotgun': 25,
          'w-missile': 70,
          'w-grenadelauncher': 50,
          'w-railgun': 90,
          'w-sniper': 120,
          'w-flamethrower': 6,
          'w-plasma': 55,
          'w-rotarycannon': 11,
          'w-pistonshotgun': 12,
          'w-energysword': 60,
          'w-kinetichammer': 80,
          'w-lance': 75,
          'w-claws': 35,
          'w-boomerang': 30,
          'w-drones': 20,
          'w-repairdrones': 8,
          'w-turrets': 20,
          'w-mines': 90,
          'w-shield': 3000,
          'w-gravityfield': 40,
          'w-emp': 100,
          'w-teleport': 60,
          'w-dash': 40,
          'w-reactor': 5000,
          'w-orbital': 120,
          'w-highbeam': 15,
          'w-summons': 25,
          // Synergy weapons
          'syn-napalm': 80,
          'syn-vulcan': 25,
          'syn-prisma': 40,
          'syn-tesla': 35,
          'syn-fantasma': 50,
          'syn-singularidad': 90,
          'syn-eclipse': 200,
          'syn-portamisiles': 60,
          'syn-centinela': 30,
          'syn-biotoxico': 100,
          'syn-criogenico': 110,
          'syn-arco-plasma': 70,
          'syn-represalia': 4000,
          'syn-nanoenjambre': 15,
          'syn-satelite': 150,
          'syn-devorador': 120,
          'syn-relampago': 80,
          'syn-incinerador': 12,
          'syn-ricochet': 30,
          'syn-lanza-fotonica': 140,
          'syn-sismico': 100,
          'syn-dimensional': 120,
          'syn-helios': 40,
          'syn-apocalipsis': 100,
          'syn-celestial': 6000,
          'syn-nova': 60,
          'syn-dragon': 50,
          'syn-motor-vacio': 150,
          'syn-berserker': 6000,
          'syn-cyclonic': 16
        });

      const WEAPON_BASE_COOLDOWN = Object.freeze({
          'w-machinegun': 250,
          'w-energycannon': 900,
          'w-laser': 400,
          'w-shotgun': 1300,
          'w-missile': 2200,
          'w-grenadelauncher': 1600,
          'w-railgun': 2000,
          'w-sniper': 2600,
          'w-flamethrower': 5200,
          'w-plasma': 1000,
          'w-rotarycannon': 380,
          'w-pistonshotgun': 1450,
          'w-energysword': 900,
          'w-kinetichammer': 1800,
          'w-lance': 1100,
          'w-claws': 500,
          'w-boomerang': 1600,
          'w-drones': 1800,
          'w-repairdrones': 5000,
          'w-turrets': 7000,
          'w-mines': 4500,
          'w-shield': 9000,
          'w-gravityfield': 7000,
          'w-emp': 12000,
          'w-teleport': 6000,
          'w-dash': 3500,
          'w-reactor': 15000,
          'w-orbital': 9000,
          'w-highbeam': 8000,
          'w-summons': 12000,
          // Synergy weapons
          'syn-napalm': 1800,
          'syn-vulcan': 80,
          'syn-prisma': 300,
          'syn-tesla': 1000,
          'syn-fantasma': 3000,
          'syn-singularidad': 1600,
          'syn-eclipse': 2200,
          'syn-portamisiles': 1500,
          'syn-centinela': 400,
          'syn-biotoxico': 4000,
          'syn-criogenico': 1800,
          'syn-arco-plasma': 900,
          'syn-represalia': 8000,
          'syn-nanoenjambre': 4000,
          'syn-satelite': 7000,
          'syn-devorador': 2000,
          'syn-relampago': 800,
          'syn-incinerador': 100,
          'syn-ricochet': 1200,
          'syn-lanza-fotonica': 1500,
          'syn-sismico': 1600,
          'syn-dimensional': 5000,
          'syn-helios': 1200,
          'syn-apocalipsis': 6000,
          'syn-celestial': 12000,
          'syn-nova': 500,
          'syn-dragon': 1000,
          'syn-motor-vacio': 2500,
          'syn-berserker': 12000,
          'syn-cyclonic': 105
        });

      function getWeaponStats(weaponId, lvl) {
        const level = Math.max(1, lvl || 1);
        const utilityIds = new Set(['w-shield','w-repairdrones']);
        const baseDamage = (WEAPON_BASE_DAMAGE[weaponId] || 20) * (1 + (level - 1) * 0.22);
        const damage = Math.round(baseDamage * (utilityIds.has(weaponId) ? 1 : 0.68));
        const cooldown = Math.round((WEAPON_BASE_COOLDOWN[weaponId] || 1000) * Math.pow(0.93, level - 1));
        return { damage, cooldown };
      }

      //#region v3_foundation · Content architecture, rarity and permanent progression
      const MEKORA_VERSION = '3.4.0';
      const CONTENT_SCHEMA_VERSION = 1;
      const MEKORA_V3_PROGRESSION_KEY = 'mekora_v3_progression';

      const __mekoraAmmoHud = { root: null, count: null, icon: null };
      function __mekoraBindAmmoHud() {
        __mekoraAmmoHud.root = document.getElementById('ammo-hud');
        if (__mekoraAmmoHud.root) {
          __mekoraAmmoHud.count = __mekoraAmmoHud.root.querySelector('.ammo-count');
          __mekoraAmmoHud.icon = __mekoraAmmoHud.root.querySelector('.ammo-icon');
        }
      }
      function __mekoraSetAmmoHud(value, reloading) {
        if (!__mekoraAmmoHud.root) __mekoraBindAmmoHud();
        if (!__mekoraAmmoHud.root) return;
        __mekoraAmmoHud.root.classList.toggle('reloading', !!reloading);
        if (__mekoraAmmoHud.count) __mekoraAmmoHud.count.textContent = reloading ? 'RECARGANDO' : String(value);
      }

      const EQUIPMENT_KIND_V3 = Object.freeze({
        WEAPON: 'weapon', POWER: 'power', MODULE: 'module', EVOLUTION: 'evolution'
      });
      const RARITY_DEFS_V3 = Object.freeze({
        common:    { label: 'COMÚN',       color: '#aeb8c5', normalWeight: 55, eliteWeight: 10, bossWeight: 0, rank: 0 },
        uncommon:  { label: 'POCO COMÚN',  color: '#55c889', normalWeight: 28, eliteWeight: 35, bossWeight: 10, rank: 1 },
        rare:      { label: 'RARA',        color: '#5ea8ff', normalWeight: 12, eliteWeight: 35, bossWeight: 35, rank: 2 },
        epic:      { label: 'ÉPICA',       color: '#c27cff', normalWeight: 4.5, eliteWeight: 17, bossWeight: 40, rank: 3 },
        legendary: { label: 'LEGENDARIA',  color: '#f4bd52', normalWeight: 0.5, eliteWeight: 3, bossWeight: 15, rank: 4 }
      });
      const POWER_IDS_V3 = new Set(["w-dash", "w-emp", "w-gravityfield", "w-orbital", "w-reactor", "w-shield", "w-teleport"]);
      const FAMILY_BY_ID_V3 = Object.freeze({"w-machinegun": "kinetic", "w-shotgun": "kinetic", "w-railgun": "kinetic", "w-sniper": "kinetic", "w-kinetichammer": "kinetic", "w-claws": "kinetic", "w-energycannon": "energy", "w-laser": "energy", "w-plasma": "energy", "w-energysword": "energy", "w-lance": "energy", "w-highbeam": "energy", "w-missile": "explosive", "w-grenadelauncher": "explosive", "w-flamethrower": "explosive", "w-mines": "explosive", "w-drones": "autonomous", "w-repairdrones": "autonomous", "w-turrets": "autonomous", "w-summons": "autonomous", "w-boomerang": "experimental", "w-shield": "experimental", "w-gravityfield": "experimental", "w-emp": "experimental", "w-teleport": "experimental", "w-dash": "experimental", "w-reactor": "experimental", "w-orbital": "experimental", "w-rotarycannon": "kinetic", "w-pistonshotgun": "kinetic"});
      const PROPOSED_RARITY_BY_ID_V3 = Object.freeze({"w-machinegun": "common", "w-energycannon": "common", "w-shotgun": "common", "w-flamethrower": "common", "w-energysword": "common", "w-claws": "common", "w-drones": "common", "w-repairdrones": "common", "w-turrets": "common", "w-mines": "common", "w-shield": "common", "w-dash": "common", "w-laser": "uncommon", "w-missile": "uncommon", "w-grenadelauncher": "uncommon", "w-plasma": "uncommon", "w-lance": "uncommon", "w-boomerang": "uncommon", "w-summons": "uncommon", "w-teleport": "uncommon", "w-reactor": "uncommon", "w-railgun": "rare", "w-sniper": "rare", "w-kinetichammer": "rare", "w-gravityfield": "rare", "w-emp": "rare", "w-orbital": "rare", "w-highbeam": "epic", "p-bounce": "common", "p-pierce": "common", "p-explode": "common", "p-fire-zone": "common", "p-lightning": "common", "p-extra-projectile": "common", "p-elemental": "common", "p-cooldown": "common", "p-extra-missile": "uncommon", "p-crit-effect": "uncommon", "p-drone-copy": "uncommon", "p-kill-cooldown": "uncommon", "p-dash-wave": "uncommon", "p-shield-reflect": "uncommon", "p-melee-wave": "uncommon", "p-evolve": "rare", "w-rotarycannon": "common", "w-pistonshotgun": "common", "p-last-magazine": "uncommon", "p-first-impact": "uncommon"});

      function getDesignTypeV3(item) {
        if (!item) return EQUIPMENT_KIND_V3.MODULE;
        if (item.id?.startsWith('p-')) return EQUIPMENT_KIND_V3.MODULE;
        if (POWER_IDS_V3.has(item.id)) return EQUIPMENT_KIND_V3.POWER;
        return EQUIPMENT_KIND_V3.WEAPON;
      }

      function createContentCatalogV3() {
        const catalog = new Map();
        UPGRADE_POOL.forEach(item => {
          const kind = getDesignTypeV3(item);
          const rarity = PROPOSED_RARITY_BY_ID_V3[item.id] || 'common';
          catalog.set(item.id, Object.freeze({
            ...item,
            kind,
            family: item.id.startsWith('p-') ? 'passive-module' : (FAMILY_BY_ID_V3[item.id] || 'unclassified'),
            rarity,
            currentRarityImplemented: false,
            baseDamage: WEAPON_BASE_DAMAGE[item.id] ?? null,
            baseCooldownMs: WEAPON_BASE_COOLDOWN[item.id] ?? null,
            maxLevel: null,
            unlockState: 'unlocked',
            schemaVersion: CONTENT_SCHEMA_VERSION
          }));
        });
        SYNERGIES.forEach(item => catalog.set(item.id, Object.freeze({
          ...item,
          title: item.name,
          kind: EQUIPMENT_KIND_V3.EVOLUTION,
          family: 'evolution',
          rarity: item.reqs.length >= 4 ? 'legendary' : item.reqs.length >= 3 ? 'epic' : 'rare',
          baseDamage: WEAPON_BASE_DAMAGE[item.id] ?? null,
          baseCooldownMs: WEAPON_BASE_COOLDOWN[item.id] ?? null,
          unlockState: 'discoverable',
          schemaVersion: CONTENT_SCHEMA_VERSION
        })));
        return catalog;
      }
      const CONTENT_CATALOG_V3 = createContentCatalogV3();

      function createDefaultProgressionV3() {
        const blueprints = {};
        UPGRADE_POOL.forEach(item => { blueprints[item.id] = 'unlocked'; });
        SYNERGIES.forEach(item => { blueprints[item.id] = 'hidden'; });
        return {
          schemaVersion: CONTENT_SCHEMA_VERSION,
          cores: 0,
          evolutionCores: 0,
          blueprints,
          discoveredEvolutions: [],
          discoveredContent: ['w-plasma'],
          discoveredRarities: ['uncommon'],
          unlockedMechs: ['vanguard'],
          pinnedMissions: [],
          missions: {},
          pity: { rareMisses: 0, epicMisses: 0, rejected: {} },
          hangar: { level: 1, unlockedFunctions: ['catalog','missions'] }
        };
      }

      function loadProgressionV3() {
        const defaults = createDefaultProgressionV3();
        const stored = readJson(MEKORA_V3_PROGRESSION_KEY, null);
        if (!stored || typeof stored !== 'object') return defaults;
        return {
          ...defaults,
          ...stored,
          blueprints: {...defaults.blueprints, ...(stored.blueprints || {})},
          discoveredContent: Array.from(new Set([...(defaults.discoveredContent || []), ...((stored.discoveredContent || []))])),
          discoveredRarities: Array.from(new Set([...(defaults.discoveredRarities || []), ...((stored.discoveredRarities || []))])),
          pity: {...defaults.pity, ...(stored.pity || {}), rejected: {...(defaults.pity.rejected || {}), ...((stored.pity && stored.pity.rejected) || {})}},
          hangar: {...defaults.hangar, ...(stored.hangar || {})}
        };
      }
      let progressionV3 = loadProgressionV3();
      function saveProgressionV3() { writeJson(MEKORA_V3_PROGRESSION_KEY, progressionV3); }

      //#region economy_v320 · Permanent economy, blueprints, missions, hangar and field shop
      const MISSION_DEFS_V32 = Object.freeze([
        {id:'mission-kills-25', title:'PRIMER DESGUACE', short:'Elimina 25 enemigos', stat:'kills', target:25, rewardCores:60, blueprint:'w-energycannon', hint:'Los restos útiles financian el siguiente prototipo.'},
        {id:'mission-scrap-150', title:'RECICLADOR INDUSTRIAL', short:'Recoge 150 de chatarra', stat:'scrapCollected', target:150, rewardCores:80, blueprint:'w-rotarycannon', hint:'Busca grupos y enemigos reforzados.'},
        {id:'mission-elite-1', title:'ROMPEBLINDAJES', short:'Derrota 1 enemigo élite', stat:'eliteKills', target:1, rewardCores:100, blueprint:'p-last-magazine', hint:'Los élites muestran piezas adicionales.'},
        {id:'mission-miniboss-1', title:'TALADRO NEUTRALIZADO', short:'Derrota al Taladro Bastión', stat:'minibossKills', target:1, rewardCores:160, blueprint:'w-pistonshotgun', hint:'Provoca una carga fallida y ataca su parte trasera.'},
        {id:'mission-survive-180', title:'SISTEMA ESTABLE', short:'Sobrevive 3 minutos', stat:'bestSurvivalMs', target:180000, rewardCores:140, blueprint:'p-cooldown', hint:'La misión registra tu mejor tiempo de supervivencia.'},
        {id:'mission-forge-titan', title:'CAÍDA DE LA FORJA', short:'Derrota al Titán de la Forja', stat:'bossKills', target:1, rewardCores:300, blueprint:'w-railgun', mechBlueprint:'lancer', hint:'Completa las tres fases del jefe Chatarrero.'},
        {id:'mission-pois-8', title:'CARTÓGRAFO DE CAMPO', short:'Activa 8 puntos de interés', stat:'poisDiscovered', target:8, rewardCores:130, blueprint:'p-drone-copy', hint:'Explora cada sector y acércate a los marcadores mecánicos.'},
        {id:'mission-events-3', title:'PROTOCOLO IMPREVISTO', short:'Completa 3 eventos dinámicos', stat:'eventsCompleted', target:3, rewardCores:180, blueprint:'w-orbital', hint:'Los eventos aparecen durante la expedición y alteran la presión.'},
        {id:'mission-sector-5', title:'RUTA A LA FORJA', short:'Alcanza el Sector 5', stat:'maxSector', target:5, rewardCores:220, blueprint:'w-gravityfield', mechBlueprint:'bastion', hint:'Sobrevive a los cuatro sectores previos y entra al Núcleo de Forja.'}
      ]);
      const HANGAR_TABS_V32 = Object.freeze([
        {id:'weapons',label:'ARMAS'}, {id:'powers',label:'PODERES'}, {id:'modules',label:'MÓDULOS'},
        {id:'mechs',label:'MECHAS'}, {id:'missions',label:'MISIONES'}, {id:'exit',label:'SALIR'}
      ]);
      const MECH_DEFS_V32 = Object.freeze([
        {id:'vanguard',name:'VANGUARD',role:'Equilibrado',price:0},
        {id:'lancer',name:'LANCER',role:'Movilidad y críticos',price:1000},
        {id:'bastion',name:'BASTION',role:'Defensa y contraataque',price:1200},
        {id:'weaver',name:'WEAVER',role:'Drones y control',price:1250},
        {id:'furnace',name:'FURNACE',role:'Explosiones y calor',price:1100},
        {id:'wraith',name:'WRAITH',role:'Fase y precisión',price:1500}
      ]);
      const BLUEPRINT_STARTER_V32 = new Set(['w-plasma','w-machinegun','w-shotgun','p-bounce','p-pierce','p-cooldown']);
      const BLUEPRINT_DISCOVERED_V32 = new Set(['w-energycannon','w-laser','w-missile','w-flamethrower','w-rotarycannon','w-pistonshotgun','w-dash','p-lightning','p-extra-projectile','p-last-magazine','p-first-impact']);

      function initializeEconomyV32() {
        progressionV3.statistics = {...{kills:0,scrapCollected:0,eliteKills:0,minibossKills:0,bossKills:0,bestSurvivalMs:0,poisDiscovered:0,eventsCompleted:0,maxSector:1}, ...(progressionV3.statistics||{})};
        progressionV3.claimedMissions = Array.from(new Set(progressionV3.claimedMissions||[]));
        progressionV3.pinnedMissions = Array.from(new Set(progressionV3.pinnedMissions||[])).slice(0,3);
        progressionV3.mechBlueprints = {...{vanguard:'unlocked',lancer:'locked',bastion:'locked',weaver:'locked',furnace:'locked',wraith:'locked'}, ...(progressionV3.mechBlueprints||{})};
        progressionV3.unlockedMechs = Array.from(new Set(['vanguard',...(progressionV3.unlockedMechs||[])]));
        if (!progressionV3.economyV32Initialized) {
          const previouslyDiscovered = new Set(progressionV3.discoveredContent||[]);
          UPGRADE_POOL.forEach(item => {
            if (BLUEPRINT_STARTER_V32.has(item.id) || previouslyDiscovered.has(item.id)) progressionV3.blueprints[item.id]='unlocked';
            else if (BLUEPRINT_DISCOVERED_V32.has(item.id)) progressionV3.blueprints[item.id]='discovered';
            else progressionV3.blueprints[item.id]='locked';
          });
          SYNERGIES.forEach(item => { if (progressionV3.blueprints[item.id] !== 'unlocked') progressionV3.blueprints[item.id]='hidden'; });
          progressionV3.cores = Math.max(0, Number(progressionV3.cores)||0);
          progressionV3.pinnedMissions = ['mission-kills-25','mission-scrap-150','mission-elite-1'];
          progressionV3.economyV32Initialized = true;
          progressionV3.economyVersion = '3.2.0';
        }
        saveProgressionV3();
      }
      initializeEconomyV32();

      function getBlueprintPriceV32(item) {
        const rarity=getContentMetaV3(item.id)?.rarity||'common';
        const base={common:140,uncommon:280,rare:520,epic:850,legendary:1300}[rarity]||220;
        const kind=getContentMetaV3(item.id)?.kind||item.type;
        return Math.max(80, base + (kind==='power'?100:kind==='module'?-40:0));
      }
      function getMissionDefV32(id){return MISSION_DEFS_V32.find(m=>m.id===id)||null;}
      function getMissionProgressV32(mission) {
        const value=Number(progressionV3.statistics?.[mission.stat])||0;
        return {value:Math.min(mission.target,value), raw:value, target:mission.target, complete:value>=mission.target, claimed:(progressionV3.claimedMissions||[]).includes(mission.id)};
      }
      function setHangarStatusV32(message){const el=document.getElementById('hangar-status-v32');if(el)el.textContent=message;}
      function claimMissionV32(id) {
        const mission=getMissionDefV32(id); if(!mission)return false;
        const progress=getMissionProgressV32(mission); if(!progress.complete||progress.claimed)return false;
        progressionV3.claimedMissions.push(id);
        progressionV3.cores=(progressionV3.cores||0)+mission.rewardCores;
        if(mission.blueprint && progressionV3.blueprints[mission.blueprint]!=='unlocked') progressionV3.blueprints[mission.blueprint]='discovered';
        if(mission.mechBlueprint) progressionV3.mechBlueprints[mission.mechBlueprint]='discovered';
        saveProgressionV3(); updateHangarUIV32(); updateMissionTrackingHudV32(); return true;
      }
      function togglePinnedMissionV32(id) {
        const pinned=progressionV3.pinnedMissions||[]; const index=pinned.indexOf(id);
        if(index>=0)pinned.splice(index,1); else {if(pinned.length>=3)pinned.shift(); pinned.push(id);} 
        progressionV3.pinnedMissions=pinned; saveProgressionV3(); updateMissionTrackingHudV32(); updateHangarUIV32();
      }
      function recordEnemyDefeatV32(enemy,scrapReward) {
        const stats=progressionV3.statistics;
        stats.kills=(stats.kills||0)+1; stats.scrapCollected=(stats.scrapCollected||0)+Math.max(0,scrapReward||0);
        if(enemy.isEliteV31)stats.eliteKills=(stats.eliteKills||0)+1;
        if(enemy.isMinibossV31)stats.minibossKills=(stats.minibossKills||0)+1;
        if(enemy.isBossV31)stats.bossKills=(stats.bossKills||0)+1;
        updateMissionTrackingHudV32();
      }
      function updateEconomyHudV32() {
        const scrap=document.getElementById('hud-scrap-value-v32'); if(scrap)scrap.textContent=Math.floor(state.scrap||0);
        const shopScrap=document.getElementById('field-shop-scrap-v32'); if(shopScrap)shopScrap.textContent=Math.floor(state.scrap||0);
      }
      function updateMissionTrackingHudV32() {
        const root=document.getElementById('hud-missions-v32'); if(!root)return;
        root.innerHTML=(progressionV3.pinnedMissions||[]).slice(0,3).map(id=>{
          const m=getMissionDefV32(id); if(!m)return''; const p=getMissionProgressV32(m);
          const value=m.stat==='bestSurvivalMs'?Math.floor(p.value/1000):p.value; const target=m.stat==='bestSurvivalMs'?Math.floor(p.target/1000):p.target;
          return `<div class="hud-mission-line-v32 ${p.complete?'complete':''}">${p.complete?'✓':'◇'} ${m.title}: ${value}/${target}${m.stat==='bestSurvivalMs'?'s':''}</div>`;
        }).join('');
      }
      function getHangarItemsV32(tabId) {
        if(tabId==='missions')return MISSION_DEFS_V32;
        if(tabId==='mechs')return MECH_DEFS_V32;
        return UPGRADE_POOL.filter(item=>{
          const kind=getContentMetaV3(item.id)?.kind;
          if(tabId==='weapons')return kind==='weapon';
          if(tabId==='powers')return kind==='power';
          if(tabId==='modules')return kind==='module';
          return false;
        });
      }
      function ensureHangarStateV32(){
        if(!Number.isFinite(state.hangarTabIndexV32))state.hangarTabIndexV32=0;
        if(!Number.isFinite(state.hangarItemIndexV32))state.hangarItemIndexV32=0;
      }
      function openHangarV32(){ensureHangarStateV32();state.hangarOpenV32=true;state.hangarTabIndexV32=0;state.hangarItemIndexV32=0;document.getElementById('hangar-modal-v32')?.classList.remove('hidden');updateHangarUIV32();lockConfirmInput(360);}
      function closeHangarV32(){state.hangarOpenV32=false;document.getElementById('hangar-modal-v32')?.classList.add('hidden');state.menuSelectionIndex=0;updateMainMenuUI();lockConfirmInput(300);}
      function getHangarRowDescriptionV32(item,tabId){
        const lang=SETTINGS_STATE.language;const w=(es,en,pt)=>lang==='en'?en:lang==='pt'?pt:es;
        if(tabId==='missions'){const p=getMissionProgressV32(item);const value=item.stat==='bestSurvivalMs'?Math.floor(p.value/1000):Math.floor(p.value);const target=item.stat==='bestSurvivalMs'?Math.floor(item.target/1000):item.target;return `${item.short} · ${item.rewardCores} ${w('Núcleos','Cores','Núcleos')} · ${p.claimed?w('RECLAMADA','CLAIMED','RESGATADA'):p.complete?w('LISTA PARA RECLAMAR','READY TO CLAIM','PRONTA PARA RESGATAR'):`${value}/${target}${item.stat==='bestSurvivalMs'?'s':''}`}`;}
        if(tabId==='mechs'){const st=progressionV3.mechBlueprints[item.id]||'locked';return `${item.role} · ${st==='unlocked'?w('DISPONIBLE','AVAILABLE','DISPONÍVEL'):st==='discovered'?`${item.price} ${w('Núcleos · implementación jugable futura','Cores · playable implementation pending','Núcleos · implementação jogável futura')}`:w('PLANO BLOQUEADO','BLUEPRINT LOCKED','PROJETO BLOQUEADO')}`;}
        const st=progressionV3.blueprints[item.id]||'locked';
        if(st==='unlocked')return `${item.desc} · ${w('DESBLOQUEADO','UNLOCKED','DESBLOQUEADO')}`;
        if(st==='discovered')return `${item.desc} · ${getBlueprintPriceV32(item)} ${w('Núcleos','Cores','Núcleos')}`;
        return w('SILUETA BLOQUEADA · completa misiones o derrota jefes','LOCKED SILHOUETTE · complete missions or defeat bosses','SILHUETA BLOQUEADA · complete missões ou derrote chefes');
      }
      function updateHangarUIV32(){
        if(!state.hangarOpenV32)return; ensureHangarStateV32();
        const lang=SETTINGS_STATE.language;const w=(es,en,pt)=>lang==='en'?en:lang==='pt'?pt:es;
        const cores=document.getElementById('hangar-cores-v32');if(cores)cores.textContent=Math.floor(progressionV3.cores||0);
        const tabs=document.getElementById('hangar-tabs-v32');
        if(tabs)tabs.innerHTML=HANGAR_TABS_V32.map((t,i)=>`<div class="hangar-tab-v32 ${i===state.hangarTabIndexV32?'selected':''}">${t.label}</div>`).join('');
        const tab=HANGAR_TABS_V32[state.hangarTabIndexV32]||HANGAR_TABS_V32[0]; const list=document.getElementById('hangar-list-v32');
        if(tab.id==='exit'){state.hangarItemIndexV32=0;if(list)list.innerHTML=`<div class="hangar-row-v32 selected"><div class="hangar-icon-v32">↩</div><div class="hangar-copy-v32"><strong>${w('VOLVER AL MENÚ','RETURN TO MENU','VOLTAR AO MENU')}</strong><span>${w('Conserva todos los cambios realizados.','Keeps every saved change.','Mantém todas as alterações salvas.')}</span></div><div class="hangar-tag-v32">${w('SALIR','EXIT','SAIR')}</div></div>`;return;}
        const items=getHangarItemsV32(tab.id); state.hangarItemIndexV32=Math.max(0,Math.min(items.length-1,state.hangarItemIndexV32));
        const start=Math.max(0,Math.min(Math.max(0,items.length-5),state.hangarItemIndexV32-2)); const visible=items.slice(start,start+5);
        if(list)list.innerHTML=visible.map((item,offset)=>{
          const actual=start+offset; let status=''; let locked=false; let icon=item.icon||'◇';
          if(tab.id==='missions'){const p=getMissionProgressV32(item);status=p.claimed?w('HECHO','DONE','FEITO'):p.complete?w('RECLAMAR','CLAIM','RESGATAR'):(progressionV3.pinnedMissions||[]).includes(item.id)?w('FIJADA','PINNED','FIXADA'):w('FIJAR','PIN','FIXAR');icon=p.complete?'✓':'◇';}
          else if(tab.id==='mechs'){const st=progressionV3.mechBlueprints[item.id]||'locked';status=st==='unlocked'?w('LISTO','READY','PRONTO'):st==='discovered'?item.price:w('BLOQ.','LOCKED','BLOQ.');locked=st==='locked';icon=item.id==='vanguard'?'◆':'⬡';}
          else {const st=progressionV3.blueprints[item.id]||'locked';status=st==='unlocked'?w('LISTO','READY','PRONTO'):st==='discovered'?getBlueprintPriceV32(item):w('BLOQ.','LOCKED','BLOQ.');locked=st==='locked';}
          return `<div class="hangar-row-v32 ${actual===state.hangarItemIndexV32?'selected':''} ${locked?'locked':''}"><div class="hangar-icon-v32">${locked?'?':icon}</div><div class="hangar-copy-v32"><strong>${locked?w('PROYECTO DESCONOCIDO','UNKNOWN PROJECT','PROJETO DESCONHECIDO'):(item.title||item.name)}</strong><span>${getHangarRowDescriptionV32(item,tab.id)}</span></div><div class="hangar-tag-v32">${status}</div></div>`;
        }).join('');
      }
      function handleHangarJoystickInputV32(jx,jy){
        ensureHangarStateV32(); const threshold=.52; let h=jx<-threshold?-1:jx>threshold?1:0;
        if(h&&lastJoystickXDir!==h){lastJoystickXDir=h;state.hangarTabIndexV32=(state.hangarTabIndexV32+h+HANGAR_TABS_V32.length)%HANGAR_TABS_V32.length;state.hangarItemIndexV32=0;updateHangarUIV32();vibrate(22);}else if(!h)lastJoystickXDir=0;
        const tab=HANGAR_TABS_V32[state.hangarTabIndexV32]; const items=tab.id==='exit'?[{}]:getHangarItemsV32(tab.id); let v=jy<-.52?-1:jy>.52?1:0;
        if(v&&lastJoystickYDir!==v){lastJoystickYDir=v;state.hangarItemIndexV32=(state.hangarItemIndexV32+v+Math.max(1,items.length))%Math.max(1,items.length);updateHangarUIV32();vibrate(22);}else if(!v)lastJoystickYDir=0;
      }
      function confirmHangarActionV32(){
        if(!state.hangarOpenV32)return; const tab=HANGAR_TABS_V32[state.hangarTabIndexV32]; if(tab.id==='exit'){closeHangarV32();return;}
        const item=getHangarItemsV32(tab.id)[state.hangarItemIndexV32]; if(!item)return;
        if(tab.id==='missions'){const p=getMissionProgressV32(item);if(p.complete&&!p.claimed){claimMissionV32(item.id);setHangarStatusV32(`RECOMPENSA RECIBIDA: +${item.rewardCores} NÚCLEOS`);}else{togglePinnedMissionV32(item.id);setHangarStatusV32((progressionV3.pinnedMissions||[]).includes(item.id)?'MISIÓN FIJADA':'MISIÓN RETIRADA');}return;}
        if(tab.id==='mechs'){const st=progressionV3.mechBlueprints[item.id]||'locked';if(st==='locked'){setHangarStatusV32('PLANO DE MECHA BLOQUEADO');return;}if(st==='unlocked'){setHangarStatusV32(item.id==='vanguard'?'VANGUARD ES EL MECHA ACTIVO':'SELECCIÓN JUGABLE LLEGARÁ EN v3.4.0');return;}if((progressionV3.cores||0)<item.price){setHangarStatusV32('NÚCLEOS INSUFICIENTES');return;}progressionV3.cores-=item.price;progressionV3.mechBlueprints[item.id]='unlocked';progressionV3.unlockedMechs=Array.from(new Set([...(progressionV3.unlockedMechs||[]),item.id]));saveProgressionV3();updateHangarUIV32();setHangarStatusV32(`${item.name} CONSTRUIDO · SISTEMAS DE COMBATE EN v3.4.0`);return;}
        const st=progressionV3.blueprints[item.id]||'locked'; if(st==='locked'||st==='hidden'){setHangarStatusV32('PLANO BLOQUEADO');return;} if(st==='unlocked'){setHangarStatusV32('EQUIPAMIENTO YA DESBLOQUEADO');return;}
        const price=getBlueprintPriceV32(item);if((progressionV3.cores||0)<price){setHangarStatusV32('NÚCLEOS INSUFICIENTES');return;}progressionV3.cores-=price;progressionV3.blueprints[item.id]='unlocked';progressionV3.discoveredContent=Array.from(new Set([...(progressionV3.discoveredContent||[]),item.id]));saveProgressionV3();updateHangarUIV32();setHangarStatusV32(`${item.title} CONSTRUIDO Y AÑADIDO AL DRAFT`);
      }

      const FIELD_SHOP_DEFS_V32=Object.freeze([
        {id:'repair',icon:'✚',title:'REPARACIÓN RÁPIDA',desc:'Restaura 30 de blindaje.',price:40},
        {id:'ammo',icon:'▥',title:'CARGADOR COMPLETO',desc:'Finaliza la recarga y rellena munición.',price:25},
        {id:'upgrade',icon:'▲',title:'CALIBRACIÓN DE ARMA',desc:'Aumenta un nivel el arma principal.',price:90},
        {id:'speed',icon:'»',title:'SERVOMOTORES',desc:'Aumenta 5 % la velocidad durante esta partida.',price:70},
        {id:'evolution',icon:'◆',title:'NÚCLEO DE EVOLUCIÓN',desc:'Entrega un núcleo para evoluciones.',price:140}
      ]);
      function generateFieldShopOffersV32(){
        const pool=[...FIELD_SHOP_DEFS_V32].sort(()=>Math.random()-.5).slice(0,3);const multiplier=1+(state.fieldShopVisitsV32||0)*.12;
        return [...pool.map(o=>({...o,price:Math.round(o.price*multiplier),sold:false})),{id:'exit',icon:'↩',title:'SALIR',desc:'Continuar la expedición.',price:0,sold:false}];
      }
      function openFieldShopV32(force=false){
        if(state.fieldShopOpenV32||state.phase!=='playing'||state.testMode)return false;
        if(!force&&(state.paused||state.bossEncounterV31?.active))return false;
        state.fieldShopOpenV32=true;state.paused=true;state.isFiring=false;state.fieldShopSelectionV32=0;state.fieldShopOffersV32=generateFieldShopOffersV32();state.fieldShopVisitsV32=(state.fieldShopVisitsV32||0)+1;
        document.getElementById('field-shop-modal-v32')?.classList.remove('hidden');updateFieldShopUIV32();lockConfirmInput(360);return true;
      }
      function closeFieldShopV32(){state.fieldShopOpenV32=false;state.paused=false;state.nextFieldShopAtV32=(state.playTime||0)+150000;document.getElementById('field-shop-modal-v32')?.classList.add('hidden');lockConfirmInput(260);}
      function updateFieldShopUIV32(){
        updateEconomyHudV32();const list=document.getElementById('field-shop-list-v32');if(!list)return;
        const soldLabel=SETTINGS_STATE.language==='en'?'SOLD OUT':SETTINGS_STATE.language==='pt'?'ESGOTADO':'AGOTADO';const exitLabel=SETTINGS_STATE.language==='en'?'EXIT':SETTINGS_STATE.language==='pt'?'SAIR':'SALIR';const exitDesc=SETTINGS_STATE.language==='en'?'Continue the expedition.':SETTINGS_STATE.language==='pt'?'Continuar a expedição.':'Continuar la expedición.';list.innerHTML=(state.fieldShopOffersV32||[]).map((o,i)=>`<div class="field-shop-row-v32 ${i===state.fieldShopSelectionV32?'selected':''} ${o.sold?'sold':''}"><div>${o.icon}</div><div><strong>${o.id==='exit'?exitLabel:o.title}</strong><span>${o.sold?soldLabel:o.id==='exit'?exitDesc:o.desc}</span></div><div class="field-shop-price-v32">${o.id==='exit'?exitLabel:`${o.price} ◇`}</div></div>`).join('');
      }
      function handleFieldShopJoystickInputV32(jx,jy){const offers=state.fieldShopOffersV32||[];let v=jy<-.5?-1:jy>.5?1:0;if(v&&lastJoystickYDir!==v){lastJoystickYDir=v;state.fieldShopSelectionV32=(state.fieldShopSelectionV32+v+offers.length)%offers.length;updateFieldShopUIV32();vibrate(20);}else if(!v)lastJoystickYDir=0;lastJoystickXDir=0;}
      function applyFieldShopOfferV32(offer){
        if(offer.id==='repair')state.mecha.hp=Math.min(state.mecha.maxHp,state.mecha.hp+30);
        else if(offer.id==='ammo'){state.mecha.isReloading=false;state.mecha.ammo=getPrimaryMagazineCapacityV301();state.mecha.primaryFirstShotReady=true;updatePrimaryAmmoHudV301();}
        else if(offer.id==='upgrade'){const id=getPrimaryWeaponIdV301();state.weaponLevels[id]=Math.min(10,(state.weaponLevels[id]||1)+1);calculateMechaStats();}
        else if(offer.id==='speed')state.stats.speedMult*=1.05;
        else if(offer.id==='evolution')awardEvolutionCoreV302('field_shop');
      }
      function confirmFieldShopActionV32(){
        const offer=(state.fieldShopOffersV32||[])[state.fieldShopSelectionV32];if(!offer)return;if(offer.id==='exit'){closeFieldShopV32();return;}if(offer.sold){document.getElementById('field-shop-status-v32').textContent=SETTINGS_STATE.language==='en'?'OFFER SOLD OUT':SETTINGS_STATE.language==='pt'?'OFERTA ESGOTADA':'OFERTA AGOTADA';return;}if((state.scrap||0)<offer.price){document.getElementById('field-shop-status-v32').textContent=SETTINGS_STATE.language==='en'?'NOT ENOUGH SCRAP':SETTINGS_STATE.language==='pt'?'SUCATA INSUFICIENTE':'CHATARRA INSUFICIENTE';return;}state.scrap-=offer.price;applyFieldShopOfferV32(offer);offer.sold=true;document.getElementById('field-shop-status-v32').textContent=`${SETTINGS_STATE.language==='en'?'PURCHASE COMPLETE':SETTINGS_STATE.language==='pt'?'COMPRA CONCLUÍDA':'COMPRA COMPLETADA'}: ${offer.title}`;updateFieldShopUIV32();
      }
      function maybeOpenFieldShopV32(){if(state.phase==='playing'&&!state.paused&&!state.testMode&&!state.bossEncounterV31?.active&&(state.playTime||0)>=(state.nextFieldShopAtV32||60000))openFieldShopV32();}
      function awardRunCoresV32(){
        if(state.runCoresAwardedV32||state.testMode)return 0;state.runCoresAwardedV32=true;
        const award=(state.playTime||0)>=60000?5:0;
        progressionV3.cores=(progressionV3.cores||0)+award;progressionV3.statistics.bestSurvivalMs=Math.max(progressionV3.statistics.bestSurvivalMs||0,state.playTime||0);saveProgressionV3();return award;
      }
      //#endregion economy_v320

      function getContentMetaV3(id) { return CONTENT_CATALOG_V3.get(id) || null; }
      function isContentUnlockedV3(id) { return (progressionV3.blueprints[id] || 'locked') === 'unlocked'; }

      function weightedPickV3(items, weightFn) {
        if (!items.length) return null;
        const weights = items.map(item => Math.max(0, Number(weightFn(item)) || 0));
        const total = weights.reduce((sum, value) => sum + value, 0);
        if (total <= 0) return items[Math.floor(Math.random() * items.length)];
        let cursor = Math.random() * total;
        for (let i = 0; i < items.length; i++) {
          cursor -= weights[i];
          if (cursor <= 0) return items[i];
        }
        return items[items.length - 1];
      }

      function getRarityPoolWeightV3(rarity, stateRef) {
        const def = RARITY_DEFS_V3[rarity] || RARITY_DEFS_V3.common;
        let weight = def.normalWeight;
        if ((stateRef?.playTime || 0) < 8 * 60 * 1000 && rarity === 'legendary') return 0;
        if ((progressionV3.pity.epicMisses || 0) >= 20 && rarity === 'epic') weight *= 5;
        return weight;
      }

      function chooseRarityV3(availableRarities, stateRef, forceRarePlus = false) {
        let allowed = [...availableRarities];
        if (forceRarePlus) allowed = allowed.filter(r => (RARITY_DEFS_V3[r]?.rank || 0) >= RARITY_DEFS_V3.rare.rank);
        if (!allowed.length) allowed = [...availableRarities];
        return weightedPickV3(allowed, rarity => getRarityPoolWeightV3(rarity, stateRef));
      }

      function selectDraftCardsV3(eligible, count, stateRef) {
        const unlocked = eligible.filter(item => item.type === 'evolution' || isContentUnlockedV3(item.id));
        const pool = unlocked.length ? unlocked : eligible;
        const selected = [];
        const forceRare = (progressionV3.pity.rareMisses || 0) >= 8;
        for (let slot = 0; slot < count && selected.length < pool.length; slot++) {
          const remaining = pool.filter(item => !selected.some(chosen => chosen.id === item.id));
          const rarities = [...new Set(remaining.map(item => getContentMetaV3(item.id)?.rarity || 'common'))];
          const rarity = chooseRarityV3(rarities, stateRef, forceRare && slot === 0);
          const candidates = remaining.filter(item => (getContentMetaV3(item.id)?.rarity || 'common') === rarity);
          const chosen = weightedPickV3(candidates.length ? candidates : remaining, item => {
            const owned = item.type === 'evolution' ? false : (item.type === 'weapon' ? stateRef.activeWeapons.includes(item.id) : stateRef.passives.includes(item.id));
            const rejection = progressionV3.pity.rejected[item.id] || 0;
            return (owned ? 2.4 : 1) * Math.pow(0.72, Math.min(5, rejection));
          });
          if (chosen) selected.push(chosen);
        }
        return selected;
      }

      function recordDraftChoiceV3(chosen, offered) {
        const rarity = getContentMetaV3(chosen.id)?.rarity || 'common';
        const rank = RARITY_DEFS_V3[rarity]?.rank || 0;
        progressionV3.pity.rareMisses = rank >= RARITY_DEFS_V3.rare.rank ? 0 : (progressionV3.pity.rareMisses || 0) + 1;
        progressionV3.pity.epicMisses = rank >= RARITY_DEFS_V3.epic.rank ? 0 : (progressionV3.pity.epicMisses || 0) + 1;
        (offered || []).forEach(item => {
          if (item.id === chosen.id) progressionV3.pity.rejected[item.id] = 0;
          else progressionV3.pity.rejected[item.id] = Math.min(5, (progressionV3.pity.rejected[item.id] || 0) + 1);
        });
        saveProgressionV3();
      }

      function prepareDraftDiscoveriesV301(cards) {
        const knownContent = new Set(progressionV3.discoveredContent || []);
        const knownRarities = new Set(progressionV3.discoveredRarities || []);
        const claimedNewRarities = new Set();
        const flags = {};
        (cards || []).forEach(card => {
          const rarity = getContentMetaV3(card.id)?.rarity || 'common';
          const isNewContent = !knownContent.has(card.id);
          const isNewRarity = !knownRarities.has(rarity) && !claimedNewRarities.has(rarity);
          flags[card.id] = { isNewContent, isNewRarity };
          knownContent.add(card.id);
          if (isNewRarity) claimedNewRarities.add(rarity);
          knownRarities.add(rarity);
        });
        state.draftDiscoveryFlags = flags;
        progressionV3.discoveredContent = Array.from(knownContent);
        progressionV3.discoveredRarities = Array.from(knownRarities);
        saveProgressionV3();
        return flags;
      }
      //#endregion v3_foundation

      //#region primary_magazine_v301 · Stable primary weapon magazine
      const PRIMARY_MAGAZINE_BASE_V301 = 10;

      function getPrimaryWeaponIdV301() {
        return Array.isArray(state.activeWeapons) && state.activeWeapons.length ? state.activeWeapons[0] : null;
      }

      function getPrimaryMagazineCapacityV301() {
        const bonus = Math.max(0, Math.floor(Number(state.mecha.maxAmmoBonus) || 0));
        return PRIMARY_MAGAZINE_BASE_V301 + bonus;
      }

      function normalizePrimaryMagazineV301() {
        const capacity = getPrimaryMagazineCapacityV301();
        state.mecha.maxAmmo = capacity;
        if (!Number.isFinite(state.mecha.ammo)) state.mecha.ammo = capacity;
        state.mecha.ammo = Math.max(0, Math.min(capacity, Math.floor(state.mecha.ammo)));
        if (state.devInfAmmo) {
          state.mecha.ammo = capacity;
          state.mecha.isReloading = false;
          state.mecha.reloadProgress = 1;
        }
        return capacity;
      }

      function updatePrimaryAmmoHudV301() {
        normalizePrimaryMagazineV301();
        __mekoraSetAmmoHud(state.mecha.ammo, state.mecha.isReloading);
      }

      function beginPrimaryReloadV301(timestamp = performance.now()) {
        if (state.devInfAmmo) {
          normalizePrimaryMagazineV301();
          updatePrimaryAmmoHudV301();
          return false;
        }
        if (state.mecha.isReloading) return false;
        state.mecha.isReloading = true;
        state.mecha.reloadStartTime = timestamp;
        state.mecha.reloadProgress = 0;
        updatePrimaryAmmoHudV301();
        return true;
      }

      function consumePrimaryAmmoV301(timestamp = performance.now()) {
        const capacity = normalizePrimaryMagazineV301();
        if (state.devInfAmmo) {
          state.mecha.ammo = capacity;
          updatePrimaryAmmoHudV301();
          return true;
        }
        if (state.mecha.isReloading) return false;
        if (state.mecha.ammo <= 0) {
          beginPrimaryReloadV301(timestamp);
          return false;
        }
        state.mecha.ammo -= 1;
        if (state.mecha.ammo <= 0) beginPrimaryReloadV301(timestamp);
        else updatePrimaryAmmoHudV301();
        return true;
      }

      function updatePrimaryReloadV301(timestamp = performance.now()) {
        normalizePrimaryMagazineV301();
        if (!state.mecha.isReloading) {
          updatePrimaryAmmoHudV301();
          return false;
        }
        const baseDuration = Math.max(120, Number(state.mecha.reloadDuration) || 1500);
        const reloadDuration = baseDuration / Math.max(.1, Number(state.stats.reloadSpeedMult) || 1);
        const elapsed = Math.max(0, timestamp - (state.mecha.reloadStartTime || timestamp));
        state.mecha.reloadProgress = Math.min(1, elapsed / reloadDuration);
        if (elapsed >= reloadDuration) {
          state.mecha.isReloading = false;
          state.mecha.ammo = getPrimaryMagazineCapacityV301();
          state.mecha.reloadProgress = 1;
          state.mecha.primaryFirstShotReady = true;
        }
        updatePrimaryAmmoHudV301();
        return state.mecha.isReloading;
      }
      //#endregion primary_magazine_v301


      //#region arsenal_v302 · Renewed weapons, modules, evolution cores and balance
      const WEAPON_MAX_LEVEL_V302 = Object.freeze({ 'w-rotarycannon': 5, 'w-pistonshotgun': 5 });
      const FLAMETHROWER_BURST_DURATION_V302 = 1800;
      const FLAMETHROWER_PULSE_MS_V302 = 120;

      const WEAPON_BALANCE_V302 = Object.freeze({
        'w-machinegun': { status:'balanced', role:'rapid kinetic', note:'Stable baseline.' },
        'w-energycannon': { status:'balanced', role:'slow energy burst', note:'Moderate area impact.' },
        'w-laser': { status:'watch', role:'fast precision energy', note:'Monitor evolved piercing.' },
        'w-shotgun': { status:'balanced', role:'close spread', note:'Five pellets and long cooldown.' },
        'w-missile': { status:'balanced', role:'homing explosive', note:'High damage, slow cycle.' },
        'w-grenadelauncher': { status:'balanced', role:'area explosive', note:'Delayed detonation and bounce.' },
        'w-railgun': { status:'balanced', role:'penetrating line', note:'High commitment.' },
        'w-sniper': { status:'balanced', role:'precision burst', note:'Long cooldown.' },
        'w-flamethrower': { status:'reworked', role:'timed flame burst', note:'1.8 s burst, 5.2 s cycle; no infinite stream.' },
        'w-plasma': { status:'balanced', role:'manual primary blast', note:'Manual trigger and splash.' },
        'w-gravityfield': { status:'rebalanced', role:'control power', note:'Damage value corrected from duration-like outlier.' },
        'w-rotarycannon': { status:'new', role:'ramping kinetic', note:'Cadence ramps; dispersion also rises.' },
        'w-pistonshotgun': { status:'new', role:'close kinetic burst', note:'Heavy spread with self recoil.' }
      });

      function getWeaponRuntimeV302(id) {
        state.weaponRuntime = state.weaponRuntime || {};
        return state.weaponRuntime[id] || (state.weaponRuntime[id] = {});
      }

      function updateRotarySpinV302(dt, hasTarget) {
        const runtime = getWeaponRuntimeV302('w-rotarycannon');
        const delta = Math.max(0, Number(dt) || 0);
        runtime.spin = Math.max(0, Math.min(1, (runtime.spin || 0) + (hasTarget ? delta / 2200 : -delta / 900)));
        return runtime.spin;
      }

      function getPrimaryShotModifiersV302(weaponId) {
        const isPrimary = weaponId === getPrimaryWeaponIdV301();
        const result = { damageMult: 1, bonusPierceHits: 0, lastMagazine: false, firstImpact: false };
        if (!isPrimary) return result;
        if (state.passives.includes('p-last-magazine') && state.mecha.ammo <= 3) {
          const level = state.passiveLevels['p-last-magazine'] || 1;
          result.damageMult *= 1.25 + level * 0.10;
          result.lastMagazine = true;
        }
        if (state.passives.includes('p-first-impact') && state.mecha.primaryFirstShotReady) {
          const level = state.passiveLevels['p-first-impact'] || 1;
          result.damageMult *= 1.35 + level * 0.10;
          result.bonusPierceHits += 1 + level;
          result.firstImpact = true;
          state.mecha.primaryFirstShotReady = false;
        }
        return result;
      }

      function startFlamethrowerBurstV302(timestamp) {
        const runtime = getWeaponRuntimeV302('w-flamethrower');
        runtime.activeUntil = timestamp + FLAMETHROWER_BURST_DURATION_V302;
        runtime.nextPulseAt = timestamp;
        runtime.pulses = 0;
      }

      function updateFlamethrowerBurstV302(timestamp, nearestEnemy) {
        const runtime = getWeaponRuntimeV302('w-flamethrower');
        if (!runtime.activeUntil || timestamp >= runtime.activeUntil || !nearestEnemy) return false;
        if (timestamp < (runtime.nextPulseAt || 0)) return true;
        runtime.nextPulseAt = timestamp + FLAMETHROWER_PULSE_MS_V302;
        runtime.pulses = (runtime.pulses || 0) + 1;
        const level = state.weaponLevels['w-flamethrower'] || 1;
        const base = getWeaponStats('w-flamethrower', level).damage;
        const aimAngle = state.manualAimV340 ? state.manualAimAngleV340 : Math.atan2(nearestEnemy.y - state.mecha.y, nearestEnemy.x - state.mecha.x);
        for (let f = 0; f < 2; f++) {
          const angle = aimAngle + (Math.random() - 0.5) * 0.34;
          state.bullets.push({
            x: state.mecha.x + Math.cos(angle) * 20,
            y: state.mecha.y + Math.sin(angle) * 20,
            vx: Math.cos(angle) * (5.2 + Math.random() * 2.3),
            vy: Math.sin(angle) * (5.2 + Math.random() * 2.3),
            damage: Math.round(base * state.stats.dpsMult),
            type: 'flame', radius: 6 + Math.random() * 5,
            color: `rgba(249,115,22,${0.72 + Math.random() * 0.25})`,
            life: 22 + Math.random() * 10, bounces: 0, pierces: 0,
            bonusPierceHits: 1, hitEnemies: []
          });
        }
        return true;
      }

      function awardEvolutionCoreV302(source = 'milestone') {
        state.runEvolutionCores = Math.max(0, Number(state.runEvolutionCores) || 0) + 1;
        progressionV3.evolutionCores = Math.max(0, Number(progressionV3.evolutionCores) || 0) + 1;
        progressionV3.lastEvolutionCoreSource = source;
        saveProgressionV3();
        return state.runEvolutionCores;
      }

      function getEligibleEvolutionCardsV302() {
        const result = [];
        const rotaryLevel = state.weaponLevels['w-rotarycannon'] || 0;
        if (state.runEvolutionCores > 0 && rotaryLevel >= 5 && state.activeWeapons.includes('w-rotarycannon') && state.passives.includes('p-bounce') && !state.activeWeapons.includes('syn-cyclonic')) {
          const evolution = SYNERGY_BY_ID.get('syn-cyclonic');
          if (evolution) result.push({ ...evolution, title: evolution.name, type: 'evolution', rarity: 'rare' });
        }
        return result;
      }

      function applyEvolutionV302(evolutionId) {
        if (evolutionId !== 'syn-cyclonic' || state.runEvolutionCores <= 0) return false;
        const rotaryLevel = state.weaponLevels['w-rotarycannon'] || 0;
        if (rotaryLevel < 5 || !state.activeWeapons.includes('w-rotarycannon') || !state.passives.includes('p-bounce')) return false;
        const index = state.activeWeapons.indexOf('w-rotarycannon');
        if (index >= 0) state.activeWeapons.splice(index, 1, 'syn-cyclonic');
        delete state.weaponLevels['w-rotarycannon'];
        state.weaponLevels['syn-cyclonic'] = Math.max(5, rotaryLevel);
        state.activatedSynergies = Array.from(new Set([...(state.activatedSynergies || []), 'syn-cyclonic']));
        state.runEvolutionCores -= 1;
        progressionV3.evolutionCores = Math.max(0, (progressionV3.evolutionCores || 0) - 1);
        progressionV3.discoveredEvolutions = Array.from(new Set([...(progressionV3.discoveredEvolutions || []), 'syn-cyclonic']));
        progressionV3.blueprints['syn-cyclonic'] = 'unlocked';
        saveProgressionV3();
        calculateMechaStats();
        return true;
      }
      //#endregion arsenal_v302

      function damageEnemy(e, damage, timestamp) {
        let adjustedDamage = Math.max(0, Number(damage) || 0);
        if (e && e.eliteModifierV31 === 'armored') adjustedDamage *= 0.8;
        if (e && (e.type === 'drill_bastion' || e.type === 'forge_titan') && timestamp < (e.vulnerableUntil || 0)) adjustedDamage *= 1.35;
        const safeDamage = Math.max(0, Math.round(adjustedDamage));
        if (e.isDummy) {
          const stats = state.dummyStats || (state.dummyStats = { totalDamage: 0, hits: 0, firstHitTime: 0, lastDamage: 0 });
          stats.hits += 1;
          stats.totalDamage += safeDamage;
          stats.lastDamage = safeDamage;
          if (!stats.firstHitTime) stats.firstHitTime = timestamp;

          if (state.testDummyMortal) {
            e.hp -= safeDamage;
          } else {
            e.hp = e.maxHp;
          }
          updateDummyStatsUI(timestamp);
        } else {
          e.hp -= safeDamage;
        }
      }

      function getCurrentWorldSize() {
        return state.testMode ? TEST_WORLD_SIZE : WORLD_SIZE;
      }

      function updateDummyStatsUI(timestamp = performance.now()) {
        const stats = state.dummyStats || { totalDamage: 0, hits: 0, firstHitTime: 0, lastDamage: 0 };
        const elapsed = stats.firstHitTime ? Math.max(0.25, (timestamp - stats.firstHitTime) / 1000) : 0;
        const dps = elapsed ? Math.round(stats.totalDamage / elapsed) : 0;
        if (dom.dummyDps) dom.dummyDps.textContent = dps;
        if (dom.dummyLastDamage) dom.dummyLastDamage.textContent = stats.lastDamage || 0;
        if (dom.dummyHits) dom.dummyHits.textContent = stats.hits || 0;
        if (dom.dummyTotalDamage) dom.dummyTotalDamage.textContent = stats.totalDamage || 0;
      }

      function resetDummyStats() {
        state.dummyStats = { totalDamage: 0, hits: 0, firstHitTime: 0, lastDamage: 0 };
        updateDummyStatsUI();
      }

      function spawnTestDummy() {
        if (!state.testMode || !state.testDummyEnabled) return null;
        const existing = state.enemies.find(enemy => enemy.isDummy);
        if (existing) return existing;
        const worldSize = getCurrentWorldSize();
        const hp = state.testDummyMortal ? 3000 : 999999999;
        const dummy = {
          id: 'training_dummy',
          isDummy: true,
          type: 'dummy',
          x: Math.round(worldSize * 0.72),
          y: Math.round(worldSize * 0.5),
          vx: 0,
          vy: 0,
          hp,
          maxHp: hp,
          radius: 30,
          speed: 0,
          color: '#ffaa00',
          explodeTimer: null,
          hasEnteredVision: false,
          nextShotTime: null
        };
        state.enemies.push(dummy);
        return dummy;
      }

      function ensureTestEnvironment(timestamp) {
        if (!state.testMode) return;
        if (!state.testSpawnEnemies) {
          state.enemies = state.enemies.filter(enemy => enemy.isDummy);
          state.enemyBullets.length = 0;
        }
        const dummy = state.enemies.find(enemy => enemy.isDummy);
        if (!state.testDummyEnabled) {
          if (dummy) state.enemies = state.enemies.filter(enemy => !enemy.isDummy);
          return;
        }
        if (!dummy && timestamp >= (state.testDummyRespawnAt || 0)) {
          spawnTestDummy();
        }
      }

      function handleDummyDestroyed(enemyIndex, timestamp) {
        state.enemies.splice(enemyIndex, 1);
        state.testDummyRespawnAt = timestamp + 800;
        state.particles.push({
          x: Math.round(getCurrentWorldSize() * 0.72),
          y: Math.round(getCurrentWorldSize() * 0.5),
          vx: 0, vy: 0, life: 35, color: '#ffaa00'
        });
      }


      // Calculate hybrid mecha statistics and compatibility penalties
      function calculateMechaStats() {
        state.activeWeapons = Array.from(new Set(state.activeWeapons));
        state.passives = Array.from(new Set(state.passives)).slice(0, 6);

        state.mecha.maxHp = 100 + (state.passives.length * 10);
        state.mecha.maxShield = 0;
        state.mecha.baseDps = 40 + (state.activeWeapons.length * 10);
        state.mecha.hp = Math.min(state.mecha.hp || 100, state.mecha.maxHp);
        state.mecha.shield = 0;

        state.evolvedWeapons = [];
        if (state.passives.includes('p-evolve')) {
          if (state.activeWeapons.includes('w-plasma') && state.passives.includes('p-lightning')) state.evolvedWeapons.push('w-plasma');
          if (state.activeWeapons.includes('w-missile') && state.passives.includes('p-bounce')) state.evolvedWeapons.push('w-missile');
          if (state.activeWeapons.includes('w-laser') && state.passives.includes('p-pierce')) state.evolvedWeapons.push('w-laser');
          if (state.activeWeapons.includes('w-machinegun') && state.passives.includes('p-extra-projectile')) state.evolvedWeapons.push('w-machinegun');
        }

        state.activatedSynergies = Array.from(new Set(state.activatedSynergies || []));
        let formedNewSynergy = true;
        while (formedNewSynergy) {
          formedNewSynergy = false;
          for (const syn of SYNERGIES) {
            if (syn.id === 'syn-cyclonic') continue;
            if (state.activatedSynergies.includes(syn.id)) {
              if (!state.activeWeapons.includes(syn.id) && state.activeWeapons.length < 6) {
                state.activeWeapons.push(syn.id);
              }
              state.weaponLevels[syn.id] = Math.max(1, state.weaponLevels[syn.id] || 1);
              continue;
            }

            const hasAllReqs = syn.reqs.every(reqId =>
              reqId.startsWith('w-') ? state.activeWeapons.includes(reqId) :
              reqId.startsWith('p-') ? state.passives.includes(reqId) : false
            );
            if (!hasAllReqs) continue;

            const weaponReqs = syn.reqs.filter(reqId => reqId.startsWith('w-'));
            const inheritedLevel = Math.max(1, ...weaponReqs.map(id => state.weaponLevels[id] || 1));

            // La sinergia consume las armas componentes. Las pasivas requisito se conservan.
            weaponReqs.forEach(reqId => {
              const index = state.activeWeapons.indexOf(reqId);
              if (index >= 0) state.activeWeapons.splice(index, 1);
              delete state.weaponLevels[reqId];
            });

            if (!state.activeWeapons.includes(syn.id)) state.activeWeapons.push(syn.id);
            state.weaponLevels[syn.id] = inheritedLevel;
            state.activatedSynergies.push(syn.id);
            formedNewSynergy = true;
            break;
          }
        }

        state.activeWeapons = Array.from(new Set(state.activeWeapons)).slice(0, 6);
        updateStatsUI();
      }
      function updateStatsUI() {
        const loadoutSignature = [
          state.activeWeapons.slice(0, 6).map(id => `${id}:${state.weaponLevels[id] || 1}`).join(','),
          state.passives.slice(0, 6).map(id => `${id}:${state.passiveLevels[id] || 1}`).join(',')
        ].join('|');

        if (loadoutSignature !== hudCache.loadoutSignature) {
          hudCache.loadoutSignature = loadoutSignature;

          if (dom.hudActiveSlots) {
            let html = '';
            for (let i = 0; i < 6; i++) {
              const weaponId = state.activeWeapons[i];
              if (weaponId) {
                const item = CONTENT_BY_ID.get(weaponId);
                const level = state.weaponLevels[weaponId] || 1;
                const title = item ? (item.title || item.name) : '';
                const icon = item ? item.icon : '⚔';
                html += `<div class="hud-slot weapon" data-weapon-id="${weaponId}" title="${title} (Lvl ${level})">
                  <span class="slot-icon">${icon}</span>
                  <span class="slot-level">${level}</span>
                </div>`;
              } else {
                html += `<div class="hud-slot empty"><span>·</span></div>`;
              }
            }
            dom.hudActiveSlots.innerHTML = html;
          }

          if (dom.hudPassivesList) {
            let html = '';
            for (let i = 0; i < 6; i++) {
              const passiveId = state.passives[i];
              if (passiveId) {
                const item = UPGRADE_BY_ID.get(passiveId);
                const level = state.passiveLevels[passiveId] || 1;
                const title = item ? item.title : '';
                const icon = item ? item.icon : '✦';
                html += `<div class="hud-slot passive" title="${title} (Lvl ${level})">
                  <span class="slot-icon">${icon}</span>
                  <span class="slot-level">${level}</span>
                </div>`;
              } else {
                html += `<div class="hud-slot empty"><span>·</span></div>`;
              }
            }
            dom.hudPassivesList.innerHTML = html;
          }
        }

        const enemyCount = state.enemies.length;
        if (dom.hudEnemyCount && enemyCount !== hudCache.enemyCount) {
          hudCache.enemyCount = enemyCount;
          dom.hudEnemyCount.textContent = enemyCount;
        }
        updateXpUI();
      }
      function getEffectiveWeaponCooldown(weaponId, timestamp) {
        if (state.devNoCooldown) return 0;
        let cooldown = getWeaponStats(weaponId, state.weaponLevels[weaponId] || 1).cooldown;
        if (state.passives.includes('p-cooldown')) {
          const passiveLvl = state.passiveLevels['p-cooldown'] || 1;
          cooldown *= Math.pow(0.8, passiveLvl);
        }
        if (state.mecha.reactorOverloadUntil && timestamp < state.mecha.reactorOverloadUntil) cooldown *= 0.5;
        if (state.stats.fireRateMult) cooldown /= state.stats.fireRateMult;
        cooldown /= getTemporaryFireRateMultV33();
        return Math.max(1, cooldown);
      }

      function updateHudCooldowns(timestamp) {
        if (!dom.hudActiveSlots) return;
        const lastTimes = state.lastWeaponFireTimes || {};
        dom.hudActiveSlots.querySelectorAll('.hud-slot.weapon[data-weapon-id]').forEach(slot => {
          const weaponId = slot.dataset.weaponId;
          const cooldown = getEffectiveWeaponCooldown(weaponId, timestamp);
          const storedLastFire = lastTimes[weaponId];
          const lastFire = Number.isFinite(storedLastFire) ? storedLastFire : (timestamp - cooldown);
          const progress = cooldown <= 0 ? 1 : Math.max(0, Math.min(1, (timestamp - lastFire) / cooldown));
          const degrees = Math.round(progress * 360);
          slot.classList.toggle('cooling', progress < 0.995);
          slot.style.background = progress >= 0.995
            ? 'var(--weapon-ready)'
            : `conic-gradient(var(--weapon-ready) ${degrees}deg, var(--slot-cooling) ${degrees}deg 360deg)`;
        });
      }

      //#endregion mecha_calculation

      //#region game_loop · Main combat simulation loop and rendering

      function applyMechaDamage(amount, sourceX, sourceY, timestamp = performance.now(), attackers = 1) {
        const isShieldBubbleActive = state.mecha.shieldActiveUntil && timestamp < state.mecha.shieldActiveUntil;
        if (isShieldBubbleActive || state.devInvulnerable) return false;
        const damage = Math.max(1, Math.round(Number(amount) || 0));
        let remaining = damage;
        if (state.mecha.shield > 0 && !state.devInfShield) {
          const absorbed = Math.min(state.mecha.shield, remaining);
          state.mecha.shield -= absorbed;
          remaining -= absorbed;
        }
        if (remaining > 0 && !state.devInfHp) state.mecha.hp -= remaining;
        const now = timestamp || performance.now();
        state.mecha.damageFlashUntil = now + 430;
        state.mecha.damageFlashAttackers = Math.max(1, attackers || 1);
        state.damageNumbers.push({
          x: state.mecha.x,
          y: state.mecha.y - 58,
          text: `-${damage}`,
          life: 34,
          vx: (Math.random() - 0.5) * 0.7,
          vy: -1.25,
          color: '#ffffff',
          size: 23,
          playerDamage: true
        });
        vibrate(attackers > 1 ? 70 : 45);
        updateStatsUI();
        if (state.mecha.hp <= 0) beginDeathSequenceV331(sourceX, sourceY, timestamp);
        return true;
      }

      function getMechaDamageTint(timestamp) {
        if (!state.mecha.damageFlashUntil || timestamp >= state.mecha.damageFlashUntil) return null;
        const attackers = Math.max(1, state.mecha.damageFlashAttackers || 1);
        const interval = attackers > 1 ? 85 : 145;
        return Math.floor((state.mecha.damageFlashUntil - timestamp) / interval) % 2 === 0 ? '#ff354f' : null;
      }
      // COMBAT SIMULATION ENGINE
      //#region enemies_v310 · Chatarreros faction, elite, miniboss, boss and threat director
      const ENEMY_DEFS_V31 = Object.freeze({
        scrap_hound: { name:'Sabueso de Chatarra', role:'perseguidor', hp:92, speed:3.25, radius:12, color:'#d9633c', contactDamage:9, xp:2, score:90, scrap:3, threat:1 },
        saw_raider: { name:'Saqueador Sierra', role:'asedio', hp:168, speed:2.22, radius:16, color:'#e48a43', contactDamage:13, xp:5, score:145, scrap:5, threat:2 },
        scrap_gunner: { name:'Tirador Remachado', role:'tirador', hp:142, speed:1.82, radius:15, color:'#c9a45b', contactDamage:7, xp:5, score:160, scrap:5, threat:2 },
        mine_junker: { name:'Minador Improvisado', role:'controlador', hp:205, speed:1.55, radius:17, color:'#b9753f', contactDamage:9, xp:8, score:190, scrap:7, threat:3 },
        scrap_suicide: { name:'Detonador Errante', role:'suicida', hp:118, speed:5.15, radius:14, color:'#d84a32', contactDamage:0, xp:5, score:175, scrap:6, threat:3 },
        scrap_bomber: { name:'Bombardero de Forja', role:'bombardero', hp:156, speed:5.65, radius:18, color:'#8f6a4e', contactDamage:0, xp:8, score:220, scrap:8, threat:4, flying:true },
        drill_bastion: { name:'Taladro Bastión', role:'mini_jefe', hp:6200, speed:1.42, radius:36, color:'#dd753c', contactDamage:25, xp:60, score:1800, scrap:80, threat:18, miniboss:true },
        forge_titan: { name:'Titán de la Forja', role:'jefe', hp:22000, speed:.92, radius:55, color:'#d25535', contactDamage:34, xp:180, score:7500, scrap:260, threat:45, boss:true }
      });
      const CHATARRERO_BASIC_TYPES_V31 = Object.freeze(['scrap_hound','saw_raider','scrap_gunner','mine_junker','scrap_suicide','scrap_bomber']);

      function getEnemyDefV31(type) { return ENEMY_DEFS_V31[type] || ENEMY_DEFS_V31.scrap_hound; }
      function getEnemyTypeForSector(sector) {
        return getEnemyTypeForSectorV33(sector);
      }

      function createEnemyV31(type, ex, ey, worldSize, options = {}) {
        const def = getEnemyDefV31(type);
        const sectorScale = 1 + Math.max(0, state.sector - 1) * .12;
        const enemy = {
          id: `${def.boss ? 'boss' : def.miniboss ? 'mini' : 'scrap'}_${Math.random().toString(36).slice(2,10)}`,
          faction: 'scrappers', type, roleV31: def.role, displayNameV31: def.name,
          x: Math.max(100, Math.min(worldSize - 100, ex)), y: Math.max(100, Math.min(worldSize - 100, ey)),
          vx:0, vy:0, hp:Math.round(def.hp * sectorScale), maxHp:Math.round(def.hp * sectorScale),
          radius:def.radius, speed:def.speed, color:def.color, contactDamage:def.contactDamage,
          xpRewardV31:def.xp, scoreRewardV31:def.score, scrapRewardV31:def.scrap, threatCostV31:def.threat,
          explodeTimer:null, hasEnteredVision:false, nextShotTime:null, nextActionAt:performance.now()+700+Math.random()*1900, fireCadenceOffsetV332:Math.random()*1300, fireIntervalV332:1750+Math.random()*1050, fireWindupV332:360+Math.random()*360,
          attackWarningUntil:0, pendingAttackAt:0, vulnerableUntil:0, chargeUntil:0, windupUntil:0,
          chargeAngle:0, nextMeleeHitAt:0, isMinibossV31:!!def.miniboss, isBossV31:!!def.boss,
          phaseV31:1, suppressContactDamageV31:false
        };
        if (options.elite) applyEliteModifierV31(enemy, options.modifier || 'armored');
        return enemy;
      }

      function applyEliteModifierV31(enemy, modifier = 'armored') {
        enemy.isEliteV31 = true;
        enemy.eliteModifierV31 = modifier;
        enemy.displayNameV31 = `ÉLITE · ${enemy.displayNameV31}`;
        enemy.maxHp = Math.round(enemy.maxHp * 2.15);
        enemy.hp = enemy.maxHp;
        enemy.radius = Math.round(enemy.radius * 1.14);
        enemy.contactDamage = Math.round(enemy.contactDamage * 1.35);
        enemy.scoreRewardV31 = Math.round(enemy.scoreRewardV31 * 2.5);
        enemy.scrapRewardV31 += 22;
        enemy.xpRewardV31 = Math.round(enemy.xpRewardV31 * 2);
        return enemy;
      }

      function spawnEnemyAt(ex, ey, worldSize, forcedType, options = {}) {
        const type = forcedType || getEnemyTypeForSector(state.sector);
        const enemy = createEnemyV31(type, ex, ey, worldSize, options);
        state.enemies.push(enemy);
        return enemy;
      }

      function safeSpawnAroundPlayerV31(type, distance = 650, options = {}) {
        const worldSize = getCurrentWorldSize();
        const angle = Math.random() * Math.PI * 2;
        const ex = state.mecha.x + Math.cos(angle) * distance;
        const ey = state.mecha.y + Math.sin(angle) * distance;
        return spawnEnemyAt(ex, ey, worldSize, type, options);
      }

      function showEncounterNoticeV31(text, duration = 1700) {
        const el = dom.encounterNoticeV31 || document.getElementById('encounter-notice-v31');
        if (!el) return;
        el.textContent = text;
        el.classList.add('show');
        clearTimeout(el._hideTimerV31);
        el._hideTimerV31 = setTimeout(() => el.classList.remove('show'), duration);
      }

      function spawnMinibossV31() {
        const existing = state.enemies.find(e => e.isMinibossV31);
        if (existing) return existing;
        const enemy = safeSpawnAroundPlayerV31('drill_bastion', 720);
        state.bossEncounterV31 = {active:true,id:enemy.id,type:enemy.type,name:enemy.displayNameV31,phase:1};
        showEncounterNoticeV31('⚠ MINI JEFE: TALADRO BASTIÓN', 2300);
        return enemy;
      }

      function spawnBossV31() {
        const existing = state.enemies.find(e => e.isBossV31);
        if (existing) return existing;
        state.enemies = state.enemies.filter(e => e.isDummy || e.isMinibossV31);
        state.enemyMinesV31.length = 0;
        state.enemyBullets.length = 0;
        const enemy = safeSpawnAroundPlayerV31('forge_titan', 780);
        state.bossEncounterV31 = {active:true,id:enemy.id,type:enemy.type,name:enemy.displayNameV31,phase:1};
        showEncounterNoticeV31('⚠ JEFE: TITÁN DE LA FORJA', 2600);
        return enemy;
      }

      function spawnEnemyWave() {
        const count = Math.min(7, 3 + Math.floor(state.sector * .75));
        const eliteChance = state.playTime > 70000 ? Math.min(.16, .045 + state.sector * .015) : 0;
        for (let i = 0; i < count; i++) {
          const type = getEnemyTypeForSector(state.sector);
          safeSpawnAroundPlayerV31(type, 520 + Math.random() * 360, {elite:Math.random() < eliteChance});
        }
      }

      function updateThreatDirectorV31(timestamp, timeFactor) {
        if (state.testMode && (!state.testSpawnEnemies || state.devContinuousSpawn === false)) return;
        if (!state.encounterMilestonesV31.miniboss && state.playTime >= 270000) {
          state.encounterMilestonesV31.miniboss = true;
          spawnMinibossV31();
          return;
        }
        if (!state.encounterMilestonesV31.boss && state.playTime >= 720000 && !state.enemies.some(e => e.isMinibossV31)) {
          state.encounterMilestonesV31.boss = true;
          spawnBossV31();
          return;
        }
        if (state.enemies.some(e => e.isBossV31)) return;
        const regularCount = state.enemies.filter(e => !e.isDummy && !e.isMinibossV31 && !e.isBossV31).length;
        const cap = state.enemies.some(e => e.isMinibossV31) ? 5 : Math.min(22, 9 + state.sector * 2);
        if (regularCount === 0) { spawnEnemyWave(); state.threatDirectorV31.lastSpawnAt = timestamp; return; }
        const interval = Math.max(680, 1800 / Math.max(.45,timeFactor));
        if (regularCount < cap && timestamp - (state.threatDirectorV31.lastSpawnAt || 0) >= interval) {
          state.threatDirectorV31.lastSpawnAt = timestamp;
          const amount = regularCount < cap * .45 ? 2 : 1;
          for (let i=0;i<amount;i++) {
            const eliteChance = state.playTime > 70000 ? Math.min(.18,.04+state.sector*.018) : 0;
            safeSpawnAroundPlayerV31(getEnemyTypeForSector(state.sector), 500+Math.random()*420, {elite:Math.random()<eliteChance});
          }
        }
      }

      function fireEnemyBulletV31(e, angle, speed, damage, color='#ff9b53', radius=5, life=220) {
        state.enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,damage,color,radius,lifeV31:life});
      }
      function fireRadialBurstV31(e, count, speed, damage, color='#ff7a45') {
        for (let i=0;i<count;i++) fireEnemyBulletV31(e,(Math.PI*2*i/count)+(e.phaseV31||0)*.13,speed,damage,color,5,260);
      }
      function fireFanV31(e, centerAngle, count, spread, speed, damage, color='#f5a04f') {
        for(let i=0;i<count;i++) {
          const t=count===1?0:i/(count-1)-.5;
          fireEnemyBulletV31(e,centerAngle+t*spread,speed,damage,color,5,240);
        }
      }

      function moveEnemyTowardV31(e, angle, speed, simulationSpeed) {
        e.x += Math.cos(angle) * speed * simulationSpeed;
        e.y += Math.sin(angle) * speed * simulationSpeed;
      }

      function executeBossAttackV31(e, timestamp, angle) {
        if (e.type === 'drill_bastion') {
          e.chargeAngle = angle; e.chargeUntil = timestamp + 760; e.suppressContactDamageV31 = true;
          return;
        }
        if (e.phaseV31 === 1) {
          fireRadialBurstV31(e,8,3.5,10,'#ef8742');
          state.enemyMinesV31.push({x:e.x+Math.cos(angle)*110,y:e.y+Math.sin(angle)*110,radius:55,damage:16,armedAt:timestamp+700,expiresAt:timestamp+8000,color:'#e65b37'});
        } else if (e.phaseV31 === 2) {
          fireFanV31(e,angle,7,1.25,4.4,12,'#f0a24e');
          for(let i=0;i<2;i++) safeSpawnAroundPlayerV31(i?'saw_raider':'scrap_hound',420+Math.random()*100);
        } else {
          fireRadialBurstV31(e,14,4.4,14,'#ff5a3c');
          fireFanV31(e,angle,5,.72,5.2,16,'#ffd064');
        }
        e.vulnerableUntil = timestamp + 1250;
      }

      function updateScrapperEnemyV31(e, timestamp, distToPlayer, angle, isStunned, simulationSpeed, visibleRange) {
        e.suppressContactDamageV31 = false;
        if (isStunned) return;
        if (e.type === 'scrap_hound') {
          moveEnemyTowardV31(e,angle+Math.sin(timestamp*.004+(e.x%17))*.13,e.speed,simulationSpeed);
        } else if (e.type === 'saw_raider') {
          if (timestamp < (e.windupUntil||0)) {
            e.attackWarningUntil=e.windupUntil; return;
          }
          if (timestamp < (e.chargeUntil||0)) {
            e.suppressContactDamageV31=true;
            moveEnemyTowardV31(e,e.chargeAngle,e.speed*5.2,simulationSpeed);
            if (distToPlayer < e.radius+25 && timestamp >= (e.nextChargeHitAt||0)) {
              e.nextChargeHitAt=timestamp+900;
              applyMechaDamage(14,e.x,e.y,timestamp,1);
            }
            return;
          }
          if (e.chargeUntil && timestamp >= e.chargeUntil) { e.chargeUntil=0; e.vulnerableUntil=timestamp+900; }
          if (timestamp >= (e.nextActionAt||0) && distToPlayer<520) {
            e.chargeAngle=angle; e.windupUntil=timestamp+620; e.chargeUntil=timestamp+1220; e.nextActionAt=timestamp+3600; e.attackWarningUntil=e.windupUntil; return;
          }
          moveEnemyTowardV31(e,angle,e.speed,simulationSpeed);
        } else if (e.type === 'scrap_gunner') {
          let moveAngle=angle;
          if (distToPlayer<260) moveAngle=angle+Math.PI;
          else if (distToPlayer<430) moveAngle=angle+(e.id.charCodeAt(e.id.length-1)%2?1:-1)*Math.PI/2;
          moveEnemyTowardV31(e,moveAngle,e.speed,simulationSpeed);
          if (e.pendingAttackAt && timestamp>=e.pendingAttackAt) {
            const gunnerAngleV333=Math.atan2(state.mecha.y-e.y,state.mecha.x-e.x);
            fireEnemyBulletV31(e,gunnerAngleV333-.045,4.45,12,'#e6b15f',6,275);
            fireEnemyBulletV31(e,gunnerAngleV333+.045,4.45,12,'#e6b15f',6,275);
            e.pendingAttackAt=0; e.nextActionAt=timestamp+(e.fireIntervalV332||2650)+Math.random()*420;
          } else if (!e.pendingAttackAt && timestamp>=(e.nextActionAt||0) && distToPlayer<visibleRange) {
            e.pendingAttackAt=timestamp+620; e.attackWarningUntil=e.pendingAttackAt;
          }
        } else if (e.type === 'mine_junker') {
          let moveAngle=angle;
          if(distToPlayer<230) moveAngle=angle+Math.PI;
          else if(distToPlayer<390) moveAngle=angle+Math.PI/2;
          moveEnemyTowardV31(e,moveAngle,e.speed,simulationSpeed);
          if(timestamp>=(e.nextActionAt||0)) {
            state.enemyMinesV31.push({x:e.x,y:e.y,radius:48,damage:13,armedAt:timestamp+650,expiresAt:timestamp+11000,color:'#d27b38'});
            e.nextActionAt=timestamp+3100+Math.random()*700;
          }
        } else if (e.type === 'drill_bastion') {
          if(timestamp<(e.windupUntil||0)) { e.attackWarningUntil=e.windupUntil; return; }
          if(timestamp<(e.chargeUntil||0)) {
            e.suppressContactDamageV31=true;
            moveEnemyTowardV31(e,e.chargeAngle,e.speed*7.4,simulationSpeed);
            if(distToPlayer<e.radius+28 && timestamp>=(e.nextChargeHitAt||0)) { e.nextChargeHitAt=timestamp+1100; applyMechaDamage(22,e.x,e.y,timestamp,1); }
            return;
          }
          if(e.chargeUntil && timestamp>=e.chargeUntil) { e.chargeUntil=0; e.vulnerableUntil=timestamp+1600; }
          if(timestamp>=(e.nextActionAt||0)) { e.chargeAngle=angle; e.windupUntil=timestamp+850; e.chargeUntil=timestamp+1850; e.nextActionAt=timestamp+4300; e.attackWarningUntil=e.windupUntil; return; }
          moveEnemyTowardV31(e,angle,e.speed,simulationSpeed);
        } else if (e.type === 'forge_titan') {
          const hpRatio=Math.max(0,e.hp/e.maxHp);
          e.phaseV31=hpRatio>.66?1:(hpRatio>.33?2:3);
          state.bossEncounterV31.phase=e.phaseV31;
          const preferred=e.phaseV31===1?260:340;
          const moveAngle=distToPlayer<preferred*.75?angle+Math.PI:(distToPlayer>preferred?angle:angle+Math.PI/2);
          moveEnemyTowardV31(e,moveAngle,e.speed*(e.phaseV31===3?1.25:1),simulationSpeed);
          if(e.pendingAttackAt && timestamp>=e.pendingAttackAt) {
            executeBossAttackV31(e,timestamp,angle); e.pendingAttackAt=0; e.nextActionAt=timestamp+(e.phaseV31===3?1550:e.phaseV31===2?2100:2600);
          } else if(!e.pendingAttackAt && timestamp>=(e.nextActionAt||0)) {
            e.pendingAttackAt=timestamp+720; e.attackWarningUntil=e.pendingAttackAt;
          }
        }
      }

      function updateEnemyMinesV31(timestamp) {
        for(let i=state.enemyMinesV31.length-1;i>=0;i--) {
          const mine=state.enemyMinesV31[i];
          if(timestamp>=mine.expiresAt) { state.enemyMinesV31.splice(i,1); continue; }
          const armed=timestamp>=mine.armedAt;
          const d=Math.hypot(state.mecha.x-mine.x,state.mecha.y-mine.y);
          if(armed && d<mine.radius) {
            applyMechaDamage(mine.damage,mine.x,mine.y,timestamp,1);
            for(let p=0;p<18;p++) state.particles.push({x:mine.x,y:mine.y,vx:(Math.random()-.5)*7,vy:(Math.random()-.5)*7,life:22,color:mine.color});
            state.enemyMinesV31.splice(i,1);
          }
        }
      }

      function drawEnemyMinesV31(timestamp) {
        for(const mine of state.enemyMinesV31) {
          const armed=timestamp>=mine.armedAt;
          ctx.save(); ctx.translate(mine.x,mine.y);
          ctx.strokeStyle=armed?'#ff6b3d':'#d99b4e'; ctx.fillStyle=armed?'rgba(255,77,42,.18)':'rgba(217,155,78,.12)'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(0,0,mine.radius*(armed?1:.38),0,Math.PI*2); ctx.fill(); ctx.stroke();
          ctx.rotate(timestamp*.003); ctx.fillStyle=mine.color; ctx.fillRect(-7,-7,14,14); ctx.restore();
        }
      }

      function drawScrapperEnemyV31(e, timestamp, angle) {
        ctx.save();
        if(e.attackWarningUntil>timestamp) {
          const pulse=.45+.4*Math.sin(timestamp*.025);
          ctx.strokeStyle=`rgba(255,86,48,${pulse})`; ctx.lineWidth=e.isBossV31?6:3;
          ctx.beginPath(); ctx.arc(0,0,e.radius+9,0,Math.PI*2); ctx.stroke();
          if(e.chargeAngle!==undefined && (e.type==='saw_raider'||e.type==='drill_bastion')) {
            ctx.rotate(e.chargeAngle-angle); ctx.beginPath(); ctx.moveTo(e.radius,0); ctx.lineTo(e.radius+180,0); ctx.stroke(); ctx.rotate(-(e.chargeAngle-angle));
          }
        }
        ctx.rotate(angle);
        const vulnerable=timestamp<(e.vulnerableUntil||0);
        ctx.fillStyle=vulnerable?'#ffe3b3':e.color; ctx.strokeStyle=e.isEliteV31?'#ffe38a':'#f4d4ad'; ctx.lineWidth=e.isBossV31?4:2;
        ctx.beginPath();
        if(e.type==='scrap_hound') { ctx.moveTo(17,0);ctx.lineTo(-8,-11);ctx.lineTo(-14,-3);ctx.lineTo(-7,0);ctx.lineTo(-14,5);ctx.lineTo(-8,11); }
        else if(e.type==='saw_raider') { ctx.arc(0,0,e.radius,0,Math.PI*2); for(let k=0;k<8;k++){const a=k*Math.PI/4;ctx.moveTo(Math.cos(a)*e.radius,Math.sin(a)*e.radius);ctx.lineTo(Math.cos(a)*(e.radius+6),Math.sin(a)*(e.radius+6));} }
        else if(e.type==='scrap_gunner') { ctx.rect(-14,-11,28,22);ctx.moveTo(6,-4);ctx.lineTo(25,-4);ctx.lineTo(25,4);ctx.lineTo(6,4); }
        else if(e.type==='mine_junker') { for(let k=0;k<6;k++){const a=k*Math.PI/3;const x=Math.cos(a)*e.radius,y=Math.sin(a)*e.radius;k?ctx.lineTo(x,y):ctx.moveTo(x,y);} }
        else if(e.type==='scrap_suicide') { ctx.moveTo(18,0);ctx.lineTo(2,-13);ctx.lineTo(-13,-9);ctx.lineTo(-18,0);ctx.lineTo(-13,9);ctx.lineTo(2,13);ctx.moveTo(-5,-12);ctx.lineTo(-12,-20);ctx.moveTo(-5,12);ctx.lineTo(-12,20); }
        else if(e.type==='scrap_bomber') { ctx.moveTo(25,0);ctx.lineTo(1,-8);ctx.lineTo(-14,-22);ctx.lineTo(-20,-18);ctx.lineTo(-10,-5);ctx.lineTo(-24,0);ctx.lineTo(-10,5);ctx.lineTo(-20,18);ctx.lineTo(-14,22);ctx.lineTo(1,8); }
        else if(e.type==='drill_bastion') { ctx.rect(-26,-22,44,44);ctx.moveTo(18,-14);ctx.lineTo(42,0);ctx.lineTo(18,14); }
        else { ctx.arc(0,0,e.radius,0,Math.PI*2);ctx.moveTo(-e.radius*.8,-12);ctx.lineTo(-e.radius-25,-24);ctx.lineTo(-e.radius-15,0);ctx.lineTo(-e.radius-25,24);ctx.lineTo(-e.radius*.8,12);ctx.moveTo(e.radius*.8,-12);ctx.lineTo(e.radius+25,-24);ctx.lineTo(e.radius+15,0);ctx.lineTo(e.radius+25,24);ctx.lineTo(e.radius*.8,12); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle=e.phaseV31===3?'#fff1a8':'#ffdb74'; ctx.beginPath();ctx.arc(0,0,Math.max(4,e.radius*.22),0,Math.PI*2);ctx.fill();
        if(e.isEliteV31) { ctx.strokeStyle='#ffe88e';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,e.radius+7,0,Math.PI*2);ctx.stroke(); }
        ctx.restore();
      }

      function drawEnemyHealthV31(e) {
        if(!e.isEliteV31&&!e.isMinibossV31&&!e.isBossV31) return;
        const w=e.isBossV31?110:e.isMinibossV31?76:42, h=e.isBossV31?7:5, y=e.y-e.radius-15;
        ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(e.x-w/2,y,w,h);
        ctx.fillStyle=e.isBossV31?'#df593d':e.isMinibossV31?'#e98942':'#f0c75e';ctx.fillRect(e.x-w/2,y,w*Math.max(0,e.hp/e.maxHp),h);
        if(e.isEliteV31){ctx.fillStyle='#ffe58a';ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillText('◆',e.x,y-3);}
      }

      function updateBossHudV31() {
        const encounter=state.enemies.find(e=>e.isBossV31||e.isMinibossV31);
        const hud=dom.bossHudV31||document.getElementById('boss-hud-v31');
        if(!hud) return;
        if(!encounter){hud.classList.add('hidden');return;}
        hud.classList.remove('hidden');
        if(dom.bossNameV31) dom.bossNameV31.textContent=encounter.displayNameV31;
        if(dom.bossPhaseV31) dom.bossPhaseV31.textContent=encounter.isBossV31?`FASE ${encounter.phaseV31||1}`:'MINI JEFE';
        if(dom.bossHpFillV31) dom.bossHpFillV31.style.width=`${Math.max(0,Math.min(100,encounter.hp/encounter.maxHp*100))}%`;
      }

      function queueRewardDraftV31(tier='elite') {
        const rewardToken = ++rewardDraftTokenV31;
        state.pendingRewardTierV31=tier;
        setTimeout(()=>{
          if(rewardToken !== rewardDraftTokenV31 || state.pendingRewardTierV31 !== tier || state.phase!=='playing') return;
          const minRank=tier==='boss'?3:(tier==='miniboss'?2:1);
          let pool=UPGRADE_POOL.filter(item=>isContentUnlockedV3(item.id)&&(RARITY_DEFS_V3[getContentMetaV3(item.id)?.rarity||'common']?.rank||0)>=minRank);
          if(pool.length<3) pool=UPGRADE_POOL.filter(item=>isContentUnlockedV3(item.id));
          const cards=selectDraftCardsV3(pool,3,state);
          if(!cards.length) return;
          state.phase='draft'; state.draftCards=cards; state.draftSelection=0; state.draftConfirmArmed=false; state.draftInputLocked=false;
          prepareDraftDiscoveriesV301(cards); document.getElementById('roguelike-draft-modal')?.classList.remove('hidden'); updateDraftMenuUI(); render();
          state.pendingRewardTierV31=null;
        },180);
      }
      //#endregion enemies_v310


      //#region sectors_v330 · Sector route, POIs, hazards, events and adaptive threat director
      const SECTOR_DEFS_V33 = Object.freeze([
        {id:'outer_scrapyard', index:1, name:'DESGUACE EXTERIOR', subtitle:'Entrada a la cadena de reciclaje', modifier:'Más chatarra · presión estable', bg:'#11161a', grid:'rgba(154,174,178,.11)', accent:'#8e9ba0', hazard:null, hazardInterval:0,
          weights:{scrap_hound:.65,saw_raider:.25,scrap_gunner:.10,mine_junker:0}},
        {id:'press_yard', index:2, name:'PATIO DE PRENSAS', subtitle:'Maquinaria pesada todavía activa', modifier:'Prensas periódicas · asaltantes frecuentes', bg:'#181714', grid:'rgba(191,148,88,.12)', accent:'#b9874f', hazard:'press', hazardInterval:17000,
          weights:{scrap_hound:.34,saw_raider:.36,scrap_gunner:.10,mine_junker:.20}},
        {id:'rail_corridor', index:3, name:'CORREDOR FERROVIARIO', subtitle:'Rieles magnéticos de carga', modifier:'Barridos lineales · tiradores reforzados', bg:'#12171a', grid:'rgba(104,159,169,.12)', accent:'#6f9ca5', hazard:'rail', hazardInterval:15000,
          weights:{scrap_hound:.30,saw_raider:.24,scrap_gunner:.26,mine_junker:.20}},
        {id:'open_foundry', index:4, name:'FUNDICIÓN ABIERTA', subtitle:'Conductos de calor expuestos', modifier:'Respiraderos térmicos · más controladores', bg:'#1a1412', grid:'rgba(191,104,66,.13)', accent:'#b76445', hazard:'heat', hazardInterval:13500,
          weights:{scrap_hound:.28,saw_raider:.30,scrap_gunner:.12,mine_junker:.30}},
        {id:'forge_core', index:5, name:'NÚCLEO DE FORJA', subtitle:'Cámara del Titán de la Forja', modifier:'Amenaza máxima · élites y calor industrial', bg:'#171111', grid:'rgba(187,77,57,.14)', accent:'#c45c43', hazard:'core', hazardInterval:12000,
          weights:{scrap_hound:.26,saw_raider:.27,scrap_gunner:.15,mine_junker:.32}}
      ]);
      const POI_DEFS_V33 = Object.freeze({
        salvage:{name:'DEPÓSITO DE CHATARRA',color:'#c99452',icon:'◇',desc:'Chatarra recuperada'},
        repair:{name:'RELEVO DE REPARACIÓN',color:'#65a783',icon:'+',desc:'Blindaje restaurado'},
        relay:{name:'REPETIDOR TÁCTICO',color:'#668f9a',icon:'⌁',desc:'Director suprimido'},
        cache:{name:'ARCHIVO DE COMBATE',color:'#8d7ea8',icon:'▣',desc:'Experiencia recuperada'},
        overclock:{name:'BANCO DE SERVOS',color:'#b8714f',icon:'»',desc:'Cadencia temporal mejorada'}
      });
      const EVENT_DEFS_V33 = Object.freeze({
        salvage_rain:{title:'LLUVIA DE RESTOS',detail:'Fragmentos de chatarra caen en la zona',duration:16000,mode:'timer'},
        overdrive:{title:'VENTANA DE SOBRECARGA',detail:'Más cadencia, pero el director aumenta la presión',duration:16000,mode:'timer'},
        elite_patrol:{title:'PATRULLA BLINDADA',detail:'Neutraliza la escuadra élite antes de que se retire',duration:30000,mode:'targets'},
        repair_signal:{title:'SEÑAL DE AUXILIO',detail:'Localiza y activa el relevo de reparación',duration:25000,mode:'poi'}
      });

      function getSectorDefV33(index=state.sector) {
        return SECTOR_DEFS_V33[Math.max(0,Math.min(SECTOR_DEFS_V33.length-1,(Number(index)||1)-1))];
      }
      function getEnemyTypeForSectorV33(sector=state.sector) {
        const weights=getSectorDefV33(sector).weights; let cursor=Math.random();
        for(const [type,weight] of Object.entries(weights)){cursor-=weight;if(cursor<=0)return type;}
        return 'scrap_hound';
      }
      function initializeSectorProgressionV33() {
        progressionV3.statistics={...{poisDiscovered:0,eventsCompleted:0,maxSector:1},...(progressionV3.statistics||{})};
        if(!progressionV3.sectorSystemV33Initialized){
          progressionV3.sectorSystemV33Initialized=true;
          progressionV3.sectorSystemVersion='3.3.3';
        }
        saveProgressionV3();
      }
      function initializeRunSectorsV33() {
        state.sectorCurrentV33=0; state.sectorEnteredAtV33=0; state.sectorPropsV33=[]; state.sectorPoisV33=[];
        state.sectorDropsV33=[]; state.sectorHazardsV33=[]; state.nextSectorEventAtV33=35000; state.lastSectorEventIdV33=null;
        state.sectorEventV33=null; state.directorSuppressedUntilV33=0; state.overclockUntilV33=0;
        state.threatDirectorV33={budget:0,lastTick:0,lastSpawnAt:0,intensity:1,pressure:0,squadCount:0};
        state.sectorStatsV33={poisCollected:0,eventsCompleted:0,eventsFailed:0,hazardsTriggered:0};
        updateSectorProgressionV33(performance.now(),true); updateSectorHudV33();
      }
      function showSectorBannerV33(def) {
        const el=document.getElementById('sector-banner-v33'); if(!el)return;
        el.innerHTML=`<strong>SECTOR ${def.index} · ${def.name}</strong><span>${def.subtitle}</span>`;
        el.classList.add('show'); clearTimeout(el._timerV33); el._timerV33=setTimeout(()=>el.classList.remove('show'),2100);
      }
      function showPoiToastV33(text) {
        const el=document.getElementById('poi-toast-v33'); if(!el)return;
        el.textContent=text;el.classList.add('show');clearTimeout(el._timerV33);el._timerV33=setTimeout(()=>el.classList.remove('show'),1600);
      }
      function addScrapV33(amount) {
        const value=Math.max(0,Math.round(Number(amount)||0)); state.scrap=(state.scrap||0)+value;
        progressionV3.statistics.scrapCollected=(progressionV3.statistics.scrapCollected||0)+value;
        updateEconomyHudV32(); updateMissionTrackingHudV32(); return value;
      }
      function generateSectorPropsV33(def) {
        const worldSize=getCurrentWorldSize(); const props=[]; const count=state.testMode?12:44;
        for(let i=0;i<count;i++) props.push({x:80+Math.random()*(worldSize-160),y:80+Math.random()*(worldSize-160),r:7+Math.random()*16,kind:i%4,rot:Math.random()*Math.PI*2,color:def.accent});
        return props;
      }
      function getPoiPoolV33(def) {
        if(def.index===1)return ['salvage','cache','repair'];
        if(def.index===2)return ['salvage','repair','relay','overclock'];
        if(def.index===3)return ['relay','cache','overclock','salvage'];
        if(def.index===4)return ['repair','salvage','overclock','cache'];
        return ['repair','relay','overclock','salvage'];
      }
      function createPoiV33(type,x,y,options={}) {
        const worldSize=getCurrentWorldSize();
        return {id:`poi_${Math.random().toString(36).slice(2,9)}`,type,x:Math.max(70,Math.min(worldSize-70,x)),y:Math.max(70,Math.min(worldSize-70,y)),radius:20,collected:false,eventId:options.eventId||null,expiresAt:options.expiresAt||0};
      }
      function spawnSectorPoisV33(def) {
        const pool=[...getPoiPoolV33(def)].sort(()=>Math.random()-.5); const pois=[];
        for(let i=0;i<2;i++){
          const a=(i*Math.PI)+Math.random()*1.4-.7; const d=340+Math.random()*300;
          pois.push(createPoiV33(pool[i%pool.length],state.mecha.x+Math.cos(a)*d,state.mecha.y+Math.sin(a)*d));
        }
        state.sectorPoisV33=pois;
      }
      function updateSectorProgressionV33(timestamp=performance.now(),force=false) {
        const next=Math.min(5,Math.floor((state.playTime||0)/180000)+1);
        if(!force && next===state.sectorCurrentV33)return false;
        state.sector=next; state.sectorCurrentV33=next; state.sectorEnteredAtV33=state.playTime||0; state.sectorEnemiesDefeated=0;
        const def=getSectorDefV33(next); state.sectorPropsV33=generateSectorPropsV33(def); state.sectorHazardsV33=[];
        state.nextSectorHazardAtV33=(state.playTime||0)+(def.hazard?9000:99999999); spawnSectorPoisV33(def);
        progressionV3.statistics.maxSector=Math.max(progressionV3.statistics.maxSector||1,next); saveProgressionV3(); updateMissionTrackingHudV32();
        showSectorBannerV33(def); showEncounterNoticeV31(`RUTA ACTUALIZADA · ${def.name}`,1700); updateSectorHudV33(); return true;
      }
      function updateSectorHudV33() {
        const def=getSectorDefV33(); const root=document.getElementById('sector-hud-v33'); const idx=document.getElementById('sector-index-v33'); const name=document.getElementById('sector-name-v33');
        const encounterActive=state.enemies.some(e=>e.isBossV31||e.isMinibossV31); if(root)root.style.opacity=encounterActive?'0':'1';
        const threat=document.getElementById('threat-v33'); const mod=document.getElementById('sector-modifier-v33'); const route=document.getElementById('sector-route-v33');
        if(idx)idx.textContent=`SECTOR ${def.index}/5`; if(name)name.textContent=def.name; if(mod)mod.textContent=def.modifier;
        const threatLevel=Math.max(1,Math.min(5,Math.ceil((state.threatDirectorV33?.intensity||.8)*2.15)));
        if(threat)threat.textContent=`AMENAZA ${threatLevel}`;
        if(route)route.innerHTML=SECTOR_DEFS_V33.map(s=>`<span class="sector-node-v33 ${s.index<def.index?'done':s.index===def.index?'active':''}"></span>`).join('');
        const eventRoot=document.getElementById('event-hud-v33'); const event=state.sectorEventV33;
        if(!eventRoot)return; eventRoot.style.opacity=encounterActive?'0':'1';
        if(!event){eventRoot.classList.add('hidden');return;}
        const remaining=Math.max(0,Math.ceil((event.endsAt-(state.playTime||0))/1000));
        eventRoot.classList.remove('hidden'); const ed=EVENT_DEFS_V33[event.id];
        const title=document.getElementById('event-title-v33'); const detail=document.getElementById('event-detail-v33');
        if(title)title.textContent=`${ed.title} · ${remaining}s`; if(detail)detail.textContent=event.id==='elite_patrol'?`${ed.detail} · ${event.targetsRemaining||0} objetivos`:ed.detail;
      }
      function drawSectorBackdropV33(viewLeft,viewRight,viewTop,viewBottom,worldSize) {
        const def=getSectorDefV33(); ctx.fillStyle=def.bg; ctx.fillRect(viewLeft,viewTop,viewRight-viewLeft,viewBottom-viewTop);
        ctx.save();ctx.globalAlpha=.34;ctx.fillStyle=def.accent;
        if(def.id==='press_yard')for(let x=100;x<worldSize;x+=420)ctx.fillRect(x,viewTop,34,viewBottom-viewTop);
        else if(def.id==='rail_corridor')for(let y=160;y<worldSize;y+=520){ctx.fillRect(viewLeft,y,viewRight-viewLeft,10);ctx.fillRect(viewLeft,y+24,viewRight-viewLeft,4);}
        else if(def.id==='open_foundry'||def.id==='forge_core')for(let x=160;x<worldSize;x+=560)ctx.fillRect(x,viewTop,8,viewBottom-viewTop);
        ctx.restore();
        for(const p of state.sectorPropsV33||[]){if(p.x<viewLeft-30||p.x>viewRight+30||p.y<viewTop-30||p.y>viewBottom+30)continue;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.globalAlpha=.36;ctx.fillStyle=p.color;ctx.strokeStyle='rgba(10,12,14,.8)';ctx.lineWidth=2;if(p.kind===0)ctx.fillRect(-p.r,-p.r*.35,p.r*2,p.r*.7);else if(p.kind===1){ctx.beginPath();ctx.arc(0,0,p.r,0,Math.PI*2);ctx.fill();ctx.stroke();}else if(p.kind===2){ctx.beginPath();ctx.moveTo(-p.r,0);ctx.lineTo(0,-p.r*.6);ctx.lineTo(p.r,0);ctx.lineTo(0,p.r*.6);ctx.closePath();ctx.fill();}else{ctx.fillRect(-p.r*.25,-p.r,p.r*.5,p.r*2);}ctx.restore();}
      }
      function collectPoiV33(poi) {
        if(poi.collected)return;poi.collected=true;const def=POI_DEFS_V33[poi.type];let message=def.name;
        if(poi.type==='salvage'){const value=30+state.sector*7;addScrapV33(value);message+=` · +${value} CHATARRA`;}
        else if(poi.type==='repair'){const heal=30;state.mecha.hp=Math.min(state.mecha.maxHp,state.mecha.hp+heal);state.mecha.shield=Math.min(state.mecha.maxShield,state.mecha.shield+15);message+=` · +${heal} BLINDAJE`;}
        else if(poi.type==='relay'){state.directorSuppressedUntilV33=(state.playTime||0)+18000;message+=' · PRESIÓN REDUCIDA';}
        else if(poi.type==='cache'){state.xp+=80+state.sector*15;message+=' · DATOS DE COMBATE';if(state.xp>=state.xpNeeded)triggerLevelUp();}
        else if(poi.type==='overclock'){state.overclockUntilV33=(state.playTime||0)+20000;message+=' · CADENCIA +15%';}
        state.sectorStatsV33.poisCollected++;progressionV3.statistics.poisDiscovered=(progressionV3.statistics.poisDiscovered||0)+1;saveProgressionV3();updateMissionTrackingHudV32();showPoiToastV33(message);
        if(poi.eventId==='repair_signal'&&state.sectorEventV33?.id==='repair_signal')completeSectorEventV33(true);
      }
      function spawnScrapDropsV33(count=10) {
        const worldSize=getCurrentWorldSize();
        for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,d=110+Math.random()*520;state.sectorDropsV33.push({x:Math.max(50,Math.min(worldSize-50,state.mecha.x+Math.cos(a)*d)),y:Math.max(50,Math.min(worldSize-50,state.mecha.y+Math.sin(a)*d)),value:5+Math.floor(Math.random()*8),radius:7,life:40000});}
      }
      function spawnSectorHazardV33(forcedType=null) {
        const def=getSectorDefV33();const type=forcedType||def.hazard;if(!type)return [];
        const now=state.playTime||0;const hazards=[];const worldSize=getCurrentWorldSize();
        const point=(d=220)=>{const a=Math.random()*Math.PI*2;return{x:Math.max(70,Math.min(worldSize-70,state.mecha.x+Math.cos(a)*d)),y:Math.max(70,Math.min(worldSize-70,state.mecha.y+Math.sin(a)*d))}};
        if(type==='press'){for(let i=0;i<2;i++){const p=point(130+i*120);hazards.push({type:'circle',kind:'press',x:p.x,y:p.y,radius:64,warnUntil:now+1300,activeUntil:now+1850,damage:15,nextTick:0});}}
        else if(type==='rail'){const vertical=Math.random()<.5;hazards.push({type:'line',kind:'rail',vertical,pos:(vertical?state.mecha.x:state.mecha.y)+(Math.random()-.5)*220,width:58,warnUntil:now+1000,activeUntil:now+1900,damage:13,nextTick:0});}
        else if(type==='heat'){for(let i=0;i<3;i++){const p=point(110+Math.random()*300);hazards.push({type:'circle',kind:'heat',x:p.x,y:p.y,radius:52,warnUntil:now+1000,activeUntil:now+5200,damage:5,nextTick:0});}}
        else if(type==='core'){hazards.push(...spawnSectorHazardV33(Math.random()<.5?'heat':'rail'));return hazards;}
        state.sectorHazardsV33.push(...hazards);state.sectorStatsV33.hazardsTriggered++;return hazards;
      }
      function applyHazardDamageV33(h,now) {
        if(now<h.warnUntil||now>h.activeUntil||now<(h.nextTick||0))return;
        h.nextTick=now+(h.kind==='heat'?500:700);let inside=false;
        if(h.type==='circle')inside=Math.hypot(state.mecha.x-h.x,state.mecha.y-h.y)<h.radius+16;
        else inside=Math.abs((h.vertical?state.mecha.x:state.mecha.y)-h.pos)<h.width*.5;
        if(inside)applyMechaDamage(h.damage,h.x||state.mecha.x,h.y||state.mecha.y,performance.now(),1);
        for(const e of state.enemies){if(e.hp<=0)continue;let hit=false;if(h.type==='circle')hit=Math.hypot(e.x-h.x,e.y-h.y)<h.radius+e.radius;else hit=Math.abs((h.vertical?e.x:e.y)-h.pos)<h.width*.5+e.radius;if(hit)damageEnemy(e,h.kind==='heat'?10:45,performance.now());}
      }
      function drawSectorObjectsV33(timestamp=performance.now()) {
        const now=state.playTime||0;
        for(let i=state.sectorPoisV33.length-1;i>=0;i--){const p=state.sectorPoisV33[i];if(p.expiresAt&&now>p.expiresAt&&!p.collected){state.sectorPoisV33.splice(i,1);continue;}if(!p.collected&&Math.hypot(state.mecha.x-p.x,state.mecha.y-p.y)<44)collectPoiV33(p);if(p.collected){state.sectorPoisV33.splice(i,1);continue;}const d=POI_DEFS_V33[p.type];ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#171b1e';ctx.strokeStyle=d.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,18,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=d.color;ctx.font='bold 16px ui-monospace,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(d.icon,0,1);ctx.strokeStyle=d.color;ctx.lineWidth=1;ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(0,0,25+Math.sin(now*.006)*3,0,Math.PI*2);ctx.stroke();ctx.restore();}
        for(let i=state.sectorDropsV33.length-1;i>=0;i--){const d=state.sectorDropsV33[i];d.life-=Math.max(0,state.lastFrameTime?16:0);const dist=Math.hypot(state.mecha.x-d.x,state.mecha.y-d.y);if(dist<130){const a=Math.atan2(state.mecha.y-d.y,state.mecha.x-d.x);d.x+=Math.cos(a)*Math.max(2,8*(1-dist/130));d.y+=Math.sin(a)*Math.max(2,8*(1-dist/130));}if(dist<25){addScrapV33(d.value);showPoiToastV33(`RESTOS RECUPERADOS · +${d.value}`);state.sectorDropsV33.splice(i,1);continue;}if(d.life<=0){state.sectorDropsV33.splice(i,1);continue;}ctx.fillStyle='#bf8b4d';ctx.strokeStyle='#2c241c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(d.x,d.y-7);ctx.lineTo(d.x+7,d.y);ctx.lineTo(d.x,d.y+7);ctx.lineTo(d.x-7,d.y);ctx.closePath();ctx.fill();ctx.stroke();}
        for(let i=state.sectorHazardsV33.length-1;i>=0;i--){const h=state.sectorHazardsV33[i];if(now>h.activeUntil){state.sectorHazardsV33.splice(i,1);continue;}applyHazardDamageV33(h,now);const active=now>=h.warnUntil;ctx.save();ctx.globalAlpha=active?.48:.28;ctx.fillStyle=h.kind==='rail'?'#b6d0d2':h.kind==='heat'?'#b95a36':'#c07842';ctx.strokeStyle=active?'#f1c18d':'#d49b68';ctx.lineWidth=active?4:2;ctx.setLineDash(active?[]:[10,8]);if(h.type==='circle'){ctx.beginPath();ctx.arc(h.x,h.y,h.radius,0,Math.PI*2);ctx.fill();ctx.stroke();}else{const ws=getCurrentWorldSize();if(h.vertical){ctx.fillRect(h.pos-h.width/2,0,h.width,ws);ctx.strokeRect(h.pos-h.width/2,0,h.width,ws);}else{ctx.fillRect(0,h.pos-h.width/2,ws,h.width);ctx.strokeRect(0,h.pos-h.width/2,ws,h.width);}}ctx.restore();}
      }
      function maybeSpawnSectorHazardV33() {
        const def=getSectorDefV33();if(!def.hazard||state.testMode)return;const now=state.playTime||0;if(now<(state.nextSectorHazardAtV33||Infinity))return;if(state.fieldShopOpenV32||state.paused)return;spawnSectorHazardV33();state.nextSectorHazardAtV33=now+def.hazardInterval;
      }
      function getTemporaryFireRateMultV33() {
        let mult=1;if(state.sectorEventV33?.id==='overdrive')mult*=1.2;if((state.overclockUntilV33||0)>(state.playTime||0))mult*=1.15;return mult;
      }
      function startSectorEventV33(id=null) {
        if(state.sectorEventV33||state.bossEncounterV31?.active||state.phase!=='playing')return false;
        const ids=Object.keys(EVENT_DEFS_V33).filter(x=>x!==state.lastSectorEventIdV33);const selected=id&&EVENT_DEFS_V33[id]?id:ids[Math.floor(Math.random()*ids.length)];const def=EVENT_DEFS_V33[selected];
        state.sectorEventV33={id:selected,startedAt:state.playTime||0,endsAt:(state.playTime||0)+def.duration,targetsRemaining:0};state.lastSectorEventIdV33=selected;
        if(selected==='salvage_rain')spawnScrapDropsV33(12);
        else if(selected==='elite_patrol'){const types=['saw_raider','scrap_gunner','mine_junker','scrap_hound'];for(let i=0;i<4;i++){const e=safeSpawnAroundPlayerV31(types[i],430+i*55,{elite:i===0});e.eventTagV33=selected;}state.sectorEventV33.targetsRemaining=4;}
        else if(selected==='repair_signal'){const a=Math.random()*Math.PI*2,d=380;state.sectorPoisV33.push(createPoiV33('repair',state.mecha.x+Math.cos(a)*d,state.mecha.y+Math.sin(a)*d,{eventId:selected,expiresAt:state.sectorEventV33.endsAt}));}
        showEncounterNoticeV31(`EVENTO · ${def.title}`,2100);updateSectorHudV33();return true;
      }
      function completeSectorEventV33(success=true) {
        const event=state.sectorEventV33;if(!event)return false;const def=EVENT_DEFS_V33[event.id];
        if(success){state.sectorStatsV33.eventsCompleted++;progressionV3.statistics.eventsCompleted=(progressionV3.statistics.eventsCompleted||0)+1;addScrapV33(20+state.sector*4);progressionV3.cores=(progressionV3.cores||0)+6;saveProgressionV3();updateMissionTrackingHudV32();showEncounterNoticeV31(`EVENTO COMPLETADO · ${def.title}`,1800);}else{state.sectorStatsV33.eventsFailed++;showEncounterNoticeV31(`EVENTO PERDIDO · ${def.title}`,1500);}
        state.sectorEventV33=null;state.nextSectorEventAtV33=(state.playTime||0)+48000;updateSectorHudV33();return success;
      }
      function handleEventEnemyKilledV33(enemy) {
        if(!enemy?.eventTagV33||state.sectorEventV33?.id!==enemy.eventTagV33)return;
        state.sectorEventV33.targetsRemaining=Math.max(0,(state.sectorEventV33.targetsRemaining||0)-1);if(state.sectorEventV33.targetsRemaining<=0)completeSectorEventV33(true);
      }
      function updateDynamicEventsV33() {
        if(state.testMode||state.phase!=='playing')return;const now=state.playTime||0;const event=state.sectorEventV33;
        if(event){const def=EVENT_DEFS_V33[event.id];if(now>=event.endsAt){if(def.mode==='timer')completeSectorEventV33(true);else completeSectorEventV33(false);}return;}
        if(now>=(state.nextSectorEventAtV33||35000)&&!state.bossEncounterV31?.active&&!state.fieldShopOpenV32)startSectorEventV33();
      }
      function getDirectorSquadsV33(sector=state.sector) {
        const squads=[{id:'pack',types:['scrap_hound','scrap_hound','scrap_hound'],cost:3},{id:'breach',types:['saw_raider','scrap_hound'],cost:3},{id:'fireteam',types:['scrap_gunner','scrap_hound','scrap_hound'],cost:4}];
        if(sector>=2)squads.push({id:'mine_screen',types:['mine_junker','scrap_hound','scrap_hound'],cost:5});if(sector>=4)squads.push({id:'assault',types:['saw_raider','scrap_gunner','mine_junker'],cost:7});return squads;
      }
      function spawnSquadV33(squad=null,eliteChance=0) {
        const candidates=getDirectorSquadsV33();const selected=squad||candidates[Math.floor(Math.random()*candidates.length)];const baseAngle=Math.random()*Math.PI*2;selected.types.forEach((type,i)=>{const dist=520+Math.random()*300;const angle=baseAngle+(i-(selected.types.length-1)/2)*.16;const worldSize=getCurrentWorldSize();spawnEnemyAt(state.mecha.x+Math.cos(angle)*dist,state.mecha.y+Math.sin(angle)*dist,worldSize,type,{elite:i===0&&Math.random()<eliteChance});});state.threatDirectorV33.squadCount++;return selected;
      }
      function updateThreatDirectorV33(timestamp,timeFactor) {
        if(state.testMode&&(!state.testSpawnEnemies||state.devContinuousSpawn===false))return;
        if(!state.encounterMilestonesV31.miniboss&&state.playTime>=270000){state.encounterMilestonesV31.miniboss=true;spawnMinibossV31();return;}
        if(!state.encounterMilestonesV31.boss&&state.playTime>=720000&&!state.enemies.some(e=>e.isMinibossV31)){state.encounterMilestonesV31.boss=true;spawnBossV31();return;}
        if(state.enemies.some(e=>e.isBossV31))return;
        const d=state.threatDirectorV33;const dt=d.lastTick?Math.min(1000,timestamp-d.lastTick):16;d.lastTick=timestamp;
        const hpRatio=Math.max(0,state.mecha.hp/Math.max(1,state.mecha.maxHp));const regular=state.enemies.filter(e=>!e.isDummy&&!e.isMinibossV31&&!e.isBossV31).length;
        let cap=state.enemies.some(e=>e.isMinibossV31)?5:Math.min(26,9+state.sector*3);if(hpRatio<.35)cap=Math.max(6,Math.floor(cap*.72));
        const eventMult=state.sectorEventV33?.id==='overdrive'?1.35:1;const suppression=(state.directorSuppressedUntilV33||0)>(state.playTime||0)?.62:1;
        const healthAdapt=hpRatio<.35?.68:hpRatio>.78?1.12:1;d.pressure=cap?regular/cap:0;d.intensity=Math.max(.45,Math.min(2.25,(.68+state.sector*.16+(state.playTime||0)/360000)*eventMult*suppression*healthAdapt));
        d.budget=Math.min(18,(d.budget||0)+(dt/1000)*(1.05+d.intensity*1.35));updateSectorHudV33();
        if(regular===0){const sq=spawnSquadV33(null,0);d.budget=Math.max(0,d.budget-sq.cost);d.lastSpawnAt=timestamp;return;}
        if(regular>=cap)return;let interval=Math.max(560,1900/Math.max(.42,timeFactor*d.intensity));if(hpRatio<.35)interval*=1.35;
        if(timestamp-(d.lastSpawnAt||0)<interval)return;const available=getDirectorSquadsV33().filter(s=>s.cost<=d.budget+1.5);if(!available.length)return;
        d.lastSpawnAt=timestamp;const selected=available[Math.floor(Math.random()*available.length)];const eliteChance=state.playTime>70000?Math.min(.22,.025+state.sector*.025)*healthAdapt:0;spawnSquadV33(selected,eliteChance);d.budget=Math.max(0,d.budget-selected.cost);
      }
      //#endregion sectors_v330



       function triggerSplashExplosion(x, y, radius, damage) {
         for (let p = 0; p < 15; p++) {
           const angle = Math.random() * Math.PI * 2;
           const dist = Math.random() * radius;
           state.particles.push({
             x: x + Math.cos(angle) * dist,
             y: y + Math.sin(angle) * dist,
             vx: (Math.random() - 0.5) * 3,
             vy: (Math.random() - 0.5) * 3,
             life: 20,
             color: '#ffaa00'
           });
         }

         if (state.passives.includes('p-fire-zone')) {
           const lvl = state.passiveLevels['p-fire-zone'] || 1;
           state.fireZones.push({
             x: x,
             y: y,
             radius: radius * 0.8,
             damage: Math.round(damage * 0.15 * lvl),
             life: 180,
             maxLife: 180
           });
         }

         for (let k = state.enemies.length - 1; k >= 0; k--) {
           const other = state.enemies[k];
           if (other.hp <= 0) continue;
           const dist = Math.hypot(other.x - x, other.y - y);
           if (dist < radius) {
             const splashDmg = Math.round(damage * (1 - dist / radius));
             if (splashDmg > 0) {
               damageEnemy(other, splashDmg, performance.now());
               state.damageNumbers.push({
                 x: other.x,
                 y: other.y - 10,
                 text: splashDmg.toString(),
                 life: 30,
                 vx: (Math.random() - 0.5) * 2,
                 vy: -1.5 - Math.random()
               });
             }
           }
         }
       }

       function getXpForEnemyType(type) {
         return ENEMY_DEFS_V31[type]?.xp || ({scout:15,heavy:25,square:20,purple_arrow:30}[type] || 15);
       }
       function updateXpUI() {
         const pct = Math.min(100, (state.xp / state.xpNeeded) * 100);
         if (dom.xpProgressBar && pct !== hudCache.xpPct) { hudCache.xpPct = pct; dom.xpProgressBar.style.width = `${pct}%`; }
         if (dom.hudLevel && state.level !== hudCache.level) { hudCache.level = state.level; dom.hudLevel.textContent = state.level; }
         const xpText = `${state.xp}/${state.xpNeeded}`;
         if (dom.hudXpText && xpText !== hudCache.xpText) { hudCache.xpText = xpText; dom.hudXpText.textContent = xpText; }
       }

       function killEnemy(e, index) {
         const noReward = !!e.noRewardV331;
         if (!noReward) {
           const scoreReward=e.scoreRewardV31||100;
           state.score += scoreReward;
           const scrapRewardV32 = e.scrapRewardV31 || 2;
           state.scrap = (state.scrap||0) + scrapRewardV32;
           recordEnemyDefeatV32(e, scrapRewardV32);
           state.sectorEnemiesDefeated++;
           state.totalEnemiesDefeated = (state.totalEnemiesDefeated || 0) + 1;
           spawnEnergyOrbsV331(e);
           maybeDropRareConsumableV331(e);
           const hudScore=document.getElementById('hud-score'); if(hudScore) hudScore.textContent=state.score;

           if (state.passives.includes('p-kill-cooldown')) {
             const reduction=(state.passiveLevels['p-kill-cooldown']||1)*220;
             if(state.lastWeaponFireTimes) for(const k in state.lastWeaponFireTimes) state.lastWeaponFireTimes[k]=Math.max(0,state.lastWeaponFireTimes[k]-reduction);
           }
           if(state.passives.includes('p-explode')) triggerSplashExplosion(e.x,e.y,80,30);

           if(e.isEliteV31){state.eliteKillsV31++;}
           if(e.isMinibossV31){state.minibossKillsV31++; awardEvolutionCoreV302('drill_bastion'); if((progressionV3.statistics.minibossKills||0)%3===0) progressionV3.cores=(progressionV3.cores||0)+15; state.bossEncounterV31={active:false,id:null,type:null,name:'',phase:0};}
           if(e.isBossV31){state.bossKillsV31++; awardEvolutionCoreV302('forge_titan'); progressionV3.cores=(progressionV3.cores||0)+40; state.bossEncounterV31={active:false,id:null,type:null,name:'',phase:0}; progressionV3.missions=progressionV3.missions||{}; progressionV3.missions['boss-forge-titan']={completed:true,completedAt:Date.now()};}
           if(e.isEliteV31||e.isMinibossV31||e.isBossV31) saveProgressionV3();
         }

         if (e.type === 'heavy' && e.faction !== 'scrappers') {
           explodeHeavyEnemy(e, index);
           return;
         }
         handleEventEnemyKilledV33(e);
         const particleCount=e.isBossV31?90:e.isMinibossV31?55:e.isEliteV31?28:14;
         for(let p=0;p<particleCount;p++) state.particles.push({x:e.x,y:e.y,vx:(Math.random()-.5)*(e.isBossV31?14:8),vy:(Math.random()-.5)*(e.isBossV31?14:8),life:e.isBossV31?48:28,color:e.color||'#ffaa00'});
         state.enemies.splice(index,1);
         updateBossHudV31();
       }

       function applyElementalStatus(enemy) {
         if (!state.passives.includes('p-elemental')) return;
         const lvl = state.passiveLevels['p-elemental'] || 1;
         const r = Math.random();
         if (r < 0.33) {
           enemy.slowedUntil = performance.now() + 3000;
         } else if (r < 0.66) {
           enemy.burnTicks = (enemy.burnTicks || 0) + 3 * lvl;
         } else {
           enemy.stunnedUntil = performance.now() + 1000;
         }
       }

        function explodeHeavyEnemy(e, index) {
         const explosionRadius = 120;

         // Damage player
         const pDist = Math.hypot(state.mecha.x - e.x, state.mecha.y - e.y);
         if (pDist < explosionRadius) {
            const isShieldBubbleActive = state.mecha.shieldActiveUntil && performance.now() < state.mecha.shieldActiveUntil;
            if (!isShieldBubbleActive && !state.devInvulnerable) {
              const dmg = Math.round(40 * (1 - pDist / explosionRadius));
              applyMechaDamage(dmg, e.x, e.y, performance.now(), 1);
            }
         }

         // Damage nearby enemies (friendly fire / chain reaction)
         for (let k = 0; k < state.enemies.length; k++) {
           const other = state.enemies[k];
           if (other.id === e.id || other.hp <= 0) continue;
           const eDist = Math.hypot(other.x - e.x, other.y - e.y);
           if (eDist < explosionRadius) {
             // Deal massive damage
             const enemyDmg = Math.round(150 * (1 - eDist / explosionRadius));
             damageEnemy(other, enemyDmg, performance.now());

             // Spawn floating damage number
             state.damageNumbers.push({
               x: other.x,
               y: other.y - 10,
               text: enemyDmg.toString(),
               life: 30,
               vx: (Math.random() - 0.5) * 2,
               vy: -1.5 - Math.random()
             });

             // Particle FX on impact
             for (let p = 0; p < 4; p++) {
               state.particles.push({
                 x: other.x, y: other.y,
                 vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
                 life: 15, color: '#ffaa00'
               });
             }
           }
         }

         // Explosion Particles
         for (let p = 0; p < 20; p++) {
           state.particles.push({
             x: e.x, y: e.y,
             vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
             life: 30, color: '#ffaa00'
           });
           state.particles.push({
             x: e.x, y: e.y,
             vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
             life: 20, color: '#ffffff'
           });
         }

         playSound('hit');

         // Remove from enemies
         state.enemies.splice(index, 1);

         // Check player death
         if (state.mecha.hp <= 0) {
           beginDeathSequenceV331(e.x, e.y, performance.now());
         }
       }





      function loop(timestamp) {
         if (state.phase !== 'playing' || state.paused || (dom.orientationWarning && dom.orientationWarning.style.display === 'flex')) {
           state.lastFrameTime = 0;
           rafId = requestAnimationFrame(loop);
           return;
        }

        if (!state.lastFrameTime) {
          state.lastFrameTime = timestamp;
        }
        const dt = Math.min(100, timestamp - state.lastFrameTime);
        state.lastFrameTime = timestamp;
        state.playTime = (state.playTime || 0) + dt;
        ensureV331State();
        updateDeathSequenceV331(timestamp, dt);
        updateSectorProgressionV33(timestamp);
        updateDynamicEventsV33();
        maybeSpawnSectorHazardV33();

        if (state.devInfHp) state.mecha.hp = state.mecha.maxHp;
        if (state.devInfShield) state.mecha.shield = state.mecha.maxShield;

        // Update Timer HUD only when the displayed second changes.
        const totalSeconds = Math.floor(state.playTime / 1000);
        if (dom.hudTimer && (totalSeconds !== hudCache.timerSecond || state.isDevPlay)) {
          hudCache.timerSecond = totalSeconds;
          if (state.isDevPlay) {
            if (dom.hudTimer.textContent) dom.hudTimer.textContent = '';
          } else {
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            dom.hudTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          }
        }
        updateHudCooldowns(timestamp);
        updateEconomyHudV32();
        progressionV3.statistics.bestSurvivalMs = Math.max(progressionV3.statistics.bestSurvivalMs || 0, state.playTime || 0);
        updateMissionTrackingHudV32();
        maybeOpenFieldShopV32();

        const timeFactor = Math.min(3.0, 0.3 + (state.playTime / 60000) * 0.7);
        const simulationSpeed = state.devSpeedUp ? 2.0 : (state.devSlowMo ? 0.3 : 1.0);

        // Resize Canvas dynamically
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
          canvas.width = canvas.clientWidth;
          canvas.height = canvas.clientHeight;
          if (!state.started || (state.mecha.x === 0 && state.mecha.y === 0)) {
            state.mecha.x = 1500;
            state.mecha.y = 1500;
          }
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Camera Follow with cached settings.
        ctx.save();
        const cameraZoom = getActiveCameraZoom();
        ctx.scale(cameraZoom, cameraZoom);
        const halfW = (canvas.width / cameraZoom) / 2;
        const halfH = (canvas.height / cameraZoom) / 2;
        state.cameraViewV331 = { halfW, halfH, zoom: cameraZoom };
        const cameraX = halfW - state.mecha.x;
        const cameraY = halfH - state.mecha.y;
        ctx.translate(cameraX, cameraY);

        const worldSize = getCurrentWorldSize();
        ensureTestEnvironment(timestamp);
        const viewLeft = Math.max(0, state.mecha.x - halfW - GRID_SIZE);
        const viewRight = Math.min(worldSize, state.mecha.x + halfW + GRID_SIZE);
        const viewTop = Math.max(0, state.mecha.y - halfH - GRID_SIZE);
        const viewBottom = Math.min(worldSize, state.mecha.y + halfH + GRID_SIZE);

        drawSectorBackdropV33(viewLeft,viewRight,viewTop,viewBottom,worldSize);

        // Draw only visible grid lines in one path instead of redrawing the full world.
        ctx.strokeStyle = getSectorDefV33().grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = Math.floor(viewLeft / GRID_SIZE) * GRID_SIZE; x <= viewRight; x += GRID_SIZE) {
          ctx.moveTo(x, viewTop);
          ctx.lineTo(x, viewBottom);
        }
        for (let y = Math.floor(viewTop / GRID_SIZE) * GRID_SIZE; y <= viewBottom; y += GRID_SIZE) {
          ctx.moveTo(viewLeft, y);
          ctx.lineTo(viewRight, y);
        }
        ctx.stroke();

        const boundaryAccentV333=getSectorDefV33().accent;
        ctx.save();
        ctx.strokeStyle='rgba(4,7,9,.92)';ctx.lineWidth=34;ctx.strokeRect(0,0,worldSize,worldSize);
        ctx.strokeStyle=boundaryAccentV333;ctx.lineWidth=8;ctx.strokeRect(17,17,worldSize-34,worldSize-34);
        ctx.setLineDash([30,18]);ctx.strokeStyle='rgba(224,176,85,.58)';ctx.lineWidth=4;ctx.strokeRect(29,29,worldSize-58,worldSize-58);ctx.setLineDash([]);
        const postStepV333=180;
        ctx.fillStyle='rgba(23,29,32,.96)';ctx.strokeStyle='rgba(189,151,83,.78)';ctx.lineWidth=3;
        for(let bx=42;bx<worldSize-42;bx+=postStepV333){ctx.fillRect(bx-9,11,18,38);ctx.strokeRect(bx-9,11,18,38);ctx.fillRect(bx-9,worldSize-49,18,38);ctx.strokeRect(bx-9,worldSize-49,18,38);}
        for(let by=42;by<worldSize-42;by+=postStepV333){ctx.fillRect(11,by-9,38,18);ctx.strokeRect(11,by-9,38,18);ctx.fillRect(worldSize-49,by-9,38,18);ctx.strokeRect(worldSize-49,by-9,38,18);}
        ctx.restore();

        // Build one ID index and find the closest visible enemy using squared distance.
        let nearestEnemy = null;
        let minDistSq = Infinity;
        const enemyById = new Map();
        for (let i = 0; i < state.enemies.length; i++) {
          const enemy = state.enemies[i];
          if (enemy.hp <= 0) continue;
          enemyById.set(enemy.id, enemy);
          const dx = enemy.x - state.mecha.x;
          const dy = enemy.y - state.mecha.y;
          if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) {
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
              minDistSq = distSq;
              nearestEnemy = enemy;
            }
          }
        }

        if (state.manualAimV340) {
          state.mecha.angle = Number.isFinite(state.manualAimAngleV340) ? state.manualAimAngleV340 : state.mecha.angle;
        } else if (nearestEnemy && minDistSq <= 384400) {
          const targetAngle = Math.atan2(nearestEnemy.y - state.mecha.y, nearestEnemy.x - state.mecha.x);
          let angleDiff = targetAngle - state.mecha.angle;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          state.mecha.angle += angleDiff * 0.15;
        } else if (state.moveJoystick.active && Math.hypot(state.moveJoystick.x,state.moveJoystick.y) > 0.12) {
          state.mecha.angle = Math.atan2(state.moveJoystick.y,state.moveJoystick.x);
        }

        // Update Mecha Movement from Move Joystick across open world
        let speed = (4.65 + (state.mecha.stability / 100) * 1.75) * state.stats.speedMult;
        if (state.mecha.reactorOverloadUntil && timestamp < state.mecha.reactorOverloadUntil) {
          speed *= 1.5;
        }
        if (state.devSlowMo) speed *= 0.3;
        if (state.devSpeedUp) speed *= 2.0;

        if (state.moveJoystick.active) {
          state.mecha.x += state.moveJoystick.x * speed;
          state.mecha.y += state.moveJoystick.y * speed;
          state.mecha.x = Math.max(50, Math.min(worldSize - 50, state.mecha.x));
          state.mecha.y = Math.max(50, Math.min(worldSize - 50, state.mecha.y));
        }

        drawSectorObjectsV33(timestamp);
        updateRareConsumablesV331(timestamp);
        spawnPlayerTrailV331(timestamp);

        // Update only the primary weapon magazine. Secondary weapons and powers keep running while it reloads.
        updatePrimaryReloadV301(timestamp);
        updateRotarySpinV302(dt, !!nearestEnemy);
        updateFlamethrowerBurstV302(timestamp, nearestEnemy);

         // Automated weapon firing
          if (nearestEnemy) {
           if (!state.lastWeaponFireTimes) {
             state.lastWeaponFireTimes = {};
           }
           state.activeWeapons.forEach(weaponId => {
             if (weaponId === 'w-plasma' && !state.isFiring) {
               return;
             }
             let { damage, cooldown } = getWeaponStats(weaponId, state.weaponLevels[weaponId] || 1);

             if (state.devNoCooldown) {
               cooldown = 0;
             } else {
               // Apply passive cooldown reduction
               if (state.passives.includes('p-cooldown')) {
                 const passiveLvl = state.passiveLevels['p-cooldown'] || 1;
                 cooldown *= Math.pow(0.8, passiveLvl);
               }

               // Apply reactor overload cooldown reduction
               if (state.mecha.reactorOverloadUntil && timestamp < state.mecha.reactorOverloadUntil) {
                 cooldown *= 0.5;
               }

               // Apply fire rate multiplier
               if (state.stats.fireRateMult) {
                 cooldown /= state.stats.fireRateMult;
               }
               cooldown /= getTemporaryFireRateMultV33();
             }
             if (weaponId === 'w-rotarycannon') {
               const spin = getWeaponRuntimeV302('w-rotarycannon').spin || 0;
               cooldown = Math.max(105, cooldown * (1 - spin * 0.72));
             }

             const storedLastFire = state.lastWeaponFireTimes[weaponId];
             const lastFire = Number.isFinite(storedLastFire) ? storedLastFire : (timestamp - cooldown);
             if (timestamp - lastFire >= cooldown) {
               // Synergy weapons firing
               if (weaponId.startsWith('syn-')) {
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 const aimAngle = nearestEnemy ? Math.atan2(nearestEnemy.y - state.mecha.y, nearestEnemy.x - state.mecha.x) : state.mecha.angle;

                 if (weaponId === 'syn-cyclonic') {
                   const runtime = getWeaponRuntimeV302('syn-cyclonic');
                   runtime.shots = (runtime.shots || 0) + 1;
                   const angle = aimAngle + (Math.random() - 0.5) * 0.12;
                   state.bullets.push({
                     x: state.mecha.x + Math.cos(angle) * 20,
                     y: state.mecha.y + Math.sin(angle) * 20,
                     vx: Math.cos(angle) * 17,
                     vy: Math.sin(angle) * 17,
                     damage: Math.round(damage * state.stats.dpsMult),
                     type: 'machinegun', radius: 4, color: '#8be9e3',
                     bonusPierceHits: 3, forcedBounces: 2, bounces: 0, pierces: 0, hitEnemies: []
                   });
                   if (runtime.shots % 8 === 0) {
                     state.shockwaves.push({ x:state.mecha.x, y:state.mecha.y, radius:10, maxRadius:115, damage:Math.round(damage*1.6), life:16, maxLife:16, color:'#8be9e3', pushBack:true, hitEnemies:[] });
                   }
                 } else if (weaponId === 'syn-napalm') {
                   state.bullets.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     vx: Math.cos(aimAngle) * 8,
                     vy: Math.sin(aimAngle) * 8,
                     damage: damage,
                     type: 'missile',
                     radius: 8,
                     color: '#f97316',
                     isNapalm: true,
                     bounces: 0,
                     pierces: 0,
                     hitEnemies: []
                   });
                 } else if (weaponId === 'syn-vulcan') {
                   for (let i = 0; i < 3; i++) {
                     const angle = aimAngle + (Math.random() - 0.5) * 0.2;
                     state.bullets.push({
                       x: state.mecha.x,
                       y: state.mecha.y,
                       vx: Math.cos(angle) * 16,
                       vy: Math.sin(angle) * 16,
                       damage: damage,
                       type: 'machinegun',
                       radius: 4,
                       color: '#38bdf8',
                       bounces: 0,
                       pierces: 1,
                       hitEnemies: []
                     });
                   }
                 } else if (weaponId === 'syn-prisma') {
                   state.bullets.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     vx: Math.cos(aimAngle) * 20,
                     vy: Math.sin(aimAngle) * 20,
                     damage: damage,
                     type: 'laser',
                     radius: 6,
                     color: '#a855f7',
                     bounces: 3,
                     pierces: 99,
                     hitEnemies: []
                   });
                 } else if (weaponId === 'syn-tesla') {
                   for (let s = -3; s <= 3; s++) {
                     const angle = aimAngle + s * 0.15;
                     state.bullets.push({
                       x: state.mecha.x,
                       y: state.mecha.y,
                       vx: Math.cos(angle) * 12,
                       vy: Math.sin(angle) * 12,
                       damage: damage,
                       type: 'shotgun',
                       radius: 5,
                       color: '#00ffcc',
                       isTesla: true,
                       bounces: 0,
                       pierces: 0,
                       hitEnemies: []
                     });
                   }
                 } else if (weaponId === 'syn-fantasma') {
                   state.spectralCopies.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     life: 300
                   });
                 } else if (weaponId === 'syn-singularidad') {
                   state.bullets.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     vx: Math.cos(aimAngle) * 10,
                     vy: Math.sin(aimAngle) * 10,
                     damage: damage,
                     type: 'energycannon',
                     radius: 15,
                     color: '#a855f7',
                     isSingularidad: true,
                     bounces: 0,
                     pierces: 0,
                     hitEnemies: []
                   });
                 } else if (weaponId === 'syn-eclipse') {
                   state.bullets.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     vx: Math.cos(aimAngle) * 25,
                     vy: Math.sin(aimAngle) * 25,
                     damage: damage * 2,
                     type: 'sniper',
                     radius: 6,
                     color: '#f43f5e',
                     bounces: 0,
                     pierces: 99,
                     hitEnemies: []
                   });
                 } else if (weaponId === 'syn-portamisiles') {
                   state.bullets.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     vx: Math.cos(aimAngle) * 9,
                     vy: Math.sin(aimAngle) * 9,
                     damage: damage,
                     type: 'missile',
                     radius: 6,
                     color: '#ef4444',
                     bounces: 0,
                     pierces: 0,
                     hitEnemies: []
                   });
                 } else if (weaponId === 'syn-centinela') {
                   state.turrets.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     damage: damage,
                     fireCooldown: 200,
                     lastFireTime: 0,
                     life: 800,
                     maxLife: 800,
                     isCentinela: true
                   });
                 } else if (weaponId === 'syn-biotoxico') {
                   state.mines.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     damage: damage,
                     radius: 50,
                     color: '#22c55e',
                     isBiotoxico: true
                   });
                 } else if (weaponId === 'syn-criogenico') {
                   state.bullets.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     vx: Math.cos(aimAngle) * 22,
                     vy: Math.sin(aimAngle) * 22,
                     damage: damage,
                     type: 'railgun',
                     radius: 5,
                     color: '#38bdf8',
                     isCriogenico: true,
                     bounces: 0,
                     pierces: 99,
                     hitEnemies: []
                   });
                 } else if (weaponId === 'syn-arco-plasma') {
                   state.bullets.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     vx: Math.cos(aimAngle) * 11,
                     vy: Math.sin(aimAngle) * 11,
                     damage: damage,
                     type: 'plasma',
                     radius: 10,
                     color: '#00ffcc',
                     isArcoPlasma: true,
                     bounces: 0,
                     pierces: 0,
                     hitEnemies: []
                   });
                 } else if (weaponId === 'syn-represalia') {
                   state.mecha.shieldActiveUntil = timestamp + damage;
                   state.mecha.hasRepresalia = true;
                 } else if (weaponId === 'syn-nanoenjambre') {
                   state.mecha.hp = Math.min(state.mecha.maxHp, state.mecha.hp + damage * 2);
                   state.mecha.shield = Math.min(state.mecha.maxShield, state.mecha.shield + damage * 4);
                   updateStatsUI();
                 } else if (weaponId === 'syn-satelite') {
                   state.orbitalStrikes.push({
                     x: nearestEnemy ? nearestEnemy.x : state.mecha.x,
                     y: nearestEnemy ? nearestEnemy.y : state.mecha.y,
                     delay: 30,
                     radius: 100,
                     damage: damage
                   });
                 } else if (weaponId === 'syn-devorador') {
                   state.gravityFields.push({
                     damage: Math.round(damage * 0.2),
                     radius: 180,
                     life: 300,
                     maxLife: 300,
                     color: 'rgba(239, 68, 68, 0.2)'
                   });
                 } else if (weaponId === 'syn-relampago') {
                   state.slashes.push({
                     type: 'sword',
                     angle: aimAngle,
                     damage: Math.round(damage * state.stats.dpsMult),
                     life: 15,
                     maxLife: 15,
                     color: '#eab308',
                     isRelampago: true,
                     hitEnemies: []
                   });
                 } else if (weaponId === 'syn-incinerador') {
                   for (let f = 0; f < 5; f++) {
                     const angle = aimAngle + (Math.random() - 0.5) * 0.5;
                     state.bullets.push({
                       x: state.mecha.x + Math.cos(angle) * 20,
                       y: state.mecha.y + Math.sin(angle) * 20,
                       vx: Math.cos(angle) * (6 + Math.random() * 4),
                       vy: Math.sin(angle) * (6 + Math.random() * 4),
                       damage: Math.round(damage * state.stats.dpsMult),
                       type: 'flame',
                       radius: 8 + Math.random() * 8,
                       color: '#ef4444',
                       life: 40 + Math.random() * 20,
                       isIncinerador: true,
                       bounces: 0,
                       pierces: 99,
                       hitEnemies: []
                     });
                   }
                 } else if (weaponId === 'syn-ricochet') {
                   for (let s = -2; s <= 2; s++) {
                     const angle = aimAngle + s * 0.2;
                     state.bullets.push({
                       x: state.mecha.x,
                       y: state.mecha.y,
                       vx: Math.cos(angle) * 12,
                       vy: Math.sin(angle) * 12,
                       damage: damage,
                       type: 'shotgun',
                       radius: 5,
                       color: '#10b981',
                       bounces: 4,
                       pierces: 0,
                       hitEnemies: []
                     });
                   }
                 } else if (weaponId === 'syn-lanza-fotonica') {
                   state.slashes.push({
                     type: 'lance',
                     angle: aimAngle,
                     damage: damage,
                     life: 15,
                     maxLife: 15,
                     color: '#00ffcc',
                     hitEnemies: []
                   });
                 } else if (weaponId === 'syn-sismico') {
                   state.shockwaves.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     radius: 10,
                     maxRadius: 160,
                     damage: Math.round(damage * state.stats.dpsMult),
                     life: 25,
                     maxLife: 25,
                     color: '#f97316',
                     isSismico: true,
                     pushBack: true,
                     hitEnemies: []
                   });
                 } else if (weaponId === 'syn-dimensional') {
                   const moveDirX = Math.cos(aimAngle);
                   const moveDirY = Math.sin(aimAngle);
                   state.mecha.x = Math.max(50, Math.min(getCurrentWorldSize() - 50, state.mecha.x + moveDirX * 200));
                   state.mecha.y = Math.max(50, Math.min(getCurrentWorldSize() - 50, state.mecha.y + moveDirY * 200));
                   state.slashes.push({
                     type: 'sword',
                     angle: aimAngle,
                     damage: damage,
                     life: 10,
                     maxLife: 10,
                     color: '#a855f7',
                     hitEnemies: []
                   });
                 } else if (weaponId === 'syn-helios') {
                   for (let h = 0; h < 3; h++) {
                     const angle = aimAngle + h * (Math.PI * 2 / 3);
                     state.bullets.push({
                       x: state.mecha.x,
                       y: state.mecha.y,
                       vx: Math.cos(angle) * 14,
                       vy: Math.sin(angle) * 14,
                       damage: damage,
                       type: 'laser',
                       radius: 5,
                       color: '#eab308',
                       bounces: 0,
                       pierces: 99,
                       hitEnemies: []
                     });
                   }
                 } else if (weaponId === 'syn-apocalipsis') {
                   for (let a = 0; a < 5; a++) {
                     state.bullets.push({
                       x: state.mecha.x + (Math.random() - 0.5) * 100,
                       y: state.mecha.y + (Math.random() - 0.5) * 100,
                       vx: Math.cos(aimAngle + (Math.random() - 0.5) * 0.5) * 8,
                       vy: Math.sin(aimAngle + (Math.random() - 0.5) * 0.5) * 8,
                       damage: damage,
                       type: 'missile',
                       radius: 6,
                       color: '#ef4444',
                       bounces: 0,
                       pierces: 0,
                       hitEnemies: []
                     });
                   }
                 } else if (weaponId === 'syn-celestial') {
                   state.mecha.reactorOverloadUntil = timestamp + 5000;
                 } else if (weaponId === 'syn-nova') {
                   state.mecha.highBeamActiveUntil = timestamp + 3000;
                   state.mecha.highBeamDamage = damage * 2;
                   state.mecha.highBeamNextTickAt = timestamp;
                 } else if (weaponId === 'syn-dragon') {
                   state.summons.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     vx: 0, vy: 0,
                     damage: damage,
                     fireCooldown: 300,
                     lastFireTime: 0,
                     angle: aimAngle,
                     life: 1200
                   });
                 } else if (weaponId === 'syn-motor-vacio') {
                   state.gravityFields.push({
                     damage: Math.round(damage * 0.3),
                     radius: 200,
                     life: 400,
                     maxLife: 400,
                     color: 'rgba(168, 85, 247, 0.3)'
                   });
                 } else if (weaponId === 'syn-berserker') {
                   state.mecha.reactorOverloadUntil = timestamp + 8000;
                   state.mecha.shieldActiveUntil = timestamp + 8000;
                 }
                 playSound('laser');
                 return;
               }

               // Shield doesn't require enemies or ammo
               if (weaponId === 'w-shield') {
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 state.mecha.shieldActiveUntil = timestamp + damage;
                 // Spawn shield activation particles
                 for (let p = 0; p < 15; p++) {
                   const angle = Math.random() * Math.PI * 2;
                   const dist = 30 + Math.random() * 10;
                   state.particles.push({
                     x: state.mecha.x + Math.cos(angle) * dist,
                     y: state.mecha.y + Math.sin(angle) * dist,
                     vx: Math.cos(angle) * 2,
                     vy: Math.sin(angle) * 2,
                     life: 20,
                     color: '#00ffcc'
                   });
                 }
                 playSound('equip');
                 return;
               }

               // Repair drones don't require enemies or ammo
               if (weaponId === 'w-repairdrones') {
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 state.mecha.hp = Math.min(state.mecha.maxHp, state.mecha.hp + damage);
                 state.mecha.shield = Math.min(state.mecha.maxShield, state.mecha.shield + damage * 2);
                 updateStatsUI();
                 for (let p = 0; p < 10; p++) {
                   state.particles.push({
                     x: state.mecha.x + (Math.random() - 0.5) * 30,
                     y: state.mecha.y + (Math.random() - 0.5) * 30,
                     vx: (Math.random() - 0.5) * 2,
                     vy: -1 - Math.random(),
                     life: 20,
                     color: '#22c55e'
                   });
                 }
                 playSound('equip');
                 return;
               }

               // Reactor overload doesn't require enemies or ammo
               if (weaponId === 'w-reactor') {
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 state.mecha.reactorOverloadUntil = timestamp + damage;
                 playSound('equip');
                 return;
               }

               // Teleport doesn't require enemies or ammo
               if (weaponId === 'w-teleport') {
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 const moveDirX = state.moveJoystick.active ? state.moveJoystick.x : Math.cos(state.mecha.angle);
                 const moveDirY = state.moveJoystick.active ? state.moveJoystick.y : Math.sin(state.mecha.angle);
                 const dist = Math.hypot(moveDirX, moveDirY);
                 const dx = dist > 0 ? (moveDirX / dist) * 150 : 0;
                 const dy = dist > 0 ? (moveDirY / dist) * 150 : 0;

                 const hasDashWave = state.passives.includes('p-dash-wave');
                 const dashWaveLvl = state.passiveLevels['p-dash-wave'] || 1;
                 const maxRad = 80 * (hasDashWave ? (1.5 + dashWaveLvl * 0.5) : 1);
                 const dmg = damage * (hasDashWave ? (1.2 + dashWaveLvl * 0.3) : 1);

                 state.shockwaves.push({
                   x: state.mecha.x,
                   y: state.mecha.y,
                   radius: 10,
                    maxRadius: maxRad,
                    damage: dmg,
                   life: 15,
                   maxLife: 15,
                   color: '#a855f7',
                   pushBack: true,
                   hitEnemies: []
                 });

                 state.mecha.x = Math.max(50, Math.min(getCurrentWorldSize() - 50, state.mecha.x + dx));
                 state.mecha.y = Math.max(50, Math.min(getCurrentWorldSize() - 50, state.mecha.y + dy));

                 for (let p = 0; p < 12; p++) {
                   state.particles.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     vx: (Math.random() - 0.5) * 6,
                     vy: (Math.random() - 0.5) * 6,
                     life: 20,
                     color: '#c084fc'
                   });
                 }
                 playSound('equip');
                 return;
               }

               // Dash doesn't require enemies or ammo
               if (weaponId === 'w-dash') {
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 const moveDirX = state.moveJoystick.active ? state.moveJoystick.x : Math.cos(state.mecha.angle);
                 const moveDirY = state.moveJoystick.active ? state.moveJoystick.y : Math.sin(state.mecha.angle);
                 const dist = Math.hypot(moveDirX, moveDirY);
                 const dx = dist > 0 ? (moveDirX / dist) * 120 : 0;
                 const dy = dist > 0 ? (moveDirY / dist) * 120 : 0;

                 state.mecha.x = Math.max(50, Math.min(getCurrentWorldSize() - 50, state.mecha.x + dx));
                 state.mecha.y = Math.max(50, Math.min(getCurrentWorldSize() - 50, state.mecha.y + dy));

                 const hasDashWave = state.passives.includes('p-dash-wave');
                 const dashWaveLvl = state.passiveLevels['p-dash-wave'] || 1;
                 const maxRad = 60 * (hasDashWave ? (1.5 + dashWaveLvl * 0.5) : 1);
                 const dmg = damage * (hasDashWave ? (1.2 + dashWaveLvl * 0.3) : 1);

                 state.shockwaves.push({
                   x: state.mecha.x,
                   y: state.mecha.y,
                   radius: 10,
                    maxRadius: maxRad,
                    damage: dmg,
                   life: 12,
                   maxLife: 12,
                   color: '#38bdf8',
                   pushBack: true,
                   hitEnemies: []
                 });
                 playSound('equip');
                 return;
               }

               // Deployable powers
               if (weaponId === 'w-turrets') {
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 state.turrets.push({
                   x: state.mecha.x,
                   y: state.mecha.y,
                   damage: damage,
                   fireCooldown: 600,
                   lastFireTime: 0,
                   life: 600,
                   maxLife: 600
                 });
                 playSound('equip');
                 return;
               }

               if (weaponId === 'w-mines') {
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 state.mines.push({
                   x: state.mecha.x,
                   y: state.mecha.y,
                   damage: damage,
                   radius: 40,
                   color: '#ef4444'
                 });
                 playSound('equip');
                 return;
               }

               if (weaponId === 'w-summons') {
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 state.summons.push({
                   x: state.mecha.x + (Math.random() - 0.5) * 50,
                   y: state.mecha.y + (Math.random() - 0.5) * 50,
                   vx: 0,
                   vy: 0,
                   damage: damage,
                   fireCooldown: 500,
                   lastFireTime: 0,
                   angle: state.mecha.angle,
                   life: 900
                 });
                 playSound('equip');
                 return;
               }

               if (weaponId === 'w-gravityfield') {
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 state.gravityFields.push({
                   damage: Math.round(damage * 0.1),
                   radius: 150,
                   life: 240,
                   maxLife: 240,
                   color: 'rgba(168, 85, 247, 0.15)',
                   nextDamageTickAt: timestamp
                 });
                 playSound('equip');
                 return;
               }

               if (weaponId === 'w-emp') {
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 state.enemies.forEach(e => {
                   if (e.hp <= 0) return;
                   damageEnemy(e, damage, timestamp);
                   e.stunnedUntil = timestamp + 3000;

                   state.damageNumbers.push({
                     x: e.x,
                     y: e.y - 10,
                     text: damage.toString(),
                     life: 30,
                     vx: (Math.random() - 0.5) * 2,
                     vy: -1.5 - Math.random()
                   });

                   for (let p = 0; p < 5; p++) {
                     state.particles.push({
                       x: e.x, y: e.y,
                       vx: (Math.random() - 0.5) * 5,
                       vy: (Math.random() - 0.5) * 5,
                       life: 15,
                       color: '#38bdf8'
                     });
                   }
                 });
                 state.empFlash = 10;
                 playSound('hit');
                 vibrate(100);
                 return;
               }

               if (weaponId === 'w-orbital') {
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 for (let o = 0; o < 3; o++) {
                   let tx = state.mecha.x + (Math.random() - 0.5) * 400;
                   let ty = state.mecha.y + (Math.random() - 0.5) * 400;
                   if (state.enemies.length > 0) {
                     const randomEnemy = state.enemies[Math.floor(Math.random() * state.enemies.length)];
                     if (randomEnemy && randomEnemy.hp > 0) {
                       tx = randomEnemy.x + (Math.random() - 0.5) * 30;
                       ty = randomEnemy.y + (Math.random() - 0.5) * 30;
                     }
                   }
                   state.orbitalStrikes.push({
                     x: tx,
                     y: ty,
                     delay: 45,
                     radius: 80,
                     damage: damage
                   });
                 }
                 playSound('hit');
                 return;
               }

               if (weaponId === 'w-highbeam') {
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 state.mecha.highBeamActiveUntil = timestamp + 2000;
                 state.mecha.highBeamDamage = damage;
                 state.mecha.highBeamNextTickAt = timestamp;
                 playSound('laser');
                 return;
               }

               if (weaponId === 'w-flamethrower') {
                 const isPrimaryFlame = weaponId === getPrimaryWeaponIdV301();
                 if (isPrimaryFlame && !consumePrimaryAmmoV301(timestamp)) return;
                 state.lastWeaponFireTimes[weaponId] = timestamp;
                 startFlamethrowerBurstV302(timestamp);
                 playSound('laser');
                 return;
               }

               // Offensive weapons fire if there is an enemy in range
               if ((nearestEnemy && minDistSq < 360000) || state.manualAimV340) {
                 const isPrimaryWeaponV301 = weaponId === getPrimaryWeaponIdV301();
                 if (PROJECTILE_WEAPONS.has(weaponId) && isPrimaryWeaponV301) {
                   if (!consumePrimaryAmmoV301(timestamp)) return;
                 }
                 const primaryShotModsV302 = getPrimaryShotModifiersV302(weaponId);
                 damage = Math.round(damage * primaryShotModsV302.damageMult);

                 state.lastWeaponFireTimes[weaponId] = timestamp;

                 const aimAngle = Math.atan2(nearestEnemy.y - state.mecha.y, nearestEnemy.x - state.mecha.x);

                 const extraProjLvl = state.passiveLevels['p-extra-projectile'] || 1;
                 const isMainWeapon = weaponId === state.activeWeapons[0];
                 const count = (isMainWeapon && state.passives.includes('p-extra-projectile')) ? (1 + extraProjLvl) : 1;

                 if (['w-machinegun', 'w-energycannon', 'w-laser', 'w-shotgun', 'w-missile', 'w-grenadelauncher', 'w-railgun', 'w-sniper', 'w-flamethrower', 'w-plasma',
        'w-rotarycannon', 'w-pistonshotgun'].includes(weaponId)) {
                   if (state.passives.includes('p-extra-missile')) {
                     state.shotCount = (state.shotCount || 0) + 1;
                     if (state.shotCount >= 5) {
                       state.shotCount = 0;
                       const lvl = state.passiveLevels['p-extra-missile'] || 1;
                       const mAngle = aimAngle + (Math.random() - 0.5) * 0.5;
                       state.bullets.push({
                         x: state.mecha.x,
                         y: state.mecha.y,
                         vx: Math.cos(mAngle) * 8,
                         vy: Math.sin(mAngle) * 8,
                         damage: 40 * lvl,
                         type: 'missile',
                         radius: 6,
                         color: '#ef4444',
                         bounces: 0,
                         pierces: 0,
                         bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         hitEnemies: []
                       });
                     }
                   }
                 }

                 for (let pIdx = 0; pIdx < count; pIdx++) {
                   let spreadAngle = aimAngle;
                   if (count > 1) {
                     const totalSpread = 0.4;
                     spreadAngle = aimAngle - (totalSpread / 2) + (pIdx / (count - 1)) * totalSpread;
                   }

                   if (weaponId === 'w-rotarycannon') {
                     const spin = getWeaponRuntimeV302('w-rotarycannon').spin || 0;
                     const angle = spreadAngle + (Math.random() - 0.5) * (0.035 + spin * 0.22);
                     state.bullets.push({
                       x: state.mecha.x + Math.cos(angle) * 20,
                       y: state.mecha.y + Math.sin(angle) * 20,
                       vx: Math.cos(angle) * 15,
                       vy: Math.sin(angle) * 15,
                       damage: Math.round(damage * state.stats.dpsMult),
                       type: 'machinegun', radius: 4, color: '#d6eef1',
                       bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                       bounces: 0, pierces: 0, bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         hitEnemies: []
                     });
                   } else if (weaponId === 'w-pistonshotgun') {
                     for (let pellet = -3; pellet <= 3; pellet++) {
                       const angle = spreadAngle + pellet * 0.105;
                       state.bullets.push({
                         x: state.mecha.x + Math.cos(angle) * 20,
                         y: state.mecha.y + Math.sin(angle) * 20,
                         vx: Math.cos(angle) * 13,
                         vy: Math.sin(angle) * 13,
                         damage: Math.round(damage * state.stats.dpsMult),
                         type: 'pistonshot', radius: 5, color: '#f2d39b', life: 34,
                         bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         bounces: 0, pierces: 0, bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         hitEnemies: []
                       });
                     }
                     state.mecha.x = Math.max(50, Math.min(getCurrentWorldSize()-50, state.mecha.x - Math.cos(spreadAngle) * 12));
                     state.mecha.y = Math.max(50, Math.min(getCurrentWorldSize()-50, state.mecha.y - Math.sin(spreadAngle) * 12));
                     vibrate(35);
                   } else if (weaponId === 'w-machinegun') {
                     const isEvolved = state.evolvedWeapons && state.evolvedWeapons.includes('w-machinegun');
                     const mCount = isEvolved ? 8 : 1;
                     for (let mIdx = 0; mIdx < mCount; mIdx++) {
                       const angle = isEvolved ? (spreadAngle + (mIdx * Math.PI / 4)) : spreadAngle;
                       state.bullets.push({
                         x: state.mecha.x + Math.cos(angle) * 20,
                         y: state.mecha.y + Math.sin(angle) * 20,
                         vx: Math.cos(angle) * 14,
                         vy: Math.sin(angle) * 14,
                         damage: Math.round(damage * state.stats.dpsMult),
                         type: 'machinegun',
                         radius: 4,
                         color: isEvolved ? '#facc15' : '#00ffcc',
                         bounces: 0,
                         pierces: 0,
                         bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         hitEnemies: []
                       });
                     }
                   } else if (weaponId === 'w-energycannon') {
                     state.bullets.push({
                       x: state.mecha.x + Math.cos(spreadAngle) * 20,
                       y: state.mecha.y + Math.sin(spreadAngle) * 20,
                       vx: Math.cos(spreadAngle) * 6,
                       vy: Math.sin(spreadAngle) * 6,
                       damage: Math.round(damage * state.stats.dpsMult),
                       type: 'energycannon',
                       radius: 12,
                       color: '#38bdf8',
                       bounces: 0,
                       pierces: 0,
                       bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         hitEnemies: []
                     });
                   } else if (weaponId === 'w-laser') {
                     const isEvolved = state.evolvedWeapons && state.evolvedWeapons.includes('w-laser');
                     state.bullets.push({
                       x: state.mecha.x + Math.cos(spreadAngle) * 20,
                       y: state.mecha.y + Math.sin(spreadAngle) * 20,
                       vx: Math.cos(spreadAngle) * 20,
                       vy: Math.sin(spreadAngle) * 20,
                       damage: Math.round(damage * state.stats.dpsMult * (isEvolved ? 2 : 1)),
                       type: 'laser',
                       radius: isEvolved ? 8 : 3,
                       color: isEvolved ? '#f43f5e' : '#ff3366',
                       bounces: 0,
                       pierces: isEvolved ? 99 : 0,
                       bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         hitEnemies: []
                     });
                   } else if (weaponId === 'w-shotgun') {
                     const spread = 0.25;
                     for (let s = -2; s <= 2; s++) {
                       const angle = spreadAngle + s * spread;
                       state.bullets.push({
                         x: state.mecha.x + Math.cos(angle) * 20,
                         y: state.mecha.y + Math.sin(angle) * 20,
                         vx: Math.cos(angle) * 12,
                         vy: Math.sin(angle) * 12,
                         damage: Math.round(damage * state.stats.dpsMult),
                         type: 'shotgun',
                         radius: 5,
                         color: '#ffaa00',
                         bounces: 0,
                         pierces: 0,
                         bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         hitEnemies: []
                       });
                     }
                   } else if (weaponId === 'w-missile') {
                     state.bullets.push({
                       x: state.mecha.x + Math.cos(spreadAngle) * 20,
                       y: state.mecha.y + Math.sin(spreadAngle) * 20,
                       vx: Math.cos(spreadAngle) * 7,
                       vy: Math.sin(spreadAngle) * 7,
                       damage: Math.round(damage * state.stats.dpsMult),
                       type: 'missile',
                       radius: 6,
                       color: '#ef4444',
                       targetId: nearestEnemy.id,
                       bounces: 0,
                       pierces: 0,
                       bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         hitEnemies: []
                     });
                   } else if (weaponId === 'w-grenadelauncher') {
                     state.bullets.push({
                       x: state.mecha.x + Math.cos(spreadAngle) * 20,
                       y: state.mecha.y + Math.sin(spreadAngle) * 20,
                       vx: Math.cos(spreadAngle) * 8,
                       vy: Math.sin(spreadAngle) * 8,
                       damage: Math.round(damage * state.stats.dpsMult),
                       type: 'grenade',
                       radius: 8,
                       color: '#facc15',
                       life: 90,
                       bounces: 0,
                       pierces: 0,
                       bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         hitEnemies: []
                     });
                   } else if (weaponId === 'w-railgun') {
                     state.bullets.push({
                       x: state.mecha.x + Math.cos(spreadAngle) * 20,
                       y: state.mecha.y + Math.sin(spreadAngle) * 20,
                       vx: Math.cos(spreadAngle) * 25,
                       vy: Math.sin(spreadAngle) * 25,
                       damage: Math.round(damage * state.stats.dpsMult),
                       type: 'railgun',
                       radius: 4,
                       color: '#a855f7',
                       bounces: 0,
                       pierces: 99,
                       bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         hitEnemies: []
                     });
                   } else if (weaponId === 'w-sniper') {
                     state.bullets.push({
                       x: state.mecha.x + Math.cos(spreadAngle) * 20,
                       y: state.mecha.y + Math.sin(spreadAngle) * 20,
                       vx: Math.cos(spreadAngle) * 24,
                       vy: Math.sin(spreadAngle) * 24,
                       damage: Math.round(damage * state.stats.dpsMult),
                       type: 'sniper',
                       radius: 5,
                       color: '#e11d48',
                       bounces: 0,
                       pierces: 1,
                       bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         hitEnemies: []
                     });
                   } else if (weaponId === 'w-flamethrower-legacy-disabled') {
                     for (let f = 0; f < 3; f++) {
                       const angle = spreadAngle + (Math.random() - 0.5) * 0.4;
                       state.bullets.push({
                         x: state.mecha.x + Math.cos(angle) * 20,
                         y: state.mecha.y + Math.sin(angle) * 20,
                         vx: Math.cos(angle) * (5 + Math.random() * 3),
                         vy: Math.sin(angle) * (5 + Math.random() * 3),
                         damage: Math.round(damage * state.stats.dpsMult),
                         type: 'flame',
                         radius: 6 + Math.random() * 6,
                         color: `rgba(249, 115, 22, ${0.6 + Math.random() * 0.4})`,
                         life: 20 + Math.random() * 15,
                         bounces: 0,
                         pierces: 99,
                         bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         hitEnemies: []
                       });
                     }
                   } else if (weaponId === 'w-plasma') {
                     state.bullets.push({
                       x: state.mecha.x + Math.cos(spreadAngle) * 20,
                       y: state.mecha.y + Math.sin(spreadAngle) * 20,
                       vx: Math.cos(spreadAngle) * 10,
                       vy: Math.sin(spreadAngle) * 10,
                       damage: Math.round(damage * state.stats.dpsMult),
                       type: 'plasma',
                       radius: 8,
                       color: '#00ffcc',
                       bounces: 0,
                       pierces: 0,
                       bonusPierceHits: primaryShotModsV302.bonusPierceHits,
                         hitEnemies: []
                     });
                   }
                 }
                 playSound('laser');

                 if (weaponId === 'w-energysword') {
                   state.slashes.push({
                     type: 'sword',
                     angle: aimAngle,
                     damage: Math.round(damage * state.stats.dpsMult),
                     life: 15,
                     maxLife: 15,
                     color: '#00ffcc',
                     hitEnemies: []
                   });
                   if (state.passives.includes('p-melee-wave')) {
                     const lvl = state.passiveLevels['p-melee-wave'] || 1;
                     state.bullets.push({
                       x: state.mecha.x,
                       y: state.mecha.y,
                       vx: Math.cos(aimAngle) * 10,
                       vy: Math.sin(aimAngle) * 10,
                       damage: Math.round(damage * 0.5 * lvl),
                       type: 'energywave',
                       radius: 12,
                       color: '#00ffcc',
                       bounces: 0,
                       pierces: 99,
                       hitEnemies: []
                     });
                   }
                   playSound('equip');
                 } else if (weaponId === 'w-kinetichammer') {
                   state.shockwaves.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     radius: 10,
                     maxRadius: 120,
                     damage: Math.round(damage * state.stats.dpsMult),
                     life: 20,
                     maxLife: 20,
                     color: '#eab308',
                     pushBack: true,
                     hitEnemies: []
                   });
                   if (state.passives.includes('p-melee-wave')) {
                     const lvl = state.passiveLevels['p-melee-wave'] || 1;
                     for (let d = 0; d < 4; d++) {
                       const angle = aimAngle + d * Math.PI / 2;
                       state.bullets.push({
                         x: state.mecha.x,
                         y: state.mecha.y,
                         vx: Math.cos(angle) * 8,
                         vy: Math.sin(angle) * 8,
                         damage: Math.round(damage * 0.4 * lvl),
                         type: 'energywave',
                         radius: 10,
                         color: '#eab308',
                         bounces: 0,
                         pierces: 99,
                         hitEnemies: []
                       });
                     }
                   }
                   playSound('hit');
                 } else if (weaponId === 'w-lance') {
                   state.slashes.push({
                     type: 'lance',
                     angle: aimAngle,
                     damage: Math.round(damage * state.stats.dpsMult),
                     life: 12,
                     maxLife: 12,
                     color: '#38bdf8',
                     hitEnemies: []
                   });
                   if (state.passives.includes('p-melee-wave')) {
                     const lvl = state.passiveLevels['p-melee-wave'] || 1;
                     state.bullets.push({
                       x: state.mecha.x,
                       y: state.mecha.y,
                       vx: Math.cos(aimAngle) * 12,
                       vy: Math.sin(aimAngle) * 12,
                       damage: Math.round(damage * 0.6 * lvl),
                       type: 'energywave',
                       radius: 14,
                       color: '#38bdf8',
                       bounces: 0,
                       pierces: 99,
                       hitEnemies: []
                     });
                   }
                   playSound('equip');
                 } else if (weaponId === 'w-claws') {
                   state.slashes.push({
                     type: 'claws',
                     angle: aimAngle - 0.2,
                     damage: Math.round(damage * state.stats.dpsMult),
                     life: 10,
                     maxLife: 10,
                     color: '#f43f5e',
                     hitEnemies: []
                   });
                   if (state.passives.includes('p-melee-wave')) {
                     const lvl = state.passiveLevels['p-melee-wave'] || 1;
                     state.bullets.push({
                       x: state.mecha.x,
                       y: state.mecha.y,
                       vx: Math.cos(aimAngle - 0.2) * 9,
                       vy: Math.sin(aimAngle - 0.2) * 9,
                       damage: Math.round(damage * 0.4 * lvl),
                       type: 'energywave',
                       radius: 10,
                       color: '#f43f5e',
                       bounces: 0,
                       pierces: 99,
                       hitEnemies: []
                     });
                   }
                   setTimeout(() => {
                     if (state.phase === 'playing' && !state.paused) {
                       state.slashes.push({
                         type: 'claws',
                         angle: aimAngle + 0.2,
                         damage: Math.round(damage * state.stats.dpsMult),
                         life: 10,
                         maxLife: 10,
                         color: '#f43f5e',
                         hitEnemies: []
                       });
                       if (state.passives.includes('p-melee-wave')) {
                         const lvl = state.passiveLevels['p-melee-wave'] || 1;
                         state.bullets.push({
                           x: state.mecha.x,
                           y: state.mecha.y,
                           vx: Math.cos(aimAngle + 0.2) * 9,
                           vy: Math.sin(aimAngle + 0.2) * 9,
                           damage: Math.round(damage * 0.4 * lvl),
                           type: 'energywave',
                           radius: 10,
                           color: '#f43f5e',
                           bounces: 0,
                           pierces: 99,
                           hitEnemies: []
                         });
                       }
                     }
                   }, 150);
                   playSound('equip');
                 } else if (weaponId === 'w-boomerang') {
                   state.boomerangs.push({
                     x: state.mecha.x,
                     y: state.mecha.y,
                     vx: Math.cos(aimAngle) * 8,
                     vy: Math.sin(aimAngle) * 8,
                     damage: Math.round(damage * state.stats.dpsMult),
                     radius: 10,
                     color: '#10b981',
                     returning: false,
                     life: 80,
                     maxLife: 80,
                     hitEnemies: []
                   });
                   playSound('laser');
                 }
               }
             }
           });
         }

        // Update and Render Fire Zones
        for (let i = state.fireZones.length - 1; i >= 0; i--) {
          const fz = state.fireZones[i];
          fz.life--;

          if (fz.life % 15 === 0) {
            state.enemies.forEach(e => {
              if (e.hp <= 0) return;
              const dx = e.x - fz.x;
              const dy = e.y - fz.y;
              if (dx * dx + dy * dy < fz.radius * fz.radius) {
                 damageEnemy(e, fz.damage, timestamp);
                 if (state.passives.includes('p-elemental')) {
                   e.burnTicks = (e.burnTicks || 0) + 3;
                 }
                state.damageNumbers.push({
                  x: e.x,
                  y: e.y - 10,
                  text: fz.damage.toString(),
                  life: 20,
                  vx: (Math.random() - 0.5) * 1,
                  vy: -1
                });
              }
            });
          }

          ctx.save();
          const alpha = fz.life / fz.maxLife;
          ctx.fillStyle = `rgba(249, 115, 22, ${0.15 * alpha})`;
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 * alpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(fz.x, fz.y, fz.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          if (Math.random() < 0.15) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * fz.radius;
            state.particles.push({
              x: fz.x + Math.cos(angle) * dist,
              y: fz.y + Math.sin(angle) * dist,
              vx: (Math.random() - 0.5) * 1,
              vy: -1 - Math.random(),
              life: 15,
              color: '#f97316'
            });
          }
          ctx.restore();

          if (fz.life <= 0) {
            state.fireZones.splice(i, 1);
          }
        }

        // Update Bullets
        for (let i = state.bullets.length - 1; i >= 0; i--) {
          const b = state.bullets[i];
          if (!b.speedBoostedV331) { b.vx *= 1.24; b.vy *= 1.24; b.speedBoostedV331 = true; }

          // Missile tracking logic
          if (b.type === 'missile') {
            let target = enemyById.get(b.targetId);
            if (!target) {
              let nearest = null;
              let minDistSq = Infinity;
              for (let enemyIndex = 0; enemyIndex < state.enemies.length; enemyIndex++) {
                const enemy = state.enemies[enemyIndex];
                if (enemy.hp <= 0) continue;
                const dx = enemy.x - b.x;
                const dy = enemy.y - b.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < minDistSq) {
                  minDistSq = distSq;
                  nearest = enemy;
                }
              }
              if (nearest) {
                b.targetId = nearest.id;
                target = nearest;
              }
            }
            if (target) {
              const angle = Math.atan2(target.y - b.y, target.x - b.x);
              const speed = 8;
              const currentAngle = Math.atan2(b.vy, b.vx);
              let diff = angle - currentAngle;
              while (diff < -Math.PI) diff += Math.PI * 2;
              while (diff > Math.PI) diff -= Math.PI * 2;
              const newAngle = currentAngle + diff * 0.15;
              b.vx = Math.cos(newAngle) * speed;
              b.vy = Math.sin(newAngle) * speed;
            }
            if (Math.random() < 0.4) {
              state.particles.push({
                x: b.x,
                y: b.y,
                vx: -b.vx * 0.2 + (Math.random() - 0.5),
                vy: -b.vy * 0.2 + (Math.random() - 0.5),
                life: 15,
                color: 'rgba(150, 150, 150, 0.5)'
              });
            }
          }

          // Grenade bounce logic
          if (b.type === 'grenade') {
            if (b.x < 10 || b.x > worldSize - 10) {
              b.vx *= -1;
              b.x = Math.max(10, Math.min(worldSize - 10, b.x));
            }
            if (b.y < 10 || b.y > worldSize - 10) {
              b.vy *= -1;
              b.y = Math.max(10, Math.min(worldSize - 10, b.y));
            }
            b.life--;
            if (b.life <= 0) {
              triggerSplashExplosion(b.x, b.y, 80, b.damage);
              playSound('hit');
              state.bullets.splice(i, 1);
              continue;
            }
          }

          if (b.type === 'pistonshot') {
            b.life = Number.isFinite(b.life) ? b.life - 1 : 33;
            if (b.life <= 0) {
              state.bullets.splice(i, 1);
              continue;
            }
          }

          // Flame particle logic
          if (b.type === 'flame') {
            b.life--;
            b.radius *= 0.95;
            if (b.life <= 0) {
              state.bullets.splice(i, 1);
              continue;
            }
          }
          const bulletSpeedFactor = simulationSpeed;
          b.x += b.vx * bulletSpeedFactor;
          b.y += b.vy * bulletSpeedFactor;

          // Draw Bullet
          ctx.save();
          ctx.shadowBlur = 8;
          ctx.shadowColor = b.color || '#00ffcc';
          ctx.fillStyle = b.color || '#00ffcc';
          ctx.beginPath();
          if (b.type === 'laser') {
            ctx.strokeStyle = b.color || '#ff3366';
            ctx.lineWidth = 3;
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 1.2, b.y - b.vy * 1.2);
            ctx.stroke();
          } else if (b.type === 'plasma') {
            ctx.arc(b.x, b.y, b.radius || 8, 0, Math.PI * 2);
            ctx.fill();
          } else if (b.type === 'shotgun' || b.type === 'pistonshot') {
            ctx.arc(b.x, b.y, b.radius || 5, 0, Math.PI * 2);
            ctx.fill();
          } else if (b.type === 'missile') {
            ctx.arc(b.x, b.y, b.radius || 6, 0, Math.PI * 2);
            ctx.fill();
          } else if (b.type === 'drone') {
            ctx.arc(b.x, b.y, b.radius || 4, 0, Math.PI * 2);
            ctx.fill();
          } else if (b.type === 'grenade') {
            ctx.arc(b.x, b.y, b.radius || 8, 0, Math.PI * 2);
            ctx.fill();
          } else if (b.type === 'energycannon') {
            ctx.arc(b.x, b.y, b.radius || 12, 0, Math.PI * 2);
            ctx.fill();
          } else if (b.type === 'flame') {
            ctx.arc(b.x, b.y, b.radius || 8, 0, Math.PI * 2);
            ctx.fill();
          } else if (b.type === 'machinegun') {
            ctx.arc(b.x, b.y, b.radius || 4, 0, Math.PI * 2);
            ctx.fill();
          } else if (b.type === 'railgun') {
            ctx.strokeStyle = b.color || '#a855f7';
            ctx.lineWidth = 4;
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 1.5, b.y - b.vy * 1.5);
            ctx.stroke();
          } else if (b.type === 'sniper') {
            ctx.strokeStyle = b.color || '#e11d48';
            ctx.lineWidth = 3;
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 1.5, b.y - b.vy * 1.5);
            ctx.stroke();
          } else if (b.type === 'summon') {
            ctx.arc(b.x, b.y, b.radius || 3, 0, Math.PI * 2);
            ctx.fill();
          } else if (b.type === 'turret') {
            ctx.arc(b.x, b.y, b.radius || 4, 0, Math.PI * 2);
            ctx.fill();
          } else if (b.type === 'energywave') {
            ctx.save();
            ctx.strokeStyle = b.color || '#00ffcc';
            ctx.lineWidth = 4;
            ctx.shadowColor = b.color || '#00ffcc';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            const angle = Math.atan2(b.vy, b.vx);
            ctx.arc(b.x, b.y, b.radius || 12, angle - 0.8, angle + 0.8);
            ctx.stroke();
            ctx.restore();
          } else {
            ctx.strokeStyle = '#00ffcc';
            ctx.lineWidth = 3;
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx * 1.5, b.y - b.vy * 1.5);
            ctx.stroke();
          }
          ctx.restore();

          // Out of world bounds check
          if (b.x < 0 || b.x > worldSize || b.y < 0 || b.y > worldSize) {
            state.bullets.splice(i, 1);
          }
        }

        // Update Slashes
        for (let i = state.slashes.length - 1; i >= 0; i--) {
          const s = state.slashes[i];
          s.life--;

          const slashX = state.mecha.x;
          const slashY = state.mecha.y;

          state.enemies.forEach(e => {
            if (e.hp <= 0 || s.hitEnemies.includes(e.id)) return;

            const dist = Math.hypot(e.x - slashX, e.y - slashY);
            let inRange = false;

            if (s.type === 'sword') {
              const angleToEnemy = Math.atan2(e.y - slashY, e.x - slashX);
              let diff = angleToEnemy - s.angle;
              while (diff < -Math.PI) diff += Math.PI * 2;
              while (diff > Math.PI) diff -= Math.PI * 2;
              if (dist < 90 && Math.abs(diff) < 1.0) {
                inRange = true;
              }
            } else if (s.type === 'lance') {
              const angleToEnemy = Math.atan2(e.y - slashY, e.x - slashX);
              let diff = angleToEnemy - s.angle;
              while (diff < -Math.PI) diff += Math.PI * 2;
              while (diff > Math.PI) diff -= Math.PI * 2;
              if (dist < 160 && Math.abs(diff) < 0.25) {
                inRange = true;
              }
            } else if (s.type === 'claws') {
              const angleToEnemy = Math.atan2(e.y - slashY, e.x - slashX);
              let diff = angleToEnemy - s.angle;
              while (diff < -Math.PI) diff += Math.PI * 2;
              while (diff > Math.PI) diff -= Math.PI * 2;
              if (dist < 70 && Math.abs(diff) < 0.8) {
                inRange = true;
              }
            }

            if (inRange) {
               damageEnemy(e, s.damage, timestamp);
               s.hitEnemies.push(e.id);

              state.damageNumbers.push({
                x: e.x,
                y: e.y - 10,
                text: s.damage.toString(),
                life: 30,
                vx: (Math.random() - 0.5) * 2,
                vy: -1.5 - Math.random()
              });

              const pushAngle = Math.atan2(e.y - slashY, e.x - slashX);
              e.x += Math.cos(pushAngle) * 15;
              e.y += Math.sin(pushAngle) * 15;

              for (let p = 0; p < 4; p++) {
                state.particles.push({
                  x: e.x, y: e.y,
                  vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
                  life: 15, color: s.color
                });
              }
            }
          });

          ctx.save();
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.type === 'lance' ? 6 : 4;
          ctx.shadowColor = s.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          if (s.type === 'sword') {
            ctx.arc(slashX, slashY, 70, s.angle - 1.0, s.angle + 1.0);
            ctx.stroke();
          } else if (s.type === 'lance') {
            ctx.moveTo(slashX, slashY);
            ctx.lineTo(slashX + Math.cos(s.angle) * 150, slashY + Math.sin(s.angle) * 150);
            ctx.stroke();
          } else if (s.type === 'claws') {
            ctx.arc(slashX, slashY, 55, s.angle - 0.8, s.angle + 0.8);
            ctx.stroke();
          }
          ctx.restore();

          if (s.life <= 0) {
            state.slashes.splice(i, 1);
          }
        }

        // Update Shockwaves
        for (let i = state.shockwaves.length - 1; i >= 0; i--) {
          const sw = state.shockwaves[i];
          sw.life--;

          const progress = 1 - (sw.life / sw.maxLife);
          const currentRadius = sw.radius + (sw.maxRadius - sw.radius) * progress;

          state.enemies.forEach(e => {
            if (e.hp <= 0 || sw.hitEnemies.includes(e.id)) return;

            const dist = Math.hypot(e.x - sw.x, e.y - sw.y);
            if (dist < currentRadius) {
               damageEnemy(e, sw.damage, timestamp);
               sw.hitEnemies.push(e.id);

              state.damageNumbers.push({
                x: e.x,
                y: e.y - 10,
                text: sw.damage.toString(),
                life: 30,
                vx: (Math.random() - 0.5) * 2,
                vy: -1.5 - Math.random()
              });

              if (sw.pushBack) {
                const pushAngle = Math.atan2(e.y - sw.y, e.x - sw.x);
                e.x += Math.cos(pushAngle) * 30;
                e.y += Math.sin(pushAngle) * 30;
              }

              for (let p = 0; p < 4; p++) {
                state.particles.push({
                  x: e.x, y: e.y,
                  vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
                  life: 15, color: sw.color
                });
              }
            }
          });

          ctx.save();
          ctx.strokeStyle = sw.color;
          ctx.lineWidth = 3 * (1 - progress);
          ctx.shadowColor = sw.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, currentRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          if (sw.life <= 0) {
            state.shockwaves.splice(i, 1);
          }
        }

        // Update Turrets
        for (let i = state.turrets.length - 1; i >= 0; i--) {
          const t = state.turrets[i];
          t.life--;

          let nearest = null;
          let minDist = Infinity;
          state.enemies.forEach(e => {
            if (e.hp <= 0) return;
            const dist = Math.hypot(e.x - t.x, e.y - t.y);
            if (dist < minDist) {
              minDist = dist;
              nearest = e;
            }
          });

          if (nearest && minDist < 350) {
            if (timestamp - t.lastFireTime >= t.fireCooldown) {
              t.lastFireTime = timestamp;
              const aimAngle = Math.atan2(nearest.y - t.y, nearest.x - t.x);
              state.bullets.push({
                x: t.x,
                y: t.y,
                vx: Math.cos(aimAngle) * 10,
                vy: Math.sin(aimAngle) * 10,
                damage: t.damage,
                type: 'turret',
                radius: 4,
                color: '#38bdf8',
                bounces: 0,
                pierces: 0,
                hitEnemies: []
              });
              playSound('laser');
            }
          }

          ctx.save();
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(t.x, t.y, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          const barrelAngle = nearest ? Math.atan2(nearest.y - t.y, nearest.x - t.x) : 0;
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(t.x + Math.cos(barrelAngle) * 18, t.y + Math.sin(barrelAngle) * 18);
          ctx.stroke();
          ctx.restore();

          if (t.life <= 0) {
            state.turrets.splice(i, 1);
          }
        }

        // Update Mines
        for (let i = state.mines.length - 1; i >= 0; i--) {
          const m = state.mines[i];

          let triggered = false;
          state.enemies.forEach(e => {
            if (e.hp <= 0 || triggered) return;
            const dist = Math.hypot(e.x - m.x, e.y - m.y);
            if (dist < m.radius) {
              triggered = true;
            }
          });

          if (triggered) {
            triggerSplashExplosion(m.x, m.y, 90, m.damage);
            playSound('hit');
            state.mines.splice(i, 1);
            continue;
          }

          ctx.save();
          ctx.fillStyle = '#ef4444';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          const pulse = (timestamp % 1000) / 1000;
          ctx.strokeStyle = 'rgba(239, 68, 68, ' + (1 - pulse) + ')';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 6 + pulse * 20, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Update Orbital Strikes
        for (let i = state.orbitalStrikes.length - 1; i >= 0; i--) {
          const os = state.orbitalStrikes[i];
          os.delay--;

          if (os.delay <= 0) {
            triggerSplashExplosion(os.x, os.y, os.radius, os.damage);
            playSound('hit');
            state.orbitalStrikes.splice(i, 1);
            continue;
          }

          ctx.save();
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(os.x, os.y, os.radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(os.x - 15, os.y); ctx.lineTo(os.x + 15, os.y);
          ctx.moveTo(os.x, os.y - 15); ctx.lineTo(os.x, os.y + 15);
          ctx.stroke();

          const progress = os.delay / 45;
          ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
          ctx.beginPath();
          ctx.arc(os.x, os.y, os.radius * progress, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Update Summons
        for (let i = state.summons.length - 1; i >= 0; i--) {
          const s = state.summons[i];
          s.life--;

          const targetX = state.mecha.x - Math.cos(state.mecha.angle) * 60;
          const targetY = state.mecha.y - Math.sin(state.mecha.angle) * 60;
          const distToTarget = Math.hypot(targetX - s.x, targetY - s.y);

          if (distToTarget > 20) {
            const angleToTarget = Math.atan2(targetY - s.y, targetX - s.x);
            s.x += Math.cos(angleToTarget) * 3.5;
            s.y += Math.sin(angleToTarget) * 3.5;
            s.angle = angleToTarget;
          }

          let nearest = null;
          let minDist = Infinity;
          state.enemies.forEach(e => {
            if (e.hp <= 0) return;
            const dist = Math.hypot(e.x - s.x, e.y - s.y);
            if (dist < minDist) {
              minDist = dist;
              nearest = e;
            }
          });

          if (nearest && minDist < 300) {
            if (timestamp - s.lastFireTime >= s.fireCooldown) {
              s.lastFireTime = timestamp;
              const aimAngle = Math.atan2(nearest.y - s.y, nearest.x - s.x);
              state.bullets.push({
                x: s.x,
                y: s.y,
                vx: Math.cos(aimAngle) * 11,
                vy: Math.sin(aimAngle) * 11,
                damage: s.damage,
                type: 'summon',
                radius: 3,
                color: '#10b981',
                bounces: 0,
                pierces: 0,
                hitEnemies: []
              });
              playSound('laser');
            }
          }

          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(s.angle);
          ctx.fillStyle = '#10b981';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(10, 0);
          ctx.lineTo(-8, -8);
          ctx.lineTo(-4, 0);
          ctx.lineTo(-8, 8);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          if (s.life <= 0) {
            state.summons.splice(i, 1);
          }
        }

        // Update Gravity Fields
        for (let i = state.gravityFields.length - 1; i >= 0; i--) {
          const gf = state.gravityFields[i];
          gf.life--;

          const gfX = state.mecha.x;
          const gfY = state.mecha.y;

          state.enemies.forEach(e => {
            if (e.hp <= 0) return;
            const dist = Math.hypot(e.x - gfX, e.y - gfY);
            if (dist < gf.radius) {
              e.x -= Math.cos(Math.atan2(e.y - gfY, e.x - gfX)) * (e.speed * 0.5);
              e.y -= Math.sin(Math.atan2(e.y - gfY, e.x - gfX)) * (e.speed * 0.5);

              const pullAngle = Math.atan2(gfY - e.y, gfX - e.x);
              e.x += Math.cos(pullAngle) * 0.8;
              e.y += Math.sin(pullAngle) * 0.8;

              if (timestamp >= (gf.nextDamageTickAt || 0)) {
                gf.nextDamageTickAt = timestamp + 250;
                damageEnemy(e, gf.damage, timestamp);
                state.damageNumbers.push({
                  x: e.x,
                  y: e.y - 10,
                  text: gf.damage.toString(),
                  life: 20,
                  vx: (Math.random() - 0.5) * 1,
                  vy: -1
                });
              }
            }
          });

          ctx.save();
          ctx.fillStyle = gf.color;
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(gfX, gfY, gf.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.strokeStyle = 'rgba(168, 85, 247, 0.2)';
          ctx.beginPath();
          ctx.arc(gfX, gfY, gf.radius * 0.6, (timestamp * 0.002) % (Math.PI * 2), ((timestamp * 0.002) + Math.PI) % (Math.PI * 2));
          ctx.stroke();
          ctx.restore();

          if (gf.life <= 0) {
            state.gravityFields.splice(i, 1);
          }
        }

        // Update Boomerangs
        for (let i = state.boomerangs.length - 1; i >= 0; i--) {
          const b = state.boomerangs[i];
          b.life--;

          if (b.life < b.maxLife / 2) {
            b.returning = true;
          }

          if (b.returning) {
            const angleToPlayer = Math.atan2(state.mecha.y - b.y, state.mecha.x - b.x);
            b.vx = Math.cos(angleToPlayer) * 9;
            b.vy = Math.sin(angleToPlayer) * 9;

            const distToPlayer = Math.hypot(state.mecha.x - b.x, state.mecha.y - b.y);
            if (distToPlayer < 25) {
              state.boomerangs.splice(i, 1);
              continue;
            }
          }

          b.x += b.vx;
          b.y += b.vy;

          state.enemies.forEach(e => {
            if (e.hp <= 0 || b.hitEnemies.includes(e.id)) return;
            const dist = Math.hypot(e.x - b.x, e.y - b.y);
            if (dist < e.radius + b.radius) {
               damageEnemy(e, b.damage, timestamp);
               b.hitEnemies.push(e.id);

              state.damageNumbers.push({
                x: e.x,
                y: e.y - 10,
                text: b.damage.toString(),
                life: 30,
                vx: (Math.random() - 0.5) * 2,
                vy: -1.5 - Math.random()
              });

              playSound('hit');
            }
          });

          if (b.life === Math.floor(b.maxLife / 2)) {
            b.hitEnemies = [];
          }

          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(timestamp * 0.02);
          ctx.strokeStyle = b.color;
          ctx.lineWidth = 4;
          ctx.shadowColor = b.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(0, -12);
          ctx.lineTo(10, 10);
          ctx.lineTo(-10, 10);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();

          if (b.life <= 0) {
            state.boomerangs.splice(i, 1);
          }
        }

         // Update and Render Orbs
         for (let i = state.orbs.length - 1; i >= 0; i--) {
           const orb = state.orbs[i];

           // Magnet effect: if player is close, pull orb towards player
           const distToPlayer = Math.hypot(state.mecha.x - orb.x, state.mecha.y - orb.y);
           const magnetRange = 150;
           if (distToPlayer < magnetRange) {
             const angleToPlayer = Math.atan2(state.mecha.y - orb.y, state.mecha.x - orb.x);
             const pullSpeed = 6 * (1 - distToPlayer / magnetRange) + 2;
             orb.x += Math.cos(angleToPlayer) * pullSpeed;
             orb.y += Math.sin(angleToPlayer) * pullSpeed;
           }

           // Collision detection with player mecha
           const collectRange = 25;
           if (distToPlayer < collectRange) {
             state.xp += orb.xpValue;
             updateXpUI();

             state.damageNumbers.push({
               x: orb.x,
               y: orb.y - 10,
               text: `+${orb.xpValue} ${SETTINGS_STATE.language==='en'?'ENERGY':SETTINGS_STATE.language==='pt'?'ENERGIA':'ENERGÍA'}`,
               life: 30,
               vx: (Math.random() - 0.5) * 1,
               vy: -1.5,
               color: '#00ffcc'
             });

             for (let p = 0; p < 6; p++) {
               state.particles.push({
                 x: orb.x,
                 y: orb.y,
                 vx: (Math.random() - 0.5) * 4,
                 vy: (Math.random() - 0.5) * 4,
                 life: 15,
                 color: orb.color || '#3e7dc9'
               });
             }

             playSound('equip');

             if (state.xp >= state.xpNeeded) {
               triggerLevelUp();
             }

             state.orbs.splice(i, 1);
             continue;
           }

           ctx.save();
           ctx.fillStyle = orb.color || '#3e7dc9';
           ctx.strokeStyle = orb.stroke || '#ffffff';
           ctx.lineWidth = 1.5;
           ctx.shadowColor = orb.color || '#3e7dc9';
           ctx.shadowBlur = 8 + Math.sin(timestamp * 0.01) * 3;
           ctx.beginPath();
           ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
           ctx.fill();
           ctx.stroke();
           ctx.restore();
         }

         // EMP Flash Screen Effect
        if (state.empFlash && state.empFlash > 0) {
          ctx.save();
          ctx.fillStyle = `rgba(255, 255, 255, ${state.empFlash / 10})`;
          ctx.fillRect(state.mecha.x - canvas.width, state.mecha.y - canvas.height, canvas.width * 2, canvas.height * 2);
          ctx.restore();
          state.empFlash--;
        }

        // Update and Draw High Beam
        const isHighBeamActive = state.mecha.highBeamActiveUntil && timestamp < state.mecha.highBeamActiveUntil;
        if (isHighBeamActive) {
          const beamLength = 500;
          const beamWidth = 24;
          const beamAngle = state.mecha.angle;
          const startX = state.mecha.x + Math.cos(beamAngle) * 20;
          const startY = state.mecha.y + Math.sin(beamAngle) * 20;
          const endX = startX + Math.cos(beamAngle) * beamLength;
          const endY = startY + Math.sin(beamAngle) * beamLength;

          state.enemies.forEach(e => {
            if (e.hp <= 0) return;

            const l2 = beamLength * beamLength;
            let t = ((e.x - startX) * (endX - startX) + (e.y - startY) * (endY - startY)) / l2;
            t = Math.max(0, Math.min(1, t));
            const projX = startX + t * (endX - startX);
            const projY = startY + t * (endY - startY);
            const dist = Math.hypot(e.x - projX, e.y - projY);

            if (dist < e.radius + beamWidth / 2) {
              if (timestamp >= (state.mecha.highBeamNextTickAt || 0)) {
                state.mecha.highBeamNextTickAt = timestamp + 100;
                const dmg = Math.max(1, Math.round(state.mecha.highBeamDamage * 0.2));
                damageEnemy(e, dmg, timestamp);
                state.damageNumbers.push({
                  x: e.x,
                  y: e.y - 10,
                  text: dmg.toString(),
                  life: 20,
                  vx: (Math.random() - 0.5) * 1,
                  vy: -1
                });
              }
            }
          });

          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = beamWidth;
          ctx.shadowColor = '#00ffcc';
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = beamWidth * 0.4;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
          ctx.restore();
        }

        // Spawn enemy wave if field empty
        updateThreatDirectorV33(timestamp, timeFactor);
        updateRareEnemySpawnsV331(timestamp);

        // Update Active Targets array for Mekora contract/harness
        state.activeTargets.length = 0;

        // Visible range for enemy firing (match viewport dimensions or custom range)
        const visibleRange = Math.max(canvas.width, canvas.height) / cameraZoom * 0.75;

        // Update Enemies
        for (let i = state.enemies.length - 1; i >= 0; i--) {
          const e = state.enemies[i];
           if (e.hp <= 0) {
             if (e.isDummy) {
               handleDummyDestroyed(i, timestamp);
             } else {
               killEnemy(e, i);
             }
             continue;
           }
           const angle = Math.atan2(state.mecha.y - e.y, state.mecha.x - e.x);

           let distToPlayer = Math.hypot(state.mecha.x - e.x, state.mecha.y - e.y);

            const isStunned = e.isDummy || (e.stunnedUntil && timestamp < e.stunnedUntil) || state.devPauseEnemies;
            const isSlowed = e.slowedUntil && timestamp < e.slowedUntil;

            if (e.burnTicks > 0 && timestamp >= (e.nextBurnTick || 0)) {
              e.nextBurnTick = timestamp + 500;
              e.burnTicks--;
              const burnDmg = 5;
              damageEnemy(e, burnDmg, timestamp);
              state.damageNumbers.push({
                x: e.x,
               y: e.y - 10,
               text: burnDmg.toString(),
               life: 20,
               vx: (Math.random() - 0.5) * 1,
               vy: -1,
               color: '#f97316'
             });
           }

           if (e.faction === 'scrappers') {
             updateScrapperEnemyV31(e, timestamp, distToPlayer, angle, isStunned, simulationSpeed, visibleRange);
           } else {
           // Initialize/reset vision entry for projectile enemies
           if (e.type === 'square' || e.type === 'purple_arrow') {
            if (isEnemyInsideCombatViewV331(e, 20)) {
              if (!e.hasEnteredVision) {
                e.hasEnteredVision = true;
                e.fireCadenceOffsetV332=e.fireCadenceOffsetV332??Math.random()*1800;e.fireIntervalV332=e.fireIntervalV332??(e.type==='square'?850+Math.random()*850:2450+Math.random()*1500);e.nextShotTime = timestamp + 900 + e.fireCadenceOffsetV332;
              }
            } else {
              e.hasEnteredVision = false;
              e.nextShotTime = null;
            }
          }

          let moveAngle = angle;
          let currentSpeed = e.speed;
          if (isStunned) {
            currentSpeed = 0;
          } else if (isSlowed) {
            currentSpeed *= 0.5;
          }

          if (e.type === 'purple_arrow') {
            if (distToPlayer < 250) {
              moveAngle = angle + Math.PI;
            } else if (distToPlayer > 350) {
              moveAngle = angle;
            } else {
              const dir = (e.id.charCodeAt(0) % 2 === 0) ? 1 : -1;
              moveAngle = angle + dir * Math.PI / 2;
            }

            if (e.hasEnteredVision && e.nextShotTime !== null && !isStunned) {
              const timeUntilShot = e.nextShotTime - timestamp;
              if (timeUntilShot <= 1000) {
                currentSpeed = e.speed * 0.3;
              }
            }
          } else if (e.type === 'square') {
            const dir = (e.id.charCodeAt(0) % 2 === 0) ? 1 : -1;
            moveAngle = angle + dir * Math.PI / 3;
          }

           if (!isStunned) {
             const enemySpeedFactor = simulationSpeed;
             e.x += Math.cos(moveAngle) * currentSpeed * enemySpeedFactor;
             e.y += Math.sin(moveAngle) * currentSpeed * enemySpeedFactor;
           }

          if (e.type !== 'heavy' && !e.isBossV31 && !e.isMinibossV31) {
             let sepX = 0;
             let sepY = 0;
             let sepCount = 0;
             const desiredDist = 75;
             for (let k = 0; k < state.enemies.length; k++) {
               const otherE = state.enemies[k];
               if (otherE.id === e.id || otherE.type === 'heavy' || otherE.hp <= 0) continue;
               const eeDist = Math.hypot(e.x - otherE.x, e.y - otherE.y);
              if (eeDist < desiredDist && eeDist > 0) {
                const force = (desiredDist - eeDist) / desiredDist;
                const angleEE = Math.atan2(e.y - otherE.y, e.x - otherE.x);
                sepX += Math.cos(angleEE) * force * 1.5;
                sepY += Math.sin(angleEE) * force * 1.5;
                sepCount++;
              }
            }
            if (sepCount > 0) {
              e.x += sepX;
              e.y += sepY;
            }
          }

          // Yellow self-destruct logic
          if (e.type === 'heavy') {
             if (distToPlayer < 80 && e.explodeTimer === null && !isStunned) {
               e.explodeTimer = 90;
             }
             if (e.explodeTimer !== null && !isStunned) {
               e.explodeTimer--;
               if (e.explodeTimer <= 0) {
                 explodeHeavyEnemy(e, i);
                 continue;
               }
             }
           }

          // Ranged enemy firing logic
          if ((e.type === 'square' || e.type === 'purple_arrow') && isEnemyInsideCombatViewV331(e,20) && e.hasEnteredVision && e.nextShotTime !== null && !isStunned) {
            const now = timestamp;
            if (now >= e.nextShotTime) {
              let baseFireInterval = 2000;
              let bulletSpeed = 6;
              let bulletDamage = 15;
              let bulletColor = '#a855f7';
              let bulletRadius = 5;

              if (e.type === 'square') {
                baseFireInterval = 1000;
                bulletSpeed = 7;
                bulletDamage = 8;
                bulletColor = '#00ffcc';
                bulletRadius = 4;
              } else if (e.type === 'purple_arrow') {
                baseFireInterval = 3000;
                bulletSpeed = 3;
                bulletDamage = 35;
                bulletColor = '#a855f7';
                bulletRadius = 8;
              }

              const personalInterval=e.fireIntervalV332||(baseFireInterval*.8+Math.random()*baseFireInterval*.8);const variation=(Math.random()-.5)*(personalInterval*.28);e.fireIntervalV332=Math.max(baseFireInterval*.65,personalInterval+(Math.random()-.5)*220);
              e.nextShotTime = now + e.fireIntervalV332 + variation;

              const pAngle = Math.atan2(state.mecha.y - e.y, state.mecha.x - e.x);
              state.enemyBullets.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(pAngle) * bulletSpeed,
                vy: Math.sin(pAngle) * bulletSpeed,
                damage: bulletDamage,
                color: bulletColor,
                radius: bulletRadius
              });
              playSound('laser');
            }
          }

           }

          spawnEnemyTrailV331(e, timestamp);

          // Register for harness interactivity state reader
          state.activeTargets.push({ id: e.id, x: e.x - e.radius, y: e.y - e.radius, w: e.radius * 2, h: e.radius * 2 });

          // Enemy Collision with Player Bullets
          for (let j = state.bullets.length - 1; j >= 0; j--) {
            const b = state.bullets[j];
            if (b.hitEnemies && b.hitEnemies.includes(e.id)) continue;

            const collisionRadius = e.radius + (b.radius || 8);
            const bulletDx = b.x - e.x;
            const bulletDy = b.y - e.y;
            if (bulletDx * bulletDx + bulletDy * bulletDy < collisionRadius * collisionRadius) {
               let finalDamage = b.damage;
               let isCrit = false;
               if (state.passives.includes('p-crit-effect')) {
                 const lvl = state.passiveLevels['p-crit-effect'] || 1;
                 const critChance = 0.15 + lvl * 0.05;
                 if (Math.random() < critChance) {
                   isCrit = true;
                   finalDamage *= 2;
                   triggerSplashExplosion(e.x, e.y, 50, Math.round(finalDamage * 0.5));
                 }
               }
                damageEnemy(e, finalDamage, timestamp);
                applyElementalStatus(e);

                state.damageNumbers.push({
                  x: e.x,
                  y: e.y - 10,
                  text: isCrit ? `CRIT! ${finalDamage}` : finalDamage.toString(),
                  life: 30,
                  vx: (Math.random() - 0.5) * 2,
                  vy: -1.5 - Math.random(),
                  color: isCrit ? '#ff334f' : '#ffffff',
                  size: isCrit ? 29 : 24
                });

               for (let p = 0; p < 4; p++) {
                 state.particles.push({
                  x: e.x, y: e.y,
                  vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
                  life: 15, color: b.color || '#ff3366'
                });
              }

              playSound('hit');
              vibrate(20);

              if (b.type === 'plasma') {
                const isEvolved = state.evolvedWeapons && state.evolvedWeapons.includes('w-plasma');
                triggerSplashExplosion(b.x, b.y, isEvolved ? 120 : 60, b.damage);
                if (isEvolved) {
                  let count = 0;
                  state.enemies.forEach(other => {
                    if (other.hp <= 0 || count >= 5) return;
                    const dist = Math.hypot(other.x - b.x, other.y - b.y);
                    if (dist < 200) {
                      damageEnemy(other, Math.round(b.damage * 0.5), timestamp);
                      state.lightnings = state.lightnings || [];
                      state.lightnings.push({
                        x1: b.x, y1: b.y,
                        x2: other.x, y2: other.y,
                        life: 8
                      });
                      count++;
                    }
                  });
                }
              } else if (b.type === 'missile') {
                const isEvolved = state.evolvedWeapons && state.evolvedWeapons.includes('w-missile');
                triggerSplashExplosion(b.x, b.y, isEvolved ? 150 : 100, b.damage);
                if (isEvolved) {
                  for (let m = 0; m < 3; m++) {
                    const angle = Math.random() * Math.PI * 2;
                    state.bullets.push({
                      x: b.x,
                      y: b.y,
                      vx: Math.cos(angle) * 6,
                      vy: Math.sin(angle) * 6,
                      damage: Math.round(b.damage * 0.4),
                      type: 'missile',
                      radius: 4,
                      color: '#ffaa00',
                      bounces: 0,
                      pierces: 0,
                      hitEnemies: []
                    });
                  }
                }
              } else if (b.type === 'grenade') {
                triggerSplashExplosion(b.x, b.y, 80, b.damage);
              } else if (b.type === 'energycannon') {
                triggerSplashExplosion(b.x, b.y, 70, b.damage);
              }

              if (b.isNapalm) {
                triggerSplashExplosion(b.x, b.y, 140, b.damage);
                state.fireZones.push({
                  x: b.x,
                  y: b.y,
                  radius: 100,
                  damage: Math.round(b.damage * 0.3),
                  life: 300,
                  maxLife: 300
                });
              }
              if (b.isTesla) {
                let count = 0;
                state.enemies.forEach(other => {
                  if (other.id === e.id || other.hp <= 0 || count >= 4) return;
                  const dist = Math.hypot(other.x - e.x, other.y - e.y);
                  if (dist < 180) {
                    damageEnemy(other, Math.round(b.damage * 0.5), timestamp);
                    state.lightnings = state.lightnings || [];
                    state.lightnings.push({
                      x1: e.x, y1: e.y,
                      x2: other.x, y2: other.y,
                      life: 8
                    });
                    count++;
                  }
                });
              }
              if (b.isCriogenico) {
                e.stunnedUntil = timestamp + 3000;
              }
              if (b.isArcoPlasma) {
                triggerSplashExplosion(b.x, b.y, 80, b.damage);
                let count = 0;
                state.enemies.forEach(other => {
                  if (other.id === e.id || other.hp <= 0 || count >= 5) return;
                  const dist = Math.hypot(other.x - e.x, other.y - e.y);
                  if (dist < 200) {
                    damageEnemy(other, Math.round(b.damage * 0.6), timestamp);
                    state.lightnings = state.lightnings || [];
                    state.lightnings.push({
                      x1: e.x, y1: e.y,
                      x2: other.x, y2: other.y,
                      life: 8
                    });
                    count++;
                  }
                });
              }
              if (b.isSingularidad) {
                state.gravityFields.push({
                  damage: Math.round(b.damage * 0.15),
                  radius: 120,
                  life: 180,
                  maxLife: 180,
                  color: 'rgba(168, 85, 247, 0.2)'
                });
              }

              if (state.passives.includes('p-lightning')) {
                const lightningLvl = state.passiveLevels['p-lightning'] || 1;
                let count = 0;
                const maxChain = 1 + lightningLvl;
                const chainDmg = 15 + lightningLvl * 5;
                state.enemies.forEach(other => {
                  if (other.id === e.id || other.hp <= 0 || count >= maxChain) return;
                  const lDist = Math.hypot(other.x - e.x, other.y - e.y);
                  if (lDist < 150) {
                    damageEnemy(other, chainDmg, timestamp);
                    state.damageNumbers.push({
                      x: other.x,
                      y: other.y - 10,
                      text: chainDmg.toString(),
                      life: 30,
                      vx: (Math.random() - 0.5) * 2,
                      vy: -1.5 - Math.random()
                    });
                    state.lightnings = state.lightnings || [];
                    state.lightnings.push({
                      x1: e.x, y1: e.y,
                      x2: other.x, y2: other.y,
                      life: 6
                    });
                    count++;
                  }
                });
              }

              let shouldDestroy = true;
              const passivePierceHits = state.passives.includes('p-pierce') ? (2 + (state.passiveLevels['p-pierce'] || 1)) : 0;
              const maxPierceHits = passivePierceHits + Math.max(0, b.bonusPierceHits || 0);
              if (maxPierceHits > 0) {
                b.hitEnemies = b.hitEnemies || [];
                b.hitEnemies.push(e.id);
                b.pierces = (b.pierces || 0) + 1;
                if (b.pierces < maxPierceHits) shouldDestroy = false;
              }

              const passiveBounceHits = state.passives.includes('p-bounce') ? (1 + (state.passiveLevels['p-bounce'] || 1)) : 0;
              const maxBounceHits = passiveBounceHits + Math.max(0, b.forcedBounces || 0);
              if (shouldDestroy && maxBounceHits > 0) {
                b.bounces = (b.bounces || 0) + 1;
                if (b.bounces < maxBounceHits) {
                  let nearestOther = null;
                  let minOtherDist = Infinity;
                  state.enemies.forEach(other => {
                    if (other.id === e.id || other.hp <= 0) return;
                    const oDist = Math.hypot(other.x - b.x, other.y - b.y);
                    if (oDist < minOtherDist && oDist < 200) {
                      minOtherDist = oDist;
                      nearestOther = other;
                    }
                  });
                  if (nearestOther) {
                    const bounceAngle = Math.atan2(nearestOther.y - b.y, nearestOther.x - b.x);
                    const speed = Math.hypot(b.vx, b.vy);
                    b.vx = Math.cos(bounceAngle) * speed;
                    b.vy = Math.sin(bounceAngle) * speed;
                    shouldDestroy = false;
                    b.hitEnemies = [];
                  }
                }
              }

              if (shouldDestroy) {
                state.bullets.splice(j, 1);
              }
              break;
            }
          }

          // Enemy Death
          if (e.hp <= 0) {
            if (e.isDummy) {
              handleDummyDestroyed(i, timestamp);
            } else {
              killEnemy(e, i);
            }
            continue;
          }

          // Enemy Collision & Separation with Player Mecha
          const playerDist = Math.hypot(state.mecha.x - e.x, state.mecha.y - e.y);
          const minCollideDist = e.radius + 18;
          if (!e.isDummy && playerDist < minCollideDist) {
            const overlap = minCollideDist - playerDist;
            const pushAngle = Math.atan2(e.y - state.mecha.y, e.x - state.mecha.x);

            e.x += Math.cos(pushAngle) * (overlap * 0.5);
            e.y += Math.sin(pushAngle) * (overlap * 0.5);

            if (!state.moveJoystick.active) {
              state.mecha.x -= Math.cos(pushAngle) * (overlap * 0.2);
              state.mecha.y -= Math.sin(pushAngle) * (overlap * 0.2);
            }

            // Yellow enemy doesn't deal contact damage while self-destructing
            if (!e.suppressContactDamageV31 && (e.type !== 'heavy' || e.explodeTimer === null)) {
              const isShieldBubbleActive = state.mecha.shieldActiveUntil && timestamp < state.mecha.shieldActiveUntil;
              if (!isShieldBubbleActive && !state.devInvulnerable) {
                if (timestamp >= (e.nextMeleeHitAt || 0)) {
                  e.nextMeleeHitAt = timestamp + 650;
                  const nearbyAttackers = state.enemies.reduce((count, other) => {
                    if (other.isDummy || other.hp <= 0) return count;
                    const d = Math.hypot(state.mecha.x - other.x, state.mecha.y - other.y);
                    return count + (d < other.radius + 24 ? 1 : 0);
                  }, 0);
                  applyMechaDamage(e.contactDamage || 7, e.x, e.y, timestamp, Math.max(1, nearbyAttackers));
                  if (state.phase !== 'playing') return;
                }
              }
            }
          }

          // Render enemy or training dummy
          ctx.save();
          ctx.translate(e.x, e.y);
          if (e.isDummy) {
            ctx.strokeStyle = '#ffaa00';
            ctx.fillStyle = 'rgba(255,170,0,.18)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-e.radius - 10, 0);
            ctx.lineTo(e.radius + 10, 0);
            ctx.moveTo(0, -e.radius - 10);
            ctx.lineTo(0, e.radius + 10);
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('DUMMY', 0, -e.radius - 15);
            if (state.testDummyMortal) {
              const hpRatio = Math.max(0, e.hp / e.maxHp);
              ctx.fillStyle = 'rgba(0,0,0,.65)';
              ctx.fillRect(-35, e.radius + 10, 70, 6);
              ctx.fillStyle = '#ff3366';
              ctx.fillRect(-35, e.radius + 10, 70 * hpRatio, 6);
            } else {
              ctx.fillStyle = '#00ffcc';
              ctx.font = '9px Share Tech Mono, monospace';
              ctx.fillText('HP ∞', 0, e.radius + 21);
            }
          } else if (e.faction === 'scrappers') {
            drawScrapperEnemyV31(e, timestamp, angle);
          } else {
            ctx.rotate(angle);
            let drawColor = e.color;
            if (e.type === 'heavy' && e.explodeTimer !== null && Math.floor(e.explodeTimer / 5) % 2 === 0) drawColor = '#ffffff';
            ctx.fillStyle = drawColor; ctx.beginPath();
            if (e.type === 'square') ctx.rect(-14, -14, 28, 28);
            else { ctx.moveTo(16, 0); ctx.lineTo(-12, -12); ctx.lineTo(-6, 0); ctx.lineTo(-12, 12); }
            ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.stroke();
          }
          ctx.restore();
          if (e.faction === 'scrappers') drawEnemyHealthV31(e);

          // Draw visual timer for self-destructing yellow enemy (not rotated)
          if (e.type === 'heavy' && e.explodeTimer !== null) {
            ctx.save();
            ctx.translate(e.x, e.y);
            const timerBarW = 30;
            const timerBarH = 4;
            const timerY = -e.radius - 12;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(-timerBarW / 2, timerY, timerBarW, timerBarH);

            const progress = e.explodeTimer / 90;
            ctx.fillStyle = '#ff3366';
            ctx.fillRect(-timerBarW / 2, timerY, timerBarW * progress, timerBarH);
            ctx.restore();
          }
        }

        updateEnemyMinesV31(timestamp);
        drawEnemyMinesV31(timestamp);
        updateBossHudV31();

        // Update Enemy Projectiles
        for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
          const eb = state.enemyBullets[i];
          if (!eb.speedBoostedV331) { eb.vx *= 1.32; eb.vy *= 1.32; eb.speedBoostedV331 = true; }
          const enemyBulletSpeedFactor = simulationSpeed;
          eb.x += eb.vx * enemyBulletSpeedFactor;
          eb.y += eb.vy * enemyBulletSpeedFactor;
          if (eb.lifeV31 !== undefined) { eb.lifeV31--; if (eb.lifeV31 <= 0) { state.enemyBullets.splice(i,1); continue; } }

           // Check if out of player's vision range
           const enemyBulletDx = state.mecha.x - eb.x;
           const enemyBulletDy = state.mecha.y - eb.y;
           const enemyBulletPlayerDistSq = enemyBulletDx * enemyBulletDx + enemyBulletDy * enemyBulletDy;
           if (enemyBulletPlayerDistSq > visibleRange * visibleRange) {
             if (eb.outOfVisionTime === undefined || eb.outOfVisionTime === null) {
               eb.outOfVisionTime = timestamp;
             } else if (timestamp - eb.outOfVisionTime > 3000) {
               state.enemyBullets.splice(i, 1);
               continue;
             }
           } else {
             eb.outOfVisionTime = null;
           }

          ctx.fillStyle = eb.color || '#a855f7';
          ctx.beginPath();
          ctx.arc(eb.x, eb.y, eb.radius || 5, 0, Math.PI * 2);
          ctx.fill();

          // Collision with player mecha
           if (enemyBulletPlayerDistSq < 625) {
             const isShieldBubbleActive = state.mecha.shieldActiveUntil && timestamp < state.mecha.shieldActiveUntil;
             const hasShield = state.mecha.shield > 0 || isShieldBubbleActive;

             if (hasShield && state.passives.includes('p-shield-reflect')) {
               const lvl = state.passiveLevels['p-shield-reflect'] || 1;
               let targetAngle = Math.atan2(-eb.vy, -eb.vx);
               if (nearestEnemy) {
                 targetAngle = Math.atan2(nearestEnemy.y - eb.y, nearestEnemy.x - eb.x);
               }
               state.bullets.push({
                 x: eb.x,
                 y: eb.y,
                 vx: Math.cos(targetAngle) * 12,
                 vy: Math.sin(targetAngle) * 12,
                 damage: eb.damage * lvl,
                 type: 'reflected',
                 radius: eb.radius,
                 color: '#00ffcc',
                 bounces: 0,
                 pierces: 0,
                 hitEnemies: []
               });
               state.enemyBullets.splice(i, 1);
               playSound('laser');
               continue;
             }

             if (state.mecha.hasRepresalia) {
               let targetAngle = Math.atan2(-eb.vy, -eb.vx);
               if (nearestEnemy) {
                 targetAngle = Math.atan2(nearestEnemy.y - eb.y, nearestEnemy.x - eb.x);
               }
               state.bullets.push({
                 x: eb.x,
                 y: eb.y,
                 vx: Math.cos(targetAngle) * 14,
                 vy: Math.sin(targetAngle) * 14,
                 damage: eb.damage * 3,
                 type: 'reflected',
                 radius: eb.radius * 1.5,
                 color: '#ff3366',
                 bounces: 0,
                 pierces: 0,
                 hitEnemies: []
               });
             }

             if (!isShieldBubbleActive && !state.devInvulnerable) {
               applyMechaDamage(eb.damage, eb.x, eb.y, timestamp, 1);
               if (state.phase !== 'playing') return;
            }
             state.enemyBullets.splice(i, 1);
             continue;
           }

          // Out of bounds
          if (eb.x < 0 || eb.x > worldSize || eb.y < 0 || eb.y > worldSize) {
            state.enemyBullets.splice(i, 1);
          }
        }

        // Render Particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
          const p = state.particles[i];
          p.x += p.vx; p.y += p.vy;
          p.life--;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.15, p.life / 5), 0, Math.PI * 2); ctx.fill();
          if (p.life <= 0) state.particles.splice(i, 1);
        }

        // Render Lightning Lines
        if (state.lightnings) {
          ctx.save();
          ctx.strokeStyle = '#00ffcc';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#00ffcc';
          ctx.shadowBlur = 8;
          for (let i = state.lightnings.length - 1; i >= 0; i--) {
            const l = state.lightnings[i];
            ctx.beginPath();
            ctx.moveTo(l.x1, l.y1);
            const midX = (l.x1 + l.x2) / 2 + (Math.random() - 0.5) * 20;
            const midY = (l.y1 + l.y2) / 2 + (Math.random() - 0.5) * 20;
            ctx.lineTo(midX, midY);
            ctx.lineTo(l.x2, l.y2);
            ctx.stroke();
            l.life--;
            if (l.life <= 0) {
              state.lightnings.splice(i, 1);
            }
          }
          ctx.restore();
        }

        // Update and Render Drones
        if (state.activeWeapons.includes('w-drones')) {
          const droneCount = 2;
          const orbitRadius = 45;
          const orbitSpeed = 0.003;
          const droneLvl = state.weaponLevels['w-drones'] || 1;
          const { damage, cooldown } = getWeaponStats('w-drones', droneLvl);

          if (!state.lastDroneFireTimes) {
            state.lastDroneFireTimes = Array(droneCount).fill(0);
          }

          ctx.save();
          for (let d = 0; d < droneCount; d++) {
            const angle = (timestamp * orbitSpeed) + (d * Math.PI);
            const dx = state.mecha.x + Math.cos(angle) * orbitRadius;
            const dy = state.mecha.y + Math.sin(angle) * orbitRadius;

            ctx.fillStyle = '#10b981';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(dx, dy, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            if (timestamp - state.lastDroneFireTimes[d] >= cooldown) {
              let nearest = null;
              let minDist = Infinity;
              state.enemies.forEach(e => {
                if (e.hp <= 0) return;
                const dist = Math.hypot(e.x - dx, e.y - dy);
                if (dist < minDist) {
                  minDist = dist;
                  nearest = e;
                }
              });

              if (nearest && minDist < 250) {
                state.lastDroneFireTimes[d] = timestamp;
                const aimAngle = Math.atan2(nearest.y - dy, nearest.x - dx);

                let projType = 'drone';
                let projColor = '#10b981';
                let projRadius = 3;
                let projSpeed = 12;

                if (state.passives.includes('p-drone-copy')) {
                  const mainW = state.activeWeapons[0];
                  if (mainW === 'w-machinegun') { projType = 'machinegun'; projColor = '#00ffcc'; projRadius = 4; projSpeed = 14; }
                  else if (mainW === 'w-energycannon') { projType = 'energycannon'; projColor = '#38bdf8'; projRadius = 10; projSpeed = 7; }
                  else if (mainW === 'w-laser') { projType = 'laser'; projColor = '#ff3366'; projRadius = 3; projSpeed = 20; }
                  else if (mainW === 'w-shotgun') { projType = 'shotgun'; projColor = '#ffaa00'; projRadius = 5; projSpeed = 12; }
                  else if (mainW === 'w-missile') { projType = 'missile'; projColor = '#ef4444'; projRadius = 6; projSpeed = 8; }
                  else if (mainW === 'w-grenadelauncher') { projType = 'grenade'; projColor = '#facc15'; projRadius = 7; projSpeed = 8; }
                  else if (mainW === 'w-railgun') { projType = 'railgun'; projColor = '#a855f7'; projRadius = 4; projSpeed = 22; }
                  else if (mainW === 'w-sniper') { projType = 'sniper'; projColor = '#e11d48'; projRadius = 5; projSpeed = 22; }
                  else if (mainW === 'w-flamethrower') { projType = 'flame'; projColor = '#f97316'; projRadius = 8; projSpeed = 6; }
                  else if (mainW === 'w-plasma') { projType = 'plasma'; projColor = '#00ffcc'; projRadius = 8; projSpeed = 10; }
                }

                state.bullets.push({
                  x: dx,
                  y: dy,
                  vx: Math.cos(aimAngle) * projSpeed,
                  vy: Math.sin(aimAngle) * projSpeed,
                  damage: damage,
                  type: projType,
                  radius: projRadius,
                  color: projColor,
                  bounces: 0,
                  pierces: 0,
                  hitEnemies: []
                });
                playSound('laser');
              }
            }
          }
          ctx.restore();
        }

        // Render Player Mecha
        ctx.save();
        ctx.translate(state.mecha.x, state.mecha.y);
        ctx.rotate(state.mecha.angle);
        if (state.mecha.hiddenV331) ctx.globalAlpha = 0;

        // v3.4.0 active mecha palette and industrial silhouette
        const mechPaletteV340 = typeof window.getActiveMechPaletteV340 === 'function' ? window.getActiveMechPaletteV340() : {armor:'#d7d0c2',dark:'#29343a',accent:'#a6523f',energy:'#e0ad4e'};
        ctx.fillStyle = getMechaDamageTint(timestamp) || (state.mecha.mismatchedPenalty ? '#ff3366' : mechPaletteV340.armor);
        ctx.shadowColor = mechPaletteV340.energy;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(24,0);ctx.lineTo(10,-16);ctx.lineTo(-7,-20);ctx.lineTo(-19,-11);ctx.lineTo(-22,0);ctx.lineTo(-19,11);ctx.lineTo(-7,20);ctx.lineTo(10,16);ctx.closePath();ctx.fill();
        ctx.strokeStyle = mechPaletteV340.dark;ctx.lineWidth = 3;ctx.stroke();
        ctx.fillStyle = mechPaletteV340.dark;ctx.fillRect(-7,-27,22,7);ctx.fillRect(-7,20,22,7);ctx.fillRect(-18,-7,9,14);
        ctx.fillStyle = mechPaletteV340.accent;ctx.fillRect(7,-12,12,7);ctx.fillRect(7,5,12,7);
        ctx.fillStyle = mechPaletteV340.energy;ctx.beginPath();ctx.arc(2,0,5,0,Math.PI*2);ctx.fill();
        ctx.restore();

        // Render Shield Bubble
        const isShieldBubbleActive = state.mecha.shieldActiveUntil && timestamp < state.mecha.shieldActiveUntil;
        if (isShieldBubbleActive) {
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 255, 204, 0.8)';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#00ffcc';
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(state.mecha.x, state.mecha.y, 35, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(0, 255, 204, 0.1)';
          ctx.fill();
          ctx.restore();
        }

        // Draw mini health, shield, and ammo/reload bars above the mecha (horizontal, not rotated)
        ctx.save();
        ctx.translate(state.mecha.x, state.mecha.y);
        if (state.mecha.hiddenV331 || state.deathSequenceV331?.active) ctx.globalAlpha = 0;

        const barW = 58;
        const hpH = 6;
        const shieldH = 5;
        const startY = -49;

        ctx.fillStyle = 'rgba(5, 8, 13, 0.86)';
        ctx.fillRect(-barW / 2 - 1, startY - 1, barW + 2, hpH + 2);
        const hpRatio = Math.max(0, state.mecha.hp / state.mecha.maxHp);
        ctx.fillStyle = '#22c98d';
        ctx.fillRect(-barW / 2, startY, barW * hpRatio, hpH);

        if (state.mecha.maxShield > 0) {
          ctx.fillStyle = 'rgba(5, 8, 13, 0.86)';
          ctx.fillRect(-barW / 2 - 1, startY + 8, barW + 2, shieldH + 2);
          const shieldRatio = Math.max(0, state.mecha.shield / state.mecha.maxShield);
          ctx.fillStyle = '#37bde5';
          ctx.fillRect(-barW / 2, startY + 9, barW * shieldRatio, shieldH);
        }

        ctx.restore();

        // Update and Render Damage Numbers
        ctx.save();
        ctx.font = 'bold 21px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let i = state.damageNumbers.length - 1; i >= 0; i--) {
          const dn = state.damageNumbers[i];
          dn.x += dn.vx;
          dn.y += dn.vy;
          dn.life--;

          const alpha = Math.max(0, dn.life / 30);
          ctx.globalAlpha = alpha;
          ctx.font = `bold ${dn.size || 22}px ui-sans-serif, system-ui, sans-serif`;
          ctx.fillStyle = dn.color || '#ffffff';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 4;
          ctx.strokeText(dn.text, dn.x, dn.y);
          ctx.fillText(dn.text, dn.x, dn.y);

          if (dn.life <= 0) {
            state.damageNumbers.splice(i, 1);
          }
        }
        ctx.restore();

        // Restore Camera Transform
        ctx.restore();
        drawFogV331(timestamp);

        enforceTransientEntityLimits();
        rafId = requestAnimationFrame(loop);
      }
      //#endregion game_loop

      //#region roguelite_draft · Roguelite upgrade draft modal logic
       function triggerLevelUp() {
         if (state.phase !== 'playing' || state.deathSequenceV331?.active || state.xp < state.xpNeeded) return false;
         state.level++;
         state.xp = Math.max(0, state.xp - state.xpNeeded);
         state.xpNeeded = Math.round(state.xpNeeded * 1.5);
         state.credits += 25;
         if (state.level >= 5 && !(state.awardedEvolutionMilestones || []).includes(5)) {
           state.awardedEvolutionMilestones = [...(state.awardedEvolutionMilestones || []), 5];
           awardEvolutionCoreV302('level-5-prototype');
         }

         const modal = document.getElementById('roguelike-draft-modal');
         const contentPanel = document.getElementById('draft-content-panel');
         state.phase = 'draft';
         render();
         state.isFiring = false;
         state.draftConfirming = false;
         state.draftConfirmArmed = false;
         state.draftInputLocked = true;
         state.draftReadyAt = performance.now() + 900;
         state.draftOpenToken = (state.draftOpenToken || 0) + 1;
         const openToken = state.draftOpenToken;

         const weaponSlotsFull = state.activeWeapons.length >= 6;
         const passiveSlotsFull = state.passives.length >= 6;
         let eligible = UPGRADE_POOL.filter(upgrade => {
           if (upgrade.type === 'weapon') {
             return !weaponSlotsFull || state.activeWeapons.includes(upgrade.id);
           }
           if (upgrade.type === 'passive') {
             return !passiveSlotsFull || state.passives.includes(upgrade.id);
           }
           return false;
         });
         eligible = eligible.concat(getEligibleEvolutionCardsV302());

         state.draftCards = selectDraftCardsV3(eligible, Math.min(3, eligible.length), state);
         const mandatoryEvolutionV302 = getEligibleEvolutionCardsV302()[0];
         if (mandatoryEvolutionV302 && !state.draftCards.some(card => card.id === mandatoryEvolutionV302.id)) {
           if (state.draftCards.length >= 3) state.draftCards[state.draftCards.length - 1] = mandatoryEvolutionV302;
           else state.draftCards.push(mandatoryEvolutionV302);
         }
         prepareDraftDiscoveriesV301(state.draftCards);
         state.draftSelection = 0;

         updateDraftMenuUI();
         if (modal) {
           modal.classList.remove('hidden');
           modal.classList.add('draft-locked');
         }
         if (contentPanel) {
           contentPanel.classList.remove('draft-pop-in');
           void contentPanel.offsetWidth;
           contentPanel.classList.add('draft-pop-in');
         }

         setTimeout(() => {
           if (state.phase !== 'draft' || state.draftOpenToken !== openToken) return;
           state.draftInputLocked = false;
           modal?.classList.remove('draft-locked');
           updateDraftMenuUI();
         }, 900);
         updateXpUI();
         return true;
       }
      //#endregion roguelite_draft
//#region controls · Non-static dynamic joystick and tap fire handlers
      let lastJoystickYDir = 0;
      let lastJoystickXDir = 0;
      let joystickUsed = false;
      let developerUnlocked = false;
      let confirmInputLockedUntil = 0;

      function lockConfirmInput(duration = 520) {
        confirmInputLockedUntil = Math.max(confirmInputLockedUntil, performance.now() + duration);
        if (state) state.isFiring = false;
      }

      function canAcceptConfirmInput() {
        return performance.now() >= confirmInputLockedUntil;
      }

      const UI_I18N = {
        es: {
          play:'JUGAR', global:'RED GLOBAL DE MECHAS', settings:'CONFIGURACIÓN', developer:'MODO DEVELOPER',
          pause_title:'JUEGO PAUSADO', resume:'REANUDAR', abandon:'ABANDONAR', confirm:'CONFIRMAR', cancel:'CANCELAR',
          level_up:'¡NUEVO NIVEL!', choose_upgrade:'ELIGE UNA MEJORA TÁCTICA', settings_title:'CONFIGURACIÓN DE SISTEMA',
          music:'VOLUMEN DE MÚSICA', sfx:'VOLUMEN EFECTOS DE SONIDO (SFX)', language:'IDIOMA', back_menu:'VOLVER AL MENÚ',
          global_title:'RED GLOBAL DE MECHAS', failed:'MISIÓN FALLIDA', destroyed:'MECHA DESTRUIDO', level:'NIVEL', points:'PUNTOS', cores:'NÚCLEOS', retry:'JUGAR DE NUEVO',
          move:'MOVER', navigate:'NAVEGAR', pause:'PAUSA', fire:'DISPARAR', hud_time:'TIEMPO', hud_enemies:'ENEMIGOS:', hud_level:'NIVEL:', hud_points:'PUNTOS:',
          fullscreen_install:'En iPhone: Compartir → Añadir a pantalla de inicio. Ábrelo desde el icono para ocultar Safari.', immersive_exit:'SALIR DEL MODO INMERSIVO', immersive_enter:'ACTIVAR MODO INMERSIVO'
        },
        en: {
          play:'PLAY', global:'GLOBAL MECHA NETWORK', settings:'SETTINGS', developer:'DEVELOPER MODE',
          pause_title:'GAME PAUSED', resume:'RESUME', abandon:'QUIT RUN', confirm:'CONFIRM', cancel:'CANCEL',
          level_up:'LEVEL UP!', choose_upgrade:'CHOOSE A TACTICAL UPGRADE', settings_title:'SYSTEM SETTINGS',
          music:'MUSIC VOLUME', sfx:'SOUND EFFECTS VOLUME (SFX)', language:'LANGUAGE', back_menu:'BACK TO MENU',
          global_title:'GLOBAL MECHA NETWORK', failed:'MISSION FAILED', destroyed:'MECHA DESTROYED', level:'LEVEL', points:'SCORE', cores:'CORES', retry:'PLAY AGAIN',
          move:'MOVE', navigate:'NAVIGATE', pause:'PAUSE', fire:'FIRE', hud_time:'TIME', hud_enemies:'ENEMIES:', hud_level:'LEVEL:', hud_points:'SCORE:',
          fullscreen_install:'On iPhone: Share → Add to Home Screen. Open from the icon to hide Safari.', immersive_exit:'EXIT IMMERSIVE MODE', immersive_enter:'ENTER IMMERSIVE MODE'
        },
        pt: {
          play:'JOGAR', global:'REDE GLOBAL DE MECHAS', settings:'CONFIGURAÇÕES', developer:'MODO DESENVOLVEDOR',
          pause_title:'JOGO PAUSADO', resume:'CONTINUAR', abandon:'ABANDONAR', confirm:'CONFIRMAR', cancel:'CANCELAR',
          level_up:'NOVO NÍVEL!', choose_upgrade:'ESCOLHA UMA MELHORIA TÁTICA', settings_title:'CONFIGURAÇÕES DO SISTEMA',
          music:'VOLUME DA MÚSICA', sfx:'VOLUME DOS EFEITOS (SFX)', language:'IDIOMA', back_menu:'VOLTAR AO MENU',
          global_title:'REDE GLOBAL DE MECHAS', failed:'MISSÃO FRACASSADA', destroyed:'MECHA DESTRUÍDO', level:'NÍVEL', points:'PONTOS', cores:'NÚCLEOS', retry:'JOGAR NOVAMENTE',
          move:'MOVER', navigate:'NAVEGAR', pause:'PAUSA', fire:'DISPARAR', hud_time:'TEMPO', hud_enemies:'INIMIGOS:', hud_level:'NÍVEL:', hud_points:'PONTOS:',
          fullscreen_install:'No iPhone: Compartilhar → Adicionar à Tela de Início. Abra pelo ícone para ocultar o Safari.', immersive_exit:'SAIR DO MODO IMERSIVO', immersive_enter:'ATIVAR MODO IMERSIVO'
        }
      };

      function tr(key) {
        const lang = UI_I18N[SETTINGS_STATE.language] ? SETTINGS_STATE.language : 'es';
        return UI_I18N[lang][key] || UI_I18N.es[key] || key;
      }

      function setUiText(id, key) {
        const el = document.getElementById(id);
        if (el) el.textContent = tr(key);
      }

      function applyLanguage(lang, persist = true) {
        SETTINGS_STATE.language = UI_I18N[lang] ? lang : 'es';
        document.documentElement.lang = SETTINGS_STATE.language;
        const pairs = {
          'btn-main-play':'play','btn-main-global':'global','btn-main-settings':'settings','btn-main-dev':'developer',
          'pause-title':'pause_title','btn-resume':'resume','btn-exit':'abandon','btn-confirm-exit':'confirm','btn-cancel-exit':'cancel',
          'draft-level-title':'level_up','draft-choose-title':'choose_upgrade','settings-title':'settings_title',
          'settings-bgm-label':'music','settings-sfx-label':'sfx','settings-language-label':'language','btn-close-settings':'back_menu',
          'global-title':'global_title','btn-close-global':'back_menu','gameover-failed-label':'failed','gameover-title':'destroyed',
          'gameover-level-label':'level','gameover-score-label':'points','gameover-cores-label':'cores',
          'btn-gameover-retry':'retry','btn-gameover-menu':'back_menu'
        };
        Object.entries(pairs).forEach(([id,key]) => setUiText(id,key));
        document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = tr(el.dataset.i18n); });
        document.querySelectorAll('#language-buttons-container .lang-btn').forEach(btn => {
          btn.classList.toggle('language-active', btn.dataset.lang === SETTINGS_STATE.language);
        });
        if (persist) saveRuntimeSettings();
      }

      function installPersistentConsoleControls() {
        if (document.getElementById('persistent-console-controls')) return;
        const pause = document.getElementById('btn-control-pause');
        const mute = document.getElementById('btn-mute');
        const fullscreen = document.getElementById('btn-fullscreen');
        if (!pause || !mute || !fullscreen) return;
        const cluster = document.createElement('div');
        cluster.id = 'persistent-console-controls';
        const smallRow = document.createElement('div');
        smallRow.className = 'persistent-small-row';
        smallRow.append(mute, fullscreen);
        cluster.append(pause, smallRow);
        document.body.appendChild(cluster);
      }

      function updatePersistentConsoleControls() {
        const pause = document.getElementById('btn-control-pause');
        if (!pause) return;
        const enabled = state.phase === 'playing';
        pause.disabled = !enabled;
        pause.classList.toggle('console-control-disabled', !enabled);
      }

      function installBrowserGestureLock() {
        const stop = event => {
          if (event.cancelable) event.preventDefault();
        };
        ['gesturestart','gesturechange','gestureend','dblclick','contextmenu','dragstart','selectstart'].forEach(type => {
          document.addEventListener(type, stop, { passive:false });
        });
        document.addEventListener('touchmove', stop, { passive:false });
        let lastTouchEnd = 0;
        document.addEventListener('touchend', event => {
          const now = Date.now();
          if (now - lastTouchEnd < 420 && event.cancelable) event.preventDefault();
          lastTouchEnd = now;
        }, { passive:false });
        document.addEventListener('keydown', event => {
          if ((event.ctrlKey || event.metaKey) && ['+','-','=','0'].includes(event.key)) event.preventDefault();
        });
      }

      function triggerExitTransition(destination = 'menu') {
        lockConfirmInput(1100);
        vibrate(160);
        playSound('hit');

        const activeScreen = document.querySelector(`.screen[data-show-on="${state.phase === 'draft' ? 'playing' : state.phase}"]`);
        const virtualScreen = activeScreen?.firstElementChild;
        virtualScreen?.classList.add('screen-shake');

        const overlay = document.getElementById('white-out-overlay');
        if (overlay && virtualScreen && overlay.parentElement !== virtualScreen) virtualScreen.appendChild(overlay);
        if (overlay) {
          overlay.classList.remove('opacity-0', 'opacity-100');
          overlay.style.opacity = '1';
          overlay.style.pointerEvents = 'none';
        }

        setTimeout(() => {
          virtualScreen?.classList.remove('screen-shake');
          state.paused = false;
          state.pauseConfirmState = false;
          document.getElementById('pause-modal')?.classList.add('hidden');

          if (destination === 'dev' || ((state.testMode || state.isDevPlay) && destination !== 'menu')) openDeveloperMenu();
          else startMainMenu();

          setTimeout(() => {
            if (overlay) {
              overlay.style.opacity = '0';
              overlay.classList.add('opacity-0', 'pointer-events-none');
            }
          }, 80);
        }, 620);
      }

      function confirmPauseAction() {
        if (!canAcceptConfirmInput()) return;
        lockConfirmInput(280);
        if (!state.pauseConfirmState) {
          if (state.pauseSelection === 'resume') {
            state.paused = false;
            document.getElementById('pause-modal')?.classList.add('hidden');
            vibrate(50);
          } else if (state.pauseSelection === 'exit') {
            if (isImmersiveMode()) {
              exitImmersiveMode();
              state.paused = false;
              state.pauseConfirmState = false;
              document.getElementById('pause-modal')?.classList.add('hidden');
              vibrate(50);
            } else {
              state.pauseConfirmState = true;
              state.pauseSelection = 'cancel';
              updatePauseMenuUI(); vibrate(50);
            }
          }
        } else if (state.pauseSelection === 'confirm') {
          triggerExitTransition(state.testMode || state.isDevPlay ? 'dev' : 'menu');
        } else {
          state.paused = false; state.pauseConfirmState = false;
          document.getElementById('pause-modal')?.classList.add('hidden'); vibrate(50);
        }
      }

      function handlePauseJoystickInput(jx, jy) {
        if (!joystickUsed && (Math.abs(jx) > 0.3 || Math.abs(jy) > 0.3)) {
          joystickUsed = true;
          updatePauseMenuUI();
        }
        if (jy < -0.5) {
          if (lastJoystickYDir !== -1) {
            lastJoystickYDir = -1;
            if (!state.pauseConfirmState) {
              state.pauseSelection = 'resume';
            } else {
              state.pauseSelection = 'confirm';
            }
            updatePauseMenuUI();
            vibrate(30);
          }
        } else if (jy > 0.5) {
          if (lastJoystickYDir !== 1) {
            lastJoystickYDir = 1;
            if (!state.pauseConfirmState) {
              state.pauseSelection = 'exit';
            } else {
              state.pauseSelection = 'cancel';
            }
            updatePauseMenuUI();
            vibrate(30);
          }
        } else {
          lastJoystickYDir = 0;
        }

        // La palanca solo navega. El botón rojo confirma la selección.
        lastJoystickXDir = 0;
      }

      function updatePauseMenuUI() {
        if (!joystickUsed) {
          const unselected = "w-full bg-slate-900/60 text-gray-400 font-title text-xs py-1.5 rounded-lg border border-slate-800 transition-all duration-200";
          ['btn-resume','btn-exit','btn-confirm-exit','btn-cancel-exit'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.className = unselected;
          });
          return;
        }
        const btnResume = document.getElementById('btn-resume');
        const btnExit = document.getElementById('btn-exit');
        const btnConfirm = document.getElementById('btn-confirm-exit');
        const btnCancel = document.getElementById('btn-cancel-exit');
        if (!btnResume || !btnExit || !btnConfirm || !btnCancel) return;
        btnExit.textContent = isImmersiveMode() ? tr('immersive_exit') : tr('abandon');

        const selectedCyan = "w-full bg-gradient-to-r from-cyan-600 to-teal-700 text-white font-title text-xs py-1.5 rounded-lg border-2 border-cyan-400 shadow-lg scale-105 heartbeat-card transition-all duration-200";
        const selectedRed = "w-full bg-gradient-to-r from-pink-600 to-rose-700 text-white font-title text-xs py-1.5 rounded-lg border-2 border-pink-400 shadow-lg scale-105 heartbeat-card transition-all duration-200";
        const unselected = "w-full bg-slate-900/60 text-gray-400 font-title text-xs py-1.5 rounded-lg border border-slate-800 transition-all duration-200";

        if (!state.pauseConfirmState) {
          document.getElementById('pause-normal-buttons').classList.remove('hidden');
          document.getElementById('pause-confirm-buttons').classList.add('hidden');
          if (state.pauseSelection === 'resume') {
            btnResume.className = selectedCyan;
            btnExit.className = unselected;
          } else {
            btnResume.className = unselected;
            btnExit.className = selectedCyan; // Same color as resume
          }
        } else {
          document.getElementById('pause-normal-buttons').classList.add('hidden');
          document.getElementById('pause-confirm-buttons').classList.remove('hidden');
          if (state.pauseSelection === 'confirm') {
            btnConfirm.className = selectedRed; // Red
            btnCancel.className = unselected;
          } else {
            btnConfirm.className = unselected;
            btnCancel.className = selectedCyan; // Cyan/Teal
          }
        }
      }

      function confirmDraftAction() {
        if (state.draftConfirming) return;
        const now = performance.now();
        if (state.draftInputLocked || now < state.draftReadyAt) {
          vibrate(20);
          return;
        }

        const cards = state.draftCards;
        if (!cards || !cards[state.draftSelection]) return;

        // Primera pulsación: arma la elección. La segunda la confirma.
        if (!state.draftConfirmArmed) {
          state.draftConfirmArmed = true;
          state.draftArmReadyAt = now + 260;
          updateDraftMenuUI();
          vibrate(35);
          return;
        }
        if (now < state.draftArmReadyAt) return;

        const upg = cards[state.draftSelection];
        const isEvolution = upg.type === 'evolution';
        const isWeapon = upg.type === 'weapon' || isEvolution;
        const alreadyOwned = isWeapon ? state.activeWeapons.includes(upg.id) : state.passives.includes(upg.id);
        const categoryFull = isEvolution ? false : (isWeapon ? state.activeWeapons.length >= 6 : state.passives.length >= 6);

        // Defensa final: jamás reemplazar un slot completo.
        if (!alreadyOwned && categoryFull) {
          vibrate(80);
          state.draftConfirming = false;
          state.draftConfirmArmed = false;
          updateDraftMenuUI();
          return;
        }

        recordDraftChoiceV3(upg, cards);
        state.draftConfirming = true;
        const container = document.getElementById('upgrade-cards-container');
        if (container) {
          const selectedCardElement = container.children[state.draftSelection];
          if (selectedCardElement) {
            selectedCardElement.classList.remove('heartbeat-card', 'draft-confirm-armed');
            selectedCardElement.classList.add('shake-confirm');
            setTimeout(() => selectedCardElement.classList.add('white-out-card'), 200);
          }
        }

        setTimeout(() => {
          if (isEvolution) {
            if (!applyEvolutionV302(upg.id)) {
              state.draftConfirming = false;
              state.draftConfirmArmed = false;
              return;
            }
          } else if (isWeapon) {
            if (alreadyOwned) {
              const maxLevel = WEAPON_MAX_LEVEL_V302[upg.id] || 99;
              state.weaponLevels[upg.id] = Math.min(maxLevel, (state.weaponLevels[upg.id] || 1) + 1);
            } else {
              state.activeWeapons.push(upg.id);
              state.weaponLevels[upg.id] = 1;
            }
          } else {
            if (alreadyOwned) {
              state.passiveLevels[upg.id] = (state.passiveLevels[upg.id] || 1) + 1;
            } else {
              state.passives.push(upg.id);
              state.passiveLevels[upg.id] = 1;
            }
          }
          calculateMechaStats();
          const modal = document.getElementById('roguelike-draft-modal');
          if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('draft-locked');
          }
          state.phase = 'playing';
          render();
          state.draftConfirming = false;
          state.draftConfirmArmed = false;
          state.draftInputLocked = false;
          vibrate(50);
        }, 500);
      }

      function handleDraftJoystickInput(jx, jy) {
        if (state.draftConfirming || state.draftInputLocked) return;
        const tiltThreshold = 0.5;
        let dir = 0;
        if (jx < -tiltThreshold) dir = -1;
        else if (jx > tiltThreshold) dir = 1;

        if (dir !== 0) {
          if (lastJoystickXDir !== dir) {
            lastJoystickXDir = dir;
            let nextSelection = state.draftSelection + dir;
            const len = state.draftCards ? state.draftCards.length : 3;
            if (nextSelection < 0) nextSelection = len - 1;
            else if (nextSelection > len - 1) nextSelection = 0;
            state.draftSelection = nextSelection;
            state.draftConfirmArmed = false;
            updateDraftMenuUI();
            vibrate(30);
          }
        } else {
          lastJoystickXDir = 0;
        }
      }

      function updateDraftMenuUI() {
        const container = document.getElementById('upgrade-cards-container');
        if (!container || !state.draftCards) return;
        container.innerHTML = '';

        state.draftCards.forEach((upg, idx) => {
          const isEvolution = upg.type === 'evolution';
          const isWeapon = upg.type === 'weapon' || isEvolution;
          const currentLvl = isWeapon ? (state.weaponLevels[upg.id] || 0) : (state.passiveLevels[upg.id] || 0);
          const isSelected = state.draftSelection === idx;
          const metaV3 = getContentMetaV3(upg.id);
          const rarityV3 = metaV3?.rarity || 'common';
          const langV331=SETTINGS_STATE.language;
          const wordV331=(es,en,pt)=>langV331==='en'?en:langV331==='pt'?pt:es;
          const kindLabelV3 = isEvolution ? wordV331('EVOLUCIÓN','EVOLUTION','EVOLUÇÃO') : (metaV3?.kind === 'power' ? wordV331('PODER','POWER','PODER') : metaV3?.kind === 'module' ? wordV331('MÓDULO','MODULE','MÓDULO') : wordV331('ARMA','WEAPON','ARMA'));
          const discovery = (state.draftDiscoveryFlags && state.draftDiscoveryFlags[upg.id]) || {};

          const wrapper = document.createElement('div');
          wrapper.className = [
            'mekora-draft-wrapper',
            isSelected ? 'is-selected' : '',
            state.draftConfirmArmed && isSelected ? 'draft-confirm-armed' : '',
            discovery.isNewContent || discovery.isNewRarity ? 'is-new-discovery' : '',
            discovery.isNewRarity ? 'is-new-rarity' : ''
          ].filter(Boolean).join(' ');
          wrapper.dataset.rarity = rarityV3;
          wrapper.dataset.contentId = upg.id;
          wrapper.setAttribute('aria-label', `${upg.title}. ${kindLabelV3}.`);

          const card = document.createElement('div');
          card.className = 'mekora-draft-card';
          card.innerHTML = `
            <div class="draft-card-topline">
              <span class="draft-card-kind">${kindLabelV3}</span>
              <span class="draft-new-badge">${wordV331('NUEVO','NEW','NOVO')}</span>
            </div>
            <div class="draft-card-icon">${upg.icon}</div>
            <div class="draft-card-title">${upg.title}</div>
            <div class="draft-card-desc">${upg.desc}</div>
            <div class="draft-card-level">${isEvolution ? wordV331('CONSUME 1 NÚCLEO','CONSUMES 1 CORE','CONSOME 1 NÚCLEO') : (currentLvl > 0 ? `${wordV331('NIVEL','LEVEL','NÍVEL')} ${currentLvl} → ${Math.min(WEAPON_MAX_LEVEL_V302[upg.id] || 99, currentLvl + 1)}` : `${wordV331('NIVEL','LEVEL','NÍVEL')} 1`)}</div>
          `;
          wrapper.appendChild(card);
          container.appendChild(wrapper);
        });
      }

      function getMainMenuButtonsV32() {
        return ['btn-main-play','btn-main-hangar','btn-main-global','btn-main-settings','btn-main-dev']
          .map(id=>document.getElementById(id)).filter(btn=>btn&&!btn.classList.contains('hidden'));
      }
      function updateMainMenuUI() {
        if(state.hangarOpenV32){updateHangarUIV32();return;}
        const buttons=getMainMenuButtonsV32(); if(!buttons.length)return;
        state.menuSelectionIndex=Number.isFinite(state.menuSelectionIndex)?state.menuSelectionIndex:0;
        state.menuSelectionIndex=(state.menuSelectionIndex+buttons.length)%buttons.length;
        const selectedStyle="w-full bg-gradient-to-r from-cyan-600 to-teal-700 text-white font-title text-[10px] py-1.5 px-4 rounded-lg border-2 border-cyan-400 shadow-lg scale-105 heartbeat-card transition-all duration-200";
        const unselectedStyle="w-full bg-slate-900/60 text-gray-400 font-title text-[10px] py-1.5 px-4 rounded-lg border border-slate-800 transition-all duration-200";
        buttons.forEach((btn,idx)=>{btn.className=idx===state.menuSelectionIndex?selectedStyle:unselectedStyle;btn.style.pointerEvents='none';});
      }
      function confirmMenuAction() {
        if(!canAcceptConfirmInput()||state.phase!=='menu')return;
        if(state.hangarOpenV32){lockConfirmInput(230);confirmHangarActionV32();vibrate(42);return;}
        const buttons=getMainMenuButtonsV32();const selectedBtn=buttons[state.menuSelectionIndex];if(!selectedBtn)return;
        lockConfirmInput(560);vibrate(50);playSound('equip');
        if(selectedBtn.id==='btn-main-play')startRun();
        else if(selectedBtn.id==='btn-main-hangar')openHangarV32();
        else if(selectedBtn.id==='btn-main-global'){stopRun();state.phase='global_network';joystickUsed=true;render();updateGlobalStatsUI();updateGlobalNetworkUI();}
        else if(selectedBtn.id==='btn-main-settings')startSettingsMenu();
        else if(selectedBtn.id==='btn-main-dev')openDeveloperMenu();
      }
      function handleMenuJoystickInput(jx,jy) {
        joystickUsed=true;if(state.hangarOpenV32){handleHangarJoystickInputV32(jx,jy);return;}
        const buttons=getMainMenuButtonsV32();const len=buttons.length;if(!len)return;
        if(jy<-.5&&lastJoystickYDir!==-1){lastJoystickYDir=-1;state.menuSelectionIndex=(state.menuSelectionIndex-1+len)%len;updateMainMenuUI();vibrate(30);}
        else if(jy>.5&&lastJoystickYDir!==1){lastJoystickYDir=1;state.menuSelectionIndex=(state.menuSelectionIndex+1)%len;updateMainMenuUI();vibrate(30);}
        else if(Math.abs(jy)<=.5)lastJoystickYDir=0;lastJoystickXDir=0;
      }

      function updateGlobalNetworkUI() {
        const btn = document.getElementById('btn-close-global');
        if (!btn) return;
        btn.className = "mt-2 w-full bg-gradient-to-r from-cyan-600 to-teal-700 text-white font-title text-[10px] py-1.5 rounded border-2 border-cyan-400 shadow-lg scale-105 heartbeat-card transition-all duration-200";
        btn.style.pointerEvents = 'none';
      }

      function confirmGlobalAction() {
        if (state.phase !== 'global_network' || !canAcceptConfirmInput()) return;
        lockConfirmInput(560); vibrate(50); playSound('equip'); startMainMenu();
      }

      function handleGlobalJoystickInput(jx, jy) {
        if (!joystickUsed && (Math.abs(jx) > 0.3 || Math.abs(jy) > 0.3)) {
          joystickUsed = true;
          updateGlobalNetworkUI();
        }
        // La palanca no confirma acciones. El botón rojo cierra esta pantalla.
        lastJoystickXDir = 0;
      }

      function updateSettingsMenuUI() {
        document.querySelectorAll('[data-settings-idx], #slider-bgm, #slider-sfx, .lang-btn, #btn-close-settings').forEach(el => {
          el.classList.remove('settings-focus', 'settings-edit-focus');
          el.style.outline = '';
          el.style.outlineOffset = '';
          if (!el.classList.contains('language-active')) el.style.background = '';
        });
        document.querySelectorAll('#language-buttons-container .lang-btn').forEach(btn => {
          btn.classList.toggle('language-active', btn.dataset.lang === SETTINGS_STATE.language);
        });
        const idx = Number.isFinite(state.settingsSelectionIndex) ? state.settingsSelectionIndex : 0;
        const container = document.querySelector(`[data-settings-idx="${idx}"]`);
        if (!container) return;
        const focusClass = state.settingsEditMode && idx !== 3 ? 'settings-edit-focus' : 'settings-focus';
        if (idx === 0) document.getElementById('slider-bgm')?.classList.add(focusClass);
        else if (idx === 1) document.getElementById('slider-sfx')?.classList.add(focusClass);
        else if (idx === 2) {
          const buttons = container.querySelectorAll('.lang-btn');
          buttons[state.langSelectionIndex]?.classList.add(focusClass);
        } else document.getElementById('btn-close-settings')?.classList.add('settings-focus');
      }

      function handleSettingsJoystickInput(jx, jy) {
        if (!joystickUsed && (Math.abs(jx) > 0.3 || Math.abs(jy) > 0.3)) {
          joystickUsed = true;
          updateSettingsMenuUI();
        }
        const settingsItems = 4;
        if (state.settingsSelectionIndex === undefined) state.settingsSelectionIndex = 0;
        if (state.langSelectionIndex === undefined) state.langSelectionIndex = 0;
         // In edit mode, left/right adjusts the value, up/down does nothing
         if (state.settingsEditMode) {
           if (state.settingsEditTarget === 'slider-bgm' || state.settingsEditTarget === 'slider-sfx') {
             if (jx < -0.5) {
               if (lastJoystickXDir !== -1) {
                 lastJoystickXDir = -1;
                 const slider = document.getElementById(state.settingsEditTarget);
                 if (slider) { slider.value = Math.max(0, parseInt(slider.value) - 5); slider.dispatchEvent(new Event('input')); }
                 vibrate(20);
               }
             } else if (jx > 0.5) {
               if (lastJoystickXDir !== 1) {
                 lastJoystickXDir = 1;
                 const slider = document.getElementById(state.settingsEditTarget);
                 if (slider) { slider.value = Math.min(100, parseInt(slider.value) + 5); slider.dispatchEvent(new Event('input')); }
                 vibrate(20);
               }
             } else { lastJoystickXDir = 0; }
           } else if (state.settingsEditTarget === 'language') {
             const langBtns = document.querySelectorAll('#language-buttons-container .lang-btn');
             if (jx < -0.5) {
               if (lastJoystickXDir !== -1) {
                 lastJoystickXDir = -1;
                 state.langSelectionIndex = (state.langSelectionIndex - 1 + langBtns.length) % langBtns.length;
                 updateSettingsMenuUI();
                 vibrate(20);
               }
             } else if (jx > 0.5) {
               if (lastJoystickXDir !== 1) {
                 lastJoystickXDir = 1;
                 state.langSelectionIndex = (state.langSelectionIndex + 1) % langBtns.length;
                 updateSettingsMenuUI();
                 vibrate(20);
               }
             } else { lastJoystickXDir = 0; }
           }
           return;
         }
         // Not in edit mode: up/down navigates between items, left/right does nothing
         if (jy < -0.5) {
           if (lastJoystickYDir !== -1) {
             lastJoystickYDir = -1;
            state.settingsSelectionIndex = (state.settingsSelectionIndex - 1 + settingsItems) % settingsItems;
            updateSettingsMenuUI();
            vibrate(30);
          }
        } else if (jy > 0.5) {
          if (lastJoystickYDir !== 1) {
            lastJoystickYDir = 1;
            state.settingsSelectionIndex = (state.settingsSelectionIndex + 1) % settingsItems;
            updateSettingsMenuUI();
            vibrate(30);
          }
        } else {
          lastJoystickYDir = 0;
        }

        // Left/right does nothing in navigation mode
        lastJoystickXDir = 0;
     }

      function confirmSettingsAction() {
        if (state.phase !== 'settings' || !canAcceptConfirmInput()) return;
        if (state.settingsEditMode) {
          if (state.settingsEditTarget === 'language') {
            const selectedBtn = document.querySelectorAll('#language-buttons-container .lang-btn')[state.langSelectionIndex];
            if (selectedBtn) applyLanguage(selectedBtn.dataset.lang, true);
          } else {
            saveRuntimeSettings();
          }
          state.settingsEditMode = false;
          state.settingsEditTarget = null;
          lockConfirmInput(240);
          updateSettingsMenuUI(); vibrate(50); playSound('equip');
          return;
        }
        if (state.settingsSelectionIndex === 0) { state.settingsEditMode = true; state.settingsEditTarget = 'slider-bgm'; }
        else if (state.settingsSelectionIndex === 1) { state.settingsEditMode = true; state.settingsEditTarget = 'slider-sfx'; }
        else if (state.settingsSelectionIndex === 2) { state.settingsEditMode = true; state.settingsEditTarget = 'language'; }
        else if (state.settingsSelectionIndex === 3) {
          lockConfirmInput(600); vibrate(50); playSound('equip'); startMainMenu(); return;
        }
        lockConfirmInput(220); updateSettingsMenuUI(); vibrate(50); playSound('equip');
      }

       function updateGameoverUI() {
        const retry = document.getElementById('btn-gameover-retry');
        const menu = document.getElementById('btn-gameover-menu');
        if (!retry || !menu) return;
        const selection = state.gameoverSelection || 'retry';
        retry.classList.toggle('is-selected', selection === 'retry');
        menu.classList.toggle('is-selected', selection === 'menu');
        retry.style.pointerEvents = 'none'; menu.style.pointerEvents = 'none';
      }

       function confirmGameoverAction() {
        if (state.phase !== 'gameover' || !canAcceptConfirmInput()) return;
        lockConfirmInput(650); vibrate(50); playSound('equip');
        if ((state.gameoverSelection || 'retry') === 'retry') startRun();
        else triggerExitTransition('menu');
      }

       function handleGameoverJoystickInput(jx, jy) {
        joystickUsed = true;
        if (jy < -0.5 && lastJoystickYDir !== -1) {
          lastJoystickYDir = -1; state.gameoverSelection = 'retry'; updateGameoverUI(); vibrate(30);
        } else if (jy > 0.5 && lastJoystickYDir !== 1) {
          lastJoystickYDir = 1; state.gameoverSelection = 'menu'; updateGameoverUI(); vibrate(30);
        } else if (Math.abs(jy) <= 0.5) lastJoystickYDir = 0;
        lastJoystickXDir = 0;
      }

      function capturePointerSafely(element, pointerId) {
        if (!element || typeof element.setPointerCapture !== 'function') return;
        try {
          element.setPointerCapture(pointerId);
        } catch (e) {}
      }


      function installDeviceProfile() {
        const ua = navigator.userAgent || '';
        const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
        document.documentElement.classList.toggle('device-ios', isIOS);
        document.documentElement.classList.toggle('display-standalone', isStandalone);
        const syncViewport = () => {
          const viewport = window.visualViewport;
          document.documentElement.style.setProperty('--visual-width', `${viewport?.width || window.innerWidth}px`);
          document.documentElement.style.setProperty('--visual-height', `${viewport?.height || window.innerHeight}px`);
          document.documentElement.classList.toggle('orientation-landscape', window.innerWidth > window.innerHeight);
        };
        syncViewport();
        window.visualViewport?.addEventListener('resize', syncViewport, { passive: true });
        window.visualViewport?.addEventListener('scroll', syncViewport, { passive: true });
        window.addEventListener('orientationchange', () => setTimeout(syncViewport, 80), { passive: true });
        window.addEventListener('resize', syncViewport, { passive: true });
      }

      function createNavigationRepeater(callback, activeCheck = () => true) {
        let active = false;
        let x = 0;
        let y = 0;
        let startedAt = 0;
        let lastRepeatAt = 0;
        let frame = 0;
        let lastVectorKey = '';

        const directionKey = (jx, jy) => {
          const dx = jx < -0.5 ? -1 : jx > 0.5 ? 1 : 0;
          const dy = jy < -0.5 ? -1 : jy > 0.5 ? 1 : 0;
          return `${dx}:${dy}`;
        };

        const tick = now => {
          if (!active) return;
          const key = directionKey(x, y);
          if (key !== '0:0' && activeCheck() && now - startedAt >= 290 && now - lastRepeatAt >= 95) {
            lastRepeatAt = now;
            lastJoystickXDir = 0;
            lastJoystickYDir = 0;
            callback(x, y);
          }
          frame = requestAnimationFrame(tick);
        };

        return {
          begin() {
            active = true;
            startedAt = performance.now();
            lastRepeatAt = startedAt;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(tick);
          },
          set(jx, jy) {
            x = jx; y = jy;
            const key = directionKey(x, y);
            if (key !== lastVectorKey) {
              lastVectorKey = key;
              startedAt = performance.now();
              lastRepeatAt = startedAt;
            }
          },
          end() {
            active = false;
            x = 0; y = 0;
            lastVectorKey = '';
            cancelAnimationFrame(frame);
          }
        };
      }

      function setupJoystickEvents() {
        const moveZone = document.getElementById('joystick-move-zone');
        const moveKnob = document.getElementById('joystick-move-knob');
        const fireBtn = document.getElementById('btn-tap-fire');

        const menuMoveZone = document.getElementById('menu-joystick-move-zone');
        const menuMoveKnob = document.getElementById('menu-joystick-move-knob');
        const menuFireBtn = document.getElementById('btn-menu-tap-fire');

        const globalMoveZone = document.getElementById('global-joystick-move-zone');
        const globalMoveKnob = document.getElementById('global-joystick-move-knob');
        const globalFireBtn = document.getElementById('btn-global-tap-fire');

        const settingsMoveZone = document.getElementById('settings-joystick-move-zone');
        const settingsMoveKnob = document.getElementById('settings-joystick-move-knob');
        const settingsFireBtn = document.getElementById('settings-btn-tap-fire');

        const gameoverMoveZone = document.getElementById('gameover-joystick-move-zone');
        const gameoverMoveKnob = document.getElementById('gameover-joystick-move-knob');
        const gameoverFireBtn = document.getElementById('btn-gameover-tap-fire');

        let movePointerId = null;
        let centerClientX = 0;
        let centerClientY = 0;

        let menuMovePointerId = null;
        let menuCenterClientX = 0;
        let menuCenterClientY = 0;

        let globalMovePointerId = null;
        let globalCenterClientX = 0;
        let globalCenterClientY = 0;

        let settingsMovePointerId = null;
        let settingsCenterClientX = 0;
        let settingsCenterClientY = 0;

        let gameoverMovePointerId = null;
        let gameoverCenterClientX = 0;
        let gameoverCenterClientY = 0;

        const menuNavRepeater = createNavigationRepeater(handleMenuJoystickInput, () => state.phase === 'menu');
        const settingsNavRepeater = createNavigationRepeater(handleSettingsJoystickInput, () => state.phase === 'settings');
        const gameoverNavRepeater = createNavigationRepeater(handleGameoverJoystickInput, () => state.phase === 'gameover');
        const playOverlayRepeater = createNavigationRepeater((jx, jy) => {
          if (state.fieldShopOpenV32) handleFieldShopJoystickInputV32(jx, jy);
          else if (state.paused) handlePauseJoystickInput(jx, jy);
          else if (state.phase === 'draft') handleDraftJoystickInput(jx, jy);
          else if (state.phase === 'gameover') handleGameoverJoystickInput(jx, jy);
        }, () => state.fieldShopOpenV32 || state.paused || state.phase === 'draft' || state.phase === 'gameover');

        if (menuMoveZone) {
          menuMoveZone.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            initAudio();
            menuMovePointerId = e.pointerId;
            capturePointerSafely(menuMoveZone, e.pointerId);

            menuCenterClientX = e.clientX;
            menuCenterClientY = e.clientY;
            menuNavRepeater.begin();
            updateMenuMoveKnob(e);
          });

          menuMoveZone.addEventListener('pointermove', (e) => {
            if (e.pointerId === menuMovePointerId) updateMenuMoveKnob(e);
          });

          const endMenuMove = (e) => {
            if (e.pointerId === menuMovePointerId) {
              menuMovePointerId = null;
              menuMoveKnob.style.transform = `translate(0px, 0px)`;
              menuNavRepeater.end();
              lastJoystickYDir = 0;
              lastJoystickXDir = 0;
            }
          };
          menuMoveZone.addEventListener('pointerup', endMenuMove);
          menuMoveZone.addEventListener('pointercancel', endMenuMove);
        }

        function updateMenuMoveKnob(e) {
          let dx = e.clientX - menuCenterClientX;
          let dy = e.clientY - menuCenterClientY;
          const dist = Math.hypot(dx, dy);
          const maxR = 50;
          if (dist > maxR) {
            dx = (dx / dist) * maxR;
            dy = (dy / dist) * maxR;
          }
          menuMoveKnob.style.transform = `translate(${dx}px, ${dy}px)`;

          const jx = dx / maxR;
          const jy = dy / maxR;
          menuNavRepeater.set(jx, jy);
          handleMenuJoystickInput(jx, jy);
        }

        if (menuFireBtn) {
          menuFireBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            initAudio();
            if (!canAcceptConfirmInput()) return;
            confirmMenuAction();
          });
        }

        if (globalMoveZone) {
          globalMoveZone.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            initAudio();
            globalMovePointerId = e.pointerId;
            capturePointerSafely(globalMoveZone, e.pointerId);

            globalCenterClientX = e.clientX;
            globalCenterClientY = e.clientY;
            updateGlobalMoveKnob(e);
          });

          globalMoveZone.addEventListener('pointermove', (e) => {
            if (e.pointerId === globalMovePointerId) updateGlobalMoveKnob(e);
          });

          const endGlobalMove = (e) => {
            if (e.pointerId === globalMovePointerId) {
              globalMovePointerId = null;
              globalMoveKnob.style.transform = `translate(0px, 0px)`;
              lastJoystickYDir = 0;
              lastJoystickXDir = 0;
            }
          };
          globalMoveZone.addEventListener('pointerup', endGlobalMove);
          globalMoveZone.addEventListener('pointercancel', endGlobalMove);
        }

        function updateGlobalMoveKnob(e) {
          let dx = e.clientX - globalCenterClientX;
          let dy = e.clientY - globalCenterClientY;
          const dist = Math.hypot(dx, dy);
          const maxR = 50;
          if (dist > maxR) {
            dx = (dx / dist) * maxR;
            dy = (dy / dist) * maxR;
          }
          globalMoveKnob.style.transform = `translate(${dx}px, ${dy}px)`;

          const jx = dx / maxR;
          const jy = dy / maxR;
          handleGlobalJoystickInput(jx, jy);
        }

        if (globalFireBtn) {
          globalFireBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            initAudio();
            if (!canAcceptConfirmInput()) return;
            confirmGlobalAction();
          });
        }

         if (settingsMoveZone) {
           settingsMoveZone.addEventListener('pointerdown', (e) => {
             e.preventDefault();
             initAudio();
             state.settingsJoystickInUse = true;
             settingsMovePointerId = e.pointerId;
             capturePointerSafely(settingsMoveZone, e.pointerId);
             settingsCenterClientX = e.clientX;
             settingsCenterClientY = e.clientY;
             settingsNavRepeater.begin();
             updateSettingsMoveKnob(e);
           });
           settingsMoveZone.addEventListener('pointermove', (e) => {
             if (e.pointerId === settingsMovePointerId) updateSettingsMoveKnob(e);
           });
           const endSettingsMove = (e) => {
             if (e.pointerId === settingsMovePointerId) {
               settingsMovePointerId = null;
               state.settingsJoystickInUse = false;
               settingsMoveKnob.style.transform = `translate(0px, 0px)`;
               settingsNavRepeater.end();
               lastJoystickYDir = 0;
               lastJoystickXDir = 0;
             }
           };
           settingsMoveZone.addEventListener('pointerup', endSettingsMove);
           settingsMoveZone.addEventListener('pointercancel', endSettingsMove);
         }

         function updateSettingsMoveKnob(e) {
           let dx = e.clientX - settingsCenterClientX;
           let dy = e.clientY - settingsCenterClientY;
           const dist = Math.hypot(dx, dy);
           const maxR = 50;
           if (dist > maxR) {
             dx = (dx / dist) * maxR;
             dy = (dy / dist) * maxR;
           }
           settingsMoveKnob.style.transform = `translate(${dx}px, ${dy}px)`;
           const jx = dx / maxR;
           const jy = dy / maxR;
           settingsNavRepeater.set(jx, jy);
           handleSettingsJoystickInput(jx, jy);
         }

         if (settingsFireBtn) {
           settingsFireBtn.addEventListener('pointerdown', (e) => {
             e.preventDefault();
             if (state.settingsJoystickInUse) return;
             initAudio();
             if (!canAcceptConfirmInput()) return;
             confirmSettingsAction();
           });
         }

        // Gameover joystick
        if (gameoverMoveZone) {
          gameoverMoveZone.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            initAudio();
            state.gameoverJoystickInUse = true;
            gameoverMovePointerId = e.pointerId;
            capturePointerSafely(gameoverMoveZone, e.pointerId);
            gameoverCenterClientX = e.clientX;
            gameoverCenterClientY = e.clientY;
            gameoverNavRepeater.begin();
            updateGameoverMoveKnob(e);
          });
          gameoverMoveZone.addEventListener('pointermove', (e) => {
            if (e.pointerId === gameoverMovePointerId) updateGameoverMoveKnob(e);
          });
          const endGameoverMove = (e) => {
            if (e.pointerId === gameoverMovePointerId) {
              gameoverMovePointerId = null;
              state.gameoverJoystickInUse = false;
              gameoverMoveKnob.style.transform = `translate(0px, 0px)`;
              gameoverNavRepeater.end();
              lastJoystickYDir = 0;
              lastJoystickXDir = 0;
            }
          };
          gameoverMoveZone.addEventListener('pointerup', endGameoverMove);
          gameoverMoveZone.addEventListener('pointercancel', endGameoverMove);
        }

        function updateGameoverMoveKnob(e) {
          let dx = e.clientX - gameoverCenterClientX;
          let dy = e.clientY - gameoverCenterClientY;
          const dist = Math.hypot(dx, dy);
          const maxR = 50;
          if (dist > maxR) {
            dx = (dx / dist) * maxR;
            dy = (dy / dist) * maxR;
          }
          gameoverMoveKnob.style.transform = `translate(${dx}px, ${dy}px)`;
          const jx = dx / maxR;
          const jy = dy / maxR;
          gameoverNavRepeater.set(jx, jy);
          handleGameoverJoystickInput(jx, jy);
        }

        if (gameoverFireBtn) {
          gameoverFireBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (state.gameoverJoystickInUse) return;
            initAudio();
            if (!canAcceptConfirmInput()) return;
            confirmGameoverAction();
          });
        }

        if (moveZone) {
          moveZone.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            initAudio();
            movePointerId = e.pointerId;
            capturePointerSafely(moveZone, e.pointerId);

            // Non-static joystick: center floats to where user touches!
            const rect = moveZone.getBoundingClientRect();
            centerClientX = e.clientX;
            centerClientY = e.clientY;
            playOverlayRepeater.begin();
            updateMoveKnob(e);
          });

          moveZone.addEventListener('pointermove', (e) => {
            if (e.pointerId === movePointerId) updateMoveKnob(e);
          });

          const endMove = (e) => {
            if (e.pointerId === movePointerId) {
              movePointerId = null;
              state.moveJoystick.active = false;
              state.moveJoystick.x = 0; state.moveJoystick.y = 0;
              moveKnob.style.transform = `translate(0px, 0px)`;
              playOverlayRepeater.end();
              lastJoystickYDir = 0;
              lastJoystickXDir = 0;
            }
          };
          moveZone.addEventListener('pointerup', endMove);
          moveZone.addEventListener('pointercancel', endMove);
        }

        function updateMoveKnob(e) {
          let dx = e.clientX - centerClientX;
          let dy = e.clientY - centerClientY;
          const dist = Math.hypot(dx, dy);
          const maxR = 50;
          if (dist > maxR) {
            dx = (dx / dist) * maxR;
            dy = (dy / dist) * maxR;
          }
          moveKnob.style.transform = `translate(${dx}px, ${dy}px)`;
          state.moveJoystick.active = true;
          state.moveJoystick.x = dx / maxR;
          state.moveJoystick.y = dy / maxR;
          playOverlayRepeater.set(state.moveJoystick.x, state.moveJoystick.y);

          if (state.fieldShopOpenV32) {
            handleFieldShopJoystickInputV32(state.moveJoystick.x, state.moveJoystick.y);
          } else if (state.paused) {
            handlePauseJoystickInput(state.moveJoystick.x, state.moveJoystick.y);
          } else if (state.phase === 'draft') {
            handleDraftJoystickInput(state.moveJoystick.x, state.moveJoystick.y);
           } else if (state.phase === 'gameover') {
             handleGameoverJoystickInput(state.moveJoystick.x, state.moveJoystick.y);
          }
        }

        if (fireBtn) {
          fireBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            initAudio();
            if (!canAcceptConfirmInput()) return;
            if (state.fieldShopOpenV32) {
              confirmFieldShopActionV32();
              vibrate(50);
              return;
            }
            if (state.paused) {
              confirmPauseAction();
              vibrate(50);
              return;
            }
            if (state.phase === 'draft') {
              if (state.draftConfirming) return;
              confirmDraftAction();
              vibrate(50);
              return;
            }
             if (state.phase === 'gameover') {
               confirmGameoverAction();
               vibrate(50);
               return;
             }
            state.isFiring = true;
            capturePointerSafely(fireBtn, e.pointerId);
          });
          const endFire = (e) => {
            state.isFiring = false;
          };
          fireBtn.addEventListener('pointerup', endFire);
          fireBtn.addEventListener('pointercancel', endFire);
        }
      }
      //#endregion controls

      //#region lifecycle · Application lifecycle and initialization
      function stopRun() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      }

      function startRun(isDev = false, isTest = false) {
        stopRun();
        rewardDraftTokenV31++;
        const devSettings = isDev ? {
          devInfHp: state.devInfHp,
          devInfShield: state.devInfShield,
          devInfAmmo: state.devInfAmmo,
          devNoCooldown: state.devNoCooldown,
          devInvulnerable: state.devInvulnerable,
          speedMult: state.stats.speedMult,
          dpsMult: state.stats.dpsMult,
          fireRateMult: state.stats.fireRateMult,
          devPauseEnemies: state.devPauseEnemies,
          devSlowMo: state.devSlowMo,
          devSpeedUp: state.devSpeedUp,
          activeWeapons: [...state.activeWeapons],
          weaponLevels: {...state.weaponLevels},
          passives: [...state.passives],
          passiveLevels: {...state.passiveLevels},
          activatedSynergies: [...(state.activatedSynergies || [])],
          testDummyEnabled: state.testDummyEnabled,
          testDummyMortal: state.testDummyMortal,
          testSpawnEnemies: state.testSpawnEnemies,
          dummyStats: {...(state.dummyStats || {})},
          devContinuousSpawn: state.testSpawnEnemies,
          isDevPlay: true
        } : null;

        state = createState();
        document.getElementById('roguelike-draft-modal')?.classList.add('hidden');
        const resetScoreHudV31 = document.getElementById('hud-score');
        if (resetScoreHudV31) resetScoreHudV31.textContent = '0';
        const noticeV31 = document.getElementById('encounter-notice-v31');
        if (noticeV31) { clearTimeout(noticeV31._hideTimerV31); noticeV31.classList.remove('show'); noticeV31.textContent = ''; }
        document.getElementById('boss-hud-v31')?.classList.add('hidden');
        hudCache.timerSecond = -1;
        hudCache.loadoutSignature = '';
        hudCache.enemyCount = -1;
        hudCache.xpPct = -1;
        hudCache.level = -1;
        hudCache.xpText = '';

        if (devSettings) {
          state.devInfHp = devSettings.devInfHp;
          state.devInfShield = devSettings.devInfShield;
          state.devInfAmmo = devSettings.devInfAmmo;
          state.devNoCooldown = devSettings.devNoCooldown;
          state.devInvulnerable = devSettings.devInvulnerable;
          state.stats.speedMult = devSettings.speedMult;
          state.stats.dpsMult = devSettings.dpsMult;
          state.stats.fireRateMult = devSettings.fireRateMult;
          state.devPauseEnemies = devSettings.devPauseEnemies;
          state.devSlowMo = devSettings.devSlowMo;
          state.devSpeedUp = devSettings.devSpeedUp;
          state.activeWeapons = devSettings.activeWeapons;
          state.weaponLevels = devSettings.weaponLevels;
          state.passives = devSettings.passives;
          state.passiveLevels = devSettings.passiveLevels;
          state.activatedSynergies = devSettings.activatedSynergies;
          state.testDummyEnabled = devSettings.testDummyEnabled;
          state.testDummyMortal = devSettings.testDummyMortal;
          state.testSpawnEnemies = devSettings.testSpawnEnemies;
          state.dummyStats = devSettings.dummyStats;
          state.devContinuousSpawn = devSettings.devContinuousSpawn;
          state.isDevPlay = true;
          state.testMode = Boolean(isTest);
        } else {
          state.devContinuousSpawn = true;
        }

        state.phase = 'playing';
        state.started = true;
        lockConfirmInput(520);
        canvas = dom.gameCanvas || document.getElementById('game-canvas');
        ctx = canvas.getContext('2d');
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        const worldSize = getCurrentWorldSize();
        state.mecha.x = Math.round(worldSize * 0.34);
        state.mecha.y = Math.round(worldSize * 0.5);
        initializeRunSectorsV33();
        if (state.testMode) {
          state.devContinuousSpawn = state.testSpawnEnemies;
          ensureTestEnvironment(0);
        }

        calculateMechaStats();
        state.nextFieldShopAtV32 = 60000;
        state.fieldShopOpenV32 = false;
        document.getElementById('field-shop-modal-v32')?.classList.add('hidden');
        updateEconomyHudV32();
        updateMissionTrackingHudV32();
        updateBossHudV31();
        const testHud = document.getElementById('test-mode-hud');
        if (testHud) testHud.classList.toggle('hidden', !state.testMode);
        updateDummyStatsUI();
        render();
        rafId = requestAnimationFrame(loop);
      }


      function getNativeFullscreenElement() {
        return document.fullscreenElement || document.webkitFullscreenElement || null;
      }

      function isPseudoFullscreen() {
        return document.body.classList.contains('mekora-pseudo-fullscreen');
      }


      function isStandaloneDisplayMode() {
        return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
      }

      function isBrowserFullscreenActive() {
        return Boolean(getNativeFullscreenElement()) || isPseudoFullscreen() || isStandaloneDisplayMode();
      }

      function isImmersiveMode() {
        return document.body.classList.contains('mekora-immersive');
      }

      function getActiveCameraZoom() {
        const configured = Math.max(.74, Number(SETTINGS_STATE.cameraZoom) || .84);
        return Math.min(1.02, configured + .08);
      }

      function syncImmersiveOrientation() {
        const warning = dom.orientationWarning || document.getElementById('orientation-warning');
        if (!warning) return;
        const portraitBlocked = isImmersiveMode() && window.innerHeight > window.innerWidth;
        warning.style.display = portraitBlocked ? 'flex' : 'none';
        document.body.dataset.immersiveOrientationBlocked = portraitBlocked ? 'true' : 'false';
      }

      async function enterImmersiveMode() {
        if (state.phase !== 'playing' && state.phase !== 'draft') return false;
        document.documentElement.classList.add('mekora-immersive');
        document.body.classList.add('mekora-immersive');
        document.body.dataset.immersive = 'true';
        try { await screen.orientation?.lock?.('landscape'); } catch (error) {}
        syncImmersiveOrientation();
        updateFullscreenButton();
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        return true;
      }

      function exitImmersiveMode() {
        document.documentElement.classList.remove('mekora-immersive');
        document.body.classList.remove('mekora-immersive');
        document.body.dataset.immersive = 'false';
        try { screen.orientation?.unlock?.(); } catch (error) {}
        const warning = dom.orientationWarning || document.getElementById('orientation-warning');
        if (warning) warning.style.display = 'none';
        document.body.dataset.immersiveOrientationBlocked = 'false';
        updateFullscreenButton();
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        return true;
      }

      function updateFullscreenButton() {
        const button = document.getElementById('btn-fullscreen');
        const path = document.getElementById('fullscreen-icon-path');
        if (!button || !path) return;
        const browserActive = isBrowserFullscreenActive();
        const immersive = isImmersiveMode();
        button.dataset.active = browserActive ? 'true' : 'false';
        button.dataset.immersive = immersive ? 'true' : 'false';
        const canEnterImmersive = browserActive && (state.phase === 'playing' || state.phase === 'draft') && !immersive;
        button.setAttribute('aria-label', immersive ? tr('immersive_exit') : (canEnterImmersive ? tr('immersive_enter') : (browserActive ? 'Salir de pantalla completa' : 'Entrar en pantalla completa')));
        path.setAttribute('d', immersive
          ? 'M7 7h10v10H7zM3.75 8.25v-4.5h4.5m7.5 0h4.5v4.5m0 7.5v4.5h-4.5m-7.5 0h-4.5v-4.5'
          : (browserActive ? 'M9 9H3.75V3.75M15 9h5.25V3.75M15 15h5.25v5.25M9 15H3.75v5.25' : 'M8.25 3.75h-4.5v4.5m12-4.5h4.5v4.5m0 7.5v4.5h-4.5m-7.5 0h-4.5v-4.5'));
      }

      function setPseudoFullscreen(active) {
        document.documentElement.classList.toggle('mekora-pseudo-fullscreen', active);
        document.body.classList.toggle('mekora-pseudo-fullscreen', active);
        document.documentElement.style.height = active ? `${window.innerHeight}px` : '';
        document.body.style.height = active ? `${window.innerHeight}px` : '';
        if (active) {
          window.scrollTo(0, 1);
          setTimeout(() => window.scrollTo(0, 1), 120);
        }
        updateFullscreenButton();
      }

      async function toggleFullscreenMode() {
        if (isImmersiveMode()) {
          exitImmersiveMode();
          return;
        }

        if (isBrowserFullscreenActive()) {
          if (state.phase === 'playing' || state.phase === 'draft') {
            await enterImmersiveMode();
            return;
          }
          const nativeElement = getNativeFullscreenElement();
          if (nativeElement) {
            try { await (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); } catch (error) {}
          }
          setPseudoFullscreen(false);
          updateFullscreenButton();
          return;
        }

        const root = document.documentElement;
        const request = root.requestFullscreen || root.webkitRequestFullscreen;
        if (request) {
          try {
            await request.call(root, { navigationUI: 'hide' });
            updateFullscreenButton();
            return;
          } catch (error) {}
        }
        setPseudoFullscreen(true);
        const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (isiOS && !isStandaloneDisplayMode()) {
          const hint = document.getElementById('fullscreen-install-hint');
          if (hint) {
            hint.textContent = tr('fullscreen_install'); hint.classList.remove('hidden');
            clearTimeout(hint._hideTimer); hint._hideTimer = setTimeout(() => hint.classList.add('hidden'), 4200);
          }
        }
      }

      function unlockDeveloperMode(forceState = null) {
        developerUnlocked = forceState === null ? !developerUnlocked : Boolean(forceState);
        const button = document.getElementById('btn-main-dev');
        if (button) button.classList.toggle('hidden', !developerUnlocked);
        state.menuSelectionIndex = 0;
        joystickUsed = false;
        updateMainMenuUI();
        applyLanguage(SETTINGS_STATE.language, false);
        vibrate(35);
      }

      function syncDeveloperButtonVisibility() {
        const button = document.getElementById('btn-main-dev');
        if (button) button.classList.toggle('hidden', !developerUnlocked);
      }

      function startMainMenu() {
        stopRun();
        rewardDraftTokenV31++;
        state.phase = 'menu';
        state.hangarOpenV32 = false;
        document.getElementById('hangar-modal-v32')?.classList.add('hidden');
        state.menuSelectionIndex = 0;
        joystickUsed = true;
        joystickUsed = true;
        lastJoystickXDir = 0; lastJoystickYDir = 0;
        document.getElementById('test-mode-hud')?.classList.add('hidden');
        document.body.dataset.testMode = 'false';
        dom.bossHudV31?.classList.add('hidden');
        syncDeveloperButtonVisibility();
        render(); updateGlobalStatsUI(); updateMainMenuUI();
        lockConfirmInput(580);
      }

      function startSettingsMenu() {
        stopRun();
        state.phase = 'settings';
        state.settingsSelectionIndex = 0;
        state.langSelectionIndex = Math.max(0, ['es','en','pt'].indexOf(SETTINGS_STATE.language));
        state.settingsEditMode = false; state.settingsEditTarget = null;
        joystickUsed = true; lastJoystickXDir = 0; lastJoystickYDir = 0;
        render(); updateSettingsMenuUI(); lockConfirmInput(560);
      }

      function endRun() {
        stopRun();
        if (state.testMode) {
          state.phase = 'dev';
          state.started = false;
          state.testMode = false;
          render();
          state.devStatus = 'Prueba finalizada. Configuración conservada.';
          updateDevMenuUI();
          return;
        }

        state.phase = 'gameover';
        joystickUsed = true;
        state.gameoverSelection = 'retry';
        lastJoystickXDir = 0;
        lastJoystickYDir = 0;
        lockConfirmInput(700);
        saveLastRunResult({
          score: state.score,
          public: true,
          result: { score: state.score, sector: state.sector }
        });
        document.getElementById('final-wave-text').textContent = state.level;
        document.getElementById('text-final').textContent = state.score;
        const coreAwardV32 = awardRunCoresV32();
        document.getElementById('reward-credits-text').textContent = `+${coreAwardV32}`;
        state.credits += coreAwardV32;
        updateGlobalStatsOnEnd(state.score, state.level, state.totalEnemiesDefeated);
        render();
        updateGameoverUI();
      }

      function render() {
  try { updatePrimaryAmmoHudV301(); } catch(e) {}
        if (isImmersiveMode() && state.phase !== 'playing' && state.phase !== 'draft') exitImmersiveMode();
        if (isImmersiveMode()) syncImmersiveOrientation();

        document.body.dataset.phase = state.phase;
        document.body.dataset.testMode = state.testMode ? 'true' : 'false';
        updateEconomyHudV32();
        updateMissionTrackingHudV32();
        updateSectorHudV33();
        updatePersistentConsoleControls();
      }

      function initApp() {
        __mekoraBindAmmoHud();
        normalizePrimaryMagazineV301();
        updatePrimaryAmmoHudV301();
        installDeviceProfile();
        document.body.dataset.phase = 'menu';
        state.phase = 'menu';
        cacheDomRefs();
        initializeEconomyV32();
        initializeSectorProgressionV33();
        updateEconomyHudV32();
        updateMissionTrackingHudV32();
        document.querySelectorAll('.screen').forEach(screen => screen.firstElementChild?.classList.add('virtual-screen'));
        installPersistentConsoleControls();
        installBrowserGestureLock();
        applyLanguage(SETTINGS_STATE.language, false);
const btnControlPause = document.getElementById('btn-control-pause');
        if (btnControlPause) {
          btnControlPause.onclick = () => {
            if (state.phase === 'playing') {
              if (state.fieldShopOpenV32) return;
              if (!state.paused && canAcceptConfirmInput()) {
                lockConfirmInput(420);
                state.paused = true;
                state.pauseSelection = 'resume';
                state.pauseConfirmState = false;
                document.getElementById('pause-modal').classList.remove('hidden');
                document.getElementById('pause-normal-buttons').classList.remove('hidden');
                document.getElementById('pause-confirm-buttons').classList.add('hidden');
                joystickUsed = true;
                updatePauseMenuUI();
                vibrate(30);
              }
            }
          };
        }
        const btnMute = document.getElementById('btn-mute');
        if (btnMute) {
          btnMute.onclick = () => {
            state.muted = !state.muted;
            const icon = document.getElementById('mute-icon');
            if (icon) {
              const path = icon.querySelector('path');
              if (path) {
                path.setAttribute('d', state.muted ? icon.dataset.mutedPath : icon.dataset.unmutedPath);
              }
            }
            vibrate(30);
          };
        }

        const btnFullscreen = document.getElementById('btn-fullscreen');
        if (btnFullscreen) {
          btnFullscreen.onclick = () => {
            vibrate(30);
            toggleFullscreenMode();
          };
        }
        const syncFullscreenUi = () => {
          if (isImmersiveMode() && !isBrowserFullscreenActive()) exitImmersiveMode();
          updateFullscreenButton();
        };
        document.addEventListener('fullscreenchange', syncFullscreenUi);
        document.addEventListener('webkitfullscreenchange', syncFullscreenUi);
        window.addEventListener('resize', syncImmersiveOrientation, { passive:true });
        window.addEventListener('orientationchange', () => setTimeout(syncImmersiveOrientation, 80), { passive:true });
        updateFullscreenButton();

        ['settings-version-text'].forEach(id => {
          const version = document.getElementById(id);
          if (!version) return;
          let lastVersionToggleAt = 0;
          const unlockFromVersion = event => {
            event.preventDefault();
            const now = performance.now();
            if (now - lastVersionToggleAt < 420) return;
            lastVersionToggleAt = now;
            unlockDeveloperMode();
          };
          version.addEventListener('pointerup', unlockFromVersion);
          version.addEventListener('click', unlockFromVersion);
        });
        syncDeveloperButtonVisibility();

       const sliderBgm = document.getElementById('slider-bgm');
        const valBgmText = document.getElementById('val-bgm-text');
        if (sliderBgm) {
          sliderBgm.value = Math.round(getConfig('tune', 'bgm-volume', 0.8) * 100);
          if (valBgmText) valBgmText.textContent = sliderBgm.value + '%';
          sliderBgm.oninput = (e) => {
            const val = parseInt(e.target.value) / 100;
            SETTINGS_STATE.bgmVolume = val;
            saveRuntimeSettings();
            if (valBgmText) valBgmText.textContent = e.target.value + '%';
          };
        }

        const sliderSfx = document.getElementById('slider-sfx');
        const valSfxText = document.getElementById('val-sfx-text');
        if (sliderSfx) {
          sliderSfx.value = Math.round(getConfig('tune', 'sfx-volume', 0.9) * 100);
          if (valSfxText) valSfxText.textContent = sliderSfx.value + '%';
          sliderSfx.oninput = (e) => {
            const val = parseInt(e.target.value) / 100;
            SETTINGS_STATE.sfxVolume = val;
            saveRuntimeSettings();
            if (valSfxText) valSfxText.textContent = e.target.value + '%';
          };
        }

        // Language buttons and active locale.
        state.langSelectionIndex = Math.max(0, ['es','en','pt'].indexOf(SETTINGS_STATE.language));
        applyLanguage(SETTINGS_STATE.language, false);
        setupJoystickEvents();
        setupDeveloperControls();
        startMainMenu();

        // Orientation warning removed so players can play in portrait mode freely
        const warningEl = dom.orientationWarning;
        if (warningEl) warningEl.style.display = 'none';
      }

      function getDevSectionItems(sectionId) {
        if (sectionId === 'weapons') return WEAPON_UPGRADES;
        if (sectionId === 'passives') return PASSIVE_UPGRADES;
        if (sectionId === 'synergies') return SYNERGIES;
        if (sectionId === 'test') {
          return [
            { id: 'dummy', title: 'Dummy de prueba' },
            { id: 'dummy-mode', title: 'Comportamiento del dummy' },
            { id: 'enemies', title: 'Generar enemigos' },
            { id: 'inf-hp', title: 'Vida infinita' },
            { id: 'inf-shield', title: 'Escudo infinito' },
            { id: 'no-cooldown', title: 'Sin enfriamiento' },
            { id: 'inf-ammo', title: 'Munición infinita' },
            { id: 'reset-metrics', title: 'Reiniciar métricas' },
            { id: 'start-test', title: 'INICIAR CAMPO DE PRUEBAS' }
          ];
        }
        return [];
      }

      function getDevItemValue(sectionId, item) {
        if (sectionId === 'weapons') {
          const equipped = state.activeWeapons.includes(item.id);
          return equipped ? `EQUIPADA · NIV ${state.weaponLevels[item.id] || 1}` : 'NO EQUIPADA';
        }
        if (sectionId === 'passives') {
          const equipped = state.passives.includes(item.id);
          return equipped ? `ACTIVA · NIV ${state.passiveLevels[item.id] || 1}` : 'NO ACTIVA';
        }
        if (sectionId === 'synergies') {
          return state.activatedSynergies.includes(item.id) ? 'EQUIPADA · ROJO: RETIRAR' : 'ROJO: EQUIPAR';
        }
        const testValues = {
          'dummy': state.testDummyEnabled ? 'ACTIVO' : 'DESACTIVADO',
          'dummy-mode': state.testDummyMortal ? 'MUERE Y REAPARECE' : 'DAÑO INFINITO',
          'enemies': state.testSpawnEnemies ? 'ACTIVOS' : 'DESACTIVADOS',
          'inf-hp': state.devInfHp ? 'SÍ' : 'NO',
          'inf-shield': state.devInfShield ? 'SÍ' : 'NO',
          'no-cooldown': state.devNoCooldown ? 'SÍ' : 'NO',
          'inf-ammo': state.devInfAmmo ? 'SÍ' : 'NO',
          'reset-metrics': 'EJECUTAR',
          'start-test': 'CONFIRMAR'
        };
        return testValues[item.id] || '';
      }

      function setDevStatus(message) {
        state.devStatus = message;
        const line = document.getElementById('dev-status-line');
        if (line) line.textContent = message;
      }

      function openDeveloperMenu() {
        stopRun(); state.phase = 'dev'; state.testMode = false;
        document.getElementById('test-mode-hud')?.classList.add('hidden');
        state.devFocus = 'tabs';
        state.devSectionIndex = Math.max(0, DEV_SECTIONS.findIndex(section => section.id === (state.devActiveSection || 'weapons')));
        state.devItemIndex = 0; render(); updateDevMenuUI(); lockConfirmInput(560);
      }

      function updateDevMenuUI() {
        const tabs = document.getElementById('dev-section-tabs');
        const list = document.getElementById('dev-compact-list');
        const section = DEV_SECTIONS[state.devSectionIndex] || DEV_SECTIONS[0];
        const activeSectionId = state.devActiveSection || 'weapons';

        const weaponSlots = document.getElementById('dev-weapon-slots');
        const passiveSlots = document.getElementById('dev-passive-slots');
        if (weaponSlots) weaponSlots.textContent = `${state.activeWeapons.length}/6`;
        if (passiveSlots) passiveSlots.textContent = `${state.passives.length}/6`;

        if (tabs) {
          tabs.innerHTML = DEV_SECTIONS.map((tab, index) => {
            const classes = ['dev-tab'];
            if (state.devFocus === 'tabs' && index === state.devSectionIndex) classes.push('cursor');
            if (tab.id === activeSectionId && tab.id !== 'exit') classes.push('active');
            return `<div class="${classes.join(' ')}">${tab.label}</div>`;
          }).join('');
        }

        if (!list) return;
        if (state.devFocus === 'tabs') {
          list.innerHTML = `<div class="dev-row selected"><span>${section.label}</span><span class="dev-value">${section.id === 'exit' ? 'VOLVER' : 'ABRIR'}</span></div>`;
          setDevStatus(state.devStatus || 'LISTO');
          return;
        }

        const items = getDevSectionItems(activeSectionId);
        if (!items.length) {
          list.innerHTML = '<div class="dev-row selected"><span>Sin opciones disponibles</span><span class="dev-value">ARRIBA: PESTAÑAS</span></div>';
          return;
        }
        state.devItemIndex = Math.max(0, Math.min(state.devItemIndex, items.length - 1));
        const visibleCount = 5;
        let startIndex = Math.max(0, state.devItemIndex - 2);
        startIndex = Math.min(startIndex, Math.max(0, items.length - visibleCount));
        const visibleItems = items.slice(startIndex, startIndex + visibleCount);

        list.innerHTML = visibleItems.map((item, localIndex) => {
          const absoluteIndex = startIndex + localIndex;
          const selected = absoluteIndex === state.devItemIndex;
          const icon = item.icon ? `${item.icon} ` : '';
          const title = item.title || item.name || item.id;
          return `<div class="dev-row ${selected ? 'selected' : ''}">
            <span>${icon}${title}</span>
            <span class="dev-value">${getDevItemValue(activeSectionId, item)}</span>
          </div>`;
        }).join('');

        const pageText = `${state.devItemIndex + 1}/${items.length}`;
        setDevStatus(pageText);
      }

      function modifyDevLevel(sectionId, direction) {
        const items = getDevSectionItems(sectionId);
        const item = items[state.devItemIndex];
        if (!item) return;
        if (sectionId === 'weapons') {
          if (!state.activeWeapons.includes(item.id)) {
            setDevStatus('Equipa el arma con el botón rojo antes de cambiar su nivel.');
            return;
          }
          state.weaponLevels[item.id] = Math.max(1, Math.min(20, (state.weaponLevels[item.id] || 1) + direction));
        } else if (sectionId === 'passives') {
          if (!state.passives.includes(item.id)) {
            setDevStatus('Activa la pasiva con el botón rojo antes de cambiar su nivel.');
            return;
          }
          state.passiveLevels[item.id] = Math.max(1, Math.min(20, (state.passiveLevels[item.id] || 1) + direction));
        } else {
          return;
        }
        calculateMechaStats();
        updateDevMenuUI();
      }

      function toggleDevWeapon(id) {
        const index = state.activeWeapons.indexOf(id);
        if (index >= 0) {
          state.activeWeapons.splice(index, 1);
          delete state.weaponLevels[id];
          setDevStatus('Arma retirada.');
        } else if (state.activeWeapons.length >= 6) {
          setDevStatus('Slots de armas llenos. Retira una antes de equipar otra.');
          vibrate(80);
          return;
        } else {
          state.activeWeapons.push(id);
          state.weaponLevels[id] = 1;
          setDevStatus('Arma equipada.');
        }
        calculateMechaStats();
      }

      function toggleDevPassive(id) {
        const index = state.passives.indexOf(id);
        if (index >= 0) {
          state.passives.splice(index, 1);
          delete state.passiveLevels[id];
          setDevStatus('Pasiva retirada.');
        } else if (state.passives.length >= 6) {
          setDevStatus('Slots de pasivas llenos. Retira una antes de activar otra.');
          vibrate(80);
          return;
        } else {
          state.passives.push(id);
          state.passiveLevels[id] = 1;
          setDevStatus('Pasiva activada.');
        }
        calculateMechaStats();
      }

      function equipDevSynergy(id) {
        const synergy = SYNERGY_BY_ID.get(id);
        if (!synergy) return;
        if (state.activatedSynergies.includes(id)) {
          state.activatedSynergies = state.activatedSynergies.filter(synId => synId !== id);
          state.activeWeapons = state.activeWeapons.filter(weaponId => weaponId !== id);
          delete state.weaponLevels[id];
          calculateMechaStats();
          setDevStatus('Sinergia desequipada. Sus componentes pueden equiparse otra vez.');
          return;
        }
        const missingWeapons = synergy.reqs.filter(req => req.startsWith('w-') && !state.activeWeapons.includes(req));
        const missingPassives = synergy.reqs.filter(req => req.startsWith('p-') && !state.passives.includes(req));
        const weaponReqs = synergy.reqs.filter(req => req.startsWith('w-'));
        const projectedWeaponCount = state.activeWeapons.length + missingWeapons.length - weaponReqs.length + 1;
        if (projectedWeaponCount > 6) { setDevStatus('No hay suficientes slots de armas.'); vibrate(80); return; }
        if (state.passives.length + missingPassives.length > 6) { setDevStatus('No hay suficientes slots de pasivas.'); vibrate(80); return; }
        missingWeapons.forEach(req => { state.activeWeapons.push(req); state.weaponLevels[req] = 1; });
        missingPassives.forEach(req => { state.passives.push(req); state.passiveLevels[req] = 1; });
        calculateMechaStats();
        setDevStatus('Sinergia equipada. Las armas componentes fueron consumidas.');
      }

      function executeDevTestOption(id) {
        if (id === 'dummy') state.testDummyEnabled = !state.testDummyEnabled;
        else if (id === 'dummy-mode') state.testDummyMortal = !state.testDummyMortal;
        else if (id === 'enemies') state.testSpawnEnemies = !state.testSpawnEnemies;
        else if (id === 'inf-hp') state.devInfHp = !state.devInfHp;
        else if (id === 'inf-shield') state.devInfShield = !state.devInfShield;
        else if (id === 'no-cooldown') state.devNoCooldown = !state.devNoCooldown;
        else if (id === 'inf-ammo') state.devInfAmmo = !state.devInfAmmo;
        else if (id === 'reset-metrics') {
          resetDummyStats();
          setDevStatus('Métricas del dummy reiniciadas.');
        } else if (id === 'start-test') {
          startRun(true, true);
          return;
        }
        updateDevMenuUI();
      }

      function confirmDevAction() {
        if (state.phase !== 'dev' || !canAcceptConfirmInput()) return;
        lockConfirmInput(260);
        const section = DEV_SECTIONS[state.devSectionIndex] || DEV_SECTIONS[0];
        if (state.devFocus === 'tabs') {
          if (section.id === 'exit') { startMainMenu(); return; }
          state.devActiveSection = section.id;
          state.devFocus = 'list';
          state.devItemIndex = 0;
          updateDevMenuUI(); vibrate(35); return;
        }
        const items = getDevSectionItems(state.devActiveSection);
        const item = items[state.devItemIndex];
        if (!item) return;
        if (state.devActiveSection === 'weapons') toggleDevWeapon(item.id);
        else if (state.devActiveSection === 'passives') toggleDevPassive(item.id);
        else if (state.devActiveSection === 'synergies') equipDevSynergy(item.id);
        else if (state.devActiveSection === 'test') executeDevTestOption(item.id);
        updateDevMenuUI(); vibrate(35);
      }

      function handleDevJoystickInput(jx, jy) {
        const threshold = 0.55;
        if (state.devFocus === 'tabs') {
          let dir = 0;
          if (jx < -threshold) dir = -1;
          else if (jx > threshold) dir = 1;
          if (dir !== 0 && lastJoystickXDir !== dir) {
            lastJoystickXDir = dir;
            state.devSectionIndex = (state.devSectionIndex + dir + DEV_SECTIONS.length) % DEV_SECTIONS.length;
            updateDevMenuUI();
            vibrate(20);
          } else if (dir === 0) {
            lastJoystickXDir = 0;
          }
          return;
        }

        const items = getDevSectionItems(state.devActiveSection);
        let vertical = 0;
        if (jy < -threshold) vertical = -1;
        else if (jy > threshold) vertical = 1;
        if (vertical !== 0 && lastJoystickYDir !== vertical) {
          lastJoystickYDir = vertical;
          if (vertical < 0 && state.devItemIndex === 0) {
            state.devFocus = 'tabs';
            state.devSectionIndex = Math.max(0, DEV_SECTIONS.findIndex(section => section.id === state.devActiveSection));
          } else if (vertical > 0 && state.devItemIndex === items.length - 1) {
            state.devItemIndex = 0;
          } else {
            state.devItemIndex = Math.max(0, Math.min(items.length - 1, state.devItemIndex + vertical));
          }
          updateDevMenuUI();
          vibrate(20);
        } else if (vertical === 0) {
          lastJoystickYDir = 0;
        }

        let horizontal = 0;
        if (jx < -threshold) horizontal = -1;
        else if (jx > threshold) horizontal = 1;
        if (horizontal !== 0 && lastJoystickXDir !== horizontal) {
          lastJoystickXDir = horizontal;
          modifyDevLevel(state.devActiveSection, horizontal);
          vibrate(20);
        } else if (horizontal === 0) {
          lastJoystickXDir = 0;
        }
      }

      function setupDeveloperControls() {
        const zone = document.getElementById('dev-joystick-move-zone');
        const knob = document.getElementById('dev-joystick-move-knob');
        const fire = document.getElementById('btn-dev-tap-fire');
        if (!zone || !knob || !fire) return;

        let pointerId = null;
        let centerX = 0;
        let centerY = 0;
        const devNavRepeater = createNavigationRepeater(handleDevJoystickInput, () => state.phase === 'dev');

        const update = event => {
          let dx = event.clientX - centerX;
          let dy = event.clientY - centerY;
          const maxR = 50;
          const dist = Math.hypot(dx, dy);
          if (dist > maxR) {
            dx = dx / dist * maxR;
            dy = dy / dist * maxR;
          }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          const jx = dx / maxR;
          const jy = dy / maxR;
          devNavRepeater.set(jx, jy);
          handleDevJoystickInput(jx, jy);
        };

        zone.addEventListener('pointerdown', event => {
          event.preventDefault();
          initAudio();
          pointerId = event.pointerId;
          centerX = event.clientX;
          centerY = event.clientY;
          devNavRepeater.begin();
          capturePointerSafely(zone, event.pointerId);
          update(event);
        });
        zone.addEventListener('pointermove', event => {
          if (event.pointerId === pointerId) update(event);
        });
        const end = event => {
          if (event.pointerId !== pointerId) return;
          pointerId = null;
          knob.style.transform = 'translate(0px, 0px)';
          devNavRepeater.end();
          lastJoystickXDir = 0;
          lastJoystickYDir = 0;
        };
        zone.addEventListener('pointerup', end);
        zone.addEventListener('pointercancel', end);

        fire.addEventListener('pointerdown', event => {
          event.preventDefault();
          initAudio();
          if (!canAcceptConfirmInput()) return;
          confirmDevAction();
        });
      }


      //#region hotfix_v331 · progression, controls, combat pace and polish
      const CONTENT_LOCALE_V331 = {"upgrades": {"en": {"w-machinegun": ["Machine Gun", "Fires rapid bursts of kinetic rounds"], "w-energycannon": ["Energy Cannon", "Fires high-impact energy spheres"], "w-laser": ["Continuous Laser", "Fires a continuous piercing laser beam"], "w-shotgun": ["Shrapnel Shotgun", "Fires several projectiles in a short-range cone"], "w-missile": ["Homing Missiles", "Launches missiles that seek and explode on enemies"], "w-grenadelauncher": ["Grenade Launcher", "Launches bouncing grenades that deal area damage"], "w-railgun": ["Linear Railgun", "Fires a hypersonic projectile that pierces everything"], "w-sniper": ["Precision Rifle", "Slow but devastating long-range shot"], "w-flamethrower": ["Flamethrower", "Burns enemies in a timed cone of fire"], "w-plasma": ["Plasma Cannon", "Fires plasma spheres that explode on impact"], "w-energysword": ["Energy Sword", "Fast arcing melee attack"], "w-kinetichammer": ["Kinetic Hammer", "Heavy strike that creates an expanding shockwave"], "w-lance": ["Plasma Lance", "Long-reaching frontal thrust with penetration"], "w-claws": ["Combat Claws", "Extremely fast dual melee attacks"], "w-boomerang": ["Energy Boomerang", "Projectile that damages enemies on the way out and back"], "w-drones": ["Support Drones", "Orbiting drones fire at nearby enemies"], "w-repairdrones": ["Repair Drones", "Periodically restore the mecha armor and shield"], "w-turrets": ["Deployable Turret", "Deploys static turrets that fire automatically"], "w-mines": ["Proximity Mines", "Drops mines that explode when enemies approach"], "w-shield": ["Force Shield", "Creates a temporary protective bubble"], "w-gravityfield": ["Gravity Field", "Creates a zone that pulls and slows enemies"], "w-teleport": ["Teleport", "Instantly moves forward and releases a shockwave"], "w-dash": ["Tactical Boost", "Fast displacement that damages and pushes enemies"], "w-orbital": ["Orbital Strike", "Calls laser bombardments from orbit"], "w-highbeam": ["High Beam", "Fires a massive devastating beam forward"], "w-summons": ["Support Unit", "Summons allied mini-mechas"], "w-rotarycannon": ["Rotary Cannon", "Fire rate rises while firing; spread grows at maximum speed"], "w-pistonshotgun": ["Piston Shotgun", "Short-range kinetic blast that pushes the mecha backward"], "p-bounce": ["Projectile Ricochet", "Bullets bounce between nearby enemies"], "p-pierce": ["Piercing Rounds", "Projectiles pass through targets"], "p-explode": ["Death Explosion", "Enemies explode when destroyed"], "p-fire-zone": ["Fire Zones", "Explosions leave damaging fire zones"], "p-lightning": ["Electric Arcs", "Shots generate chain lightning"], "p-extra-missile": ["Extra Missile", "Every five shots launches a homing missile"], "p-crit-effect": ["Critical Strikes", "Critical hits create energy explosions"], "p-drone-copy": ["Drone Sync", "Drones copy the main weapon projectile"], "p-kill-cooldown": ["Tactical Reactor", "Enemy kills reduce ability cooldowns"], "p-dash-wave": ["Expanding Dash", "Dashes create large shockwaves"], "p-extra-projectile": ["Additional Shots", "The main weapon fires additional projectiles"], "p-elemental": ["Elemental Effects", "Attacks burn, freeze or slow enemies"], "p-shield-reflect": ["Reflective Shield", "Shields reflect enemy projectiles"], "p-melee-wave": ["Energy Waves", "Melee attacks generate energy waves"], "p-evolve": ["Weapon Evolution", "Combines weapons and modules to unlock evolutions"], "p-cooldown": ["Rapid Cooling", "Reduces cooldown for all weapons"], "p-last-magazine": ["Last Magazine", "The final three rounds of the main magazine deal extra damage"], "p-first-impact": ["First Impact", "The first shot after reloading gains damage and penetration"]}, "pt": {"w-machinegun": ["Metralhadora", "Dispara rajadas rápidas de projéteis cinéticos"], "w-energycannon": ["Canhão de Energia", "Dispara esferas de energia de alto impacto"], "w-laser": ["Laser Contínuo", "Dispara um feixe laser contínuo e perfurante"], "w-shotgun": ["Escopeta de Estilhaços", "Dispara vários projéteis em cone a curta distância"], "w-missile": ["Mísseis Teleguiados", "Lança mísseis que perseguem e explodem nos inimigos"], "w-grenadelauncher": ["Lança-granadas", "Lança granadas que ricocheteiam e causam dano em área"], "w-railgun": ["Railgun Linear", "Dispara um projétil hipersônico que atravessa tudo"], "w-sniper": ["Rifle de Precisão", "Disparo lento, porém devastador, a longa distância"], "w-flamethrower": ["Lança-chamas", "Queima inimigos em um cone temporizado de fogo"], "w-plasma": ["Canhão de Plasma", "Dispara esferas de plasma que explodem no impacto"], "w-energysword": ["Espada de Energia", "Ataque corpo a corpo rápido em arco"], "w-kinetichammer": ["Martelo Cinético", "Golpe pesado que cria uma onda de choque expansiva"], "w-lance": ["Lança de Plasma", "Estocada frontal longa e perfurante"], "w-claws": ["Garras de Combate", "Ataques corpo a corpo duplos e muito rápidos"], "w-boomerang": ["Bumerangue de Energia", "Projétil que causa dano na ida e na volta"], "w-drones": ["Drones de Apoio", "Drones orbitais disparam em inimigos próximos"], "w-repairdrones": ["Drones de Reparo", "Restauram periodicamente a blindagem e o escudo"], "w-turrets": ["Torreta Implantável", "Implanta torretas estáticas com disparo automático"], "w-mines": ["Minas de Proximidade", "Solta minas que explodem quando um inimigo se aproxima"], "w-shield": ["Escudo de Força", "Cria uma bolha protetora temporária"], "w-gravityfield": ["Campo Gravitacional", "Cria uma zona que atrai e desacelera inimigos"], "w-teleport": ["Teletransporte", "Move-se instantaneamente para frente e solta uma onda"], "w-dash": ["Impulso Tático", "Deslocamento rápido que causa dano e empurra inimigos"], "w-orbital": ["Ataque Orbital", "Solicita bombardeios laser da órbita"], "w-highbeam": ["Megafeixe de Luz", "Dispara um enorme feixe devastador para frente"], "w-summons": ["Unidade de Apoio", "Invoca mini-mechas aliados"], "w-rotarycannon": ["Canhão Rotativo", "A cadência aumenta durante o fogo; a dispersão cresce no máximo"], "w-pistonshotgun": ["Escopeta de Pistões", "Explosão cinética curta que empurra o mecha para trás"], "p-bounce": ["Ricochete de Projéteis", "As balas ricocheteiam entre inimigos próximos"], "p-pierce": ["Munição Perfurante", "Os projéteis atravessam os alvos"], "p-explode": ["Explosão ao Morrer", "Inimigos explodem ao serem destruídos"], "p-fire-zone": ["Zonas de Fogo", "Explosões deixam áreas de fogo danosas"], "p-lightning": ["Arcos Elétricos", "Disparos geram relâmpagos em cadeia"], "p-extra-missile": ["Míssil Adicional", "A cada cinco disparos lança um míssil teleguiado"], "p-crit-effect": ["Golpes Críticos", "Golpes críticos criam explosões de energia"], "p-drone-copy": ["Sincronia de Drones", "Drones copiam o projétil da arma principal"], "p-kill-cooldown": ["Reator Tático", "Abates reduzem o tempo de recarga das habilidades"], "p-dash-wave": ["Dash Expansivo", "Dashes criam grandes ondas de choque"], "p-extra-projectile": ["Disparos Adicionais", "A arma principal dispara projéteis adicionais"], "p-elemental": ["Efeitos Elementais", "Ataques queimam, congelam ou desaceleram inimigos"], "p-shield-reflect": ["Escudo Refletor", "Escudos refletem projéteis inimigos"], "p-melee-wave": ["Ondas de Energia", "Ataques corpo a corpo geram ondas de energia"], "p-evolve": ["Evolução de Armas", "Combina armas e módulos para liberar evoluções"], "p-cooldown": ["Resfriamento Rápido", "Reduz a recarga de todas as armas"], "p-last-magazine": ["Último Carregador", "As três últimas balas do carregador principal causam dano extra"], "p-first-impact": ["Primeiro Impacto", "O primeiro disparo após recarregar ganha dano e perfuração"]}}, "synergies": {"en": {"syn-napalm": ["Napalm MX-9", "Fires napalm missiles that explode and leave large burning zones."], "syn-vulcan": ["Vulcan Gauss", "Rapid bursts build energy and release a giant electromagnetic round."], "syn-prisma": ["Infinite Prism", "The beam splits, ricochets and pierces targets."], "syn-tesla": ["Tesla Shotgun", "Each pellet creates lightning that jumps between enemies."], "syn-fantasma": ["Phantom Blade", "Each dash creates a spectral copy that repeats attacks."], "syn-singularidad": ["Singularity Hammer", "Every impact creates a small pulling singularity before exploding."], "syn-eclipse": ["Eclipse", "Critical shots cross the whole arena and deal massive damage."], "syn-portamisiles": ["Autonomous Missile Carrier", "The drone independently fires intelligent missiles."], "syn-centinela": ["Solar Sentry", "The turret fires a continuous tracking beam."], "syn-biotoxico": ["Biotoxic Field", "Mines release a persistent toxic cloud."], "syn-criogenico": ["Cryogenic Cannon", "Projectiles freeze every pierced enemy."], "syn-arco-plasma": ["Plasma Arc", "Each shot creates chained electrical discharges."], "syn-represalia": ["Retaliation Shield", "Blocks projectiles and returns amplified damage."], "syn-nanoenjambre": ["Nanoswarm", "The drone splits into repairing and attacking microdrones."], "syn-satelite": ["Exterminator Satellite", "A satellite automatically bombards marked enemies."], "syn-devorador": ["Celestial Devourer", "Missiles are absorbed by a singularity and detonate together."], "syn-relampago": ["Lightning Blade", "Each strike generates powerful electrical arcs."], "syn-incinerador": ["Omega Incinerator", "Flames persist while enemies remain inside the area."], "syn-ricochet": ["Ricochet Shotgun", "Pellets bounce repeatedly without losing power."], "syn-lanza-fotonica": ["Photonic Lance", "Combines an instant piercing shot with a continuous beam."], "syn-sismico": ["Seismic Destroyer", "Impacts create earthquakes and chained explosions."], "syn-dimensional": ["Dimensional Cutter", "Teleporting performs a cut through the entire path."], "syn-helios": ["Helios Swarm", "Three drones orbit and fire interconnected beams."], "syn-apocalipsis": ["Apocalypse Storm", "Calls a continuous rain of intelligent missiles."], "syn-cyclonic": ["Cyclonic Cannon", "Maximum spin pierces and ricochets; every eight hits releases pressure."], "syn-celestial": ["Celestial Arsenal", "All weapons fire together for a short period."], "syn-nova": ["Solar Nova", "Creates a gigantic prism beam that crosses and ricochets."], "syn-dragon": ["Steel Dragon", "The drone evolves into a mechanical napalm dragon."], "syn-motor-vacio": ["Void Engine", "Fires singularities that absorb groups before collapsing."], "syn-berserker": ["Berserker Titan", "Enters an extreme melee state with greater speed, resistance and damage."]}, "pt": {"syn-napalm": ["Napalm MX-9", "Dispara mísseis de napalm que explodem e deixam grandes áreas em chamas."], "syn-vulcan": ["Vulcan Gauss", "Rajadas rápidas acumulam energia e liberam um projétil eletromagnético gigante."], "syn-prisma": ["Prisma Infinito", "O feixe se divide, ricocheteia e perfura alvos."], "syn-tesla": ["Escopeta Tesla", "Cada chumbo cria raios que saltam entre inimigos."], "syn-fantasma": ["Lâmina Fantasma", "Cada dash cria uma cópia espectral que repete ataques."], "syn-singularidad": ["Martelo Singularidade", "Cada impacto cria uma pequena singularidade antes de explodir."], "syn-eclipse": ["Eclipse", "Disparos críticos atravessam toda a arena e causam dano massivo."], "syn-portamisiles": ["Porta-mísseis Autônomo", "O drone dispara mísseis inteligentes de forma independente."], "syn-centinela": ["Sentinela Solar", "A torreta dispara um feixe contínuo de rastreamento."], "syn-biotoxico": ["Campo Biotóxico", "Minas liberam uma nuvem tóxica persistente."], "syn-criogenico": ["Canhão Criogênico", "Projéteis congelam todos os inimigos perfurados."], "syn-arco-plasma": ["Arco de Plasma", "Cada disparo cria descargas elétricas em cadeia."], "syn-represalia": ["Escudo de Retaliação", "Bloqueia projéteis e devolve dano amplificado."], "syn-nanoenjambre": ["Nanoenxame", "O drone se divide em microdrones de reparo e ataque."], "syn-satelite": ["Satélite Exterminador", "Um satélite bombardeia automaticamente inimigos marcados."], "syn-devorador": ["Devorador Celeste", "Mísseis são absorvidos por uma singularidade e detonam juntos."], "syn-relampago": ["Lâmina Relâmpago", "Cada golpe gera poderosos arcos elétricos."], "syn-incinerador": ["Incinerador Ômega", "As chamas persistem enquanto houver inimigos na área."], "syn-ricochet": ["Escopeta Ricochet", "Os chumbos ricocheteiam sem perder potência."], "syn-lanza-fotonica": ["Lança Fotônica", "Combina um disparo perfurante com um feixe contínuo."], "syn-sismico": ["Destruidor Sísmico", "Impactos criam terremotos e explosões em cadeia."], "syn-dimensional": ["Cortador Dimensional", "O teletransporte executa um corte por todo o trajeto."], "syn-helios": ["Enxame Hélio", "Três drones orbitam e disparam feixes conectados."], "syn-apocalipsis": ["Tempestade Apocalipse", "Invoca uma chuva contínua de mísseis inteligentes."], "syn-cyclonic": ["Canhão Ciclônico", "A rotação máxima perfura e ricocheteia; oito impactos liberam pressão."], "syn-celestial": ["Arsenal Celestial", "Todas as armas disparam juntas por um curto período."], "syn-nova": ["Nova Solar", "Cria um gigantesco feixe prismático que atravessa e ricocheteia."], "syn-dragon": ["Dragão de Aço", "O drone evolui para um dragão mecânico de napalm."], "syn-motor-vacio": ["Motor do Vazio", "Dispara singularidades que absorvem grupos antes de colapsar."], "syn-berserker": ["Titã Berserker", "Entra em estado corpo a corpo extremo com mais velocidade, resistência e dano."]}}};
      const ENERGY_ORB_TIERS_V331 = Object.freeze({
        blue:{id:'blue',xp:2,color:'#3e7dc9',stroke:'#bdd7f7',radius:5},
        green:{id:'green',xp:5,color:'#50a869',stroke:'#d0f3d8',radius:6},
        yellow:{id:'yellow',xp:12,color:'#d3aa3c',stroke:'#fff0ad',radius:7},
        red:{id:'red',xp:25,color:'#c94e44',stroke:'#ffd0cb',radius:8},
        purple:{id:'purple',xp:60,color:'#7b58a7',stroke:'#e4d2ff',radius:10}
      });
      const DRAFT_AFFINITY_V331 = Object.freeze({
        fire:['w-flamethrower','w-missile','w-grenadelauncher','p-fire-zone','p-explode','p-elemental','syn-napalm','syn-incinerador','syn-dragon'],
        kinetic:['w-machinegun','w-shotgun','w-railgun','w-sniper','w-rotarycannon','w-pistonshotgun','p-bounce','p-pierce','p-last-magazine','p-first-impact','syn-vulcan','syn-ricochet','syn-cyclonic'],
        energy:['w-energycannon','w-laser','w-plasma','w-highbeam','w-lance','p-lightning','syn-prisma','syn-nova','syn-lanza-fotonica'],
        drone:['w-drones','w-repairdrones','w-turrets','w-summons','p-drone-copy','syn-portamisiles','syn-centinela','syn-nanoenjambre','syn-helios'],
        mobility:['w-dash','w-teleport','p-dash-wave','syn-fantasma','syn-dimensional','syn-berserker'],
        defense:['w-shield','w-repairdrones','p-shield-reflect','p-cooldown','p-kill-cooldown','syn-represalia'],
        gravity:['w-gravityfield','w-orbital','syn-singularidad','syn-devorador','syn-motor-vacio']
      });

      function ensureV331State(target=state) {
        if (!target) return target;
        target.xpNeeded = Math.max(30, Number(target.xpNeeded)||30);
        target.sectorConsumablesV331 = target.sectorConsumablesV331 || [];
        target.nextConsumableRollAtV331 = Number(target.nextConsumableRollAtV331)||22000;
        target.nextSuicideRollAtV331 = Number(target.nextSuicideRollAtV331)||16000;
        target.nextBomberRollAtV331 = Number(target.nextBomberRollAtV331)||28000;
        target.deathSequenceV331 = target.deathSequenceV331 || {active:false,startedAt:0,exploded:false,ended:false,cause:''};
        target.sectorTransitionV331 = target.sectorTransitionV331 || {active:false,target:0,startedAt:0,applied:false};
        target.mecha.maxHp = Math.max(160, Number(target.mecha.maxHp)||160);
        target.mecha.hp = Math.min(target.mecha.maxHp, Math.max(0, Number(target.mecha.hp)||target.mecha.maxHp));
        target.activeWeapons = (target.activeWeapons||[]).filter(id=>id!=='w-emp'&&id!=='w-reactor');
        delete target.weaponLevels?.['w-emp']; delete target.weaponLevels?.['w-reactor'];
        return target;
      }

      const __createStateV331 = createState;
      createState = function(){ const next=__createStateV331(); next.xpNeeded=30; next.mecha.hp=160; next.mecha.maxHp=160; return ensureV331State(next); };
      ensureV331State(state);

      // EMP and reactor overload are rare map consumables, never draft cards.
      for (let i=UPGRADE_POOL.length-1;i>=0;i--) if (UPGRADE_POOL[i].id==='w-emp'||UPGRADE_POOL[i].id==='w-reactor') UPGRADE_POOL.splice(i,1);
      UPGRADE_BY_ID.delete('w-emp'); UPGRADE_BY_ID.delete('w-reactor');
      CONTENT_CATALOG_V3.delete('w-emp'); CONTENT_CATALOG_V3.delete('w-reactor');
      POWER_IDS_V3.delete('w-emp'); POWER_IDS_V3.delete('w-reactor');
      for (let i=WEAPON_UPGRADES.length-1;i>=0;i--) if (WEAPON_UPGRADES[i].id==='w-emp'||WEAPON_UPGRADES[i].id==='w-reactor') WEAPON_UPGRADES.splice(i,1);

      function isEnemyInsideCombatViewV331(enemy, margin=0) {
        const view=state.cameraViewV331;
        if(!view||!enemy)return false;
        return Math.abs(enemy.x-state.mecha.x)<=view.halfW+margin && Math.abs(enemy.y-state.mecha.y)<=view.halfH+margin;
      }
      function predictedPlayerAngleV331(enemy,lead=34) {
        const vx=(state.moveJoystick?.active?state.moveJoystick.x:0)*lead;
        const vy=(state.moveJoystick?.active?state.moveJoystick.y:0)*lead;
        return Math.atan2((state.mecha.y+vy)-enemy.y,(state.mecha.x+vx)-enemy.x);
      }

      function weightedTierV331(weights) {
        let cursor=Math.random()*weights.reduce((a,b)=>a+b[1],0);
        for(const [id,w] of weights){cursor-=w;if(cursor<=0)return id;}
        return weights[weights.length-1][0];
      }
      function tierForEnemyV331(enemy, forcedPurple=false) {
        if(forcedPurple)return 'purple';
        if(enemy.isBossV31)return weightedTierV331([['yellow',20],['red',50],['purple',30]]);
        if(enemy.isMinibossV31)return weightedTierV331([['green',12],['yellow',46],['red',34],['purple',8]]);
        if(enemy.isEliteV31)return weightedTierV331([['blue',12],['green',45],['yellow',32],['red',10],['purple',1]]);
        if(enemy.type==='mine_junker'||enemy.type==='scrap_bomber')return weightedTierV331([['blue',58],['green',30],['yellow',10],['red',2]]);
        if(enemy.type==='saw_raider'||enemy.type==='scrap_gunner'||enemy.type==='scrap_suicide')return weightedTierV331([['blue',70],['green',24],['yellow',5],['red',1]]);
        return weightedTierV331([['blue',84],['green',14],['yellow',2]]);
      }
      function spawnOneEnergyOrbV331(enemy,tierId,offset=0) {
        const tier=ENERGY_ORB_TIERS_V331[tierId]||ENERGY_ORB_TIERS_V331.blue;
        const a=Math.random()*Math.PI*2,d=offset+Math.random()*18;
        state.orbs.push({x:enemy.x+Math.cos(a)*d,y:enemy.y+Math.sin(a)*d,xpValue:tier.xp,radius:tier.radius,color:tier.color,stroke:tier.stroke,tierV331:tier.id,energyOrbV331:true});
      }
      function spawnEnergyOrbsV331(enemy) {
        if(!enemy||enemy.noRewardV331)return 0;
        let count=0,dropChance=.22;
        if(enemy.type==='scrap_hound')dropChance=.18;
        else if(enemy.type==='saw_raider')dropChance=.24;
        else if(enemy.type==='scrap_gunner')dropChance=.27;
        else if(enemy.type==='mine_junker')dropChance=.31;
        else if(enemy.type==='scrap_suicide')dropChance=.30;
        else if(enemy.type==='scrap_bomber')dropChance=.36;
        if(enemy.isEliteV31){dropChance=.78;count=1;}
        if(enemy.isMinibossV31){dropChance=1;count=4;}
        if(enemy.isBossV31){dropChance=1;count=7;}
        if(Math.random()>dropChance)return 0;
        count=Math.max(1,count);
        for(let i=0;i<count;i++)spawnOneEnergyOrbV331(enemy,tierForEnemyV331(enemy,enemy.isBossV31&&i===count-1),i*4);
        return count;
      }

      // Elite/miniboss/boss rewards no longer open free drafts.
      queueRewardDraftV31 = function(tier='elite') {
        state.pendingRewardTierV31=null;
        showEncounterNoticeV31(tier==='boss'?'NÚCLEO DE JEFE RECUPERADO':tier==='miniboss'?'NÚCLEO DE MINI JEFE RECUPERADO':'COMPONENTE ÉLITE RECUPERADO',1300);
        return false;
      };

      function getOwnedAffinityTagsV331(stateRef) {
        const owned=new Set([...(stateRef.activeWeapons||[]),...(stateRef.passives||[]),...(stateRef.activatedSynergies||[])]),tags=new Set();
        for(const [tag,ids] of Object.entries(DRAFT_AFFINITY_V331))if(ids.some(id=>owned.has(id)))tags.add(tag);
        return tags;
      }
      function contextualDraftWeightV331(item,stateRef) {
        const tags=getOwnedAffinityTagsV331(stateRef);let mult=1;
        for(const [tag,ids] of Object.entries(DRAFT_AFFINITY_V331))if(tags.has(tag)&&ids.includes(item.id))mult*=2.15;
        const owned=item.type==='weapon'?stateRef.activeWeapons.includes(item.id):item.type==='passive'?stateRef.passives.includes(item.id):false;
        if(owned)mult*=2.35;
        for(const syn of SYNERGIES){if(syn.reqs?.includes(item.id)&&syn.reqs.some(req=>(stateRef.activeWeapons||[]).includes(req)||(stateRef.passives||[]).includes(req)))mult*=1.55;}
        return Math.min(8,mult);
      }
      selectDraftCardsV3 = function(eligible,count,stateRef) {
        const filtered=eligible.filter(item=>item.id!=='w-emp'&&item.id!=='w-reactor');
        const unlocked=filtered.filter(item=>item.type==='evolution'||isContentUnlockedV3(item.id));
        const pool=unlocked.length?unlocked:filtered,selected=[],forceRare=(progressionV3.pity.rareMisses||0)>=8;
        for(let slot=0;slot<count&&selected.length<pool.length;slot++){
          const remaining=pool.filter(item=>!selected.some(x=>x.id===item.id));
          const rarities=[...new Set(remaining.map(item=>getContentMetaV3(item.id)?.rarity||'common'))];
          const rarity=chooseRarityV3(rarities,stateRef,forceRare&&slot===0);
          const candidates=remaining.filter(item=>(getContentMetaV3(item.id)?.rarity||'common')===rarity);
          const chosen=weightedPickV3(candidates.length?candidates:remaining,item=>{
            const rejection=progressionV3.pity.rejected[item.id]||0;
            return contextualDraftWeightV331(item,stateRef)*Math.pow(.76,Math.min(5,rejection));
          });
          if(chosen)selected.push(chosen);
        }
        return selected;
      };

      function spawnRareConsumableV331(type,x,y) {
        ensureV331State();
        if(state.sectorConsumablesV331.length>=2)return null;
        const world=getCurrentWorldSize();
        const c={id:`cons_${Math.random().toString(36).slice(2,9)}`,type,x:Math.max(60,Math.min(world-60,x)),y:Math.max(60,Math.min(world-60,y)),radius:15,expiresAt:(state.playTime||0)+55000};
        state.sectorConsumablesV331.push(c);return c;
      }
      function maybeDropRareConsumableV331(enemy) {
        if(!enemy||enemy.noRewardV331)return false;
        let chance=enemy.isBossV31?.16:enemy.isMinibossV31?.075:enemy.isEliteV31?.025:.004;
        if(Math.random()>chance)return false;
        return !!spawnRareConsumableV331(Math.random()<.54?'reactor':'emp',enemy.x,enemy.y);
      }
      function rollMapConsumableV331() {
        if(state.sectorConsumablesV331.length||state.testMode)return false;
        if(Math.random()>.065)return false;
        const a=Math.random()*Math.PI*2,d=300+Math.random()*360;
        return !!spawnRareConsumableV331(Math.random()<.58?'reactor':'emp',state.mecha.x+Math.cos(a)*d,state.mecha.y+Math.sin(a)*d);
      }
      function useConsumableV331(c,timestamp) {
        if(c.type==='emp'){
          let removed=0;
          for(const e of state.enemies){if(e.hp<=0||!isEnemyInsideCombatViewV331(e,30))continue;if(e.isBossV31||e.isMinibossV31){damageEnemy(e,Math.max(1,Math.round(e.maxHp*.08)),timestamp);e.stunnedUntil=timestamp+1800;}else{e.hp=0;removed++;}}
          state.enemyBullets=state.enemyBullets.filter(b=>Math.abs(b.x-state.mecha.x)>(state.cameraViewV331?.halfW||500)||Math.abs(b.y-state.mecha.y)>(state.cameraViewV331?.halfH||300));
          state.empFlash=8;showEncounterNoticeV31(`${SETTINGS_STATE.language==='en'?'MAGNETIC PULSE':SETTINGS_STATE.language==='pt'?'PULSO MAGNÉTICO':'PULSO MAGNÉTICO'} · ${removed} ${SETTINGS_STATE.language==='en'?'TARGETS NEUTRALIZED':SETTINGS_STATE.language==='pt'?'ALVOS NEUTRALIZADOS':'OBJETIVOS NEUTRALIZADOS'}`,1700);playSound('hit');vibrate([70,40,110]);
        }else{
          state.mecha.reactorOverloadUntil=timestamp+10000;showEncounterNoticeV31(`${SETTINGS_STATE.language==='en'?'REACTOR OVERLOAD':SETTINGS_STATE.language==='pt'?'SOBRECARGA DO REATOR':'SOBRECARGA DEL REACTOR'} · 10 s`,1700);playSound('equip');vibrate(90);
        }
      }
      function updateRareConsumablesV331(timestamp) {
        ensureV331State();const now=state.playTime||0;
        if(now>=state.nextConsumableRollAtV331){rollMapConsumableV331();state.nextConsumableRollAtV331=now+21000+Math.random()*18000;}
        for(let i=state.sectorConsumablesV331.length-1;i>=0;i--){const c=state.sectorConsumablesV331[i];if(now>c.expiresAt){state.sectorConsumablesV331.splice(i,1);continue;}const dist=Math.hypot(state.mecha.x-c.x,state.mecha.y-c.y);if(dist<30){useConsumableV331(c,timestamp);state.sectorConsumablesV331.splice(i,1);continue;}ctx.save();ctx.translate(c.x,c.y);ctx.rotate(timestamp*.0014);ctx.fillStyle=c.type==='emp'?'#557888':'#a56b3e';ctx.strokeStyle='#eee4d4';ctx.lineWidth=2;ctx.beginPath();for(let k=0;k<6;k++){const a=k*Math.PI/3;const x=Math.cos(a)*c.radius,y=Math.sin(a)*c.radius;k?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#14191d';ctx.font='bold 12px ui-monospace,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(c.type==='emp'?'M':'R',0,1);ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(0,0,22+Math.sin(timestamp*.006)*2,0,Math.PI*2);ctx.stroke();ctx.restore();}
      }

      function explosionParticlesV331(x,y,count=70,color='#d16b3e') { for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=2+Math.random()*12;state.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:24+Math.random()*42,color:i%5===0?'#f5efe6':color});} }
      function inferDeathCauseV331(sourceX,sourceY) {
        let nearest=null,best=190;
        for(const e of state.enemies){const d=Math.hypot(e.x-sourceX,e.y-sourceY);if(d<best){best=d;nearest=e;}}
        return nearest?.displayNameV31||tr('critical_failure');
      }
      function beginDeathSequenceV331(sourceX=state.mecha.x,sourceY=state.mecha.y,timestamp=performance.now()) {
        ensureV331State();if(state.deathSequenceV331.active||state.phase!=='playing')return false;
        state.mecha.hp=0;state.isFiring=false;state.moveJoystick.active=false;state.devPauseEnemies=true;
        state.deathSequenceV331={active:true,startedAt:timestamp,exploded:false,ended:false,cause:inferDeathCauseV331(sourceX,sourceY)};
        document.body.classList.add('mekora-death-v331');document.getElementById('death-cinematic-v331')?.classList.remove('hidden');
        showEncounterNoticeV31(tr('reactor_critical'),1800);vibrate([80,70,80,70,140]);return true;
      }
      function updateDeathSequenceV331(timestamp,dt) {
        const seq=state.deathSequenceV331;if(!seq?.active)return;
        const elapsed=timestamp-seq.startedAt;state.isFiring=false;state.moveJoystick.active=false;state.mecha.damageFlashUntil=timestamp+150;state.mecha.damageFlashAttackers=1;
        if(elapsed<1500&&timestamp>=(seq.nextSparkAt||0)){seq.nextSparkAt=timestamp+80+Math.random()*70;for(let i=0;i<3;i++)state.particles.push({x:state.mecha.x+(Math.random()-.5)*34,y:state.mecha.y+(Math.random()-.5)*34,vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5,life:12+Math.random()*15,color:i?'#e19a48':'#f5f2e9'});}
        if(elapsed>=1500&&!seq.exploded){seq.exploded=true;state.mecha.hiddenV331=true;document.body.classList.add('mekora-death-explode-v331');explosionParticlesV331(state.mecha.x,state.mecha.y,150,'#d75d37');const radius=250;for(const e of state.enemies){if(Math.hypot(e.x-state.mecha.x,e.y-state.mecha.y)<=radius){e.noRewardV331=true;e.hp=0;}}state.enemyBullets.length=0;playSound('hit');vibrate([180,60,220]);}
        if(elapsed>=2550&&!seq.ended){seq.ended=true;const title=document.getElementById('gameover-title');if(title)title.textContent=`${tr('destroyed_by')} ${seq.cause}`;document.body.classList.remove('mekora-death-v331','mekora-death-explode-v331');document.getElementById('death-cinematic-v331')?.classList.add('hidden');endRun();}
      }
      const __damageTintV331=getMechaDamageTint;
      getMechaDamageTint=function(timestamp){if(state.deathSequenceV331?.active&&!state.deathSequenceV331.exploded)return Math.floor((timestamp-state.deathSequenceV331.startedAt)/90)%2===0?'#ffffff':'#d55b3e';if(state.sectorTransitionV331?.active&&!state.mecha.hiddenV331)return Math.floor((timestamp-state.sectorTransitionV331.startedAt)/80)%2===0?'#ffffff':'#7e9da2';return __damageTintV331(timestamp);};

      function spawnPlayerTrailV331(timestamp) {
        if(state.deathSequenceV331?.active||state.sectorTransitionV331?.active||!state.moveJoystick?.active)return;
        if(timestamp<(state.nextPlayerTrailV331||0))return;state.nextPlayerTrailV331=timestamp+70;
        const speed=Math.hypot(state.moveJoystick.x,state.moveJoystick.y);if(speed<.18)return;const a=Math.atan2(state.moveJoystick.y,state.moveJoystick.x),side=a+Math.PI/2;
        for(const sign of [-1,1])state.particles.push({x:state.mecha.x-Math.cos(a)*17+Math.cos(side)*sign*12,y:state.mecha.y-Math.sin(a)*17+Math.sin(side)*sign*12,vx:-Math.cos(a)*(1+Math.random()*1.8)+(Math.random()-.5),vy:-Math.sin(a)*(1+Math.random()*1.8)+(Math.random()-.5),life:14+Math.random()*10,color:'#8b8175'});
      }
      function spawnEnemyTrailV331(e,timestamp) {
        if(!e||e.isDummy||state.deathSequenceV331?.active)return;const lx=e._trailLastXV331??e.x,ly=e._trailLastYV331??e.y,dx=e.x-lx,dy=e.y-ly;e._trailLastXV331=e.x;e._trailLastYV331=e.y;
        if(dx*dx+dy*dy<.5||timestamp<(e._nextTrailV331||0))return;e._nextTrailV331=timestamp+(e.type==='scrap_suicide'?45:95);const a=Math.atan2(dy,dx),side=a+Math.PI/2;
        for(const sign of [-1,1])state.particles.push({x:e.x-Math.cos(a)*e.radius*.75+Math.cos(side)*sign*e.radius*.55,y:e.y-Math.sin(a)*e.radius*.75+Math.sin(side)*sign*e.radius*.55,vx:-Math.cos(a)*(1+Math.random()*1.5),vy:-Math.sin(a)*(1+Math.random()*1.5),life:10+Math.random()*9,color:e.type==='scrap_bomber'?'#77736e':'#776c60'});
      }
      function drawFogV331(timestamp) {
        if(!ctx||!canvas)return;ctx.save();const g=ctx.createRadialGradient(canvas.width*.5,canvas.height*.5,Math.min(canvas.width,canvas.height)*.22,canvas.width*.5,canvas.height*.5,Math.max(canvas.width,canvas.height)*.72);g.addColorStop(0,'rgba(120,125,126,.015)');g.addColorStop(.62,'rgba(100,105,106,.075)');g.addColorStop(1,'rgba(49,54,56,.17)');ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalAlpha=.07;ctx.fillStyle='#d7d3ca';for(let i=0;i<10;i++){const x=(i*173+timestamp*.012*(i%2?1:-1))%(canvas.width+180)-90,y=(i*89+timestamp*.004)%(canvas.height+100)-50;ctx.beginPath();ctx.ellipse(x,y,70+(i%3)*24,18+(i%4)*5,0,0,Math.PI*2);ctx.fill();}ctx.restore();
      }

      function detonateSuicideV331(e,timestamp) {
        if(e.suicideDetonatedV331)return;e.suicideDetonatedV331=true;e.noRewardV331=true;e.hp=0;const radius=145,dist=Math.hypot(state.mecha.x-e.x,state.mecha.y-e.y);if(dist<radius)applyMechaDamage(Math.max(18,Math.round(68*(1-dist/radius))),e.x,e.y,timestamp,1);for(const other of state.enemies){if(other===e||other.hp<=0)continue;const d=Math.hypot(other.x-e.x,other.y-e.y);if(d<radius)damageEnemy(other,Math.round(110*(1-d/radius)),timestamp);}explosionParticlesV331(e.x,e.y,70,'#d95034');playSound('hit');vibrate(80);
      }
      function updateRareEnemySpawnsV331(timestamp) {
        ensureV331State();if(state.testMode||state.deathSequenceV331?.active||state.enemies.some(e=>e.isBossV31))return;const now=state.playTime||0;
        if(now>=state.nextSuicideRollAtV331){if(!state.enemies.some(e=>e.type==='scrap_suicide')&&Math.random()<.38)safeSpawnAroundPlayerV31('scrap_suicide',500+Math.random()*180);state.nextSuicideRollAtV331=now+15000+Math.random()*17000;}
        if(now>=state.nextBomberRollAtV331){if(!state.enemies.some(e=>e.type==='scrap_bomber')&&Math.random()<.27)safeSpawnAroundPlayerV31('scrap_bomber',620+Math.random()*150);state.nextBomberRollAtV331=now+26000+Math.random()*26000;}
      }

      executeBossAttackV31 = function(e,timestamp,angle) {
        e.attackCycleV331=(e.attackCycleV331||0)+1;
        if(e.type==='drill_bastion'){
          const pattern=e.attackCycleV331%3;
          if(pattern===0){e.chargeAngle=predictedPlayerAngleV331(e,64);e.chargeUntil=timestamp+950;e.suppressContactDamageV31=true;}
          else if(pattern===1){fireRadialBurstV31(e,10,4.4,13,'#e88b46');fireFanV31(e,angle,5,.75,5.4,14,'#f0bd70');e.vulnerableUntil=timestamp+1100;}
          else{for(let i=-1;i<=1;i++){const a=angle+i*.35;state.enemyMinesV31.push({x:state.mecha.x+Math.cos(a)*80,y:state.mecha.y+Math.sin(a)*80,radius:58,damage:21,armedAt:timestamp+850,expiresAt:timestamp+6500,color:'#d85d39'});}e.vulnerableUntil=timestamp+1250;}
          return;
        }
        const pattern=e.attackCycleV331%4;
        if(e.phaseV31===1){if(pattern%2===0){fireRadialBurstV31(e,12,4.2,13,'#ef8742');}else{fireFanV31(e,angle,7,1.1,5.1,15,'#efb55f');state.enemyMinesV31.push({x:state.mecha.x,y:state.mecha.y,radius:70,damage:22,armedAt:timestamp+950,expiresAt:timestamp+5200,color:'#e65b37'});}}
        else if(e.phaseV31===2){if(pattern===0){fireFanV31(e,angle,9,1.45,5.5,16,'#f0a24e');}else if(pattern===1){fireRadialBurstV31(e,16,4.8,14,'#ef6f3d');safeSpawnAroundPlayerV31('scrap_gunner',480);}else{for(let i=0;i<4;i++){const a=angle+(i-1.5)*.32;state.enemyMinesV31.push({x:state.mecha.x+Math.cos(a)*90,y:state.mecha.y+Math.sin(a)*90,radius:58,damage:22,armedAt:timestamp+800,expiresAt:timestamp+5600,color:'#d85d39'});}}}
        else{if(pattern===0){fireRadialBurstV31(e,22,5.2,17,'#ff5a3c');}else if(pattern===1){for(let wave=0;wave<3;wave++)setTimeout(()=>{if(e.hp>0)fireFanV31(e,Math.atan2(state.mecha.y-e.y,state.mecha.x-e.x),7,.82,6,19,'#ffd064');},wave*180);}else if(pattern===2){safeSpawnAroundPlayerV31('scrap_suicide',420);safeSpawnAroundPlayerV31('scrap_suicide',500);}else{e.chargeAngle=predictedPlayerAngleV331(e,70);e.chargeUntil=timestamp+720;e.suppressContactDamageV31=true;}}
        e.vulnerableUntil=timestamp+1050;
      };

      updateScrapperEnemyV31 = function(e,timestamp,distToPlayer,angle,isStunned,simulationSpeed,visibleRange) {
        e.suppressContactDamageV31=false;if(isStunned||state.deathSequenceV331?.active||state.sectorTransitionV331?.active)return;
        const visible=isEnemyInsideCombatViewV331(e,35);
        if(e.type==='scrap_hound'){moveEnemyTowardV31(e,angle+Math.sin(timestamp*.004+(e.x%17))*.14,e.speed,simulationSpeed);}
        else if(e.type==='scrap_suicide'){
          if(e.detonateAtV331){e.attackWarningUntil=e.detonateAtV331;if(timestamp>=e.detonateAtV331)detonateSuicideV331(e,timestamp);else moveEnemyTowardV31(e,predictedPlayerAngleV331(e,18),e.speed*.55,simulationSpeed);return;}
          moveEnemyTowardV31(e,predictedPlayerAngleV331(e,30),e.speed,simulationSpeed);if(distToPlayer<78){e.detonateAtV331=timestamp+560;e.attackWarningUntil=e.detonateAtV331;}
        }
        else if(e.type==='saw_raider'){
          if(timestamp<(e.windupUntil||0)){e.attackWarningUntil=e.windupUntil;e.chargeAngle=e.chargeAngle*.82+predictedPlayerAngleV331(e,55)*.18;return;}
          if(timestamp<(e.chargeUntil||0)){e.suppressContactDamageV31=true;moveEnemyTowardV31(e,e.chargeAngle,e.speed*5.8,simulationSpeed);if(distToPlayer<e.radius+25&&timestamp>=(e.nextChargeHitAt||0)){e.nextChargeHitAt=timestamp+900;applyMechaDamage(19,e.x,e.y,timestamp,1);}return;}
          if(e.chargeUntil&&timestamp>=e.chargeUntil){e.chargeUntil=0;e.vulnerableUntil=timestamp+850;}
          if(timestamp>=(e.nextActionAt||0)&&distToPlayer<310){e.chargeAngle=predictedPlayerAngleV331(e,58);e.windupUntil=timestamp+610;e.chargeUntil=timestamp+1280;e.nextActionAt=timestamp+3300;e.attackWarningUntil=e.windupUntil;return;}
          moveEnemyTowardV31(e,angle,e.speed,simulationSpeed);
        }
        else if(e.type==='scrap_gunner'){
          let moveAngle=angle;if(distToPlayer<270)moveAngle=angle+Math.PI;else if(distToPlayer<440)moveAngle=angle+(e.id.charCodeAt(e.id.length-1)%2?1:-1)*Math.PI/2;moveEnemyTowardV31(e,moveAngle,e.speed,simulationSpeed);
          if(!visible){e.pendingAttackAt=0;return;}
          if(e.pendingAttackAt&&timestamp>=e.pendingAttackAt){fireFanV31(e,predictedPlayerAngleV331(e,22),4,.25,5.7,11,'#f1bd6a');e.pendingAttackAt=0;e.fireIntervalV332=1750+Math.random()*1150;e.nextActionAt=timestamp+e.fireIntervalV332;}
          else if(!e.pendingAttackAt&&timestamp>=(e.nextActionAt||0)){e.fireWindupV332=360+Math.random()*360;e.pendingAttackAt=timestamp+e.fireWindupV332;e.attackWarningUntil=e.pendingAttackAt;}
        }
        else if(e.type==='mine_junker'){
          let moveAngle=angle;if(distToPlayer<240)moveAngle=angle+Math.PI;else if(distToPlayer<410)moveAngle=angle+Math.PI/2;moveEnemyTowardV31(e,moveAngle,e.speed,simulationSpeed);
          if(visible&&timestamp>=(e.nextActionAt||0)){state.enemyMinesV31.push({x:e.x,y:e.y,radius:52,damage:17,armedAt:timestamp+620,expiresAt:timestamp+9500,color:'#d27b38'});e.fireIntervalV332=2450+Math.random()*1450;e.nextActionAt=timestamp+e.fireIntervalV332;}
        }
        else if(e.type==='scrap_bomber'){
          if(e.flyAngleV331===undefined)e.flyAngleV331=predictedPlayerAngleV331(e,80);moveEnemyTowardV31(e,e.flyAngleV331,e.speed,simulationSpeed);
          if(visible&&!e.bombDroppedV331&&!e.pendingAttackAt){e.fireWindupV332=320+Math.random()*520;e.pendingAttackAt=timestamp+e.fireWindupV332;e.attackWarningUntil=e.pendingAttackAt;}
          if(e.pendingAttackAt&&timestamp>=e.pendingAttackAt&&!e.bombDroppedV331){e.bombDroppedV331=true;e.pendingAttackAt=0;const px=state.mecha.x+(state.moveJoystick.active?state.moveJoystick.x*65:0),py=state.mecha.y+(state.moveJoystick.active?state.moveJoystick.y*65:0);state.enemyMinesV31.push({x:px,y:py,radius:78,damage:28,armedAt:timestamp+900,expiresAt:timestamp+3300,color:'#bd633a'});}
          if(e.bombDroppedV331&&distToPlayer>1150){e.noRewardV331=true;e.hp=0;}
        }
        else if(e.type==='drill_bastion'){
          if(timestamp<(e.windupUntil||0)){e.attackWarningUntil=e.windupUntil;e.chargeAngle=e.chargeAngle*.86+predictedPlayerAngleV331(e,70)*.14;return;}
          if(timestamp<(e.chargeUntil||0)){e.suppressContactDamageV31=true;moveEnemyTowardV31(e,e.chargeAngle,e.speed*7.8,simulationSpeed);if(distToPlayer<e.radius+30&&timestamp>=(e.nextChargeHitAt||0)){e.nextChargeHitAt=timestamp+1050;applyMechaDamage(30,e.x,e.y,timestamp,1);}return;}
          if(e.chargeUntil&&timestamp>=e.chargeUntil){e.chargeUntil=0;e.vulnerableUntil=timestamp+1450;}
          if(timestamp>=(e.nextActionAt||0)){if(distToPlayer<430&&(e.attackCycleV331||0)%3===0){e.chargeAngle=predictedPlayerAngleV331(e,72);e.windupUntil=timestamp+820;e.chargeUntil=timestamp+1900;e.nextActionAt=timestamp+3900;e.attackWarningUntil=e.windupUntil;}else{e.pendingAttackAt=timestamp+650;e.attackWarningUntil=e.pendingAttackAt;e.nextActionAt=timestamp+3500;}return;}
          if(e.pendingAttackAt&&timestamp>=e.pendingAttackAt){executeBossAttackV31(e,timestamp,angle);e.pendingAttackAt=0;}
          moveEnemyTowardV31(e,angle,e.speed,simulationSpeed);
        }
        else if(e.type==='forge_titan'){
          const hpRatio=Math.max(0,e.hp/e.maxHp);e.phaseV31=hpRatio>.66?1:(hpRatio>.33?2:3);state.bossEncounterV31.phase=e.phaseV31;
          if(timestamp<(e.chargeUntil||0)){e.suppressContactDamageV31=true;moveEnemyTowardV31(e,e.chargeAngle,e.speed*6.2,simulationSpeed);if(distToPlayer<e.radius+34&&timestamp>=(e.nextChargeHitAt||0)){e.nextChargeHitAt=timestamp+1200;applyMechaDamage(38,e.x,e.y,timestamp,1);}return;}
          const preferred=e.phaseV31===1?300:e.phaseV31===2?365:315;const orbit=(e.attackCycleV331||0)%2?1:-1;const moveAngle=distToPlayer<preferred*.72?angle+Math.PI:distToPlayer>preferred?angle:angle+orbit*Math.PI/2;moveEnemyTowardV31(e,moveAngle,e.speed*(e.phaseV31===3?1.32:1),simulationSpeed);
          if(e.pendingAttackAt&&timestamp>=e.pendingAttackAt){executeBossAttackV31(e,timestamp,angle);e.pendingAttackAt=0;e.nextActionAt=timestamp+(e.phaseV31===3?1250:e.phaseV31===2?1700:2200);}
          else if(!e.pendingAttackAt&&timestamp>=(e.nextActionAt||0)){e.pendingAttackAt=timestamp+(e.phaseV31===3?520:680);e.attackWarningUntil=e.pendingAttackAt;}
        }
      };

      // Real viewport firing guard for legacy ranged enemies.
      const __fireEnemyBulletV331=fireEnemyBulletV31;
      fireEnemyBulletV31=function(e,angle,speed,damage,color='#ff9b53',radius=5,life=220){if(!isEnemyInsideCombatViewV331(e,40))return false;return __fireEnemyBulletV331(e,angle,speed*1.18,damage,color,radius,life);};

      function applySectorNowV331(next) {
        state.sector=next;state.sectorCurrentV33=next;state.sectorEnteredAtV33=state.playTime||0;state.sectorEnemiesDefeated=0;const def=getSectorDefV33(next);state.sectorPropsV33=generateSectorPropsV33(def);state.sectorHazardsV33=[];state.nextSectorHazardAtV33=(state.playTime||0)+(def.hazard?9000:99999999);spawnSectorPoisV33(def);state.mecha.x=Math.round(getCurrentWorldSize()*.5);state.mecha.y=Math.round(getCurrentWorldSize()*.5);progressionV3.statistics.maxSector=Math.max(progressionV3.statistics.maxSector||1,next);saveProgressionV3();updateMissionTrackingHudV32();showSectorBannerV33(def);updateSectorHudV33();return def;
      }
      function updateSectorTransitionV331(timestamp) {
        const t=state.sectorTransitionV331;if(!t?.active)return false;const elapsed=timestamp-t.startedAt;
        if(elapsed>=620&&!t.teleportStarted){t.teleportStarted=true;for(let i=0;i<38;i++)state.particles.push({x:state.mecha.x+(Math.random()-.5)*35,y:state.mecha.y+(Math.random()-.5)*35,vx:(Math.random()-.5)*7,vy:-2-Math.random()*6,life:18+Math.random()*25,color:i%4?'#879da0':'#f2eee6'});}
        if(elapsed>=900&&!t.applied){t.applied=true;state.mecha.hiddenV331=true;state.enemyBullets.length=0;state.enemies=state.enemies.filter(e=>e.isBossV31||e.isMinibossV31);applySectorNowV331(t.target);}
        if(elapsed>=1180)state.mecha.hiddenV331=false;
        if(elapsed>=1750){t.active=false;state.devPauseEnemies=false;document.getElementById('sector-transition-v331')?.classList.add('hidden');showEncounterNoticeV31(`${tr('route_updated')} · ${getSectorDefV33().name}`,1500);return true;}return false;
      }
      updateSectorProgressionV33=function(timestamp=performance.now(),force=false){ensureV331State();if(state.sectorTransitionV331.active){updateSectorTransitionV331(timestamp);return false;}const next=Math.min(5,Math.floor((state.playTime||0)/180000)+1);if(next===state.sectorCurrentV33)return false;if(force||state.sectorCurrentV33===0){applySectorNowV331(next);return true;}state.sectorTransitionV331={active:true,target:next,startedAt:timestamp,applied:false,teleportStarted:false};state.devPauseEnemies=true;state.isFiring=false;state.moveJoystick.active=false;const def=getSectorDefV33(next),root=document.getElementById('sector-transition-v331');document.getElementById('sector-transition-title-v331').textContent=`${tr('sector')} ${next}`;document.getElementById('sector-transition-name-v331').textContent=def.name;document.getElementById('sector-transition-detail-v331').textContent=def.subtitle;root?.classList.remove('hidden');return true;};

      function applyContentLocaleV331(lang) {
        const selected=lang==='en'||lang==='pt'?lang:'es';
        for(const item of UPGRADE_POOL){item._v331Base=item._v331Base||{title:item.title,desc:item.desc};const loc=CONTENT_LOCALE_V331.upgrades[selected]?.[item.id];item.title=loc?.[0]||item._v331Base.title;item.desc=loc?.[1]||item._v331Base.desc;}
        for(const item of SYNERGIES){item._v331Base=item._v331Base||{name:item.name,desc:item.desc};const loc=CONTENT_LOCALE_V331.synergies[selected]?.[item.id];item.name=loc?.[0]||item._v331Base.name;item.title=item.name;item.desc=loc?.[1]||item._v331Base.desc;}
        const sectorLoc={en:[['OUTER SCRAPYARD','Gateway to the recycling chain','More scrap · stable pressure'],['PRESS YARD','Heavy machinery remains active','Periodic presses · frequent raiders'],['RAIL CORRIDOR','Magnetic freight rails','Linear sweeps · reinforced gunners'],['OPEN FOUNDRY','Exposed heat conduits','Thermal vents · more controllers'],['FORGE CORE','Chamber of the Forge Titan','Maximum threat · elites and industrial heat']],pt:[['FERRO-VELHO EXTERNO','Entrada da cadeia de reciclagem','Mais sucata · pressão estável'],['PÁTIO DE PRENSAS','Maquinário pesado ainda ativo','Prensas periódicas · saqueadores frequentes'],['CORREDOR FERROVIÁRIO','Trilhos magnéticos de carga','Varreduras lineares · atiradores reforçados'],['FUNDIÇÃO ABERTA','Condutos de calor expostos','Respiradouros térmicos · mais controladores'],['NÚCLEO DA FORJA','Câmara do Titã da Forja','Ameaça máxima · elites e calor industrial']]};
        SECTOR_DEFS_V33.forEach((d,i)=>{d._v331Base=d._v331Base||{name:d.name,subtitle:d.subtitle,modifier:d.modifier};const loc=sectorLoc[selected]?.[i];d.name=loc?.[0]||d._v331Base.name;d.subtitle=loc?.[1]||d._v331Base.subtitle;d.modifier=loc?.[2]||d._v331Base.modifier;});
        const eventLoc={en:{salvage_rain:['DEBRIS RAIN','Scrap fragments fall across the zone'],overdrive:['OVERDRIVE WINDOW','More fire rate, but threat pressure rises'],elite_patrol:['ARMORED PATROL','Destroy the elite squad before it withdraws'],repair_signal:['DISTRESS SIGNAL','Locate and activate the repair relay']},pt:{salvage_rain:['CHUVA DE DESTROÇOS','Fragmentos de sucata caem pela zona'],overdrive:['JANELA DE SOBRECARGA','Mais cadência, mas a pressão inimiga aumenta'],elite_patrol:['PATRULHA BLINDADA','Destrua o esquadrão elite antes que ele recue'],repair_signal:['SINAL DE SOCORRO','Localize e ative o relé de reparo']}};
        for(const [id,d] of Object.entries(EVENT_DEFS_V33)){d._v331Base=d._v331Base||{title:d.title,detail:d.detail};const loc=eventLoc[selected]?.[id];d.title=loc?.[0]||d._v331Base.title;d.detail=loc?.[1]||d._v331Base.detail;}

        const missionLoc={
          en:{
            'mission-kills-25':['FIRST SCRAP','Eliminate 25 enemies','Useful remains finance the next prototype.'],
            'mission-scrap-150':['INDUSTRIAL RECYCLER','Collect 150 scrap','Search groups and reinforced enemies.'],
            'mission-elite-1':['ARMOR BREAKER','Defeat 1 elite enemy','Elites display additional armor pieces.'],
            'mission-miniboss-1':['DRILL NEUTRALIZED','Defeat the Bastion Drill','Bait a failed charge and strike its rear.'],
            'mission-survive-180':['STABLE SYSTEM','Survive 3 minutes','The mission records your best survival time.'],
            'mission-forge-titan':['FALL OF THE FORGE','Defeat the Forge Titan','Complete all three phases of the Scrapper boss.'],
            'mission-pois-8':['FIELD CARTOGRAPHER','Activate 8 points of interest','Explore each sector and approach mechanical markers.'],
            'mission-events-3':['UNEXPECTED PROTOCOL','Complete 3 dynamic events','Events appear during the expedition and alter pressure.'],
            'mission-sector-5':['ROUTE TO THE FORGE','Reach Sector 5','Survive the previous four sectors and enter the Forge Core.']
          },
          pt:{
            'mission-kills-25':['PRIMEIRA SUCATA','Elimine 25 inimigos','Restos úteis financiam o próximo protótipo.'],
            'mission-scrap-150':['RECICLADOR INDUSTRIAL','Colete 150 de sucata','Procure grupos e inimigos reforçados.'],
            'mission-elite-1':['QUEBRA-BLINDAGEM','Derrote 1 inimigo elite','Elites exibem peças adicionais de blindagem.'],
            'mission-miniboss-1':['BROCA NEUTRALIZADA','Derrote a Broca Bastião','Provoque uma carga falha e ataque a traseira.'],
            'mission-survive-180':['SISTEMA ESTÁVEL','Sobreviva 3 minutos','A missão registra seu melhor tempo de sobrevivência.'],
            'mission-forge-titan':['QUEDA DA FORJA','Derrote o Titã da Forja','Complete as três fases do chefe Sucateiro.'],
            'mission-pois-8':['CARTÓGRAFO DE CAMPO','Ative 8 pontos de interesse','Explore cada setor e aproxime-se dos marcadores mecânicos.'],
            'mission-events-3':['PROTOCOLO IMPREVISTO','Complete 3 eventos dinâmicos','Eventos aparecem durante a expedição e alteram a pressão.'],
            'mission-sector-5':['ROTA PARA A FORJA','Alcance o Setor 5','Sobreviva aos quatro setores anteriores e entre no Núcleo da Forja.']
          }
        };
        MISSION_DEFS_V32.forEach(m=>{m._v331Base=m._v331Base||{title:m.title,short:m.short,hint:m.hint};const loc=missionLoc[selected]?.[m.id];m.title=loc?.[0]||m._v331Base.title;m.short=loc?.[1]||m._v331Base.short;m.hint=loc?.[2]||m._v331Base.hint;});

        const tabLoc={en:{weapons:'WEAPONS',powers:'POWERS',modules:'MODULES',mechs:'MECHS',missions:'MISSIONS',exit:'EXIT'},pt:{weapons:'ARMAS',powers:'PODERES',modules:'MÓDULOS',mechs:'MECHAS',missions:'MISSÕES',exit:'SAIR'}};
        HANGAR_TABS_V32.forEach(t=>{t._v331Base=t._v331Base||t.label;t.label=tabLoc[selected]?.[t.id]||t._v331Base;});
        const roleLoc={en:{vanguard:'Balanced',lancer:'Mobility and critical hits',bastion:'Defense and counterattack',weaver:'Drones and control',furnace:'Explosions and heat',wraith:'Phase and precision'},pt:{vanguard:'Equilibrado',lancer:'Mobilidade e críticos',bastion:'Defesa e contra-ataque',weaver:'Drones e controle',furnace:'Explosões e calor',wraith:'Fase e precisão'}};
        MECH_DEFS_V32.forEach(m=>{m._v331BaseRole=m._v331BaseRole||m.role;m.role=roleLoc[selected]?.[m.id]||m._v331BaseRole;});

        const shopLoc={
          en:{repair:['QUICK REPAIR','Restores 30 armor.'],ammo:['FULL MAGAZINE','Finishes reload and refills ammunition.'],upgrade:['WEAPON CALIBRATION','Raises the main weapon by one level.'],speed:['SERVOMOTORS','Raises speed by 5% for this run.'],evolution:['EVOLUTION CORE','Provides one core for evolutions.']},
          pt:{repair:['REPARO RÁPIDO','Restaura 30 de blindagem.'],ammo:['CARREGADOR COMPLETO','Conclui a recarga e repõe a munição.'],upgrade:['CALIBRAÇÃO DE ARMA','Aumenta um nível da arma principal.'],speed:['SERVOMOTORES','Aumenta a velocidade em 5% nesta partida.'],evolution:['NÚCLEO DE EVOLUÇÃO','Fornece um núcleo para evoluções.']}
        };
        FIELD_SHOP_DEFS_V32.forEach(o=>{o._v331Base=o._v331Base||{title:o.title,desc:o.desc};const loc=shopLoc[selected]?.[o.id];o.title=loc?.[0]||o._v331Base.title;o.desc=loc?.[1]||o._v331Base.desc;});

        const poiLoc={
          en:{salvage:['SCRAP CACHE','Scrap recovered'],repair:['REPAIR RELAY','Armor restored'],relay:['TACTICAL REPEATER','Director suppressed'],cache:['COMBAT ARCHIVE','Energy recovered'],overclock:['SERVO BENCH','Temporary fire rate improved']},
          pt:{salvage:['DEPÓSITO DE SUCATA','Sucata recuperada'],repair:['RELÉ DE REPARO','Blindagem restaurada'],relay:['REPETIDOR TÁTICO','Diretor suprimido'],cache:['ARQUIVO DE COMBATE','Energia recuperada'],overclock:['BANCO DE SERVOS','Cadência temporária melhorada']}
        };
        for(const [id,d] of Object.entries(POI_DEFS_V33)){d._v331Base=d._v331Base||{name:d.name,desc:d.desc};const loc=poiLoc[selected]?.[id];d.name=loc?.[0]||d._v331Base.name;d.desc=loc?.[1]||d._v331Base.desc;}
      }

      Object.assign(UI_I18N.es,{hangar:'HANGAR',orientation_landscape:'GIRA TU DISPOSITIVO EN HORIZONTAL',critical_failure:'FALLO CRÍTICO',reactor_critical:'REACTOR EN ESTADO CRÍTICO',destroyed_by:'DESTRUIDO POR:',route_updated:'RUTA ACTUALIZADA',sector:'SECTOR'});
      Object.assign(UI_I18N.en,{hangar:'HANGAR',orientation_landscape:'ROTATE YOUR DEVICE TO LANDSCAPE',critical_failure:'CRITICAL FAILURE',reactor_critical:'REACTOR CRITICAL',destroyed_by:'DESTROYED BY:',route_updated:'ROUTE UPDATED',sector:'SECTOR'});
      Object.assign(UI_I18N.pt,{hangar:'HANGAR',orientation_landscape:'GIRE O DISPOSITIVO PARA O MODO HORIZONTAL',critical_failure:'FALHA CRÍTICA',reactor_critical:'REATOR EM ESTADO CRÍTICO',destroyed_by:'DESTRUÍDO POR:',route_updated:'ROTA ATUALIZADA',sector:'SETOR'});
      const __applyLanguageV331=applyLanguage;
      applyLanguage=function(lang,persist=true){const result=__applyLanguageV331(lang,persist);applyContentLocaleV331(SETTINGS_STATE.language);setUiText('btn-main-hangar','hangar');setUiText('orientation-warning-title-v331','orientation_landscape');const touchHint=SETTINGS_STATE.language==='en'?'TOUCH A SECTION AND CARD TO INTERACT':SETTINGS_STATE.language==='pt'?'TOQUE EM UMA SEÇÃO E CARTA PARA INTERAGIR':'TOCA UNA SECCIÓN Y UNA TARJETA PARA INTERACTUAR';const shopHint=SETTINGS_STATE.language==='en'?'TOUCH AN OFFER TO BUY':SETTINGS_STATE.language==='pt'?'TOQUE EM UMA OFERTA PARA COMPRAR':'TOCA UNA OFERTA PARA COMPRAR';const hs=document.getElementById('hangar-status-v32');if(hs&&!state.hangarOpenV32)hs.textContent=touchHint;const hangarSub=document.getElementById('hangar-subtitle-v32');if(hangarSub)hangarSub.textContent=SETTINGS_STATE.language==='en'?'PERMANENT PROGRESSION':SETTINGS_STATE.language==='pt'?'PROGRESSÃO PERMANENTE':'PROGRESIÓN PERMANENTE';const hc=document.querySelector('.hangar-currency-v32 span');if(hc)hc.textContent=SETTINGS_STATE.language==='en'?'CORES':SETTINGS_STATE.language==='pt'?'NÚCLEOS':'NÚCLEOS';const sh=document.querySelector('.field-shop-header-v32 strong');if(sh)sh.textContent=SETTINGS_STATE.language==='en'?'FIELD SHOP':SETTINGS_STATE.language==='pt'?'LOJA DE CAMPO':'TIENDA DE CAMPO';const ss=document.querySelector('.field-shop-header-v32 strong + span');if(ss)ss.textContent=SETTINGS_STATE.language==='en'?'SCRAPPER MERCHANT':SETTINGS_STATE.language==='pt'?'COMERCIANTE SUCATEIRO':'COMERCIANTE CHATARRERO';const sc=document.querySelector('.field-shop-header-v32 > div:last-child span');if(sc)sc.textContent=SETTINGS_STATE.language==='en'?'SCRAP':SETTINGS_STATE.language==='pt'?'SUCATA':'CHATARRA';const fs=document.getElementById('field-shop-status-v32');if(fs)fs.textContent=shopHint;if(state.phase==='draft')updateDraftMenuUI();if(state.hangarOpenV32)updateHangarUIV32();updateSectorHudV33();return result;};

      function decorateHangarTouchV331() {
        if(!state.hangarOpenV32)return;const tabs=[...document.querySelectorAll('#hangar-tabs-v32 .hangar-tab-v32')];tabs.forEach((el,i)=>el.dataset.tabIndex=i);const tab=HANGAR_TABS_V32[state.hangarTabIndexV32];if(!tab||tab.id==='exit')return;const items=getHangarItemsV32(tab.id),start=Math.max(0,Math.min(Math.max(0,items.length-5),state.hangarItemIndexV32-2));[...document.querySelectorAll('#hangar-list-v32 .hangar-row-v32')].forEach((el,i)=>el.dataset.itemIndex=start+i);
      }
      const __updateHangarV331=updateHangarUIV32;
      updateHangarUIV32=function(){__updateHangarV331();decorateHangarTouchV331();};

      function installDirectTouchNavigationV331() {
        const action=(id,fn)=>{const el=document.getElementById(id);if(!el)return;el.style.pointerEvents='auto';el.addEventListener('pointerup',ev=>{ev.preventDefault();ev.stopPropagation();initAudio();fn();});};
        action('btn-main-play',()=>startRun());action('btn-main-hangar',()=>openHangarV32());action('btn-main-global',()=>{stopRun();state.phase='global_network';joystickUsed=true;render();updateGlobalStatsUI();updateGlobalNetworkUI();});action('btn-main-settings',()=>startSettingsMenu());action('btn-main-dev',()=>openDeveloperMenu());
        action('btn-resume',()=>{state.pauseSelection='resume';confirmInputLockedUntil=0;confirmPauseAction();});action('btn-exit',()=>{state.pauseSelection='exit';confirmInputLockedUntil=0;confirmPauseAction();});action('btn-confirm-exit',()=>{state.pauseSelection='confirm';confirmInputLockedUntil=0;confirmPauseAction();});action('btn-cancel-exit',()=>{state.pauseSelection='cancel';confirmInputLockedUntil=0;confirmPauseAction();});
        action('btn-gameover-retry',()=>startRun());action('btn-gameover-menu',()=>startMainMenu());action('btn-close-settings',()=>startMainMenu());action('btn-close-global',()=>startMainMenu());
        document.getElementById('upgrade-cards-container')?.addEventListener('pointerup',ev=>{const card=ev.target.closest('.mekora-draft-wrapper');if(!card||state.phase!=='draft')return;ev.preventDefault();const idx=[...card.parentElement.children].indexOf(card);if(idx!==state.draftSelection){state.draftSelection=idx;state.draftConfirmArmed=false;updateDraftMenuUI();vibrate(22);}else{confirmInputLockedUntil=0;confirmDraftAction();}});
        document.getElementById('hangar-tabs-v32')?.addEventListener('pointerup',ev=>{const tab=ev.target.closest('.hangar-tab-v32');if(!tab)return;state.hangarTabIndexV32=Number(tab.dataset.tabIndex)||0;state.hangarItemIndexV32=0;updateHangarUIV32();});
        document.getElementById('hangar-list-v32')?.addEventListener('pointerup',ev=>{const row=ev.target.closest('.hangar-row-v32');if(!row)return;const idx=Number(row.dataset.itemIndex);if(Number.isFinite(idx)&&idx!==state.hangarItemIndexV32){state.hangarItemIndexV32=idx;updateHangarUIV32();}else{confirmInputLockedUntil=0;confirmHangarActionV32();}});
        document.getElementById('field-shop-list-v32')?.addEventListener('pointerup',ev=>{const row=ev.target.closest('.field-shop-row-v32');if(!row)return;const idx=[...row.parentElement.children].indexOf(row);if(idx!==state.fieldShopSelectionV32){state.fieldShopSelectionV32=idx;updateFieldShopUIV32();}else{confirmInputLockedUntil=0;confirmFieldShopActionV32();}});
      }

      installPersistentConsoleControls=function(){const pause=document.getElementById('btn-control-pause');if(!pause)return;let dock=document.getElementById('v331-pause-dock');if(!dock){dock=document.createElement('div');dock.id='v331-pause-dock';document.body.appendChild(dock);}dock.appendChild(pause);};
      syncImmersiveOrientation=function(){const warning=dom.orientationWarning||document.getElementById('orientation-warning');if(!warning)return;const blocked=(state.phase==='playing'||state.phase==='draft')&&window.innerHeight>window.innerWidth;warning.style.display=blocked?'flex':'none';document.body.dataset.immersiveOrientationBlocked=blocked?'true':'false';};
      async function activateLandscapePlayV331(){document.documentElement.classList.add('mekora-immersive');document.body.classList.add('mekora-immersive');document.body.dataset.immersive='true';try{const req=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;if(req&&!getNativeFullscreenElement())await req.call(document.documentElement,{navigationUI:'hide'});}catch(e){setPseudoFullscreen(true);}try{await screen.orientation?.lock?.('landscape');}catch(e){}syncImmersiveOrientation();}
      const __startRunV331=startRun;
      startRun=function(isDev=false,isTest=false){__startRunV331(isDev,isTest);ensureV331State();state.xpNeeded=30;state.mecha.hp=state.mecha.maxHp=160;state.activeWeapons=state.activeWeapons.filter(id=>id!=='w-emp'&&id!=='w-reactor');activateLandscapePlayV331();};
      confirmPauseAction=function(){if(!canAcceptConfirmInput())return;lockConfirmInput(240);if(!state.pauseConfirmState){if(state.pauseSelection==='resume'){state.paused=false;document.getElementById('pause-modal')?.classList.add('hidden');vibrate(35);}else{state.pauseConfirmState=true;state.pauseSelection='cancel';updatePauseMenuUI();vibrate(35);}}else if(state.pauseSelection==='confirm'){triggerExitTransition(state.testMode||state.isDevPlay?'dev':'menu');}else{state.paused=false;state.pauseConfirmState=false;document.getElementById('pause-modal')?.classList.add('hidden');vibrate(35);}};

      const __initAppV331=initApp;
      initApp=function(){__initAppV331();installDirectTouchNavigationV331();applyLanguage(SETTINGS_STATE.language,false);syncImmersiveOrientation();};
      window.addEventListener('resize',syncImmersiveOrientation,{passive:true});window.addEventListener('orientationchange',()=>setTimeout(syncImmersiveOrientation,60),{passive:true});
      //#endregion hotfix_v331


      if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initApp, { once: true });
      } else {
        initApp();
      }
      //#endregion lifecycle


      const FACTION_PACKAGE_V31 = Object.freeze({
        id:'scrappers', name:'Chatarreros', version:'3.3.3',
        basicEnemies:['scrap_hound','saw_raider','scrap_gunner','mine_junker'],
        eliteModifiers:['armored'], minibosses:['drill_bastion'], bosses:['forge_titan']
      });

      //#region debug_api · Standalone debug helpers
      window.mekoraDebug = {
        state() {
          return {
            name: state.phase,
            score: state.score,
            sector: state.sector,
            hp: state.mecha.hp,
            targets: state.activeTargets,
            entities: {
              enemies: state.enemies.length,
              bullets: state.bullets.length,
              enemyBullets: state.enemyBullets.length,
              particles: state.particles.length,
              damageNumbers: state.damageNumbers.length,
              enemyMines: state.enemyMinesV31.length
            },
            encounterV31: {...state.bossEncounterV31},
            sectorV33: {current:state.sector,event:state.sectorEventV33?{...state.sectorEventV33}:null,director:{...state.threatDirectorV33}}
          };
        },
        reset() {
          startMainMenu();
        },
        end() {
          endRun();
        },
        levelUp() {
          triggerLevelUp();
        },
        unlockDeveloper() {
          unlockDeveloperMode();
        },
        toggleFullscreen() {
          return toggleFullscreenMode();
        },
        immersive() {
          return {active:isImmersiveMode(), browserFullscreen:isBrowserFullscreenActive(), cameraZoom:getActiveCameraZoom(), blockedPortrait:document.body.dataset.immersiveOrientationBlocked === 'true'};
        },
        loadout() {
          return {
            weapons: [...state.activeWeapons],
            passives: [...state.passives],
            weaponLevels: {...state.weaponLevels},
            passiveLevels: {...state.passiveLevels}
          };
        },
        draft() {
          return {
            cards: (state.draftCards || []).map(card => ({id: card.id, type: card.type, title: card.title})),
            selected: state.draftSelection,
            locked: state.draftInputLocked,
            armed: state.draftConfirmArmed
          };
        }
      };
      window.mekoraV3 = Object.freeze({
        version: MEKORA_VERSION,
        factionPackageV31: FACTION_PACKAGE_V31,
        schemaVersion: CONTENT_SCHEMA_VERSION,
        catalog() { return Array.from(CONTENT_CATALOG_V3.values()).map(item => ({...item})); },
        content(id) { const item = getContentMetaV3(id); return item ? {...item} : null; },
        progression() { return JSON.parse(JSON.stringify(progressionV3)); },
        resetProgression() { progressionV3 = createDefaultProgressionV3(); saveProgressionV3(); return this.progression(); },
        setPity(rareMisses = 0, epicMisses = 0) { progressionV3.pity.rareMisses = Math.max(0, rareMisses|0); progressionV3.pity.epicMisses = Math.max(0, epicMisses|0); saveProgressionV3(); return this.progression().pity; },
        draftSample(count = 3) { return selectDraftCardsV3(UPGRADE_POOL, count, state).map(item => ({id:item.id, rarity:getContentMetaV3(item.id)?.rarity, kind:getContentMetaV3(item.id)?.kind})); },
        startRunForTest() { startRun(false,false); return this.ammoState(); },
        startTestCombatForTest() { state.testDummyEnabled=true; state.testSpawnEnemies=false; startRun(true,true); return this.ammoState(); },
        setFiringForTest(active = true) { state.isFiring = !!active; return {phase:state.phase,firing:state.isFiring,...this.ammoState()}; },
        placeDummyNearForTest(distance = 180) { const dummy=state.enemies.find(e=>e.isDummy); if(dummy){ dummy.x=state.mecha.x+Math.max(60,Number(distance)||180); dummy.y=state.mecha.y; } return dummy ? {x:dummy.x,y:dummy.y,mechaX:state.mecha.x,mechaY:state.mecha.y} : null; },
        ammoState() { normalizePrimaryMagazineV301(); return {primary:getPrimaryWeaponIdV301(),ammo:state.mecha.ammo,capacity:getPrimaryMagazineCapacityV301(),reloading:state.mecha.isReloading,text:__mekoraAmmoHud.count?.textContent}; },
        testAmmo(ammo = 10, reloading = false) { state.mecha.ammo = Math.max(0, ammo|0); state.mecha.isReloading = !!reloading; updatePrimaryAmmoHudV301(); return this.ammoState(); },
        simulatePrimaryShot(timestamp = performance.now()) { const fired = consumePrimaryAmmoV301(timestamp); return {fired,...this.ammoState()}; },
        completePrimaryReload() { state.mecha.reloadStartTime = performance.now() - ((state.mecha.reloadDuration || 1500) / Math.max(.1,state.stats.reloadSpeedMult || 1)) - 10; updatePrimaryReloadV301(performance.now()); return this.ammoState(); },
        equipSecondaryForTest(id = 'w-machinegun') { const before=this.ammoState(); if(!state.activeWeapons.includes(id)) state.activeWeapons.push(id); state.weaponLevels[id]=state.weaponLevels[id]||1; calculateMechaStats(); updatePrimaryAmmoHudV301(); return {before,after:this.ammoState(),loadout:[...state.activeWeapons]}; },
        setMagazineBonusForTest(bonus = 0) { state.mecha.maxAmmoBonus=Math.max(0,bonus|0); normalizePrimaryMagazineV301(); updatePrimaryAmmoHudV301(); return this.ammoState(); },
        showDraftForTest(ids = ['w-machinegun','w-laser','w-highbeam']) { const cards=ids.map(id=>UPGRADE_BY_ID.get(id)).filter(Boolean); state.phase='draft'; state.draftCards=cards; state.draftSelection=0; state.draftConfirmArmed=false; state.draftInputLocked=false; prepareDraftDiscoveriesV301(cards); document.getElementById('roguelike-draft-modal')?.classList.remove('hidden'); updateDraftMenuUI(); render(); return {cards:cards.map(c=>c.id),flags:state.draftDiscoveryFlags}; },
        testDamage(amount = 7, attackers = 1) { const hpBefore = state.mecha.hp; applyMechaDamage(amount, state.mecha.x, state.mecha.y, performance.now(), attackers); const latest = state.damageNumbers[state.damageNumbers.length - 1]; return {hpBefore,hpAfter:state.mecha.hp,flashUntil:state.mecha.damageFlashUntil,attackers:state.mecha.damageFlashAttackers,number:latest ? {text:latest.text,color:latest.color,size:latest.size} : null}; },
        balance(id) { return WEAPON_BALANCE_V302[id] ? {...WEAPON_BALANCE_V302[id], damage:WEAPON_BASE_DAMAGE[id], cooldown:WEAPON_BASE_COOLDOWN[id]} : null; },
        equipLoadoutForTest(ids = ['w-plasma']) { state.activeWeapons=[...ids]; state.weaponLevels={}; ids.forEach(id=>state.weaponLevels[id]=1); state.lastWeaponFireTimes={}; state.weaponRuntime={}; state.bullets.length=0; state.shockwaves.length=0; normalizePrimaryMagazineV301(); state.mecha.ammo=getPrimaryMagazineCapacityV301(); state.mecha.isReloading=false; state.mecha.primaryFirstShotReady=true; updatePrimaryAmmoHudV301(); calculateMechaStats(); return this.loadoutStateV302(); },
        loadoutStateV302() { return {weapons:[...state.activeWeapons], levels:{...state.weaponLevels}, passives:[...state.passives], ammo:this.ammoState(), runEvolutionCores:state.runEvolutionCores}; },
        setPassivesForTest(ids = []) { state.passives=[...ids]; state.passiveLevels={}; ids.forEach(id=>state.passiveLevels[id]=1); calculateMechaStats(); return this.loadoutStateV302(); },
        setWeaponLevelForTest(id, level=1) { state.weaponLevels[id]=Math.max(1,level|0); calculateMechaStats(); return this.loadoutStateV302(); },
        grantEvolutionCoreForTest(count=1) { for(let i=0;i<Math.max(0,count|0);i++) awardEvolutionCoreV302('debug'); return this.loadoutStateV302(); },
        eligibleEvolutionsForTest() { return getEligibleEvolutionCardsV302().map(item=>item.id); },
        applyEvolutionForTest(id='syn-cyclonic') { return {applied:applyEvolutionV302(id), state:this.loadoutStateV302()}; },
        flamethrowerRuntimeForTest() { const r=getWeaponRuntimeV302('w-flamethrower'); return {...r, bulletCount:state.bullets.filter(b=>b.type==='flame').length, lastFire:state.lastWeaponFireTimes?.['w-flamethrower']||0}; },
        rotaryRuntimeForTest() { const r=getWeaponRuntimeV302('w-rotarycannon'); return {...r, bulletCount:state.bullets.filter(b=>b.type==='machinegun').length}; },
        combatSnapshotV302() { return {phase:state.phase, mecha:{x:state.mecha.x,y:state.mecha.y,hp:state.mecha.hp,ammo:state.mecha.ammo,reloading:state.mecha.isReloading,firstShotReady:state.mecha.primaryFirstShotReady}, bullets:state.bullets.slice(-20).map(b=>({type:b.type,damage:b.damage,life:b.life,bonusPierceHits:b.bonusPierceHits||0,forcedBounces:b.forcedBounces||0,x:b.x,y:b.y})), runtime:JSON.parse(JSON.stringify(state.weaponRuntime||{}))}; },
        showEvolutionDraftForTest() { const cards=getEligibleEvolutionCardsV302(); state.phase='draft'; state.draftCards=cards; state.draftSelection=0; state.draftConfirmArmed=false; state.draftInputLocked=false; prepareDraftDiscoveriesV301(cards); document.getElementById('roguelike-draft-modal')?.classList.remove('hidden'); updateDraftMenuUI(); render(); return cards.map(c=>c.id); },
        primaryModifiersForTest(ammo=3, passiveIds=[], firstReady=false) { state.passives=[...passiveIds]; state.passiveLevels={}; passiveIds.forEach(id=>state.passiveLevels[id]=1); state.mecha.ammo=Math.max(0,ammo|0); state.mecha.primaryFirstShotReady=!!firstReady; return getPrimaryShotModifiersV302(getPrimaryWeaponIdV301()); },
        spawnEnemyV31ForTest(type='scrap_hound', options={}) { if(state.testMode){state.testSpawnEnemies=true;state.devContinuousSpawn=false;} return safeSpawnAroundPlayerV31(type, Number(options.distance)||240, options); },
        spawnEliteV31ForTest(type='saw_raider') { if(state.testMode){state.testSpawnEnemies=true;state.devContinuousSpawn=false;} return safeSpawnAroundPlayerV31(type,260,{elite:true}); },
        spawnMinibossV31ForTest() { if(state.testMode){state.testSpawnEnemies=true;state.devContinuousSpawn=false;} return spawnMinibossV31(); },
        spawnBossV31ForTest() { if(state.testMode){state.testSpawnEnemies=true;state.devContinuousSpawn=false;} return spawnBossV31(); },
        enemySnapshotV31() { return state.enemies.map(e=>({id:e.id,type:e.type,faction:e.faction,role:e.roleV31,hp:e.hp,maxHp:e.maxHp,elite:!!e.isEliteV31,miniboss:!!e.isMinibossV31,boss:!!e.isBossV31,phase:e.phaseV31||1,nextActionAt:e.nextActionAt||0})); },
        mineSnapshotV31() { return state.enemyMinesV31.map(m=>({...m})); },
        setPlayTimeV31(ms=0) { state.playTime=Math.max(0,Number(ms)||0); updateSectorProgressionV33(performance.now(),true); return {playTime:state.playTime,sector:state.sector}; },
        damageEnemyV31ForTest(id, amount=100) { const e=state.enemies.find(x=>x.id===id); if(!e)return null; damageEnemy(e,amount,performance.now()); return {id:e.id,hp:e.hp,maxHp:e.maxHp,vulnerableUntil:e.vulnerableUntil||0}; },
        updateEnemyV31ForTest(id, timestamp=performance.now()) { const e=state.enemies.find(x=>x.id===id); if(!e)return null; const angle=Math.atan2(state.mecha.y-e.y,state.mecha.x-e.x); const dist=Math.hypot(state.mecha.x-e.x,state.mecha.y-e.y); updateScrapperEnemyV31(e,timestamp,dist,angle,false,1,900); updateEnemyMinesV31(timestamp); updateBossHudV31(); return {id:e.id,type:e.type,x:e.x,y:e.y,hp:e.hp,phase:e.phaseV31,warning:e.attackWarningUntil,pending:e.pendingAttackAt,charge:e.chargeUntil,mines:state.enemyMinesV31.length,bullets:state.enemyBullets.length}; },
        defeatEnemyV31ForTest(id) { const i=state.enemies.findIndex(x=>x.id===id); if(i<0)return null; const e=state.enemies[i]; e.hp=0; killEnemy(e,i); return {eliteKills:state.eliteKillsV31,minibossKills:state.minibossKillsV31,bossKills:state.bossKillsV31,cores:progressionV3.cores,evolutionCores:state.runEvolutionCores}; },
        encounterStateV31() { return {boss:{...state.bossEncounterV31},milestones:{...state.encounterMilestonesV31},enemyCount:state.enemies.length,mines:state.enemyMinesV31.length,eliteKills:state.eliteKillsV31,minibossKills:state.minibossKillsV31,bossKills:state.bossKillsV31}; },
        resetDummyStatsForTest() { resetDummyStats(); return {...state.dummyStats}; },
        dummyStatsForTest() { return {...state.dummyStats}; },
        enterImmersiveForTest() { return enterImmersiveMode().then(() => this.immersiveStateForTest()); },
        exitImmersiveForTest() { exitImmersiveMode(); return this.immersiveStateForTest(); },
        immersiveStateForTest() {
          const activeScreen = document.querySelector('.screen[data-show-on="playing"]');
          const display = activeScreen?.firstElementChild;
          const joy = document.getElementById('joystick-move-zone');
          const fire = document.getElementById('btn-tap-fire');
          const pause = document.getElementById('btn-control-pause');
          const mute = document.getElementById('btn-mute');
          const full = document.getElementById('btn-fullscreen');
          const rect = el => el ? ({x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,display:getComputedStyle(el).display,opacity:getComputedStyle(el).opacity}) : null;
          return {active:isImmersiveMode(),cameraZoom:getActiveCameraZoom(),screen:rect(activeScreen),display:rect(display),joystick:rect(joy),fire:rect(fire),pause:rect(pause),mute:rect(mute),fullscreen:rect(full),blockedPortrait:document.body.dataset.immersiveOrientationBlocked === 'true'};
        },
        sectorStateV33() { const def=getSectorDefV33();return {sector:state.sector,def:{...def},event:state.sectorEventV33?{...state.sectorEventV33}:null,pois:state.sectorPoisV33.map(p=>({...p})),drops:state.sectorDropsV33.map(d=>({...d})),hazards:state.sectorHazardsV33.map(h=>({...h})),director:{...state.threatDirectorV33},runStats:{...state.sectorStatsV33},persistent:{poisDiscovered:progressionV3.statistics.poisDiscovered,eventsCompleted:progressionV3.statistics.eventsCompleted,maxSector:progressionV3.statistics.maxSector}}; },
        setPlayTimeV33(ms=0) { state.playTime=Math.max(0,Number(ms)||0);updateSectorProgressionV33(performance.now(),true);updateSectorHudV33();return this.sectorStateV33(); },
        startSectorEventV33ForTest(id='salvage_rain') { state.phase='playing';state.started=true;state.testMode=false;state.paused=false;state.sectorEventV33=null;startSectorEventV33(id);return this.sectorStateV33(); },
        completeSectorEventV33ForTest(success=true) { completeSectorEventV33(!!success);return this.sectorStateV33(); },
        spawnPoiV33ForTest(type='salvage',distance=40) { const p=createPoiV33(type,state.mecha.x+Math.max(0,Number(distance)||0),state.mecha.y);state.sectorPoisV33.push(p);return {...p}; },
        collectNearestPoiV33ForTest() { const p=state.sectorPoisV33.find(x=>!x.collected);if(!p)return null;p.x=state.mecha.x;p.y=state.mecha.y;collectPoiV33(p);return {type:p.type,scrap:state.scrap,hp:state.mecha.hp,statistics:{...progressionV3.statistics}}; },
        spawnHazardV33ForTest(type='press') { return spawnSectorHazardV33(type).map(h=>({...h})); },
        directorTickV33ForTest(timestamp=performance.now()) { state.phase='playing';state.started=true;state.testMode=false;updateThreatDirectorV33(timestamp,1);return this.sectorStateV33(); },
        clearSectorObjectsV33ForTest() { state.sectorPoisV33=[];state.sectorDropsV33=[];state.sectorHazardsV33=[];return this.sectorStateV33(); },
        collectPoiTypeV33ForTest(type='salvage') { state.sectorPoisV33=[];const p=createPoiV33(type,state.mecha.x,state.mecha.y);state.sectorPoisV33.push(p);const before={scrap:state.scrap,hp:state.mecha.hp,xp:state.xp,suppressed:state.directorSuppressedUntilV33,overclock:state.overclockUntilV33};collectPoiV33(p);return {type,before,after:{scrap:state.scrap,hp:state.mecha.hp,xp:state.xp,suppressed:state.directorSuppressedUntilV33,overclock:state.overclockUntilV33},statistics:{...progressionV3.statistics}}; },
        triggerHazardV33ForTest(type='press',damage=15) { state.sectorHazardsV33=[];const now=state.playTime||0;const h={type:'circle',kind:type==='heat'?'heat':'press',x:state.mecha.x,y:state.mecha.y,radius:90,warnUntil:now-1,activeUntil:now+1000,damage:Math.max(1,Number(damage)||15),nextTick:0};state.sectorHazardsV33.push(h);const before=state.mecha.hp;applyHazardDamageV33(h,now);return {before,after:state.mecha.hp,hazard:{...h}}; },
        temporaryFireRateV33ForTest() { return getTemporaryFireRateMultV33(); },
        economyStateV32() { return {cores:progressionV3.cores,blueprints:{...progressionV3.blueprints},mechBlueprints:{...progressionV3.mechBlueprints},statistics:{...progressionV3.statistics},pinned:[...(progressionV3.pinnedMissions||[])],claimed:[...(progressionV3.claimedMissions||[])],scrap:state.scrap}; },
        openHangarForTest(tab='missions') { state.phase='menu'; render(); openHangarV32(); const idx=HANGAR_TABS_V32.findIndex(t=>t.id===tab); if(idx>=0)state.hangarTabIndexV32=idx; state.hangarItemIndexV32=0; updateHangarUIV32(); return {open:state.hangarOpenV32,tab:HANGAR_TABS_V32[state.hangarTabIndexV32].id,cores:progressionV3.cores}; },
        setCoresForTest(value=0) { progressionV3.cores=Math.max(0,Number(value)||0);saveProgressionV3();updateHangarUIV32();return progressionV3.cores; },
        setMissionStatForTest(stat,value) { progressionV3.statistics[stat]=Math.max(0,Number(value)||0);updateMissionTrackingHudV32();updateHangarUIV32();return {...progressionV3.statistics}; },
        claimMissionForTest(id) { return {claimed:claimMissionV32(id),progression:this.economyStateV32()}; },
        purchaseBlueprintForTest(id) { const item=UPGRADE_BY_ID.get(id); if(!item)return null; progressionV3.blueprints[id]='discovered'; progressionV3.cores=Math.max(progressionV3.cores,getBlueprintPriceV32(item)); const before=progressionV3.cores; state.hangarOpenV32=true; state.hangarTabIndexV32=HANGAR_TABS_V32.findIndex(t=>t.id===(getContentMetaV3(id)?.kind==='power'?'powers':getContentMetaV3(id)?.kind==='module'?'modules':'weapons')); const items=getHangarItemsV32(HANGAR_TABS_V32[state.hangarTabIndexV32].id); state.hangarItemIndexV32=items.findIndex(x=>x.id===id); confirmHangarActionV32(); return {before,after:progressionV3.cores,status:progressionV3.blueprints[id]}; },
        openFieldShopForTest(scrap=300) { state.phase='playing';state.started=true;state.testMode=false;state.scrap=Math.max(0,Number(scrap)||0);state.paused=false;render();const opened=openFieldShopV32(true);return {opened,offers:(state.fieldShopOffersV32||[]).map(o=>({id:o.id,price:o.price,sold:o.sold})),scrap:state.scrap}; },
        buyFieldShopOfferForTest(index=0) { state.fieldShopSelectionV32=Math.max(0,Math.min((state.fieldShopOffersV32||[]).length-1,index|0));confirmInputLockedUntil=0;confirmFieldShopActionV32();return {open:state.fieldShopOpenV32,scrap:state.scrap,offers:(state.fieldShopOffersV32||[]).map(o=>({id:o.id,sold:o.sold,price:o.price})),hp:state.mecha.hp,ammo:state.mecha.ammo,speed:state.stats.speedMult}; },
        awardRunCoresForTest() { state.testMode=false;state.runCoresAwardedV32=false;return {award:awardRunCoresV32(),cores:progressionV3.cores}; },
        v331StateForTest() { ensureV331State(); return {phase:state.phase,level:state.level,xp:state.xp,xpNeeded:state.xpNeeded,orbs:state.orbs.map(o=>({tier:o.tierV331,xpValue:o.xpValue,color:o.color,x:o.x,y:o.y})),consumables:state.sectorConsumablesV331.map(c=>({...c})),death:{...state.deathSequenceV331},transition:{...state.sectorTransitionV331},player:{hp:state.mecha.hp,maxHp:state.mecha.maxHp,speed:(4.65+(state.mecha.stability/100)*1.75)*(state.stats.speedMult||1),hidden:!!state.mecha.hiddenV331},cameraZoom:getActiveCameraZoom(),reactorOverloadUntil:state.mecha.reactorOverloadUntil||0,retiredPowers:{emp:UPGRADE_BY_ID.has('w-emp'),reactor:UPGRADE_BY_ID.has('w-reactor')},hudVisible:(()=>{const el=document.getElementById('ui-layer')||document.querySelector('[data-show-on="playing"]');return el?getComputedStyle(el).display:'missing';})()}; },
        energyOrbTableV331ForTest() { return Object.fromEntries(Object.entries(ENERGY_ORB_TIERS_V331).map(([id,t])=>[id,{...t}])); },
        setXpV331ForTest(xp=0,needed=30,level=1) { state.phase='playing';state.started=true;state.paused=false;state.xp=Math.max(0,Number(xp)||0);state.xpNeeded=Math.max(1,Number(needed)||30);state.level=Math.max(1,Number(level)||1);document.getElementById('roguelike-draft-modal')?.classList.add('hidden');updateXpUI();return this.v331StateForTest(); },
        collectEnergyOrbV331ForTest(tier='blue') { const t=ENERGY_ORB_TIERS_V331[tier]||ENERGY_ORB_TIERS_V331.blue;const before={xp:state.xp,level:state.level,phase:state.phase};state.xp+=t.xp;if(state.xp>=state.xpNeeded)triggerLevelUp();updateXpUI();return {tier,before,after:{xp:state.xp,level:state.level,phase:state.phase},draft:{cards:(state.draftCards||[]).map(c=>({id:c.id,title:c.title,type:c.type})),selected:state.draftSelection,locked:state.draftInputLocked,armed:state.draftConfirmArmed}}; },
        spawnEnergyOrbV331ForTest(tier='blue',distance=80) { const t=ENERGY_ORB_TIERS_V331[tier]||ENERGY_ORB_TIERS_V331.blue;const orb={x:state.mecha.x+Math.max(0,Number(distance)||0),y:state.mecha.y,radius:t.radius,xpValue:t.xp,color:t.color,stroke:t.stroke,tierV331:tier};state.orbs.push(orb);return {...orb}; },
        spawnConsumableV331ForTest(type='emp',distance=60) { const c=spawnRareConsumableV331(type,state.mecha.x+Math.max(0,Number(distance)||0),state.mecha.y);return c?{...c}:null; },
        useConsumableV331ForTest(type='emp') { const c={type,x:state.mecha.x,y:state.mecha.y};useConsumableV331(c,performance.now());return this.v331StateForTest(); },
        beginDeathV331ForTest(cause='TEST IMPACT') { state.phase='playing';state.started=true;state.paused=false;state.testMode=false;const ok=beginDeathSequenceV331(state.mecha.x,state.mecha.y,performance.now());if(ok)state.deathSequenceV331.cause=cause;return {ok,...this.v331StateForTest()}; },
        advanceDeathV331ForTest(ms=0) { const start=state.deathSequenceV331?.startedAt||performance.now();updateDeathSequenceV331(start+Math.max(0,Number(ms)||0),16);return this.v331StateForTest(); },
        setLanguageV331ForTest(lang='en') { applyLanguage(lang,false);return {language:SETTINGS_STATE.language,firstCards:UPGRADE_POOL.slice(0,4).map(x=>({id:x.id,title:x.title,desc:x.desc})),mission:{title:MISSION_DEFS_V32[0].title,short:MISSION_DEFS_V32[0].short},shop:{title:FIELD_SHOP_DEFS_V32[0].title,desc:FIELD_SHOP_DEFS_V32[0].desc},sector:{name:SECTOR_DEFS_V33[0].name,subtitle:SECTOR_DEFS_V33[0].subtitle}}; },
        enemyTuningV331ForTest() { return Object.fromEntries(Object.entries(ENEMY_DEFS_V31).map(([id,d])=>[id,{hp:d.hp,speed:d.speed,contactDamage:d.contactDamage,role:d.role}])); },
        weaponStatsV331ForTest(id='w-machinegun',level=1) { return {...getWeaponStats(id,Math.max(1,Number(level)||1))}; },
        projectileSpeedsV331ForTest() { const mag=o=>Math.hypot(Number(o.vx)||0,Number(o.vy)||0);return {player:state.bullets.map(mag),enemy:state.enemyBullets.map(mag)}; },
        cycleBossPatternsV331ForTest(id,times=4) { const e=state.enemies.find(v=>v.id===id);if(!e)return null;const before={bullets:state.enemyBullets.length,mines:state.enemyMinesV31.length,cycle:e.attackCycleV331||0};for(let i=0;i<Math.max(1,Number(times)||1);i++)executeBossAttackV31(e,performance.now()+i*100,Math.atan2(state.mecha.y-e.y,state.mecha.x-e.x));return {before,after:{bullets:state.enemyBullets.length,mines:state.enemyMinesV31.length,cycle:e.attackCycleV331||0},bulletColors:[...new Set(state.enemyBullets.slice(before.bullets).map(b=>b.color))]}; },
        affinityWeightV331ForTest(id='p-fire-zone') { const item=UPGRADE_BY_ID.get(id);return item?{id,weight:contextualDraftWeightV331(item,state),ownedTags:[...getOwnedAffinityTagsV331(state)]}:null; },
        armEnemyAttackV331ForTest(id,delay=0) { const e=state.enemies.find(v=>v.id===id);if(!e)return null;e.nextActionAt=performance.now()+Math.max(0,Number(delay)||0);e.pendingAttackAt=0;e.windupUntil=0;e.chargeUntil=0;return {id:e.id,nextActionAt:e.nextActionAt}; },
        setEnemyPositionV331ForTest(id,x,y) { const e=state.enemies.find(v=>v.id===id);if(!e)return null;e.x=Number(x);e.y=Number(y);return {id:e.id,x:e.x,y:e.y,visible:isEnemyInsideCombatViewV331(e,40)}; },
        clearEnemyBulletsV331ForTest() { state.enemyBullets.length=0;return 0; },
        triggerSectorTransitionV331ForTest(target=2) { state.phase='playing';state.started=true;state.sectorCurrentV33=Math.max(1,Math.min(5,(Number(target)||2)-1));state.sector=state.sectorCurrentV33;state.playTime=(Math.max(1,Math.min(5,Number(target)||2))-1)*60000;updateSectorProgressionV33(performance.now(),false);return this.v331StateForTest(); },
        advanceSectorTransitionV331ForTest(ms=0) { const start=state.sectorTransitionV331?.startedAt||performance.now();updateSectorTransitionV331(start+Math.max(0,Number(ms)||0));return this.v331StateForTest(); },
        pauseExitImmersiveForTest() { state.phase='playing'; state.paused=true; state.pauseConfirmState=false; state.pauseSelection='exit'; document.getElementById('pause-modal')?.classList.remove('hidden'); updatePauseMenuUI(); const label=document.getElementById('btn-exit')?.textContent || ''; confirmInputLockedUntil=0; confirmPauseAction(); return {active:isImmersiveMode(),paused:state.paused,phase:state.phase,label}; }
      });
// #region v332_interface_and_ranged_fixes

(() => {
  const V332 = '3.3.2';
  function decorateDeveloperTouchV332(){
    const tabs=document.getElementById('dev-section-tabs');
    if(tabs)[...tabs.children].forEach((el,i)=>{el.dataset.devSectionIndex=String(i);el.setAttribute('role','button');el.tabIndex=0;});
    const list=document.getElementById('dev-compact-list');
    if(list){
      const sectionId=state.devActiveSection||'weapons';
      const items=getDevSectionItems(sectionId);
      let start=0;
      if(state.devFocus!=='tabs'){
        start=Math.max(0,state.devItemIndex-2);
        start=Math.min(start,Math.max(0,items.length-5));
      }
      [...list.children].forEach((el,i)=>{el.dataset.devItemIndex=String(start+i);el.setAttribute('role','button');el.tabIndex=0;});
    }
    const minus=document.getElementById('dev-touch-minus');
    const plus=document.getElementById('dev-touch-plus');
    const levelEnabled=state.devFocus==='list'&&(state.devActiveSection==='weapons'||state.devActiveSection==='passives');
    if(minus)minus.disabled=!levelEnabled;
    if(plus)plus.disabled=!levelEnabled;
  }

  function ensureDeveloperToolbarV332(){
    const panel=document.querySelector('[data-show-on="dev"] .compact-console-panel');
    if(!panel||document.getElementById('dev-touch-toolbar'))return;
    const bar=document.createElement('div');bar.id='dev-touch-toolbar';
    bar.innerHTML='<button class="dev-touch-back" id="dev-touch-back" type="button">VOLVER</button><span></span><button class="dev-touch-level" id="dev-touch-minus" type="button">− NIVEL</button><button class="dev-touch-level" id="dev-touch-plus" type="button">+ NIVEL</button>';
    panel.appendChild(bar);
    const back=bar.querySelector('#dev-touch-back');
    back.addEventListener('pointerup',ev=>{ev.preventDefault();ev.stopPropagation();if(state.devFocus==='list'){state.devFocus='tabs';state.devSectionIndex=Math.max(0,DEV_SECTIONS.findIndex(v=>v.id===state.devActiveSection));updateDevMenuUI();}else startMainMenu();});
    bar.querySelector('#dev-touch-minus').addEventListener('pointerup',ev=>{ev.preventDefault();ev.stopPropagation();modifyDevLevel(state.devActiveSection,-1);});
    bar.querySelector('#dev-touch-plus').addEventListener('pointerup',ev=>{ev.preventDefault();ev.stopPropagation();modifyDevLevel(state.devActiveSection,1);});
  }

  function installDeveloperTouchV332(){
    ensureDeveloperToolbarV332();
    const tabs=document.getElementById('dev-section-tabs');
    const list=document.getElementById('dev-compact-list');
    if(tabs&&!tabs.dataset.touchV332){
      tabs.dataset.touchV332='true';
      tabs.addEventListener('pointerup',ev=>{
        const tab=ev.target.closest('.dev-tab');if(!tab||state.phase!=='dev')return;
        ev.preventDefault();ev.stopPropagation();
        const idx=Number(tab.dataset.devSectionIndex);if(!Number.isFinite(idx))return;
        state.devSectionIndex=idx;const section=DEV_SECTIONS[idx];
        if(section.id==='exit'){startMainMenu();return;}
        state.devActiveSection=section.id;state.devFocus='list';state.devItemIndex=0;confirmInputLockedUntil=0;updateDevMenuUI();vibrate(18);
      });
    }
    if(list&&!list.dataset.touchV332){
      list.dataset.touchV332='true';
      list.addEventListener('pointerup',ev=>{
        const row=ev.target.closest('.dev-row');if(!row||state.phase!=='dev')return;
        ev.preventDefault();ev.stopPropagation();
        if(state.devFocus==='tabs'){
          const section=DEV_SECTIONS[state.devSectionIndex];if(section?.id==='exit'){startMainMenu();return;}
          if(section){state.devActiveSection=section.id;state.devFocus='list';state.devItemIndex=0;updateDevMenuUI();}
          return;
        }
        const idx=Number(row.dataset.devItemIndex);if(Number.isFinite(idx))state.devItemIndex=idx;
        confirmInputLockedUntil=0;confirmDevAction();
      });
    }
  }

  const originalUpdateDevMenuUIV332=updateDevMenuUI;
  updateDevMenuUI=function(){originalUpdateDevMenuUIV332();ensureDeveloperToolbarV332();decorateDeveloperTouchV332();};

  // All newly created ranged enemies receive independent firing clocks.
  const originalCreateEnemyV332=createEnemyV31;
  createEnemyV31=function(type,ex,ey,worldSize,options={}){
    const e=originalCreateEnemyV332(type,ex,ey,worldSize,options);
    const ranged=['scrap_gunner','mine_junker','scrap_bomber','drill_bastion','forge_titan','square','purple_arrow'].includes(type);
    if(ranged){
      e.fireCadenceOffsetV332=240+Math.random()*1800;
      e.fireIntervalV332=type==='scrap_gunner'?1750+Math.random()*1150:type==='mine_junker'?2450+Math.random()*1450:type==='scrap_bomber'?2600+Math.random()*1800:1800+Math.random()*1800;
      e.fireWindupV332=320+Math.random()*520;
      e.nextActionAt=performance.now()+e.fireCadenceOffsetV332;
      e.nextShotTime=type==='square'||type==='purple_arrow'?performance.now()+e.fireCadenceOffsetV332:null;
    }
    return e;
  };

  function initV332(){
    document.body.dataset.uiVersion=V332;
    document.getElementById('settings-version-text')?.replaceChildren(document.createTextNode('MEKORA v3.3.3'));
    installDeveloperTouchV332();
    const menuButtons=['btn-main-play','btn-main-hangar','btn-main-global','btn-main-settings','btn-main-dev','btn-close-settings','btn-close-global','btn-gameover-retry','btn-gameover-menu'];
    menuButtons.forEach(id=>{const el=document.getElementById(id);if(el){el.style.pointerEvents='auto';el.style.touchAction='manipulation';}});
    document.querySelectorAll('#language-buttons-container .lang-btn').forEach(btn=>{
      if(btn.dataset.touchV332)return;btn.dataset.touchV332='true';
      btn.addEventListener('pointerup',ev=>{ev.preventDefault();ev.stopPropagation();applyLanguage(btn.dataset.lang,true);state.langSelectionIndex=Math.max(0,['es','en','pt'].indexOf(btn.dataset.lang));updateSettingsMenuUI();vibrate(18);});
    });
  }
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',()=>setTimeout(initV332,0),{once:true});else setTimeout(initV332,0);

  window.mekoraV332={
    version:V332,
    uiState(){return {phase:state.phase,bodyBackground:getComputedStyle(document.body).backgroundColor,screenBackground:getComputedStyle(document.querySelector(`.screen[data-show-on="${state.phase==='draft'?'playing':state.phase}"]`)||document.body).backgroundColor,developerTouch:!!document.getElementById('dev-touch-toolbar')};},
    menu(){startMainMenu();return {phase:state.phase};},
    unlockDeveloper(){unlockDeveloperMode(true);return {visible:!document.getElementById('btn-main-dev')?.classList.contains('hidden')};},
    openDeveloper(){openDeveloperMenu();return {phase:state.phase};},
    developerState(){return {phase:state.phase,focus:state.devFocus,section:state.devActiveSection,sectionIndex:state.devSectionIndex,itemIndex:state.devItemIndex,passives:[...state.passives],passiveLevels:{...state.passiveLevels},weapons:[...state.activeWeapons],weaponLevels:{...state.weaponLevels}};},
    startTest(){startRun(true,true);return {phase:state.phase};},
    gameover(){stopRun();state.phase='gameover';state.started=false;render();return {phase:state.phase};},
    rangedEnemy(type='scrap_gunner'){state.phase='playing';state.started=true;const e=safeSpawnAroundPlayerV31(type,240);return {id:e.id,type:e.type,nextActionAt:e.nextActionAt,offset:e.fireCadenceOffsetV332,interval:e.fireIntervalV332,windup:e.fireWindupV332};},
    armLastGunners(){const es=state.enemies.filter(e=>e.type==='scrap_gunner').slice(-2);const now=performance.now();es.forEach((e,i)=>{e.x=state.mecha.x+220+i*5;e.y=state.mecha.y;e.nextActionAt=now;e.pendingAttackAt=0;});es.forEach(e=>updateScrapperEnemyV31(e,now,Math.hypot(state.mecha.x-e.x,state.mecha.y-e.y),Math.atan2(state.mecha.y-e.y,state.mecha.x-e.x),false,1,900));return es.map(e=>({id:e.id,pending:e.pendingAttackAt,windup:e.fireWindupV332,interval:e.fireIntervalV332}));},
    gunnerWeights(){return SECTOR_DEFS_V33.map(s=>({sector:s.index,weight:s.weights.scrap_gunner}));},
    developerTapTab(index=0){openDeveloperMenu();state.devSectionIndex=Math.max(0,Math.min(DEV_SECTIONS.length-1,index|0));const section=DEV_SECTIONS[state.devSectionIndex];if(section.id==='exit'){startMainMenu();return {phase:state.phase};}state.devActiveSection=section.id;state.devFocus='list';state.devItemIndex=0;updateDevMenuUI();return {phase:state.phase,section:state.devActiveSection,focus:state.devFocus};}
  };
})();

// #endregion v332_interface_and_ranged_fixes

// #region v333_full_landscape_ui_and_opening_balance
(() => {
  const V333='3.3.3';
  const introStateV333={firstSpawnDone:false};
  const gunnerSectorWeightsV333=[.07,.07,.18,.09,.11];

  function isPortraitV333(){return window.innerHeight>window.innerWidth;}
  function enforceLandscapeV333(){
    const warning=dom.orientationWarning||document.getElementById('orientation-warning');
    if(!warning)return false;
    const blocked=isPortraitV333();
    warning.style.display=blocked?'flex':'none';
    warning.setAttribute('aria-hidden',blocked?'false':'true');
    document.body.dataset.landscapeBlocked=blocked?'true':'false';
    if(blocked){state.isFiring=false;state.moveJoystick.active=false;}
    return blocked;
  }
  syncImmersiveOrientation=enforceLandscapeV333;

  function menuMechSvgV333(){return `<svg class="menu-mech-v333" viewBox="0 0 760 560" aria-hidden="true">
    <ellipse cx="355" cy="500" rx="230" ry="32" fill="rgba(0,0,0,.32)"/>
    <g transform="translate(85 15)">
      <path class="dark" d="M245 84 320 55 399 82 433 157 414 255 338 289 249 258 216 163Z"/>
      <path class="armor" d="M259 93 320 74 382 95 401 154 388 226 331 250 270 228 244 160Z"/>
      <path class="accent" d="M287 106 353 105 372 139 360 169 280 168 267 139Z"/>
      <path class="dark" d="M291 116 345 116 359 139 349 153 286 153 277 138Z"/>
      <rect class="energy" x="304" y="126" width="35" height="12" rx="5"/>
      <path class="armor" d="M211 151 132 179 107 252 153 280 224 231Z"/><path class="dark" d="M139 188 91 211 64 301 112 318 162 260Z"/>
      <path class="armor" d="M432 154 507 172 549 229 525 269 437 228Z"/><path class="dark" d="M515 184 568 211 592 301 544 320 493 257Z"/>
      <path class="accent" d="M84 234 129 246 108 323 55 309Z"/><path class="accent" d="M548 235 588 219 620 300 568 322Z"/>
      <path class="dark" d="M269 247 248 333 287 369 327 318 366 369 406 331 385 244Z"/>
      <path class="armor" d="M250 314 184 352 166 447 215 470 279 382Z"/><path class="dark" d="M194 363 146 393 132 492 192 502 230 443Z"/>
      <path class="armor" d="M404 315 470 354 493 448 445 472 377 381Z"/><path class="dark" d="M461 365 508 394 526 492 466 503 427 440Z"/>
      <path class="accent" d="M138 454 205 454 225 500 120 500Z"/><path class="accent" d="M456 454 521 454 541 500 438 500Z"/>
      <circle class="energy" cx="328" cy="210" r="25"/><circle class="dark" cx="328" cy="210" r="11"/>
      <path class="line" d="M280 181 250 219M377 181l34 38M289 280l-18 70M370 281l18 69"/>
    </g></svg>`;}

  function decorateMenuSettingsV333(){const b=document.getElementById('btn-main-settings');if(b&&b.closest('.menu-topbar-v333'))b.innerHTML='<span class="menu-settings-icon-v333">⚙</span>';}
  function buildMenuV333(){
    const section=document.querySelector('.screen[data-show-on="menu"]');
    const root=section?.children?.[0];if(!root||root.classList.contains('menu-home-v333'))return;
    root.className='menu-home-v333';
    const preservedButtonsV333={};for(const id of ['btn-main-play','btn-main-hangar','btn-main-global','btn-main-settings','btn-main-dev']){preservedButtonsV333[id]=document.getElementById(id);}
    [...root.children].forEach(ch=>{if(ch.id!=='hangar-modal-v32')ch.remove();});
    const top=document.createElement('div');top.className='menu-topbar-v333';top.innerHTML='<div class="menu-brand-v333"><b>MEKORA</b><span>TACTICAL SALVAGE UNIT</span></div>';
    const settings=preservedButtonsV333['btn-main-settings']||document.createElement('button');settings.id='btn-main-settings';settings.innerHTML='<span class="menu-settings-icon-v333">⚙</span>';top.appendChild(settings);
    const stage=document.createElement('div');stage.className='menu-stage-v333';stage.id='menu-stage-v333';stage.innerHTML=menuMechSvgV333();
    const panel=document.createElement('div');panel.className='menu-panel-v333';
    const title=document.createElement('h1');title.textContent='MEKORA';
    const subtitle=document.createElement('div');subtitle.className='menu-subtitle-v333';subtitle.textContent='EXPEDICIÓN MECÁNICA · UNIDAD VANGUARD';
    const actions=document.createElement('div');actions.className='menu-actions-v333';
    for(const id of ['btn-main-play','btn-main-hangar','btn-main-global','btn-main-dev']){const el=preservedButtonsV333[id];if(el)actions.appendChild(el);}
    panel.append(title,subtitle,actions);root.prepend(top,stage,panel);
  }

  function ensureHangarV333(){
    const modal=document.getElementById('hangar-modal-v32');if(!modal)return;
    if(!document.getElementById('hangar-back-v333')){const b=document.createElement('button');b.id='hangar-back-v333';b.type='button';b.setAttribute('aria-label','Volver');b.textContent='←';modal.prepend(b);b.addEventListener('pointerup',ev=>{ev.preventDefault();ev.stopPropagation();closeHangarV32();});}
    const oldTabs=document.getElementById('hangar-tabs-v32');if(oldTabs&&!oldTabs.dataset.v333){const tabs=oldTabs.cloneNode(false);tabs.dataset.v333='true';oldTabs.replaceWith(tabs);tabs.addEventListener('pointerup',ev=>{const tab=ev.target.closest('.hangar-tab-v32');if(!tab)return;ev.preventDefault();const idx=Number(tab.dataset.tabIndexV333);if(!Number.isFinite(idx))return;state.hangarTabIndexV32=idx;state.hangarItemIndexV32=0;updateHangarUIV32();});}
    const oldList=document.getElementById('hangar-list-v32');if(oldList&&!oldList.dataset.v333){const list=oldList.cloneNode(false);list.dataset.v333='true';oldList.replaceWith(list);list.addEventListener('pointerup',ev=>{const row=ev.target.closest('.hangar-row-v32');if(!row)return;ev.preventDefault();const idx=Number(row.dataset.itemIndex);if(!Number.isFinite(idx))return;state.hangarItemIndexV32=idx;updateHangarUIV32();if(ev.target.closest('.hangar-action-v333')){confirmInputLockedUntil=0;confirmHangarActionV32();}});}
  }

  function renderHangarV333(){
    if(!state.hangarOpenV32)return;ensureHangarV333();ensureHangarStateV32();
    if(state.hangarTabIndexV32>4)state.hangarTabIndexV32=0;
    const lang=SETTINGS_STATE.language;const w=(es,en,pt)=>lang==='en'?en:lang==='pt'?pt:es;
    const cores=document.getElementById('hangar-cores-v32');if(cores)cores.textContent=Math.floor(progressionV3.cores||0);
    const tabs=document.getElementById('hangar-tabs-v32');const visibleTabs=HANGAR_TABS_V32.filter(t=>t.id!=='exit');
    if(tabs)tabs.innerHTML=visibleTabs.map((t,i)=>`<button type="button" data-tab-index-v333="${i}" class="hangar-tab-v32 ${i===state.hangarTabIndexV32?'selected':''}">${t.label}</button>`).join('');
    const tab=visibleTabs[state.hangarTabIndexV32]||visibleTabs[0];const items=getHangarItemsV32(tab.id);state.hangarItemIndexV32=Math.max(0,Math.min(items.length-1,state.hangarItemIndexV32));
    const list=document.getElementById('hangar-list-v32');if(!list)return;
    list.innerHTML=items.map((item,actual)=>{let status='',locked=false,icon=item.icon||'◇',action=w('VER','VIEW','VER');
      if(tab.id==='missions'){const p=getMissionProgressV32(item);status=p.claimed?w('HECHO','DONE','FEITO'):p.complete?w('LISTA','READY','PRONTA'):(progressionV3.pinnedMissions||[]).includes(item.id)?w('FIJADA','PINNED','FIXADA'):w('ACTIVA','ACTIVE','ATIVA');icon=p.complete?'✓':'◇';action=p.complete&&!p.claimed?w('RECLAMAR','CLAIM','RESGATAR'):w('FIJAR / QUITAR','PIN / REMOVE','FIXAR / REMOVER');}
      else if(tab.id==='mechs'){const st=progressionV3.mechBlueprints[item.id]||'locked';status=st==='unlocked'?w('CONSTRUIDO','BUILT','CONSTRUÍDO'):st==='discovered'?`${item.price} ◇`:w('BLOQUEADO','LOCKED','BLOQUEADO');locked=st==='locked';icon=item.id==='vanguard'?'◆':'⬡';action=st==='discovered'?w('CONSTRUIR','BUILD','CONSTRUIR'):w('INSPECCIONAR','INSPECT','INSPECIONAR');}
      else{const st=progressionV3.blueprints[item.id]||'locked';status=st==='unlocked'?w('DESBLOQUEADO','UNLOCKED','DESBLOQUEADO'):st==='discovered'?`${getBlueprintPriceV32(item)} ◇`:w('BLOQUEADO','LOCKED','BLOQUEADO');locked=st==='locked';action=st==='discovered'?w('CONSTRUIR','BUILD','CONSTRUIR'):w('INSPECCIONAR','INSPECT','INSPECIONAR');}
      return `<article data-item-index="${actual}" class="hangar-row-v32 ${actual===state.hangarItemIndexV32?'selected':''} ${locked?'locked':''}"><div class="hangar-icon-v32">${locked?'?':icon}</div><div class="hangar-copy-v32"><strong>${locked?w('PROYECTO DESCONOCIDO','UNKNOWN PROJECT','PROJETO DESCONHECIDO'):(item.title||item.name)}</strong><span>${getHangarRowDescriptionV32(item,tab.id)}</span></div><div class="hangar-tag-v32">${status}</div><button type="button" class="hangar-action-v333">${action}</button></article>`;
    }).join('');
  }
  updateHangarUIV32=renderHangarV333;
  const oldOpenHangarV333=openHangarV32;openHangarV32=function(){const r=oldOpenHangarV333();ensureHangarV333();renderHangarV333();return r;};

  function restructureSettingsV333(){
    const section=document.querySelector('.screen[data-show-on="settings"]');const root=section?.children?.[0];const panel=root?.querySelector('.hud-border');if(!root||!panel||root.parentElement?.classList.contains('settings-layout-v333'))return;
    const layout=document.createElement('div');layout.className='settings-layout-v333';const back=document.getElementById('btn-close-settings');back.className='settings-back-v333';back.textContent='←';back.setAttribute('aria-label','Volver');
    const dev=document.createElement('button');dev.id='settings-dev-v333';dev.className='settings-dev-v333';dev.textContent='ABRIR MODO DEVELOPER';dev.addEventListener('pointerup',ev=>{ev.preventDefault();openDeveloperMenu();});
    root.appendChild(layout);layout.append(back,panel,dev);const version=document.getElementById('settings-version-text');if(version)layout.appendChild(version);
    if(!panel.querySelector('.settings-visual-v333')){const visual=document.createElement('div');visual.className='settings-visual-v333';visual.innerHTML=`<div class="settings-schematic-v333"><svg viewBox="0 0 360 180" aria-hidden="true"><g fill="none" stroke="#7ca5a8" stroke-width="3"><path d="M130 28h100l35 35-15 75-70 24-70-24-15-75Z"/><path d="m130 74-62 26 19 51 70-31M230 74l62 26-19 51-70-31M154 134l-30 34M206 134l30 34"/><circle cx="180" cy="86" r="24"/><path d="M166 86h28M180 72v28"/></g><g fill="#d5a451"><circle cx="180" cy="86" r="9"/><rect x="62" y="96" width="22" height="8"/><rect x="276" y="96" width="22" height="8"/></g></svg></div><div class="settings-system-grid-v333"><div><b>03</b><span>IDIOMAS ACTIVOS</span></div><div><b>100%</b><span>SISTEMA TÁCTIL</span></div><div><b>16:9</b><span>VISIÓN OPERATIVA</span></div></div>`;panel.appendChild(visual);}
  }
  function syncDeveloperEntryV333(){const main=document.getElementById('btn-main-dev');if(main)main.style.display='none';document.getElementById('settings-dev-v333')?.classList.toggle('visible',!!developerUnlocked);}
  const oldUnlockDeveloperV333=unlockDeveloperMode;unlockDeveloperMode=function(forceState=null){const r=oldUnlockDeveloperV333(forceState);syncDeveloperEntryV333();return r;};
  syncDeveloperButtonVisibility=function(){syncDeveloperEntryV333();};

  function restructureGlobalV333(){const section=document.querySelector('.screen[data-show-on="global_network"]');const root=section?.children?.[0];const inner=root?.querySelector(':scope > .relative');if(!root||!inner||root.parentElement?.classList.contains('global-layout-v333'))return;const layout=document.createElement('div');layout.className='global-layout-v333';const back=document.createElement('button');back.className='global-back-v333';back.textContent='←';back.setAttribute('aria-label','Volver');back.addEventListener('pointerup',()=>startMainMenu());root.appendChild(layout);layout.append(back,inner);}

  function ensureDeveloperV333(){const screen=document.querySelector('.screen[data-show-on="dev"]');const display=screen?.querySelector('.console-display');const panel=display?.querySelector('.compact-console-panel');if(!display||!panel||display.querySelector('.dev-layout-v333'))return;const layout=document.createElement('div');layout.className='dev-layout-v333';const back=document.createElement('button');back.className='dev-back-v333';back.textContent='←';back.setAttribute('aria-label','Volver');back.addEventListener('pointerup',()=>startSettingsMenu());display.appendChild(layout);layout.append(back,panel);}
  function renderDeveloperV333(){ensureDeveloperV333();const tabs=document.getElementById('dev-section-tabs');const list=document.getElementById('dev-compact-list');let idx=Math.max(0,Math.min(3,state.devSectionIndex|0));const section=DEV_SECTIONS[idx]||DEV_SECTIONS[0];if(section.id==='exit'){idx=0;state.devSectionIndex=0;}state.devActiveSection=DEV_SECTIONS[idx].id;state.devFocus='list';
    const weaponSlots=document.getElementById('dev-weapon-slots'),passiveSlots=document.getElementById('dev-passive-slots');if(weaponSlots)weaponSlots.textContent=`${state.activeWeapons.length}/6`;if(passiveSlots)passiveSlots.textContent=`${state.passives.length}/6`;
    if(tabs)tabs.innerHTML=DEV_SECTIONS.filter(s=>s.id!=='exit').map((t,i)=>`<button type="button" data-dev-section-index="${i}" class="dev-tab ${i===idx?'active cursor':''}">${t.label}</button>`).join('');
    const items=getDevSectionItems(state.devActiveSection);state.devItemIndex=Math.max(0,Math.min(items.length-1,state.devItemIndex));if(list)list.innerHTML=items.map((item,i)=>`<button type="button" data-dev-item-index="${i}" class="dev-row ${i===state.devItemIndex?'selected':''}"><span>${item.icon?item.icon+' ':''}${item.title||item.name||item.id}</span><span class="dev-value">${getDevItemValue(state.devActiveSection,item)}</span></button>`).join('');setDevStatus(`${items.length} ELEMENTOS · TOCA UNA TARJETA PARA ACTIVAR`);}
  updateDevMenuUI=renderDeveloperV333;
  const oldOpenDeveloperV333=openDeveloperMenu;openDeveloperMenu=function(){const r=oldOpenDeveloperV333();ensureDeveloperV333();state.devFocus='list';renderDeveloperV333();return r;};

  function decorateGameOverV333(){const retry=document.getElementById('btn-gameover-retry'),menu=document.getElementById('btn-gameover-menu');if(retry){retry.innerHTML='<span class="gameover-icon-v333">↻</span><small>REINTENTAR</small>';retry.setAttribute('aria-label','Reintentar');}if(menu){menu.innerHTML='<span class="gameover-icon-v333">⌂</span><small>MENÚ</small>';menu.setAttribute('aria-label','Volver al menú');}}

  const oldApplyLanguageV333=applyLanguage;applyLanguage=function(lang,persist=true){const r=oldApplyLanguageV333(lang,persist);decorateGameOverV333();decorateMenuSettingsV333();syncDeveloperEntryV333();return r;};

  /* Slow, readable opening. The first minute ramps rather than flooding the player. */
  updateThreatDirectorV33=function(timestamp,timeFactor){
    if(state.testMode&&(!state.testSpawnEnemies||state.devContinuousSpawn===false))return;
    if(!state.encounterMilestonesV31.miniboss&&state.playTime>=270000){state.encounterMilestonesV31.miniboss=true;spawnMinibossV31();return;}
    if(!state.encounterMilestonesV31.boss&&state.playTime>=720000&&!state.enemies.some(e=>e.isMinibossV31)){state.encounterMilestonesV31.boss=true;spawnBossV31();return;}
    if(state.enemies.some(e=>e.isBossV31))return;
    const t=state.playTime||0,d=state.threatDirectorV33;const dt=d.lastTick?Math.min(1000,timestamp-d.lastTick):16;d.lastTick=timestamp;
    const regular=state.enemies.filter(e=>!e.isDummy&&!e.isMinibossV31&&!e.isBossV31).length;const hpRatio=Math.max(0,state.mecha.hp/Math.max(1,state.mecha.maxHp));
    let cap=t<20000?2:t<45000?4:t<70000?7:Math.min(23,8+state.sector*3);if(state.enemies.some(e=>e.isMinibossV31))cap=5;if(hpRatio<.35)cap=Math.max(4,Math.floor(cap*.72));
    const earlyMult=t<20000?.34:t<45000?.52:t<70000?.72:1;const eventMult=state.sectorEventV33?.id==='overdrive'?1.25:1;const suppression=(state.directorSuppressedUntilV33||0)>t?.65:1;const healthAdapt=hpRatio<.35?.7:hpRatio>.78?1.08:1;
    d.pressure=cap?regular/cap:0;d.intensity=Math.max(.28,Math.min(2.05,(.56+state.sector*.14+t/410000)*earlyMult*eventMult*suppression*healthAdapt));d.budget=Math.min(16,(d.budget||0)+(dt/1000)*(.48+d.intensity*.9));updateSectorHudV33();
    if(t<6500)return;
    let interval=t<20000?5200:t<45000?3900:t<70000?3000:Math.max(850,2200/Math.max(.5,timeFactor*d.intensity));if(hpRatio<.35)interval*=1.3;
    if(regular>=cap||timestamp-(d.lastSpawnAt||0)<interval)return;
    d.lastSpawnAt=timestamp;
    if(t<45000){const type=t<20000?'scrap_hound':(Math.random()<.7?'scrap_hound':'saw_raider');safeSpawnAroundPlayerV31(type,720+Math.random()*160);d.budget=Math.max(0,d.budget-1);introStateV333.firstSpawnDone=true;return;}
    const available=getDirectorSquadsV33().filter(s=>s.cost<=d.budget+1.2&&(t>=70000||s.cost<=3));if(!available.length){safeSpawnAroundPlayerV31(getEnemyTypeForSector(state.sector),680+Math.random()*180);return;}
    const selected=available[Math.floor(Math.random()*available.length)];const eliteChance=t>85000?Math.min(.18,.018+state.sector*.021)*healthAdapt:0;spawnSquadV33(selected,eliteChance);d.budget=Math.max(0,d.budget-selected.cost);
  };

  /* Enemies cannot leave the industrial perimeter. Chargers react to the wall. */
  const oldUpdateScrapperV333=updateScrapperEnemyV31;
  updateScrapperEnemyV31=function(e,timestamp,dist,angle,isStunned,simulationSpeed,visibleRange){
    let handledGunnerV333=false;
    if(e.type==='scrap_gunner'&&!isStunned&&!state.deathSequenceV331?.active&&!state.sectorTransitionV331?.active){
      handledGunnerV333=true;const visible=isEnemyInsideCombatViewV331(e,35);let moveAngle=angle;if(dist<270)moveAngle=angle+Math.PI;else if(dist<440)moveAngle=angle+(e.id.charCodeAt(e.id.length-1)%2?1:-1)*Math.PI/2;moveEnemyTowardV31(e,moveAngle,e.speed,simulationSpeed);
      if(!visible){e.pendingAttackAt=0;}
      else if(e.pendingAttackAt&&timestamp>=e.pendingAttackAt){const a=predictedPlayerAngleV331(e,18);fireEnemyBulletV31(e,a-.045,4.45,e.isEliteV31?15:12,'#e6b15f',6,275);fireEnemyBulletV31(e,a+.045,4.45,e.isEliteV31?15:12,'#e6b15f',6,275);e.pendingAttackAt=0;e.fireIntervalV332=(e.isEliteV31?2050:2550)+Math.random()*(e.isEliteV31?700:1050);e.nextActionAt=timestamp+e.fireIntervalV332;}
      else if(!e.pendingAttackAt&&timestamp>=(e.nextActionAt||0)){e.fireWindupV332=560+Math.random()*260;e.pendingAttackAt=timestamp+e.fireWindupV332;e.attackWarningUntil=e.pendingAttackAt;}
    }
    if(!handledGunnerV333)oldUpdateScrapperV333(e,timestamp,dist,angle,isStunned,simulationSpeed,visibleRange);const ws=getCurrentWorldSize(),m=58;let hit=false;
    if(e.x<m){e.x=m;hit=true;}else if(e.x>ws-m){e.x=ws-m;hit=true;}if(e.y<m){e.y=m;hit=true;}else if(e.y>ws-m){e.y=ws-m;hit=true;}
    if(hit&&e.type==='saw_raider'&&timestamp<(e.chargeUntil||0)){
      if(e.isEliteV31){const lead=42;const tx=state.mecha.x+(state.moveJoystick?.x||0)*lead,ty=state.mecha.y+(state.moveJoystick?.y||0)*lead;e.chargeAngle=Math.atan2(ty-e.y,tx-e.x);e.chargeUntil=timestamp+760;e.attackWarningUntil=timestamp+150;for(let i=0;i<8;i++)state.particles.push({x:e.x,y:e.y,vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5,life:14,color:'#ffd071'});}
      else{e.chargeUntil=0;e.windupUntil=0;e.stunnedUntil=timestamp+900;e.vulnerableUntil=timestamp+1450;e.nextActionAt=timestamp+3200;for(let i=0;i<12;i++)state.particles.push({x:e.x,y:e.y,vx:(Math.random()-.5)*6,vy:(Math.random()-.5)*6,life:18,color:'#b6aaa0'});}
    }
  };
  const oldApplyEliteV333=applyEliteModifierV31;applyEliteModifierV31=function(enemy,modifier='armored'){const e=oldApplyEliteV333(enemy,modifier);e.speed*=1.12;e.contactDamage=Math.round(e.contactDamage*1.12);e.fireIntervalV332=Math.max(900,(e.fireIntervalV332||2200)*.84);e.color={scrap_hound:'#bd4e43',saw_raider:'#d65b3d',scrap_gunner:'#b2793f',mine_junker:'#8d6540',scrap_suicide:'#c43a43',scrap_bomber:'#80506f'}[e.type]||e.color;e.eliteGlowV333=true;return e;};
  const oldDrawScrapperV333=drawScrapperEnemyV31;drawScrapperEnemyV31=function(e,timestamp,angle){if(e.isEliteV31){ctx.save();const pulse=.42+.14*Math.sin(timestamp*.009);const g=ctx.createRadialGradient(0,0,e.radius*.45,0,0,e.radius+18);g.addColorStop(0,'rgba(255,191,83,0)');g.addColorStop(1,`rgba(255,151,56,${pulse})`);ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,e.radius+18,0,Math.PI*2);ctx.fill();ctx.restore();}oldDrawScrapperV333(e,timestamp,angle);};

  /* Fog stays at the visible perimeter instead of obscuring the center. */
  drawFogV331=function(timestamp){if(!ctx||!canvas)return;ctx.save();const edge=Math.max(56,Math.min(canvas.width,canvas.height)*.14);let g=ctx.createLinearGradient(0,0,edge,0);g.addColorStop(0,'rgba(23,28,31,.34)');g.addColorStop(1,'rgba(23,28,31,0)');ctx.fillStyle=g;ctx.fillRect(0,0,edge,canvas.height);g=ctx.createLinearGradient(canvas.width,0,canvas.width-edge,0);g.addColorStop(0,'rgba(23,28,31,.34)');g.addColorStop(1,'rgba(23,28,31,0)');ctx.fillStyle=g;ctx.fillRect(canvas.width-edge,0,edge,canvas.height);g=ctx.createLinearGradient(0,0,0,edge);g.addColorStop(0,'rgba(23,28,31,.26)');g.addColorStop(1,'rgba(23,28,31,0)');ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,edge);g=ctx.createLinearGradient(0,canvas.height,0,canvas.height-edge);g.addColorStop(0,'rgba(23,28,31,.28)');g.addColorStop(1,'rgba(23,28,31,0)');ctx.fillStyle=g;ctx.fillRect(0,canvas.height-edge,canvas.width,edge);ctx.globalAlpha=.055;ctx.fillStyle='#c8c3b8';for(let i=0;i<8;i++){const side=i%2,x=side?canvas.width-edge*.5:edge*.5,y=(i*97+timestamp*.006)%(canvas.height+80)-40;ctx.beginPath();ctx.ellipse(x,y,edge*.75,16+(i%3)*5,0,0,Math.PI*2);ctx.fill();}ctx.restore();};

  /* Gunner population drops a little more across all sectors. */
  const oldGetEnemyTypeForSectorV333=getEnemyTypeForSectorV33;getEnemyTypeForSectorV33=function(sectorIndex=state.sector){const sector=SECTOR_DEFS_V33[Math.max(0,Math.min(SECTOR_DEFS_V33.length-1,(Number(sectorIndex)||1)-1))]||SECTOR_DEFS_V33[0];const weights={...sector.weights,scrap_gunner:gunnerSectorWeightsV333[sector.index-1]??sector.weights.scrap_gunner};const total=Object.values(weights).reduce((a,b)=>a+Math.max(0,Number(b)||0),0)||1;let roll=Math.random()*total;for(const [type,value] of Object.entries(weights)){roll-=Math.max(0,Number(value)||0);if(roll<=0)return type;}return oldGetEnemyTypeForSectorV333(sectorIndex);};

  function initV333(){
    document.body.dataset.uiVersion=V333;document.getElementById('settings-version-text')?.replaceChildren(document.createTextNode('MEKORA v3.3.3'));
    buildMenuV333();decorateMenuSettingsV333();ensureHangarV333();restructureSettingsV333();restructureGlobalV333();ensureDeveloperV333();decorateGameOverV333();syncDeveloperEntryV333();
    enforceLandscapeV333();window.addEventListener('resize',enforceLandscapeV333,{passive:true});window.addEventListener('orientationchange',()=>setTimeout(enforceLandscapeV333,60),{passive:true});
    document.getElementById('btn-main-settings')?.addEventListener('pointerup',ev=>{ev.preventDefault();startSettingsMenu();});
  }
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',()=>setTimeout(initV333,20),{once:true});else setTimeout(initV333,20);

  window.mekoraV333={version:V333,orientation(){return {portrait:isPortraitV333(),blocked:document.body.dataset.landscapeBlocked==='true',display:getComputedStyle(document.getElementById('orientation-warning')).display};},menu(){startMainMenu();buildMenuV333();return {phase:state.phase};},openHangar(){state.phase='menu';render();openHangarV32();return {cards:document.querySelectorAll('.hangar-row-v32').length,tabs:document.querySelectorAll('.hangar-tab-v32').length};},openSettings(){startSettingsMenu();return {phase:state.phase,developerVisible:document.getElementById('settings-dev-v333')?.classList.contains('visible')};},unlockDeveloper(){unlockDeveloperMode(true);return {mainVisible:getComputedStyle(document.getElementById('btn-main-dev')).display,settingsVisible:document.getElementById('settings-dev-v333')?.classList.contains('visible')};},openDeveloper(){openDeveloperMenu();return {cards:document.querySelectorAll('.dev-row').length,tabs:document.querySelectorAll('.dev-tab').length};},gameover(){stopRun();state.phase='gameover';render();decorateGameOverV333();return {phase:state.phase};},startOpening(){startRun(false,false);state.enemies.length=0;state.playTime=0;state.threatDirectorV33.lastSpawnAt=performance.now();state.threatDirectorV33.budget=0;return {enemies:state.enemies.length};},directorAt(ms){state.phase='playing';state.started=true;state.playTime=ms;updateThreatDirectorV33(performance.now()+ms,1);return {time:ms,enemies:state.enemies.map(e=>e.type),count:state.enemies.length};},gunnerShot(){state.phase='playing';state.started=true;state.enemyBullets.length=0;state.enemies=state.enemies.filter(e=>e.type!=='scrap_gunner');const e=safeSpawnAroundPlayerV31('scrap_gunner',250);e.pendingAttackAt=performance.now()-1;updateScrapperEnemyV31(e,performance.now(),250,0,false,1,900);return state.enemyBullets.map(b=>({speed:Math.hypot(b.vx,b.vy),damage:b.damage,radius:b.radius}));},wallCharge(elite=false){state.phase='playing';state.started=true;const e=safeSpawnAroundPlayerV31('saw_raider',250,{elite});const ws=getCurrentWorldSize();e.x=59;e.y=state.mecha.y;e.chargeAngle=Math.PI;e.chargeUntil=performance.now()+1000;updateScrapperEnemyV31(e,performance.now(),Math.abs(state.mecha.x-e.x),0,false,1,900);return {elite:!!e.isEliteV31,x:e.x,stunnedUntil:e.stunnedUntil||0,chargeUntil:e.chargeUntil||0,angle:e.chargeAngle};},nearWall(){state.phase='playing';state.started=true;state.mecha.x=100;state.mecha.y=getCurrentWorldSize()/2;return {x:state.mecha.x,y:state.mecha.y,size:getCurrentWorldSize()};},world(){return {size:getCurrentWorldSize(),mecha:{x:state.mecha.x,y:state.mecha.y}};},elite(){const e=safeSpawnAroundPlayerV31('saw_raider',220,{elite:true});return {hp:e.hp,speed:e.speed,color:e.color,glow:!!e.eliteGlowV333};}};
})();
// #endregion v333_full_landscape_ui_and_opening_balance

// #region v340_multiplatform_overhaul
(() => {
  const V340 = '3.4.1';
  const DIFFICULTIES_V340 = Object.freeze([
    {id:'incursion',name:'INCURSIÓN',desc:'Presión estándar. Director táctico equilibrado.',hp:1,damage:1,speed:1,reward:1},
    {id:'siege',name:'ASEDIO',desc:'Más escuadrones y enemigos reforzados.',hp:1.22,damage:1.16,speed:1.04,reward:1.2},
    {id:'breach',name:'RUPTURA',desc:'Ventanas de reacción más cortas y élites más duras.',hp:1.5,damage:1.36,speed:1.09,reward:1.45},
    {id:'extinction',name:'EXTINCIÓN',desc:'Máxima presión. Diseñado para construcciones completas.',hp:1.9,damage:1.62,speed:1.14,reward:1.8}
  ]);
  const MAPS_V340 = Object.freeze([
    {id:'scrap_prime',name:'DESGUACE PRIME',desc:'Ruta industrial equilibrada entre chatarra, prensas y forja.',accent:'#d39a4a',bg:'#11161a'},
    {id:'magnetic_corridor',name:'CORREDOR MAGNÉTICO',desc:'Rieles activos, líneas de tiro largas y peligros de barrido.',accent:'#6f9ca5',bg:'#10171b'},
    {id:'night_foundry',name:'FUNDICIÓN NOCTURNA',desc:'Calor, baja visibilidad y mayor densidad de controladores.',accent:'#b76445',bg:'#181210'}
  ]);
  const MECHS_V340 = Object.freeze([
    {id:'axiom',name:'AXIOM',role:'Unidad equilibrada de expedición',unlock:'starter',price:0,desc:'Chasis marfil y óxido, movilidad estable y respuesta precisa.',colors:{armor:'#d7d0c2',dark:'#29343a',accent:'#a6523f',energy:'#e0ad4e'}},
    {id:'origins',name:'ORIGINS',role:'Prototipo histórico',unlock:'mission',mission:'mission-forge-titan',price:0,desc:'El primer chasis operativo de MEKORA. Solo se recupera completando la cadena de la Forja.',colors:{armor:'#6eb5b2',dark:'#243238',accent:'#4b7f86',energy:'#dceeea'}},
    {id:'lancer',name:'LANCER',role:'Movilidad y críticos',unlock:'cores',price:900,desc:'Chasis ligero para desplazamiento rápido y precisión sostenida.',colors:{armor:'#c9c4b9',dark:'#272f39',accent:'#b95a4b',energy:'#f0b954'}},
    {id:'bastion',name:'BASTION',role:'Defensa y contraataque',unlock:'modules',parts:4,desc:'Su identidad permanece oculta hasta reunir cuatro módulos de bastión.',colors:{armor:'#a8a59c',dark:'#252b31',accent:'#8a633f',energy:'#dcb269'}},
    {id:'weaver',name:'WEAVER',role:'Drones y control',unlock:'cores',price:1250,desc:'Plataforma de comando para unidades autónomas y zonas de control.',colors:{armor:'#c8c1cf',dark:'#2d2834',accent:'#805c94',energy:'#d8b7ef'}},
    {id:'wraith',name:'WRAITH',role:'Fase y precisión',unlock:'mission',mission:'mission-events-3',desc:'Chasis experimental desbloqueado mediante operaciones difíciles.',colors:{armor:'#b6bdc2',dark:'#222a30',accent:'#516e83',energy:'#9fd7e6'}}
  ]);
  const STORE_ITEMS_V340 = Object.freeze({
    skins:[
      {id:'skin-axiom-ash',name:'AXIOM · CENIZA',price:120,desc:'Revestimiento gris grafito con marcas de desgaste.'},
      {id:'skin-origins-white',name:'ORIGINS · ARCHIVO BLANCO',price:180,desc:'Restauración ceremonial del prototipo original.'},
      {id:'skin-lancer-red',name:'LANCER · CORTE ROJO',price:220,desc:'Paneles rojos y líneas de alta velocidad.'}
    ],
    effects:[
      {id:'fx-impact-amber',name:'IMPACTO ÁMBAR',price:90,desc:'Destellos ámbar en impactos críticos.'},
      {id:'fx-trail-ghost',name:'ESTELA FANTASMA',price:140,desc:'Estela fría durante impulsos y teletransportes.'},
      {id:'fx-destruction-forge',name:'RUPTURA DE FORJA',price:200,desc:'Secuencia de destrucción con fragmentos incandescentes.'}
    ],
    boxes:[
      {id:'box-salvage',name:'CAJA DE SALVAMENTO',price:35,desc:'Cosméticos básicos y efectos poco comunes.',rates:'70% COMÚN · 25% RARO · 5% ÉPICO'},
      {id:'box-arsenal',name:'CAJA DE ARSENAL',price:85,desc:'Skins, efectos y una posibilidad baja de mecha.',rates:'45% SKIN · 40% EFECTO · 15% MECHA'}
    ]
  });
  const runConfigV340 = {difficulty:'incursion',map:'scrap_prime'};
  const inputV340 = {keys:new Set(),device:'touch',mouseAim:false,mouseAngle:0,gamepadIndex:null,lastPadButtons:[],navAt:0,lastFrame:performance.now(),frameSamples:[]};
  let garageIndexV340 = 0;
  let catalogTabV340 = 'weapons';
  let storeTabV340 = 'mechs';
  let bootStartedV340 = false;
  let ambientNodeV340 = null;

  function currentDifficultyV340(){return DIFFICULTIES_V340.find(x=>x.id===runConfigV340.difficulty)||DIFFICULTIES_V340[0];}
  function currentMapV340(){return MAPS_V340.find(x=>x.id===runConfigV340.map)||MAPS_V340[0];}
  function ensureProgressionV340(){
    progressionV3.v340 = progressionV3.v340 || {};
    progressionV3.v340.inventory = progressionV3.v340.inventory || {skins:[],effects:[],boxesOpened:0,parts:{bastion:0}};
    progressionV3.v340.unlockedMechs = Array.from(new Set(['axiom',...(progressionV3.v340.unlockedMechs||[])]));
    progressionV3.v340.activeMech = progressionV3.v340.activeMech || 'axiom';
    if(!progressionV3.v340.migrated){
      const s=progressionV3.statistics||{};
      const untouched=(s.kills||0)+(s.scrapCollected||0)+(s.eliteKills||0)+(s.minibossKills||0)+(s.bossKills||0)===0 && !(progressionV3.claimedMissions||[]).length;
      if(untouched) progressionV3.cores=0;
      progressionV3.v340.migrated=true;
    }
    const rewards=[12,16,20,28,24,42,22,30,36];
    MISSION_DEFS_V32.forEach((m,i)=>{m.rewardCores=rewards[i]||18;});
    saveProgressionV3();
  }
  function isMechUnlockedV340(mech){
    if(mech.unlock==='starter')return true;
    if((progressionV3.v340.unlockedMechs||[]).includes(mech.id))return true;
    if(mech.unlock==='mission')return (progressionV3.claimedMissions||[]).includes(mech.mission);
    if(mech.unlock==='modules')return (progressionV3.v340.inventory.parts?.bastion||0)>=mech.parts;
    return false;
  }
  function unlockMechV340(id){progressionV3.v340.unlockedMechs=Array.from(new Set([...(progressionV3.v340.unlockedMechs||[]),id]));saveProgressionV3();}
  function activeMechV340(){return MECHS_V340.find(m=>m.id===progressionV3.v340.activeMech)||MECHS_V340[0];}
  function getActiveMechPaletteV340(){return activeMechV340().colors;}
  window.getActiveMechPaletteV340=getActiveMechPaletteV340;

  function wordV340(es,en,pt){return SETTINGS_STATE.language==='en'?en:SETTINGS_STATE.language==='pt'?pt:es;}
  function toastV340(text){let t=document.getElementById('v340-toast');if(!t){t=document.createElement('div');t.id='v340-toast';t.className='v340-toast';document.body.appendChild(t);}t.textContent=text;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),1900);}
  function setDeviceV340(device){
    if(!['touch','keyboard_mouse','gamepad'].includes(device))device='touch';
    if(inputV340.device===device)return;
    inputV340.device=device;document.body.dataset.inputDevice=device;if(device==='touch'){inputV340.mouseAim=false;if(typeof state==='object')state.manualAimV340=false;}
    const label=document.getElementById('v340-input-indicator');if(label)label.textContent=device==='gamepad'?'MANDO':device==='keyboard_mouse'?'TECLADO + RATÓN':'TÁCTIL';
  }
  function createIconPlayV340(){return '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 10 54 32 18 54Z"/></svg>';}
  function coreBalanceV340(){return Math.max(0,Math.floor(Number(progressionV3.cores)||0));}
  function refreshCoreCountersV340(){
    const n=coreBalanceV340();
    document.querySelectorAll('#v340-menu-cores,[data-core-balance],#hangar-cores-v32,.v340-wallet-core-value').forEach(el=>{el.textContent=String(n);});
    return n;
  }
  function spendCoresV340(amount){
    const cost=Math.max(0,Math.floor(Number(amount)||0));
    if(coreBalanceV340()<cost)return false;
    progressionV3.cores=coreBalanceV340()-cost;
    saveProgressionV3();
    refreshCoreCountersV340();
    return true;
  }
  function replaceButtonV340(id,label,handler,extraClass=''){
    const old=document.getElementById(id);if(!old)return null;
    const b=old.cloneNode(false);b.id=id;b.type='button';b.className=extraClass||old.className;b.removeAttribute('style');b.style.pointerEvents='auto';b.setAttribute('aria-label',label);b.textContent=label;old.replaceWith(b);b.addEventListener('click',ev=>{ev.preventDefault();initAudio();playSound('equip');handler(ev);});return b;
  }
  function mechSvgV340(mech){const c=mech.colors;return `<svg class="menu-mech-v340" viewBox="0 0 520 520" aria-hidden="true"><g transform="translate(42 22)"><path fill="${c.dark}" stroke="#11181d" stroke-width="8" d="M171 52 251 22 335 56 370 139 346 238 263 278 174 240 139 141Z"/><path fill="${c.armor}" stroke="#28343a" stroke-width="7" d="M187 67 251 45 319 70 341 137 325 214 261 247 195 218 168 140Z"/><path fill="${c.accent}" stroke="#3d241f" stroke-width="6" d="M207 83 292 84 316 122 300 159 197 158 183 120Z"/><path fill="${c.dark}" d="M214 96 285 96 300 122 288 143 208 143 196 121Z"/><rect x="230" y="111" width="42" height="14" rx="6" fill="${c.energy}"/><path fill="${c.armor}" stroke="#28343a" stroke-width="7" d="M142 137 74 173 51 253 98 283 166 222Z"/><path fill="${c.dark}" stroke="#11181d" stroke-width="7" d="M79 181 35 215 18 306 72 323 116 252Z"/><path fill="${c.armor}" stroke="#28343a" stroke-width="7" d="M359 139 424 171 459 239 427 281 342 221Z"/><path fill="${c.dark}" stroke="#11181d" stroke-width="7" d="M423 181 472 213 492 304 438 324 390 249Z"/><path fill="${c.accent}" d="M31 246 78 257 62 329 9 317Z"/><path fill="${c.accent}" d="M444 247 484 230 515 312 462 331Z"/><path fill="${c.dark}" stroke="#11181d" stroke-width="7" d="M198 233 173 324 216 365 258 309 303 365 347 323 320 231Z"/><path fill="${c.armor}" stroke="#28343a" stroke-width="7" d="M177 309 116 347 101 442 153 468 218 377Z"/><path fill="${c.dark}" stroke="#11181d" stroke-width="7" d="M126 360 82 391 72 482 133 490 168 432Z"/><path fill="${c.armor}" stroke="#28343a" stroke-width="7" d="M343 311 405 349 426 443 375 470 305 376Z"/><path fill="${c.dark}" stroke="#11181d" stroke-width="7" d="M396 361 439 390 455 482 394 492 357 430Z"/><path fill="${c.accent}" d="M70 447 145 447 164 495 49 495Z"/><path fill="${c.accent}" d="M383 447 451 447 473 495 361 495Z"/><circle cx="259" cy="205" r="29" fill="${c.energy}" stroke="#46371e" stroke-width="6"/><circle cx="259" cy="205" r="12" fill="${c.dark}"/></g></svg>`;}

  function buildMenuV340(){
    ensureProgressionV340();
    const brand=document.querySelector('.menu-brand-v333');if(brand)brand.innerHTML='<span class="v340-core-glyph">◇</span><b id="v340-menu-cores">0</b><span>NÚCLEOS</span>';
    const title=document.querySelector('.menu-panel-v333 h1');if(title)title.textContent='MEKORA';
    const subtitle=document.querySelector('.menu-subtitle-v333');if(subtitle)subtitle.textContent=`EXPEDICIÓN MECÁNICA · UNIDAD ${activeMechV340().name}`;
    const stage=document.getElementById('menu-stage-v333');if(stage)stage.innerHTML=mechSvgV340(activeMechV340());
    const actions=document.querySelector('.menu-actions-v333');if(!actions)return;
    const play=replaceButtonV340('btn-main-play','JUGAR',()=>openRunSetupV340());if(play)play.innerHTML=createIconPlayV340();
    replaceButtonV340('btn-main-hangar','GARAJE',()=>openGarageV340());
    replaceButtonV340('btn-main-global','ARSENAL',()=>openCatalogV340('weapons'));
    let missions=document.getElementById('btn-main-missions');if(!missions){missions=document.createElement('button');missions.id='btn-main-missions';missions.type='button';actions.appendChild(missions);}missions.textContent='MISIONES';missions.onclick=()=>{initAudio();playSound('equip');openMissionsV340();};
    let store=document.getElementById('btn-main-store');if(!store){store=document.createElement('button');store.id='btn-main-store';store.type='button';actions.appendChild(store);}store.textContent='TIENDA';store.onclick=()=>{initAudio();playSound('equip');openStoreV340('mechs');};
    const dev=document.getElementById('btn-main-dev');if(dev){dev.style.display='none';dev.hidden=true;}
    const settings=replaceButtonV340('btn-main-settings','CONFIGURACIÓN',()=>startSettingsMenu());if(settings)settings.innerHTML='<span class="menu-settings-icon-v333">⚙</span>';
    refreshCoreCountersV340();
  }

  function ensureOverlayV340(id,title,subtitle){let root=document.getElementById(id);if(root)return root;root=document.createElement('section');root.id=id;root.className='v340-overlay hidden';root.innerHTML=`<div class="v340-shell"><button class="v340-back" type="button" aria-label="Volver">←</button><header class="v340-head"><div><h2>${title}</h2><p>${subtitle}</p></div><div class="v340-wallet"><b class="v340-wallet-core-value" data-core-balance>0</b><span>NÚCLEOS</span></div></header><main class="v340-content"></main></div>`;document.body.appendChild(root);root.querySelector('.v340-back').onclick=()=>closeOverlayV340(root);return root;}
  function closeOverlayV340(root){(root||document.querySelector('.v340-overlay:not(.hidden)'))?.classList.add('hidden');refreshCoreCountersV340();buildMenuV340();}
  function closeAllOverlaysV340(){document.querySelectorAll('.v340-overlay').forEach(x=>x.classList.add('hidden'));document.getElementById('v340-run-setup')?.classList.add('hidden');}

  function openGarageV340(){
    const root=ensureOverlayV340('v340-garage','GARAJE','SELECCIÓN Y RECUPERACIÓN DE MECHAS');root.classList.remove('hidden');
    garageIndexV340=Math.max(0,MECHS_V340.findIndex(m=>m.id===progressionV3.v340.activeMech));renderGarageV340();
  }
  function renderGarageV340(){
    const root=document.getElementById('v340-garage');if(!root)return;refreshCoreCountersV340();const mech=MECHS_V340[garageIndexV340];const unlocked=isMechUnlockedV340(mech);const unknown=mech.unlock==='modules'&&!unlocked;let status='';let action='';let disabled=false;
    if(unlocked){status=progressionV3.v340.activeMech===mech.id?'MECHA ACTIVO':'DISPONIBLE';action=progressionV3.v340.activeMech===mech.id?'ACTIVO':'SELECCIONAR';disabled=progressionV3.v340.activeMech===mech.id;}
    else if(mech.unlock==='cores'){status=`BLOQUEADO · ${mech.price} NÚCLEOS`;action='COMPRAR';}
    else if(mech.unlock==='mission'){const m=getMissionDefV32(mech.mission);const p=m?getMissionProgressV32(m):null;status=`MISIÓN DIFÍCIL · ${p?`${p.value}/${p.target}`:'0/1'}`;action='SOLO MEDIANTE MISIÓN';disabled=true;}
    else {const parts=progressionV3.v340.inventory.parts?.bastion||0;status=`MÓDULOS ENCONTRADOS · ${parts}/${mech.parts}`;action='REQUIERE MÓDULOS';disabled=true;}
    root.querySelector('.v340-content').innerHTML=`<div class="v340-garage-stage"><button class="v340-garage-arrow" id="v340-garage-prev" type="button">‹</button><div class="v340-mech-bay"><div class="v340-mech-preview ${unknown?'silhouette':''}">${mechSvgV340(mech)}${unknown?'<div class="v340-mech-question">?</div>':''}</div><div class="v340-mech-info"><span class="v340-section-label">${String(garageIndexV340+1).padStart(2,'0')} / ${String(MECHS_V340.length).padStart(2,'0')}</span><h3>${unknown?'PROYECTO DESCONOCIDO':mech.name}</h3><p>${unknown?'La silueta y sus sistemas permanecen ocultos hasta reunir los módulos requeridos.':mech.desc}</p><div class="v340-mech-status">${status}</div><button id="v340-garage-action" class="v340-primary" type="button" ${disabled?'disabled':''}>${action}</button></div></div><button class="v340-garage-arrow" id="v340-garage-next" type="button">›</button></div>`;
    root.querySelector('#v340-garage-prev').onclick=()=>{garageIndexV340=(garageIndexV340-1+MECHS_V340.length)%MECHS_V340.length;renderGarageV340();};
    root.querySelector('#v340-garage-next').onclick=()=>{garageIndexV340=(garageIndexV340+1)%MECHS_V340.length;renderGarageV340();};
    const actionBtn=root.querySelector('#v340-garage-action');if(actionBtn&&!disabled)actionBtn.onclick=()=>{
      if(unlocked){progressionV3.v340.activeMech=mech.id;saveProgressionV3();toastV340(`${mech.name} EQUIPADO`);renderGarageV340();buildMenuV340();return;}
      if(mech.unlock==='cores'){if(!spendCoresV340(mech.price)){toastV340('NÚCLEOS INSUFICIENTES');return;}unlockMechV340(mech.id);progressionV3.v340.activeMech=mech.id;saveProgressionV3();refreshCoreCountersV340();toastV340(`${mech.name} DESBLOQUEADO`);renderGarageV340();}
    };
  }

  function getCatalogItemsV340(tab){return getHangarItemsV32(tab);}
  function openCatalogV340(tab='weapons'){catalogTabV340=tab;const root=ensureOverlayV340('v340-catalog','ARSENAL','ARMAS, PODERES Y HABILIDADES');root.classList.remove('hidden');renderCatalogV340();}
  function renderCatalogV340(){
    const root=document.getElementById('v340-catalog');if(!root)return;refreshCoreCountersV340();const tabs=[['weapons','ARMAS'],['powers','PODERES'],['modules','HABILIDADES']];const items=getCatalogItemsV340(catalogTabV340);
    root.querySelector('.v340-content').innerHTML=`<nav class="v340-tabs">${tabs.map(([id,l])=>`<button class="v340-tab ${id===catalogTabV340?'active':''}" data-tab="${id}" type="button">${l}</button>`).join('')}</nav><div class="v340-scroll"><div class="v340-grid">${items.map(item=>{const st=progressionV3.blueprints[item.id]||'locked';const locked=st==='locked'||st==='hidden';const price=getBlueprintPriceV32(item);const label=st==='unlocked'?'DESBLOQUEADO':st==='discovered'?`${price} NÚCLEOS`:'MISIÓN / DESCUBRIMIENTO';return `<article class="v340-card ${locked?'locked':''}"><h3>${locked?'PROYECTO DESCONOCIDO':item.title}</h3><p>${locked?'Continúa jugando para descubrir este sistema.':item.desc}</p><div class="v340-meta"><span>${label}</span><button data-buy="${item.id}" type="button" ${st!=='discovered'?'disabled':''}>${st==='discovered'?'COMPRAR':'INSPECCIONAR'}</button></div></article>`;}).join('')}</div></div>`;
    root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{catalogTabV340=b.dataset.tab;renderCatalogV340();});root.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>{const item=UPGRADE_BY_ID.get(b.dataset.buy);if(!item)return;const price=getBlueprintPriceV32(item);if(!spendCoresV340(price)){toastV340('NÚCLEOS INSUFICIENTES');return;}progressionV3.blueprints[item.id]='unlocked';progressionV3.discoveredContent=Array.from(new Set([...(progressionV3.discoveredContent||[]),item.id]));saveProgressionV3();refreshCoreCountersV340();toastV340(`${item.title} DESBLOQUEADO`);renderCatalogV340();});installScrollableV340(root);
  }

  function openMissionsV340(){const root=ensureOverlayV340('v340-missions','MISIONES','DESAFÍOS OPCIONALES Y OPERACIONES DIFÍCILES');root.classList.remove('hidden');renderMissionsV340();}
  function renderMissionsV340(){const root=document.getElementById('v340-missions');if(!root)return;refreshCoreCountersV340();root.querySelector('.v340-content').innerHTML=`<div class="v340-scroll"><div class="v340-grid">${MISSION_DEFS_V32.map(m=>{const p=getMissionProgressV32(m);return `<article class="v340-card ${p.complete?'selected':''}"><h3>${m.title}</h3><p>${m.short}</p><div class="v340-meta"><span>${p.value}/${p.target} · +${m.rewardCores} NÚCLEOS</span><button data-mission="${m.id}" type="button" ${p.claimed?'disabled':''}>${p.claimed?'COMPLETADA':p.complete?'RECLAMAR':(progressionV3.pinnedMissions||[]).includes(m.id)?'QUITAR':'FIJAR'}</button></div></article>`;}).join('')}</div></div>`;root.querySelectorAll('[data-mission]').forEach(b=>b.onclick=()=>{const m=getMissionDefV32(b.dataset.mission);const p=getMissionProgressV32(m);if(p.complete&&!p.claimed){claimMissionV32(m.id);if(m.id==='mission-forge-titan')unlockMechV340('origins');if(m.id==='mission-events-3')unlockMechV340('wraith');toastV340(`+${m.rewardCores} NÚCLEOS`);}else togglePinnedMissionV32(m.id);renderMissionsV340();});installScrollableV340(root);}

  function openStoreV340(tab='mechs'){storeTabV340=tab;const root=ensureOverlayV340('v340-store','TIENDA','MECHAS, SKINS, EFECTOS Y CAJAS');root.classList.remove('hidden');renderStoreV340();}
  function storeItemsV340(){if(storeTabV340==='mechs')return MECHS_V340.filter(m=>m.unlock==='cores');return STORE_ITEMS_V340[storeTabV340]||[];}
  function renderStoreV340(){const root=document.getElementById('v340-store');if(!root)return;refreshCoreCountersV340();const tabs=[['mechs','MECHAS'],['skins','SKINS'],['effects','EFECTOS'],['boxes','CAJAS']];const items=storeItemsV340();root.querySelector('.v340-content').innerHTML=`<nav class="v340-tabs">${tabs.map(([id,l])=>`<button class="v340-tab ${id===storeTabV340?'active':''}" data-store-tab="${id}" type="button">${l}</button>`).join('')}</nav><div class="v340-scroll"><div class="v340-grid">${items.map(item=>{const owned=storeTabV340==='mechs'?isMechUnlockedV340(item):(progressionV3.v340.inventory[storeTabV340]||[]).includes(item.id);return `<article class="v340-card ${owned?'selected':''}"><h3>${item.name}</h3><p>${item.desc}</p>${item.rates?`<span class="v340-rate">ⓘ ${item.rates}</span>`:''}<div class="v340-meta"><span>${item.price} NÚCLEOS</span><button data-store-buy="${item.id}" type="button" ${owned?'disabled':''}>${owned?'OBTENIDO':storeTabV340==='boxes'?'ABRIR':'COMPRAR'}</button></div></article>`;}).join('')}</div></div>`;root.querySelectorAll('[data-store-tab]').forEach(b=>b.onclick=()=>{storeTabV340=b.dataset.storeTab;renderStoreV340();});root.querySelectorAll('[data-store-buy]').forEach(b=>b.onclick=()=>buyStoreItemV340(b.dataset.storeBuy));installScrollableV340(root);}
  function buyStoreItemV340(id){const all=[...MECHS_V340,...STORE_ITEMS_V340.skins,...STORE_ITEMS_V340.effects,...STORE_ITEMS_V340.boxes];const item=all.find(x=>x.id===id);if(!item)return;if(!spendCoresV340(item.price)){toastV340('NÚCLEOS INSUFICIENTES');return;}if(id.startsWith('box-'))openBoxV340(item);else if(MECHS_V340.some(m=>m.id===id))unlockMechV340(id);else{const bucket=id.startsWith('skin-')?'skins':'effects';progressionV3.v340.inventory[bucket]=Array.from(new Set([...(progressionV3.v340.inventory[bucket]||[]),id]));}saveProgressionV3();refreshCoreCountersV340();toastV340(id.startsWith('box-')?'CAJA ABIERTA':`${item.name} OBTENIDO`);renderStoreV340();}
  function openBoxV340(box){progressionV3.v340.inventory.boxesOpened=(progressionV3.v340.inventory.boxesOpened||0)+1;const roll=Math.random();let reward;if(box.id==='box-arsenal'&&roll<.15){const pool=MECHS_V340.filter(m=>m.unlock==='cores'&&!isMechUnlockedV340(m));reward=pool[Math.floor(Math.random()*pool.length)];if(reward)unlockMechV340(reward.id);}if(!reward){const bucket=(box.id==='box-arsenal'&&roll<.55)?'effects':'skins';const pool=STORE_ITEMS_V340[bucket].filter(x=>!(progressionV3.v340.inventory[bucket]||[]).includes(x.id));reward=pool[Math.floor(Math.random()*pool.length)]||STORE_ITEMS_V340[bucket][Math.floor(Math.random()*STORE_ITEMS_V340[bucket].length)];progressionV3.v340.inventory[bucket]=Array.from(new Set([...(progressionV3.v340.inventory[bucket]||[]),reward.id]));}saveProgressionV3();toastV340(`RECOMPENSA: ${reward?.name||'50 NÚCLEOS'}`);}

  function ensureRunSetupV340(){let root=document.getElementById('v340-run-setup');if(root)return root;root=document.createElement('section');root.id='v340-run-setup';root.className='hidden';root.innerHTML='<div class="v340-setup-card"><div class="v340-setup-top"><h2>CONFIGURAR EXPEDICIÓN</h2><button class="v340-setup-close" type="button">×</button></div><div class="v340-section-label">DIFICULTAD</div><div id="v340-difficulty-grid" class="v340-choice-grid"></div><div class="v340-section-label">MAPA</div><div id="v340-map-grid" class="v340-choice-grid"></div><button id="v340-launch" class="v340-launch" type="button">INICIAR RUN</button></div>';document.body.appendChild(root);root.querySelector('.v340-setup-close').onclick=()=>root.classList.add('hidden');root.querySelector('#v340-launch').onclick=()=>beginRunLoadingV340();return root;}
  function openRunSetupV340(){const root=ensureRunSetupV340();root.classList.remove('hidden');renderRunSetupV340();}
  function renderRunSetupV340(){const root=ensureRunSetupV340();root.querySelector('#v340-difficulty-grid').innerHTML=DIFFICULTIES_V340.map(d=>`<button type="button" class="v340-choice ${d.id===runConfigV340.difficulty?'active':''}" data-difficulty="${d.id}"><b>${d.name}</b><span>${d.desc}</span></button>`).join('');root.querySelector('#v340-map-grid').innerHTML=MAPS_V340.map(m=>`<button type="button" class="v340-choice ${m.id===runConfigV340.map?'active':''}" data-map="${m.id}"><b>${m.name}</b><span>${m.desc}</span></button>`).join('');root.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>{runConfigV340.difficulty=b.dataset.difficulty;renderRunSetupV340();});root.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{runConfigV340.map=b.dataset.map;renderRunSetupV340();});}
  function ensureRunLoadingV340(){let root=document.getElementById('v340-run-loading');if(root)return root;root=document.createElement('section');root.id='v340-run-loading';root.className='hidden';root.innerHTML='<div class="v340-run-name">MEKORA</div><div class="v340-spinner"></div><div class="v340-run-tip"><b>CONSEJO TÁCTICO</b><span id="v340-run-tip-text"></span></div>';document.body.appendChild(root);return root;}
  function beginRunLoadingV340(){const setup=document.getElementById('v340-run-setup');setup?.classList.add('hidden');const loading=ensureRunLoadingV340();const tips=['Las armas comunes siguen siendo viables si mejoras su cadencia, recarga y sinergias.','Los Núcleos son escasos. Prioriza desafíos opcionales y evita abandonar expediciones demasiado pronto.','Un mini jefe entrega Núcleos únicamente al completar cada tercer derribo acumulado.','En PC, usa WASD para moverte, ratón para apuntar y clic izquierdo para disparar.'];loading.querySelector('#v340-run-tip-text').textContent=tips[Math.floor(Math.random()*tips.length)];loading.classList.remove('hidden');setTimeout(()=>{state.runLaunchAuthorizedV340=true;startRun(false,false);loading.classList.add('hidden');},950);}

  function installScrollableV340(scope=document){
    scope.querySelectorAll?.('.v340-scroll,.hangar-list-v32,.dev-list,.settings-layout-v333>.hud-border').forEach(el=>{if(el.dataset.scrollV340)return;el.dataset.scrollV340='true';el.addEventListener('touchmove',ev=>ev.stopPropagation(),{capture:true,passive:true});el.addEventListener('wheel',ev=>ev.stopPropagation(),{capture:true,passive:true});});
  }
  function fixSettingsV340(){
    ['slider-bgm','slider-sfx'].forEach(id=>{const s=document.getElementById(id);if(!s)return;s.style.pointerEvents='auto';s.style.touchAction='pan-x';const update=()=>{const value=Math.max(0,Math.min(100,Number(s.value)||0));if(id==='slider-bgm'){SETTINGS_STATE.bgmVolume=value/100;document.getElementById('val-bgm-text').textContent=`${value}%`;}else{SETTINGS_STATE.sfxVolume=value/100;document.getElementById('val-sfx-text').textContent=`${value}%`;}saveRuntimeSettings();};s.addEventListener('input',update);s.addEventListener('change',update);s.addEventListener('pointerdown',ev=>ev.stopPropagation(),true);s.addEventListener('touchmove',ev=>ev.stopPropagation(),{capture:true,passive:true});});
    document.querySelectorAll('.lang-btn').forEach(btn=>{btn.style.pointerEvents='auto';btn.onclick=ev=>{ev.preventDefault();ev.stopPropagation();applyLanguage(btn.dataset.lang,true);state.langSelectionIndex=Math.max(0,['es','en','pt'].indexOf(btn.dataset.lang));document.querySelectorAll('.lang-btn').forEach(x=>x.classList.remove('settings-focus','settings-edit-focus'));document.querySelectorAll('.lang-btn').forEach(x=>x.classList.toggle('language-active',x.dataset.lang===SETTINGS_STATE.language));};});
    const devEntry=document.getElementById('settings-dev-v333');if(devEntry)devEntry.onclick=ev=>{ev.preventDefault();openDeveloperMenu();};
    const sub=document.getElementById('hangar-subtitle-v32');if(sub)sub.textContent='';installScrollableV340(document);
  }

  const oldStartRunV340=startRun;
  startRun=function(isDev=false,isTest=false){
    if(!isDev&&!isTest&&!state.runLaunchAuthorizedV340){openRunSetupV340();return false;}
    state.runLaunchAuthorizedV340=false;const result=oldStartRunV340(isDev,isTest);state.runDifficultyV340=currentDifficultyV340().id;state.runMapV340=currentMapV340().id;state.manualAimV340=false;state.manualAimAngleV340=0;state.inputDeviceV340=inputV340.device;state.mapThemeV340=currentMapV340();state.stats.rewardMultV340=currentDifficultyV340().reward;return result;
  };
  const oldEndRunV340=endRun;
  endRun=function(){const result=oldEndRunV340();refreshCoreCountersV340();return result;};
  const oldAwardRunCoresV340=awardRunCoresV32;
  awardRunCoresV32=function(){if(state.runCoresAwardedV32||state.testMode)return 0;state.runCoresAwardedV32=true;const award=(state.playTime||0)>=60000?5:0;progressionV3.cores=(progressionV3.cores||0)+award;progressionV3.statistics.bestSurvivalMs=Math.max(progressionV3.statistics.bestSurvivalMs||0,state.playTime||0);saveProgressionV3();return award;};
  const oldSafeSpawnV340=safeSpawnAroundPlayerV31;
  safeSpawnAroundPlayerV31=function(...args){const e=oldSafeSpawnV340(...args);if(e&&!e.difficultyScaledV340&&!state.testMode){const d=currentDifficultyV340();e.maxHp=Math.round((e.maxHp||e.hp||1)*d.hp);e.hp=e.maxHp;e.contactDamage=Math.round((e.contactDamage||1)*d.damage);e.speed=(e.speed||1)*d.speed;e.difficultyScaledV340=true;}return e;};
  const oldGetSectorDefV340=getSectorDefV33;
  getSectorDefV33=function(index=state.sector){const d=oldGetSectorDefV340(index);const map=state.mapThemeV340||currentMapV340();if(!map||map.id==='scrap_prime')return d;return {...d,bg:map.bg,accent:map.accent,name:index===1?map.name:d.name,modifier:index===1?map.desc:d.modifier};};
  const oldGetWeaponStatsV340=getWeaponStats;
  getWeaponStats=function(id,lvl){const s=oldGetWeaponStatsV340(id,lvl);const mult={'w-machinegun':.92,'w-plasma':.9,'w-missile':.88,'w-orbital':.78,'w-highbeam':.76,'w-gravityfield':.84,'syn-celestial':.72,'syn-berserker':.78,'syn-apocalipsis':.8}[id]||1;return {damage:Math.max(1,Math.round(s.damage*mult)),cooldown:Math.max(90,s.cooldown)};};
  const oldTriggerLevelV340=triggerLevelUp;
  triggerLevelUp=function(){if((state.testMode||state.isDevPlay)&&state.phase==='playing'&&state.xp>=state.xpNeeded){state.level++;state.xp=Math.max(0,state.xp-state.xpNeeded);state.xpNeeded=Math.round(state.xpNeeded*1.5);updateXpUI();return true;}return oldTriggerLevelV340();};
  const oldQueueRewardV340=queueRewardDraftV31;
  queueRewardDraftV31=function(tier='elite'){if(state.testMode||state.isDevPlay)return;return oldQueueRewardV340(tier);};
  const oldSpawnOrbsV340=spawnEnergyOrbsV331;
  spawnEnergyOrbsV331=function(e){if(state.testMode||state.isDevPlay)return;return oldSpawnOrbsV340(e);};
  const oldSectorProgressV340=updateSectorProgressionV33;
  updateSectorProgressionV33=function(timestamp=performance.now(),force=false){const changed=oldSectorProgressV340(timestamp,force);if(changed){const root=document.getElementById('sector-transition-v331');clearTimeout(root?._safetyV340);if(root)root._safetyV340=setTimeout(()=>{root.classList.add('hidden');if(state.sectorTransitionV331){state.sectorTransitionV331.active=false;state.devPauseEnemies=false;}},2600);}return changed;};
  const oldStartMainV340=startMainMenu;
  startMainMenu=function(){const r=oldStartMainV340();setTimeout(buildMenuV340,0);return r;};
  const oldSettingsV340=startSettingsMenu;
  startSettingsMenu=function(){const r=oldSettingsV340();setTimeout(()=>{fixSettingsV340();},0);return r;};
  const oldDeveloperV340=openDeveloperMenu;
  openDeveloperMenu=function(){const r=oldDeveloperV340();setTimeout(()=>{updateDevMenuUI();installScrollableV340(document);},0);return r;};
  const oldApplyLanguageV340=applyLanguage;
  applyLanguage=function(lang,persist=true){const r=oldApplyLanguageV340(lang,persist);document.querySelectorAll('.lang-btn').forEach(x=>{x.classList.remove('settings-focus','settings-edit-focus');x.classList.toggle('language-active',x.dataset.lang===SETTINGS_STATE.language);});buildMenuV340();return r;};
  updateMainMenuUI=function(){refreshCoreCountersV340();};
  getMainMenuButtonsV32=function(){return ['btn-main-play','btn-main-hangar','btn-main-global','btn-main-missions','btn-main-store','btn-main-settings'].map(id=>document.getElementById(id)).filter(Boolean);};
  confirmMenuAction=function(){const buttons=getMainMenuButtonsV32();const b=buttons[Math.max(0,Math.min(buttons.length-1,state.menuSelectionIndex||0))];b?.click();};

  function installInputV340(){
    if(document.getElementById('v340-input-indicator'))return;const indicator=document.createElement('div');indicator.id='v340-input-indicator';indicator.textContent='TÁCTIL';document.body.appendChild(indicator);document.body.dataset.inputDevice='touch';
    const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
    window.addEventListener('keydown',ev=>{if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;setDeviceV340('keyboard_mouse');inputV340.keys.add(ev.code);if(movementKeys.has(ev.code)||['Space','Enter','Escape'].includes(ev.code))ev.preventDefault();if(ev.code==='Space'&&state.phase==='playing')state.isFiring=true;if(ev.code==='Escape'){const overlay=document.querySelector('.v340-overlay:not(.hidden)');if(overlay)closeOverlayV340(overlay);else if(!document.getElementById('v340-run-setup')?.classList.contains('hidden'))document.getElementById('v340-run-setup').classList.add('hidden');else if(state.phase==='playing'&&!state.paused)document.getElementById('btn-control-pause')?.click();else if(state.paused){state.paused=false;document.getElementById('pause-modal')?.classList.add('hidden');}else startMainMenu();}if(ev.code==='Enter'&&state.phase!=='playing'){const active=document.activeElement;if(active&&active.matches('button'))active.click();else focusFirstInteractiveV340();}});
    window.addEventListener('keyup',ev=>{inputV340.keys.delete(ev.code);if(ev.code==='Space')state.isFiring=false;});
    document.addEventListener('pointerdown',ev=>{if(ev.pointerType==='touch'){setDeviceV340('touch');return;}if(ev.pointerType==='mouse')setDeviceV340('keyboard_mouse');},{capture:true,passive:true});
    const canvasEl=document.getElementById('game-canvas');if(canvasEl){canvasEl.addEventListener('pointermove',ev=>{if(ev.pointerType!=='mouse')return;setDeviceV340('keyboard_mouse');const r=canvasEl.getBoundingClientRect();inputV340.mouseAngle=Math.atan2(ev.clientY-(r.top+r.height/2),ev.clientX-(r.left+r.width/2));inputV340.mouseAim=true;state.manualAimV340=true;state.manualAimAngleV340=inputV340.mouseAngle;state.mecha.angle=inputV340.mouseAngle;});canvasEl.addEventListener('pointerdown',ev=>{if(ev.pointerType==='mouse'&&ev.button===0){state.manualAimV340=true;state.isFiring=true;}});}
    window.addEventListener('pointerup',ev=>{if(ev.pointerType==='mouse'&&ev.button===0)state.isFiring=false;});
    window.addEventListener('gamepadconnected',ev=>{inputV340.gamepadIndex=ev.gamepad.index;setDeviceV340('gamepad');toastV340(`MANDO CONECTADO: ${ev.gamepad.id.split('(')[0].trim()}`);});window.addEventListener('gamepaddisconnected',()=>{inputV340.gamepadIndex=null;setDeviceV340(matchMedia('(pointer:coarse)').matches?'touch':'keyboard_mouse');});
    requestAnimationFrame(inputLoopV340);
  }
  function focusFirstInteractiveV340(){const scope=document.querySelector('.v340-overlay:not(.hidden),#v340-run-setup:not(.hidden)')||document;const first=scope.querySelector('button:not(:disabled)');first?.focus();}
  function navigateFocusV340(dir){const scope=document.querySelector('.v340-overlay:not(.hidden),#v340-run-setup:not(.hidden)')||document;const items=[...scope.querySelectorAll('button:not(:disabled)')].filter(x=>x.offsetParent!==null);if(!items.length)return;let i=items.indexOf(document.activeElement);i=(i+dir+items.length)%items.length;items[i].focus();}
  function pollGamepadV340(now){const pads=navigator.getGamepads?.()||[];const pad=inputV340.gamepadIndex!=null?pads[inputV340.gamepadIndex]:[...pads].find(Boolean);if(!pad)return false;setDeviceV340('gamepad');const ax=pad.axes[0]||0,ay=pad.axes[1]||0,rx=pad.axes[2]||0,ry=pad.axes[3]||0;const dead=.18;if(state.phase==='playing'&&!state.paused){if(Math.hypot(ax,ay)>dead){state.moveJoystick.active=true;state.moveJoystick.x=ax;state.moveJoystick.y=ay;}else if(inputV340.device==='gamepad'){state.moveJoystick.active=false;state.moveJoystick.x=0;state.moveJoystick.y=0;}if(Math.hypot(rx,ry)>.3){state.manualAimV340=true;state.manualAimAngleV340=Math.atan2(ry,rx);state.mecha.angle=state.manualAimAngleV340;}state.isFiring=!!pad.buttons[0]?.pressed;}const pressed=pad.buttons.map(b=>b.pressed);if(pressed[9]&&!inputV340.lastPadButtons[9])document.getElementById('btn-control-pause')?.click();if(state.phase!=='playing'||state.paused||document.querySelector('.v340-overlay:not(.hidden),#v340-run-setup:not(.hidden)')){if(now>inputV340.navAt){if(pressed[12]||ay<-.65){navigateFocusV340(-1);inputV340.navAt=now+220;}else if(pressed[13]||ay>.65){navigateFocusV340(1);inputV340.navAt=now+220;}else if(pressed[0]&&!inputV340.lastPadButtons[0]){(document.activeElement?.matches('button')?document.activeElement:null)?.click();}}}inputV340.lastPadButtons=pressed;return true;}
  function inputLoopV340(now){
    const padActive=pollGamepadV340(now);if(state.phase==='playing'&&!state.paused&&!padActive&&inputV340.device==='keyboard_mouse'){
      let x=(inputV340.keys.has('KeyD')||inputV340.keys.has('ArrowRight')?1:0)-(inputV340.keys.has('KeyA')||inputV340.keys.has('ArrowLeft')?1:0);let y=(inputV340.keys.has('KeyS')||inputV340.keys.has('ArrowDown')?1:0)-(inputV340.keys.has('KeyW')||inputV340.keys.has('ArrowUp')?1:0);const len=Math.hypot(x,y);if(len){state.moveJoystick.active=true;state.moveJoystick.x=x/len;state.moveJoystick.y=y/len;if(!state.manualAimV340)state.mecha.angle=Math.atan2(y,x);}else{state.moveJoystick.active=false;state.moveJoystick.x=0;state.moveJoystick.y=0;}
    }
    if(state.testMode||state.isDevPlay){state.sectorDropsV33=[];state.orbs=[];document.getElementById('roguelike-draft-modal')?.classList.add('hidden');if(state.phase==='draft'){state.phase='playing';render();}}
    const dt=now-inputV340.lastFrame;inputV340.lastFrame=now;inputV340.frameSamples.push(dt);if(inputV340.frameSamples.length>90)inputV340.frameSamples.shift();if(inputV340.frameSamples.length===90){const avg=inputV340.frameSamples.reduce((a,b)=>a+b,0)/90;document.body.dataset.quality=avg>23?'low':'high';const particleCap=avg>23?520:1000;if(state.particles?.length>particleCap)state.particles.splice(0,state.particles.length-particleCap);if(state.damageNumbers?.length>180)state.damageNumbers.splice(0,state.damageNumbers.length-180);}
    requestAnimationFrame(inputLoopV340);
  }

  function startAmbientV340(){if(!audioCtx||ambientNodeV340||state.muted||SETTINGS_STATE.bgmVolume<=0)return;try{const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();osc.type='sawtooth';osc.frequency.value=46;filter.type='lowpass';filter.frequency.value=170;gain.gain.value=.018*SETTINGS_STATE.bgmVolume;osc.connect(filter);filter.connect(gain);gain.connect(audioCtx.destination);osc.start();ambientNodeV340={osc,gain};}catch(e){}}
  const oldInitAudioV340=initAudio;initAudio=function(){const ok=oldInitAudioV340();if(ok)startAmbientV340();return ok;};

  function bootV340(){
    const root=document.getElementById('v340-boot');if(!root||bootStartedV340)return;const status=document.getElementById('v340-boot-status'),bar=document.getElementById('v340-boot-progress');
    const attempt=()=>{const landscape=window.innerWidth>=window.innerHeight;if(!landscape){root.dataset.waiting='true';status.textContent=wordV340('GIRA EL DISPOSITIVO EN HORIZONTAL PARA INICIAR','ROTATE TO LANDSCAPE TO START','GIRE PARA HORIZONTAL PARA INICIAR');if(bar)bar.style.width='0%';return;}if(bootStartedV340)return;bootStartedV340=true;root.dataset.waiting='false';let p=0;const timer=setInterval(()=>{p=Math.min(100,p+8+Math.random()*10);bar.style.width=`${p}%`;status.textContent=p<35?'PREPARANDO SISTEMAS':p<70?'CARGANDO ARSENAL Y EFECTOS':'OPTIMIZANDO CAMPO DE COMBATE';if(p>=100){clearInterval(timer);setTimeout(()=>{root.classList.add('hidden');document.getElementById('orientation-warning').style.display='none';},160);}},70);};attempt();window.addEventListener('resize',attempt,{passive:true});window.addEventListener('orientationchange',()=>setTimeout(attempt,80),{passive:true});
  }

  function initV340(){
    ensureProgressionV340();document.title='MEKORA v3.4.1';document.getElementById('settings-version-text')?.replaceChildren(document.createTextNode('MEKORA v3.4.1'));buildMenuV340();fixSettingsV340();installInputV340();installScrollableV340(document);bootV340();refreshCoreCountersV340();
    const title=document.getElementById('hangar-subtitle-v32');if(title)title.textContent='';
    document.querySelectorAll('[data-i18n],.hangar-copy-v32 span').forEach(el=>{if(/progresi[oó]n permanente|permanent progression|progress[aã]o permanente/i.test(el.textContent||''))el.textContent='';});
  }
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',()=>setTimeout(initV340,120),{once:true});else setTimeout(initV340,120);

  window.mekoraV340={version:V340,unlockDeveloper(){unlockDeveloperMode(true);syncDeveloperButtonVisibility();const b=document.getElementById('settings-dev-v333');b?.classList.add('visible');if(b)b.onclick=()=>openDeveloperMenu();return {visible:!!b?.classList.contains('visible')};},input(){return {device:inputV340.device,manualAim:!!state.manualAimV340};},economy(){return {cores:progressionV3.cores,runAward:5,minibossEvery:3,bossReward:40};},runConfig(){return {...runConfigV340};},openGarage(){openGarageV340();return {active:progressionV3.v340.activeMech,index:garageIndexV340};},openArsenal(tab='weapons'){openCatalogV340(tab);return {tab:catalogTabV340};},openMissions(){openMissionsV340();return {count:MISSION_DEFS_V32.length};},openStore(tab='mechs'){openStoreV340(tab);return {tab:storeTabV340};},setDifficulty(id){if(DIFFICULTIES_V340.some(x=>x.id===id))runConfigV340.difficulty=id;return currentDifficultyV340();},setMap(id){if(MAPS_V340.some(x=>x.id===id))runConfigV340.map=id;return currentMapV340();}};
  window.__mekoraV340Internal = {
    ensureProgressionV340,
    refreshCoreCountersV340,
    toastV340,
    MECHS_V340,
    STORE_ITEMS_V340,
    getProgression: () => progressionV3,
    getCores: () => Math.max(0, Math.floor(Number(progressionV3.cores) || 0)),
    setCores: (value) => {
      progressionV3.cores = Math.max(0, Math.floor(Number(value) || 0));
      saveProgressionV3();
      refreshCoreCountersV340();
      return progressionV3.cores;
    },
    addCores: (amount) => {
      progressionV3.cores = Math.max(0, Math.floor(Number(progressionV3.cores) || 0) + Math.floor(Number(amount) || 0));
      saveProgressionV3();
      refreshCoreCountersV340();
      return progressionV3.cores;
    },
    spendCores: (amount) => {
      const cost = Math.max(0, Math.floor(Number(amount) || 0));
      if ((progressionV3.cores || 0) < cost) return false;
      progressionV3.cores -= cost;
      saveProgressionV3();
      refreshCoreCountersV340();
      return true;
    }
  };

})();
// #endregion v340_multiplatform_overhaul


//#endregion debug_api
    

// ===== legacy runtime segment 2 =====

(() => {
  'use strict';
  const V342 = '3.4.2';
  const { ensureProgressionV340, refreshCoreCountersV340, toastV340, MECHS_V340, STORE_ITEMS_V340 } = window.__mekoraV340Internal || {};

  function isPcV342() {
    return window.innerWidth >= 900 && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  }
  function syncPlatformV342() {
    document.body.dataset.platformV342 = isPcV342() ? 'pc' : 'mobile';
  }

  const originalCameraZoomV342 = getActiveCameraZoom;
  getActiveCameraZoom = function() {
    const base = originalCameraZoomV342();
    if (!isPcV342()) return base;
    const aspect = Math.max(1, window.innerWidth / Math.max(1, window.innerHeight));
    const pcZoom = aspect >= 2.2 ? 1.52 : aspect >= 1.75 ? 1.42 : 1.34;
    return Math.max(base, pcZoom);
  };

  const fogV342 = {
    texture: document.createElement('canvas'),
    layer: document.createElement('canvas'),
    tctx: null,
    lctx: null,
    image: null,
    lastUpdate: -1,
    frame: 0
  };
  fogV342.texture.width = 180;
  fogV342.texture.height = 104;
  fogV342.tctx = fogV342.texture.getContext('2d', { alpha: true });
  fogV342.image = fogV342.tctx.createImageData(fogV342.texture.width, fogV342.texture.height);
  fogV342.lctx = fogV342.layer.getContext('2d', { alpha: true });

  function fractV342(n) { return n - Math.floor(n); }
  function hashV342(x, y) {
    return fractV342(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
  }
  function smoothV342(t) { return t * t * (3 - 2 * t); }
  function valueNoiseV342(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = smoothV342(x - ix), fy = smoothV342(y - iy);
    const a = hashV342(ix, iy), b = hashV342(ix + 1, iy);
    const c = hashV342(ix, iy + 1), d = hashV342(ix + 1, iy + 1);
    const ab = a + (b - a) * fx;
    const cd = c + (d - c) * fx;
    return ab + (cd - ab) * fy;
  }
  function fbmV342(x, y) {
    let value = 0, amplitude = .54, frequency = 1;
    for (let i = 0; i < 4; i++) {
      value += valueNoiseV342(x * frequency, y * frequency) * amplitude;
      frequency *= 2.03;
      amplitude *= .48;
    }
    return value;
  }
  function smoothstepV342(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / Math.max(.0001, b - a)));
    return t * t * (3 - 2 * t);
  }
  function updateFogTextureV342(timestamp) {
    const lowQuality = document.body.dataset.quality === 'low';
    const interval = lowQuality ? 120 : 62;
    if (timestamp - fogV342.lastUpdate < interval) return;
    fogV342.lastUpdate = timestamp;
    const w = fogV342.texture.width, h = fogV342.texture.height;
    const data = fogV342.image.data;
    const driftX = timestamp * .000055;
    const driftY = timestamp * .000031;
    let p = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = x / w * 4.9 + driftX;
        const ny = y / h * 3.1 - driftY;
        const broad = fbmV342(nx, ny);
        const detail = fbmV342(nx * 1.72 + 9.3, ny * 1.72 - 6.7);
        const ridge = 1 - Math.abs(detail * 2 - 1);
        const density = smoothstepV342(.31, .88, broad * .74 + ridge * .26);
        const alpha = Math.round(35 + density * 125);
        data[p++] = 113 + Math.round(density * 15);
        data[p++] = 121 + Math.round(density * 13);
        data[p++] = 120 + Math.round(density * 10);
        data[p++] = alpha;
      }
    }
    fogV342.tctx.putImageData(fogV342.image, 0, 0);
  }
  function ensureFogLayerV342() {
    if (!canvas || !ctx) return false;
    if (fogV342.layer.width !== canvas.width || fogV342.layer.height !== canvas.height) {
      fogV342.layer.width = canvas.width;
      fogV342.layer.height = canvas.height;
      fogV342.lctx = fogV342.layer.getContext('2d', { alpha: true });
    }
    return true;
  }
  drawFogV331 = function(timestamp) {
    if (!ensureFogLayerV342()) return;
    updateFogTextureV342(timestamp);
    const w = canvas.width, h = canvas.height;
    const fctx = fogV342.lctx;
    const pc = isPcV342();
    const minSide = Math.min(w, h);
    const maxSide = Math.max(w, h);
    fctx.clearRect(0, 0, w, h);

    fctx.fillStyle = pc ? 'rgba(20,25,27,.24)' : 'rgba(20,25,27,.20)';
    fctx.fillRect(0, 0, w, h);

    fctx.save();
    fctx.imageSmoothingEnabled = true;
    fctx.globalAlpha = pc ? .90 : .82;
    fctx.filter = document.body.dataset.quality === 'low' ? 'blur(5px)' : 'blur(11px)';
    const swayX = Math.sin(timestamp * .00009) * 54;
    const swayY = Math.cos(timestamp * .000073) * 30;
    fctx.drawImage(fogV342.texture, -90 + swayX, -58 + swayY, w + 180, h + 116);
    fctx.globalAlpha = .28;
    fctx.drawImage(fogV342.texture, -45 - swayX * .55, -32 - swayY * .4, w + 90, h + 64);
    fctx.restore();

    fctx.save();
    fctx.globalCompositeOperation = 'destination-out';
    const clearInner = minSide * (pc ? .17 : .18);
    const clearOuter = Math.min(maxSide * .54, minSide * (pc ? .70 : .76));
    const visibility = fctx.createRadialGradient(w * .5, h * .5, clearInner, w * .5, h * .5, clearOuter);
    visibility.addColorStop(0, 'rgba(0,0,0,.96)');
    visibility.addColorStop(.36, 'rgba(0,0,0,.91)');
    visibility.addColorStop(.67, 'rgba(0,0,0,.52)');
    visibility.addColorStop(1, 'rgba(0,0,0,0)');
    fctx.fillStyle = visibility;
    fctx.fillRect(0, 0, w, h);
    fctx.restore();

    fctx.save();
    const edge = Math.max(110, minSide * (pc ? .23 : .19));
    const edgeAlpha = pc ? .62 : .48;
    let g = fctx.createLinearGradient(0, 0, edge, 0);
    g.addColorStop(0, `rgba(12,16,18,${edgeAlpha})`); g.addColorStop(1, 'rgba(12,16,18,0)');
    fctx.fillStyle = g; fctx.fillRect(0, 0, edge, h);
    g = fctx.createLinearGradient(w, 0, w - edge, 0);
    g.addColorStop(0, `rgba(12,16,18,${edgeAlpha})`); g.addColorStop(1, 'rgba(12,16,18,0)');
    fctx.fillStyle = g; fctx.fillRect(w - edge, 0, edge, h);
    g = fctx.createLinearGradient(0, 0, 0, edge * .8);
    g.addColorStop(0, `rgba(12,16,18,${edgeAlpha * .75})`); g.addColorStop(1, 'rgba(12,16,18,0)');
    fctx.fillStyle = g; fctx.fillRect(0, 0, w, edge * .8);
    g = fctx.createLinearGradient(0, h, 0, h - edge * .8);
    g.addColorStop(0, `rgba(12,16,18,${edgeAlpha * .82})`); g.addColorStop(1, 'rgba(12,16,18,0)');
    fctx.fillStyle = g; fctx.fillRect(0, h - edge * .8, w, edge * .8);
    fctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(fogV342.layer, 0, 0);
    ctx.restore();
  };

  function devProgressSummaryV342() {
    return {
      cores: Math.max(0, Math.floor(Number(progressionV3.cores) || 0)),
      mechs: (progressionV3.v340?.unlockedMechs || []).length,
      skins: (progressionV3.v340?.inventory?.skins || []).length,
      effects: (progressionV3.v340?.inventory?.effects || []).length,
      arsenal: Object.values(progressionV3.blueprints || {}).filter(v => v === 'unlocked').length
    };
  }
  function saveDevProgressV342(message) {
    ensureProgressionV340();
    saveProgressionV3();
    refreshCoreCountersV340();
    updateDevProgressModalV342();
    toastV340(message);
  }
  function addDevCoresV342(amount) {
    progressionV3.cores = Math.max(0, Math.floor(Number(progressionV3.cores) || 0)) + amount;
    saveDevProgressV342(`+${amount} NÚCLEOS DE PRUEBA`);
  }
  function unlockAllMechsV342() {
    ensureProgressionV340();
    progressionV3.v340.unlockedMechs = MECHS_V340.map(mech => mech.id);
    progressionV3.mechBlueprints = progressionV3.mechBlueprints || {};
    MECHS_V340.forEach(mech => progressionV3.mechBlueprints[mech.id] = 'unlocked');
    progressionV3.v340.inventory.parts = progressionV3.v340.inventory.parts || {};
    progressionV3.v340.inventory.parts.bastion = Math.max(4, progressionV3.v340.inventory.parts.bastion || 0);
    saveDevProgressV342('TODOS LOS MECHAS DESBLOQUEADOS');
  }
  function unlockAllSkinsV342() {
    ensureProgressionV340();
    progressionV3.v340.inventory.skins = STORE_ITEMS_V340.skins.map(item => item.id);
    saveDevProgressV342('TODAS LAS SKINS DESBLOQUEADAS');
  }
  function unlockAllEffectsV342() {
    ensureProgressionV340();
    progressionV3.v340.inventory.effects = STORE_ITEMS_V340.effects.map(item => item.id);
    saveDevProgressV342('TODOS LOS EFECTOS DESBLOQUEADOS');
  }
  function unlockFullArsenalV342() {
    progressionV3.blueprints = progressionV3.blueprints || {};
    UPGRADE_POOL.forEach(item => progressionV3.blueprints[item.id] = 'unlocked');
    progressionV3.discoveredContent = Array.from(new Set([
      ...(progressionV3.discoveredContent || []),
      ...UPGRADE_POOL.map(item => item.id),
      ...SYNERGIES.map(item => item.id)
    ]));
    saveDevProgressV342('ARSENAL COMPLETO DESBLOQUEADO');
  }
  function unlockEverythingV342() {
    ensureProgressionV340();
    progressionV3.cores = Math.max(10000, Math.floor(Number(progressionV3.cores) || 0));
    progressionV3.v340.unlockedMechs = MECHS_V340.map(mech => mech.id);
    progressionV3.mechBlueprints = progressionV3.mechBlueprints || {};
    MECHS_V340.forEach(mech => progressionV3.mechBlueprints[mech.id] = 'unlocked');
    progressionV3.v340.inventory.skins = STORE_ITEMS_V340.skins.map(item => item.id);
    progressionV3.v340.inventory.effects = STORE_ITEMS_V340.effects.map(item => item.id);
    progressionV3.v340.inventory.parts = {...(progressionV3.v340.inventory.parts || {}), bastion: 4};
    progressionV3.blueprints = progressionV3.blueprints || {};
    UPGRADE_POOL.forEach(item => progressionV3.blueprints[item.id] = 'unlocked');
    progressionV3.discoveredContent = Array.from(new Set([...(progressionV3.discoveredContent || []), ...UPGRADE_POOL.map(i => i.id), ...SYNERGIES.map(i => i.id)]));
    saveDevProgressV342('TODO EL CONTENIDO DE TESTEO ESTÁ DISPONIBLE');
  }

  function ensureDevProgressModalV342() {
    let root = document.getElementById('v342-dev-progress-modal');
    if (root) return root;
    root = document.createElement('section');
    root.id = 'v342-dev-progress-modal';
    root.className = 'hidden';
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('role', 'dialog');
    root.innerHTML = `
      <div class="v342-dev-card">
        <header class="v342-dev-head">
          <div><h2>PROGRESIÓN DE TESTEO</h2><div class="v342-dev-wallet"><span>SALDO COMPARTIDO</span><b id="v342-dev-core-balance">0</b><span>NÚCLEOS</span></div></div>
          <button class="v342-dev-close" type="button" aria-label="Cerrar">×</button>
        </header>
        <p class="v342-dev-copy">Estas acciones modifican el guardado local de pruebas. Los desbloqueos se reflejan inmediatamente en Garaje, Arsenal y Tienda.</p>
        <div class="v342-dev-actions">
          <button class="v342-dev-action" data-v342-action="cores-100" type="button"><b>+100 NÚCLEOS</b><span>Añade una cantidad pequeña para probar compras individuales.</span></button>
          <button class="v342-dev-action" data-v342-action="cores-1000" type="button"><b>+1 000 NÚCLEOS</b><span>Añade saldo suficiente para probar varias compras.</span></button>
          <button class="v342-dev-action" data-v342-action="mechs" type="button"><b>DESBLOQUEAR MECHAS</b><span>Habilita chasis de Núcleos, módulos y misiones.</span></button>
          <button class="v342-dev-action" data-v342-action="skins" type="button"><b>DESBLOQUEAR SKINS</b><span>Marca todas las apariencias actuales como obtenidas.</span></button>
          <button class="v342-dev-action" data-v342-action="effects" type="button"><b>DESBLOQUEAR EFECTOS</b><span>Habilita estelas, impactos y destrucciones visuales.</span></button>
          <button class="v342-dev-action" data-v342-action="arsenal" type="button"><b>ARSENAL COMPLETO</b><span>Desbloquea armas, poderes, habilidades y descubrimientos de sinergias.</span></button>
          <button class="v342-dev-action" data-v342-action="all" type="button"><b>DESBLOQUEAR TODO</b><span>Activa todo el contenido anterior y deja 10 000 Núcleos.</span></button>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('.v342-dev-close').addEventListener('click', () => root.classList.add('hidden'));
    root.addEventListener('click', ev => { if (ev.target === root) root.classList.add('hidden'); });
    root.querySelector('.v342-dev-actions').addEventListener('click', ev => {
      const button = ev.target.closest('[data-v342-action]');
      if (!button) return;
      const action = button.dataset.v342Action;
      if (action === 'cores-100') addDevCoresV342(100);
      else if (action === 'cores-1000') addDevCoresV342(1000);
      else if (action === 'mechs') unlockAllMechsV342();
      else if (action === 'skins') unlockAllSkinsV342();
      else if (action === 'effects') unlockAllEffectsV342();
      else if (action === 'arsenal') unlockFullArsenalV342();
      else if (action === 'all') unlockEverythingV342();
    });
    return root;
  }
  function updateDevProgressModalV342() {
    const root = document.getElementById('v342-dev-progress-modal');
    if (!root) return;
    const summary = devProgressSummaryV342();
    const balance = root.querySelector('#v342-dev-core-balance');
    if (balance) balance.textContent = String(summary.cores);
  }
  function openDevProgressV342() {
    const root = ensureDevProgressModalV342();
    updateDevProgressModalV342();
    root.classList.remove('hidden');
  }
  function ensureDevProgressTabV342() {
    const tabs = document.getElementById('dev-section-tabs');
    if (!tabs || document.getElementById('v342-dev-progress-tab')) return;
    const button = document.createElement('button');
    button.id = 'v342-dev-progress-tab';
    button.className = 'dev-tab';
    button.type = 'button';
    button.textContent = 'PROGRESIÓN';
    button.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); openDevProgressV342(); });
    tabs.appendChild(button);
  }

  const originalUpdateDevMenuV342 = updateDevMenuUI;
  updateDevMenuUI = function() {
    const result = originalUpdateDevMenuV342();
    ensureDevProgressTabV342();
    return result;
  };
  const originalOpenDeveloperV342 = openDeveloperMenu;
  openDeveloperMenu = function() {
    const result = originalOpenDeveloperV342();
    setTimeout(() => { ensureDevProgressTabV342(); updateDevProgressModalV342(); }, 0);
    return result;
  };

  function initV342() {
    syncPlatformV342();
    ensureProgressionV340();
    ensureDevProgressModalV342();
    document.title = 'MEKORA v3.4.2';
    document.getElementById('settings-version-text')?.replaceChildren(document.createTextNode('MEKORA v3.4.2'));
    window.addEventListener('resize', syncPlatformV342, { passive:true });
    window.addEventListener('orientationchange', () => setTimeout(syncPlatformV342, 60), { passive:true });
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(initV342, 180), { once:true });
  else setTimeout(initV342, 180);

  window.mekoraV342 = {
    version: V342,
    platform: () => ({ pc: isPcV342(), zoom: getActiveCameraZoom() }),
    developer: {
      open: openDevProgressV342,
      addCores: addDevCoresV342,
      unlockMechs: unlockAllMechsV342,
      unlockSkins: unlockAllSkinsV342,
      unlockEffects: unlockAllEffectsV342,
      unlockArsenal: unlockFullArsenalV342,
      unlockAll: unlockEverythingV342,
      summary: devProgressSummaryV342
    },
    fog: () => ({ texture: [fogV342.texture.width, fogV342.texture.height], layer: [fogV342.layer.width, fogV342.layer.height] })
  };
})();

