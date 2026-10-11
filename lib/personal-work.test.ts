// Tests de lib/personal-work.ts, sans framework : npx tsx lib/personal-work.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import { isPersonalWork, MODULE_KEYS, NON_PERSONAL_MODULE_KEYS } from './modules';
import { activityDays, DEFAULT_WEEKLY_SESSION_GOAL, weeklyGoalOf, weekWork } from './personal-work';

let total = 0;
let failures = 0;

function check(name: string, run: () => void): void {
  total += 1;
  try {
    run();
    console.log(`ok     ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`ÉCHEC  ${name}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

check('isPersonalWork : seul l’entraînement club est hors flamme', () => {
  assert.deepEqual(NON_PERSONAL_MODULE_KEYS, ['entrainement_club']);
  assert.equal(isPersonalWork('entrainement_club'), false);
  for (const key of MODULE_KEYS.filter((module) => module !== 'entrainement_club')) {
    assert.equal(isPersonalWork(key), true, key);
  }
});

check('isPersonalWork : une valeur inconnue lue en base compte comme travail personnel', () => {
  assert.equal(isPersonalWork('match'), true);
  assert.equal(isPersonalWork(''), true);
});

check('activityDays : points de tout module, flamme du travail personnel seulement', () => {
  const days = activityDays([
    { date: '2026-10-06', module: 'entrainement_club' },
    { date: '2026-10-07', module: 'seance_libre' },
    { date: '2026-10-08', module: 'entrainement_club' },
    { date: '2026-10-08', module: 'test' },
  ]);
  assert.deepEqual([...days.trainingDays].sort(), ['2026-10-06', '2026-10-07', '2026-10-08']);
  assert.deepEqual([...days.personalDays].sort(), ['2026-10-07', '2026-10-08']);
});

check('activityDays : aucune séance', () => {
  const days = activityDays([]);
  assert.equal(days.trainingDays.size, 0);
  assert.equal(days.personalDays.size, 0);
});

check('weekWork : semaine du lundi au dimanche, club exclu', () => {
  // Dimanche 11 octobre 2026 : semaine du lundi 5 au dimanche 11.
  const work = weekWork(
    [
      { date: '2026-10-04', module: 'seance_libre', duration_min: 60 },
      { date: '2026-10-05', module: 'seance_libre', duration_min: 45 },
      { date: '2026-10-06', module: 'entrainement_club', duration_min: 90 },
      { date: '2026-10-08', module: 'test', duration_min: 15 },
      { date: '2026-10-11', module: 'etirements', duration_min: 20 },
      { date: '2026-10-12', module: 'seance_libre', duration_min: 30 },
    ],
    '2026-10-11',
  );
  assert.deepEqual(work, { sessions: 3, minutes: 80 });
});

check('weekWork : lundi, la semaine commence', () => {
  assert.deepEqual(weekWork([{ date: '2026-10-05', module: 'piscine', duration_min: 45 }], '2026-10-05'), {
    sessions: 1,
    minutes: 45,
  });
  assert.deepEqual(weekWork([{ date: '2026-10-04', module: 'piscine', duration_min: 45 }], '2026-10-05'), {
    sessions: 0,
    minutes: 0,
  });
});

check('weeklyGoalOf : 3 sans réglage, bornes 1 à 7', () => {
  assert.equal(weeklyGoalOf(null), DEFAULT_WEEKLY_SESSION_GOAL);
  assert.equal(DEFAULT_WEEKLY_SESSION_GOAL, 3);
  assert.equal(weeklyGoalOf(5), 5);
  assert.equal(weeklyGoalOf(0), 1);
  assert.equal(weeklyGoalOf(12), 7);
  assert.equal(weeklyGoalOf(2.5), 3);
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
