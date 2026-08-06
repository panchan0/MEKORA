export const MECHA_PROFILES = Object.freeze([
  {
    id: 'axiom',
    name: 'AXIOM',
    role: 'Unidad inicial de pruebas visuales',
    stats: { maxHp: 160, maxShield: 15, speedMult: 1, dpsMult: 1, fireRateMult: 1, reloadSpeedMult: 1 },
    trait: { id: 'adaptive-frame', name: 'Bastidor adaptable', description: 'Recupera 1 punto de blindaje cada 4 segundos si no recibe daño.' },
    tags: ['balanced', 'starter']
  },
  {
    id: 'origins',
    name: 'ORIGINS',
    role: 'Prototipo histórico de alto rendimiento',
    stats: { maxHp: 145, maxShield: 30, speedMult: 1.06, dpsMult: 1.08, fireRateMult: 1.04, reloadSpeedMult: 1.05 },
    trait: { id: 'prototype-feedback', name: 'Retroalimentación prototipo', description: 'Cada 20 bajas restaura 12 de escudo y reduce brevemente los enfriamientos.' },
    tags: ['prototype', 'hybrid']
  },
  {
    id: 'lancer',
    name: 'LANCER',
    role: 'Movilidad, cadencia y daño crítico',
    stats: { maxHp: 125, maxShield: 10, speedMult: 1.2, dpsMult: 1.07, fireRateMult: 1.12, reloadSpeedMult: 1.12 },
    trait: { id: 'velocity-strike', name: 'Golpe de velocidad', description: 'El daño aumenta hasta 18% mientras el mecha se mueve a velocidad máxima.' },
    tags: ['mobility', 'critical']
  },
  {
    id: 'bastion',
    name: 'BASTION',
    role: 'Defensa, escudo y contraataque',
    stats: { maxHp: 230, maxShield: 75, speedMult: 0.84, dpsMult: 0.96, fireRateMult: 0.92, reloadSpeedMult: 0.92 },
    trait: { id: 'reactive-plating', name: 'Blindaje reactivo', description: 'Reduce 22% el daño recibido y libera una onda al perder 45 de blindaje.' },
    tags: ['tank', 'defense']
  },
  {
    id: 'weaver',
    name: 'WEAVER',
    role: 'Drones, torretas y control de zona',
    stats: { maxHp: 140, maxShield: 30, speedMult: 1.02, dpsMult: 1, fireRateMult: 1.03, reloadSpeedMult: 1.04 },
    trait: { id: 'command-network', name: 'Red de mando', description: 'Drones, torretas, minas y unidades invocadas infligen 28% más daño.' },
    tags: ['drone', 'control']
  },
  {
    id: 'wraith',
    name: 'WRAITH',
    role: 'Fase, precisión y evasión',
    stats: { maxHp: 120, maxShield: 22, speedMult: 1.15, dpsMult: 1.12, fireRateMult: 1.06, reloadSpeedMult: 1.08 },
    trait: { id: 'phase-envelope', name: 'Envoltura de fase', description: 'Ignora un impacto cada 12 segundos y gana velocidad después de esquivarlo.' },
    tags: ['phase', 'precision']
  }
]);

export const MECHA_PROFILE_BY_ID = new Map(MECHA_PROFILES.map((profile) => [profile.id, profile]));
