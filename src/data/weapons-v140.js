export const WEAPONS_V140 = Object.freeze([
  {
    id: 'axiom-rivet-rifle', name: 'RIFLE DE REMACHES AX-7', short: 'AX-7', owner: 'axiom', category: 'rifle', rarity: 'starter',
    description: 'Rifle industrial estable. Preciso, económico y diseñado para sostener oleadas largas.',
    legacyId: 'w-machinegun', damage: 22, cooldown: 170, magazine: 18, reserveMax: 126, reloadMs: 1150,
    projectile: 'machinegun', speed: 17, radius: 4, color: '#ff4c42', range: 520, spread: 0.025, pellets: 1, ammoPerShot: 1,
    visual: { kind: 'rifle', length: 34, width: 8, accent: '#ff3b30' }
  },
  {
    id: 'origins-photon-lance', name: 'LANZA FOTÓNICA OR-1', short: 'OR-1', owner: 'origins', category: 'precision', rarity: 'starter',
    description: 'Prototipo de pulso penetrante. Sacrifica cadencia por disparos limpios y de largo alcance.',
    legacyId: 'w-lance', damage: 58, cooldown: 560, magazine: 7, reserveMax: 49, reloadMs: 1450,
    projectile: 'laser', speed: 23, radius: 5, color: '#9ef2e8', range: 700, spread: 0, pellets: 1, ammoPerShot: 1, pierces: 3,
    visual: { kind: 'lance', length: 43, width: 6, accent: '#9ef2e8' }
  },
  {
    id: 'lancer-twin-needle', name: 'AGUJAS GEMELAS LC-9', short: 'LC-9', owner: 'lancer', category: 'smg', rarity: 'starter',
    description: 'Dos emisores compactos de altísima cadencia. Dominan a corta y media distancia.',
    legacyId: 'w-rotarycannon', damage: 12, cooldown: 82, magazine: 32, reserveMax: 192, reloadMs: 920,
    projectile: 'machinegun', speed: 18, radius: 3, color: '#f0b954', range: 430, spread: 0.075, pellets: 1, ammoPerShot: 1,
    visual: { kind: 'dual', length: 28, width: 6, accent: '#f0b954' }
  },
  {
    id: 'bastion-siege-maul', name: 'MAZA DE ASEDIO BS-4', short: 'BS-4', owner: 'bastion', category: 'melee', rarity: 'starter',
    description: 'Arma de impacto masiva. No usa munición y libera ondas de presión al golpear.',
    legacyId: 'w-kinetichammer', damage: 105, cooldown: 760, magazine: 0, reserveMax: 0, reloadMs: 0,
    projectile: 'melee', speed: 0, radius: 0, color: '#dcb269', range: 92, spread: 0, pellets: 1, ammoPerShot: 0,
    visual: { kind: 'maul', length: 38, width: 11, accent: '#dcb269' }
  },
  {
    id: 'weaver-command-carbine', name: 'CARABINA DE MANDO WV-3', short: 'WV-3', owner: 'weaver', category: 'carbine', rarity: 'starter',
    description: 'Carabina de energía sincronizada con drones. Cada cuarto disparo marca un objetivo.',
    legacyId: 'w-energycannon', damage: 30, cooldown: 245, magazine: 14, reserveMax: 98, reloadMs: 1250,
    projectile: 'energycannon', speed: 13, radius: 7, color: '#d8b7ef', range: 560, spread: 0.02, pellets: 1, ammoPerShot: 1,
    visual: { kind: 'carbine', length: 32, width: 9, accent: '#d8b7ef' }
  },
  {
    id: 'wraith-phase-rifle', name: 'RIFLE DE FASE WR-8', short: 'WR-8', owner: 'wraith', category: 'sniper', rarity: 'starter',
    description: 'Rifle espectral de precisión. El proyectil atraviesa varios objetivos y deja una estela fría.',
    legacyId: 'w-sniper', damage: 86, cooldown: 820, magazine: 5, reserveMax: 35, reloadMs: 1650,
    projectile: 'sniper', speed: 25, radius: 5, color: '#9fd7e6', range: 760, spread: 0, pellets: 1, ammoPerShot: 1, pierces: 5,
    visual: { kind: 'sniper', length: 46, width: 6, accent: '#9fd7e6' }
  },
  {
    id: 'salvage-shotgun', name: 'ESCOPETA DE RESCATE SG-12', short: 'SG-12', category: 'shotgun', rarity: 'common',
    description: 'Dispersión agresiva y gran empuje. Excelente para limpiar enemigos cercanos.',
    legacyId: 'w-shotgun', damage: 17, cooldown: 680, magazine: 6, reserveMax: 42, reloadMs: 1500,
    projectile: 'shotgun', speed: 14, radius: 4, color: '#ffb24b', range: 300, spread: 0.42, pellets: 7, ammoPerShot: 1,
    visual: { kind: 'shotgun', length: 31, width: 10, accent: '#ffb24b' }
  },
  {
    id: 'forge-flamethrower', name: 'LANZALLAMAS DE FORJA FL-6', short: 'FL-6', category: 'flame', rarity: 'uncommon',
    description: 'Ráfagas de combustión de corto alcance. Consume munición con rapidez y controla grupos.',
    legacyId: 'w-flamethrower', damage: 11, cooldown: 95, magazine: 40, reserveMax: 200, reloadMs: 1800,
    projectile: 'flame', speed: 7, radius: 8, color: '#ff6b2c', range: 250, spread: 0.26, pellets: 2, ammoPerShot: 1,
    visual: { kind: 'flame', length: 35, width: 11, accent: '#ff6b2c' }
  },
  {
    id: 'rail-splitter', name: 'CORTADOR LINEAL RL-2', short: 'RL-2', category: 'railgun', rarity: 'rare',
    description: 'Proyectil hipersónico de alto daño. Atraviesa objetivos y consume dos unidades por disparo.',
    legacyId: 'w-railgun', damage: 118, cooldown: 1050, magazine: 4, reserveMax: 28, reloadMs: 1900,
    projectile: 'railgun', speed: 28, radius: 5, color: '#c084fc', range: 820, spread: 0, pellets: 1, ammoPerShot: 2, pierces: 8,
    visual: { kind: 'rail', length: 50, width: 7, accent: '#c084fc' }
  },
  {
    id: 'scrap-grenade-launcher', name: 'LANZAGRANADAS CHATARRERO GL-5', short: 'GL-5', category: 'explosive', rarity: 'uncommon',
    description: 'Granadas pesadas que rebotan y explotan. Útil contra oleadas compactas.',
    legacyId: 'w-grenadelauncher', damage: 72, cooldown: 880, magazine: 5, reserveMax: 30, reloadMs: 1720,
    projectile: 'grenade', speed: 9, radius: 7, color: '#facc15', range: 520, spread: 0.04, pellets: 1, ammoPerShot: 1,
    visual: { kind: 'launcher', length: 37, width: 12, accent: '#facc15' }
  },
  {
    id: 'arc-boomerang', name: 'BOOMERANGUE DE ARCO BA-3', short: 'BA-3', category: 'throwable', rarity: 'rare',
    description: 'Disco de energía retornable. No usa munición, pero solo puede existir uno a la vez.',
    legacyId: 'w-boomerang', damage: 48, cooldown: 920, magazine: 0, reserveMax: 0, reloadMs: 0,
    projectile: 'boomerang', speed: 11, radius: 10, color: '#62e7ff', range: 430, spread: 0, pellets: 1, ammoPerShot: 0,
    visual: { kind: 'thrower', length: 27, width: 9, accent: '#62e7ff' }
  },
  {
    id: 'energy-blade', name: 'ESPADA DE ENERGÍA ES-1', short: 'ES-1', category: 'melee', rarity: 'rare',
    description: 'Corte rápido de energía. No consume munición y permite reposicionamiento agresivo.',
    legacyId: 'w-energysword', damage: 68, cooldown: 360, magazine: 0, reserveMax: 0, reloadMs: 0,
    projectile: 'melee-fast', speed: 0, radius: 0, color: '#56f5d0', range: 78, spread: 0, pellets: 1, ammoPerShot: 0,
    visual: { kind: 'blade', length: 39, width: 5, accent: '#56f5d0' }
  }
]);

export const WEAPON_BY_ID_V140 = new Map(WEAPONS_V140.map((weapon) => [weapon.id, weapon]));
export const STARTER_WEAPON_BY_MECHA_V140 = Object.freeze({
  axiom: 'axiom-rivet-rifle',
  origins: 'origins-photon-lance',
  lancer: 'lancer-twin-needle',
  bastion: 'bastion-siege-maul',
  weaver: 'weaver-command-carbine',
  wraith: 'wraith-phase-rifle'
});
export const CHEST_WEAPON_IDS_V140 = Object.freeze([
  'salvage-shotgun', 'forge-flamethrower', 'rail-splitter',
  'scrap-grenade-launcher', 'arc-boomerang', 'energy-blade'
]);
