export const RELEASE = Object.freeze({
  name: 'MEKORA',
  version: '1.4.2',
  architecture: 'Modular Runtime',
  legacyCompatibility: '3.4.2'
});

export const DIFFICULTIES = Object.freeze([
  { id: 'cadet', label: 'CADET', enemyScale: 0.9, rewardScale: 0.9 },
  { id: 'pilot', label: 'PILOT', enemyScale: 1, rewardScale: 1 },
  { id: 'ace', label: 'ACE', enemyScale: 1.18, rewardScale: 1.1 },
  { id: 'anomaly', label: 'ANOMALY', enemyScale: 1.35, rewardScale: 1.2 }
]);

export const MAPS = Object.freeze([
  { id: 'scrapyard-alpha', name: 'SCRAPYARD // ALPHA', biome: 'Industrial ruin' },
  { id: 'sundered-belt', name: 'SUNDERED BELT', biome: 'Metal wasteland' },
  { id: 'ember-depths', name: 'EMBER DEPTHS', biome: 'Molten foundry' }
]);

export const CONTENT_SCHEMAS = Object.freeze({
  mecha: {
    id: 'new-mecha', name: 'New Mecha', role: 'Adaptive chassis', unlock: 'cores',
    price: 600, hp: 100, speed: 6, energy: 120, tags: []
  },
  weapon: {
    id: 'new-weapon', title: 'New Weapon', kind: 'weapon', rarity: 'common',
    damage: 12, fireRate: 0.22, reload: 1.1, desc: 'Prototype weapon.', tags: []
  },
  ability: {
    id: 'new-ability', title: 'New Ability', kind: 'power', rarity: 'rare',
    cooldown: 8, desc: 'Prototype active ability.', tags: []
  },
  enemy: {
    id: 'new-enemy', name: 'New Enemy', hp: 80, speed: 2.5,
    xp: 15, loot: ['scrap'], tags: []
  },
  map: {
    id: 'new-map', name: 'New Map', biome: 'Unknown', encounterRate: 1,
    boss: 'boss-id', tags: []
  },
  shopItem: {
    id: 'new-item', name: 'New Item', category: 'skins', price: 250,
    rarity: 'common', unlock: 'store', tags: []
  }
});
