export const MISSIONS = Object.freeze([
  { id: 'mission-kills-25', title: 'PRIMER DESGUACE', objective: 'Elimina 25 enemigos', stat: 'kills', target: 25, rewardCores: 12, blueprint: 'w-energycannon' },
  { id: 'mission-scrap-150', title: 'RECICLADOR INDUSTRIAL', objective: 'Recoge 150 de chatarra', stat: 'scrapCollected', target: 150, rewardCores: 16, blueprint: 'w-rotarycannon' },
  { id: 'mission-elite-1', title: 'ROMPEBLINDAJES', objective: 'Derrota 1 enemigo élite', stat: 'eliteKills', target: 1, rewardCores: 20, blueprint: 'p-last-magazine' },
  { id: 'mission-miniboss-1', title: 'TALADRO NEUTRALIZADO', objective: 'Derrota al Taladro Bastión', stat: 'minibossKills', target: 1, rewardCores: 28, blueprint: 'w-pistonshotgun' },
  { id: 'mission-survive-180', title: 'SISTEMA ESTABLE', objective: 'Sobrevive 3 minutos', stat: 'bestSurvivalMs', target: 180000, rewardCores: 24, blueprint: 'p-cooldown' },
  { id: 'mission-forge-titan', title: 'CAÍDA DE LA FORJA', objective: 'Derrota al Titán de la Forja', stat: 'bossKills', target: 1, rewardCores: 42, blueprint: 'w-railgun', mech: 'origins' },
  { id: 'mission-pois-8', title: 'CARTÓGRAFO DE CAMPO', objective: 'Activa 8 puntos de interés', stat: 'poisDiscovered', target: 8, rewardCores: 22, blueprint: 'p-drone-copy' },
  { id: 'mission-events-3', title: 'PROTOCOLO IMPREVISTO', objective: 'Completa 3 eventos dinámicos', stat: 'eventsCompleted', target: 3, rewardCores: 30, blueprint: 'w-orbital', mech: 'wraith' },
  { id: 'mission-sector-5', title: 'RUTA A LA FORJA', objective: 'Alcanza el Sector 5', stat: 'maxSector', target: 5, rewardCores: 36, blueprint: 'w-gravityfield', mech: 'bastion' }
]);
