export const SECTOR_WAVES_V140 = Object.freeze([
  { id: 'sector-1', sector: 1, name: 'Patio de recuperación', waveCount: 3, baseEnemies: 5, pool: ['scrap_hound', 'saw_raider'], final: 'elite' },
  { id: 'sector-2', sector: 2, name: 'Corredor de prensado', waveCount: 4, baseEnemies: 6, pool: ['scrap_hound', 'saw_raider', 'scrap_gunner'], final: 'miniboss' },
  { id: 'sector-3', sector: 3, name: 'Vertedero ferroviario', waveCount: 5, baseEnemies: 7, pool: ['scrap_hound', 'scrap_gunner', 'mine_junker'], final: 'elite' },
  { id: 'sector-4', sector: 4, name: 'Fundición abierta', waveCount: 6, baseEnemies: 8, pool: ['saw_raider', 'scrap_gunner', 'mine_junker', 'scrap_suicide'], final: 'miniboss' },
  { id: 'sector-5', sector: 5, name: 'Núcleo de la forja', waveCount: 7, baseEnemies: 9, pool: ['saw_raider', 'scrap_gunner', 'mine_junker', 'scrap_suicide', 'scrap_bomber'], final: 'boss' }
]);

export const WAVE_BY_SECTOR_V140 = new Map(SECTOR_WAVES_V140.map((entry) => [entry.sector, entry]));
