export const ACTIVE_WEAPON_IDS = Object.freeze([
  'w-machinegun','w-energycannon','w-laser','w-shotgun','w-missile','w-grenadelauncher','w-railgun','w-sniper','w-flamethrower','w-plasma',
  'w-energysword','w-kinetichammer','w-lance','w-claws','w-boomerang','w-drones','w-repairdrones','w-turrets','w-mines','w-shield',
  'w-gravityfield','w-emp','w-teleport','w-dash','w-reactor','w-orbital','w-highbeam','w-summons','w-rotarycannon','w-pistonshotgun'
]);

export const PASSIVE_IDS = Object.freeze([
  'p-bounce','p-pierce','p-explode','p-fire-zone','p-lightning','p-extra-missile','p-crit-effect','p-drone-copy','p-kill-cooldown',
  'p-dash-wave','p-extra-projectile','p-elemental','p-shield-reflect','p-melee-wave','p-evolve','p-cooldown','p-last-magazine','p-first-impact'
]);

export const REQUIRED_COLLECTIONS = Object.freeze([
  'mechas','arsenal','synergies','enemies','skins','effects','boxes','maps','difficulties','missions','bosses'
]);

export const CONTENT_IMPLEMENTATION_RULES = Object.freeze({
  activeWeapon: { requires: ['id','title','desc'], runtime: 'legacy-combat', status: 'playable' },
  passive: { requires: ['id','title','desc'], runtime: 'legacy-combat', status: 'playable' },
  synergy: { requires: ['id','name','desc','reqs'], runtime: 'legacy-combat', status: 'playable' },
  mecha: { requires: ['id','name','role'], runtime: 'gameplay-profile', status: 'playable' },
  cosmetic: { requires: ['id','name','price','desc'], runtime: 'cosmetics', status: 'equipable' }
});
