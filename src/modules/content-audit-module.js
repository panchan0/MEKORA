import {
  ACTIVE_WEAPON_IDS,
  PASSIVE_IDS,
  REQUIRED_COLLECTIONS,
  CONTENT_IMPLEMENTATION_RULES
} from '../data/content-implementation.js';
import { STARTER_WEAPON_BY_MECHA_V140 } from '../data/weapons-v140.js';

function uniqueIds(items = []) {
  const seen = new Set();
  const duplicates = [];
  for (const item of items) {
    if (!item?.id) continue;
    if (seen.has(item.id)) duplicates.push(item.id);
    seen.add(item.id);
  }
  return duplicates;
}

function toItems(items = []) {
  if (Array.isArray(items)) return items;
  if (!items || typeof items !== 'object') return [];
  return Object.entries(items).map(([key, value]) => ({ id: value?.id || key, ...(value || {}) }));
}

function ids(items = []) {
  return new Set(toItems(items).map((item) => item?.id).filter(Boolean));
}

function missingFrom(sourceIds, targetIds) {
  return [...sourceIds].filter((id) => !targetIds.has(id));
}

function validateRequiredFields(items, fields, label) {
  return items.flatMap((item) => fields
    .filter((field) => item?.[field] === undefined || item?.[field] === null || item?.[field] === '')
    .map((field) => `${label} ${item?.id || 'sin-id'} no define ${field}`));
}

