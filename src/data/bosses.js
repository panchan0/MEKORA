export const BOSSES = Object.freeze([
  {
    id: 'drill_bastion',
    name: 'TALADRO BASTIÓN',
    type: 'miniboss',
    phases: 2,
    mechanics: ['carga perforante', 'minas de presión', 'ventana vulnerable tras impacto contra muro'],
    rewards: { evolutionCores: 1, coreCycleReward: 15, parts: { bastion: 1 } }
  },
  {
    id: 'forge_titan',
    name: 'TITÁN DE LA FORJA',
    type: 'boss',
    phases: 3,
    mechanics: ['barrido de martillo', 'lluvia de metal', 'sobrecarga de reactor', 'invocación de chatarreros'],
    rewards: { evolutionCores: 1, cores: 40, unlockMission: 'mission-forge-titan' }
  }
]);
