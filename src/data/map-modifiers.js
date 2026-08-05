export const MAP_MODIFIERS = Object.freeze([
  {
    id: 'scrap_prime',
    name: 'DESGUACE PRIME',
    modifier: 'Salvamento industrial',
    description: 'Más chatarra, presión equilibrada y menor frecuencia de peligros.',
    gameplay: { scrapMult: 1.2, hazardRateMult: 0.82, enemySpeedMult: 1, enemyDamageMult: 1, visibilityMult: 1 },
    tags: ['balanced', 'economy']
  },
  {
    id: 'magnetic_corridor',
    name: 'CORREDOR MAGNÉTICO',
    modifier: 'Interferencia electromagnética',
    description: 'Enemigos a distancia disparan con mayor frecuencia, pero el jugador recarga más rápido.',
    gameplay: { scrapMult: 1, hazardRateMult: 1.08, enemySpeedMult: 1.04, enemyDamageMult: 1.04, reloadSpeedMult: 1.14, rangedCadenceMult: 1.18, visibilityMult: 1.05 },
    tags: ['ranged', 'mobility']
  },
  {
    id: 'night_foundry',
    name: 'FUNDICIÓN NOCTURNA',
    modifier: 'Calor de forja',
    description: 'Visibilidad reducida, más peligros y enemigos resistentes. Las explosiones causan más daño.',
    gameplay: { scrapMult: 1.12, hazardRateMult: 1.35, enemySpeedMult: 1.02, enemyDamageMult: 1.1, enemyHpMult: 1.12, explosionDamageMult: 1.2, visibilityMult: 0.82 },
    tags: ['hazards', 'explosive']
  }
]);

export const MAP_MODIFIER_BY_ID = new Map(MAP_MODIFIERS.map((map) => [map.id, map]));