export const contentAuditModule = {
  start(runtime) {
    const api = {
      run() {
        const collections = runtime.content.listCollections();
        const missingCollections = REQUIRED_COLLECTIONS.filter((name) => !collections.includes(name));
        const arsenal = runtime.content.all('arsenal');
        const weapons = arsenal.filter((item) => item.type === 'weapon');
        const passives = arsenal.filter((item) => item.type === 'passive');
        const synergies = runtime.content.all('synergies');
        const mechas = runtime.content.all('mechas');
        const profiles = runtime.content.all('mechaProfiles');
        const enemies = runtime.content.all('enemies');
        const bosses = runtime.content.all('bosses');
        const missions = runtime.content.all('missions');
        const skins = runtime.content.all('skins');
        const effects = runtime.content.all('effects');
        const boxes = runtime.content.all('boxes');
        const maps = runtime.content.all('maps');
        const mapModifiers = runtime.content.all('mapModifiers');
        const difficulties = runtime.content.all('difficulties');
        const weaponsV140 = runtime.content.all('weaponsV140');
        const buffsV140 = runtime.content.all('buffsV140');
        const wavesV140 = runtime.content.all('wavesV140');

        const weaponIds = ids(weapons);
        const passiveIds = ids(passives);
        const arsenalIds = ids(arsenal);
        const synergyIds = ids(synergies);
        const mechaIds = ids(mechas);
        const profileIds = ids(profiles);
        const enemyIds = ids(enemies);
        const bossIds = ids(bosses);
        const missionIds = ids(missions);
        const mapIds = ids(maps);
        const modifierIds = ids(mapModifiers);
        const weaponIdsV140 = ids(weaponsV140);
        const buffIdsV140 = ids(buffsV140);

        const missingWeapons = ACTIVE_WEAPON_IDS.filter((id) => !weaponIds.has(id));
        const missingPassives = PASSIVE_IDS.filter((id) => !passiveIds.has(id));
        const invalidSynergies = synergies.filter((item) => !Array.isArray(item.reqs)
          || item.reqs.length < 2
          || item.reqs.some((id) => !arsenalIds.has(id)));
        const invalidMissionRewards = missions.flatMap((mission) => {
          const issues = [];
          if (mission.blueprint && !arsenalIds.has(mission.blueprint)) issues.push(`Misión ${mission.id} referencia blueprint inexistente: ${mission.blueprint}`);
          if (mission.mech && !mechaIds.has(mission.mech)) issues.push(`Misión ${mission.id} referencia mecha inexistente: ${mission.mech}`);
          return issues;
        });
        const invalidBosses = bosses.flatMap((boss) => {
          const issues = [];
          if (!enemyIds.has(boss.id)) issues.push(`Jefe sin enemigo jugable asociado: ${boss.id}`);
          const unlockMission = boss.rewards?.unlockMission;
          if (unlockMission && !missionIds.has(unlockMission)) issues.push(`Jefe ${boss.id} referencia misión inexistente: ${unlockMission}`);
          return issues;
        });

        const duplicates = {};
        for (const collection of collections) {
          const found = uniqueIds(runtime.content.all(collection));
          if (found.length) duplicates[collection] = found;
        }

        const legacyDefinitions = window.__mekoraLegacyV1?.getDefinitions?.() || {};
        const legacyChecks = [
          ['arsenal', arsenalIds, ids(legacyDefinitions.upgrades)],
          ['synergies', synergyIds, ids(legacyDefinitions.synergies)],
          ['enemies', enemyIds, ids(legacyDefinitions.enemies)],
          ['missions', missionIds, ids(legacyDefinitions.missions)],
          ['mechas', mechaIds, ids(legacyDefinitions.mechas)],
          ['skins', ids(skins), ids(legacyDefinitions.skins)],
          ['effects', ids(effects), ids(legacyDefinitions.effects)],
          ['boxes', ids(boxes), ids(legacyDefinitions.boxes)],
          ['maps', mapIds, ids(legacyDefinitions.maps)],
          ['difficulties', ids(difficulties), ids(legacyDefinitions.difficulties)]
        ];
        const legacyIssues = legacyChecks.flatMap(([label, modularIds, legacyIds]) => {
          if (!legacyIds.size) return [`Puente heredado sin definiciones para ${label}`];
          return [
            ...missingFrom(modularIds, legacyIds).map((id) => `${label}: ${id} no existe en el runtime jugable heredado`),
            ...missingFrom(legacyIds, modularIds).map((id) => `${label}: ${id} existe en el runtime heredado pero no en datos modulares`)
          ];
        });

        const v140Issues = [
          ...Object.entries(STARTER_WEAPON_BY_MECHA_V140).flatMap(([mechaId, weaponId]) => [
            ...(mechaIds.has(mechaId) ? [] : [`Arma inicial referencia mecha inexistente: ${mechaId}`]),
            ...(weaponIdsV140.has(weaponId) ? [] : [`Mecha ${mechaId} referencia arma inicial inexistente: ${weaponId}`])
          ]),
          ...wavesV140.flatMap((wave) => (wave.pool || []).filter((id) => !enemyIds.has(id)).map((id) => `Oleada sector ${wave.sector} referencia enemigo inexistente: ${id}`)),
          ...buffsV140.filter((buff) => !passiveIds.has(buff.id)).map((buff) => `Buff v1.4 sin módulo heredado compatible: ${buff.id}`)
        ];

        const fieldIssues = [
          ...validateRequiredFields(weapons, CONTENT_IMPLEMENTATION_RULES.activeWeapon.requires, 'Arma'),
          ...validateRequiredFields(passives, CONTENT_IMPLEMENTATION_RULES.passive.requires, 'Módulo'),
          ...validateRequiredFields(synergies, CONTENT_IMPLEMENTATION_RULES.synergy.requires, 'Sinergia'),
          ...validateRequiredFields(mechas, CONTENT_IMPLEMENTATION_RULES.mecha.requires, 'Mecha'),
          ...validateRequiredFields([...skins, ...effects], CONTENT_IMPLEMENTATION_RULES.cosmetic.requires, 'Cosmético')
        ];

        const issues = [
          ...missingCollections.map((name) => `Colección ausente: ${name}`),
          ...missingWeapons.map((id) => `Arma sin registro: ${id}`),
          ...missingPassives.map((id) => `Módulo sin registro: ${id}`),
          ...invalidSynergies.map((item) => `Sinergia inválida: ${item.id}`),
          ...missingFrom(mechaIds, profileIds).map((id) => `Mecha sin perfil jugable: ${id}`),
          ...missingFrom(profileIds, mechaIds).map((id) => `Perfil sin mecha registrado: ${id}`),
          ...missingFrom(mapIds, modifierIds).map((id) => `Mapa sin modificador jugable: ${id}`),
          ...missingFrom(modifierIds, mapIds).map((id) => `Modificador sin mapa registrado: ${id}`),
          ...invalidMissionRewards,
          ...invalidBosses,
          ...fieldIssues,
          ...v140Issues,
          ...legacyIssues,
          ...Object.entries(duplicates).flatMap(([collection, foundIds]) => foundIds.map((id) => `ID duplicado en ${collection}: ${id}`))
        ];

        const report = {
          ok: issues.length === 0,
          version: runtime.version,
          checkedAt: Date.now(),
          totals: {
            collections: collections.length,
            arsenal: arsenal.length,
            activeWeapons: weaponIds.size,
            passives: passiveIds.size,
            synergies: synergies.length,
            mechas: mechas.length,
            profiles: profiles.length,
            enemies: enemies.length,
            missions: missions.length,
            bosses: bosses.length,
            maps: maps.length,
            cosmetics: skins.length + effects.length,
            legacyLinks: legacyChecks.reduce((total, [, modularIds]) => total + modularIds.size, 0),
            weaponsV140: weaponsV140.length,
            buffsV140: buffsV140.length,
            waveSectorsV140: wavesV140.length
          },
          implementation: {
            weapons: CONTENT_IMPLEMENTATION_RULES.activeWeapon.status,
            passives: CONTENT_IMPLEMENTATION_RULES.passive.status,
            synergies: CONTENT_IMPLEMENTATION_RULES.synergy.status,
            mechas: CONTENT_IMPLEMENTATION_RULES.mecha.status,
            cosmetics: CONTENT_IMPLEMENTATION_RULES.cosmetic.status
          },
          issues
        };
        runtime.store.patch({ contentAudit: report }, { source: 'content-audit' });
        runtime.events.emit('content:audit-complete', report);
        return report;
      },
      assertComplete() {
        const report = this.run();
        if (!report.ok) throw new Error(report.issues.join('\n'));
        return report;
      }
    };
    const report = api.run();
    runtime.services.set('contentAudit', api);
    return { ...api, initialReport: report };
  }
};
