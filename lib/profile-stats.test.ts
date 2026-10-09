// Tests de lib/profile-stats.ts, sans framework : npx tsx lib/profile-stats.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import {
  buildRegularityWeeks,
  buildSkillDetail,
  countActiveWeeks,
  countTestsSince,
  describeTrend,
  formatMinutes,
  initialsOf,
  joinCaption,
  monthVolume,
  regularityStart,
  splitMinutes,
  summarizeSkills,
  type MeasureSource,
  type TestStatsSource,
} from './profile-stats';
import type { MeasureLatest } from './records';
import type { FamilyKey, SkillKey } from './test-families';

/** Vendredi 9 octobre 2026 : sa semaine commence le lundi 5, la première des 12 le lundi 20 juillet. */
const TODAY = '2026-10-09';

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

function measure(key: string, unit: string, higherIsBetter: boolean): MeasureSource {
  return { key, name: `Mesure ${key}`, unit, higher_is_better: higherIsBetter };
}

/** Test fait (lastDate = premier de resultDates) ou jamais fait (resultDates vide). */
function testOf(
  slug: string,
  skill: SkillKey,
  family: FamilyKey,
  resultDates: string[],
  measures: MeasureSource[],
  latest: [string, MeasureLatest][] = [],
  records: [string, number][] = [],
): TestStatsSource {
  return {
    slug,
    title: `Test ${slug}`,
    skill,
    family,
    lastDate: resultDates[0] ?? null,
    resultDates,
    records: new Map(records),
    latest: new Map(latest),
    exercise: { measures },
  };
}

check('regularityStart : lundi de la 12e semaine avant la courante', () => {
  assert.equal(regularityStart(TODAY), '2026-07-20');
  // Un lundi : sa propre semaine est la courante.
  assert.equal(regularityStart('2026-10-05'), '2026-07-20');
  // Un dimanche appartient encore à la semaine du lundi précédent.
  assert.equal(regularityStart('2026-10-11'), '2026-07-20');
});

check('buildRegularityWeeks : 12 semaines, séances et tests rangés par lundi, hors fenêtre ignorés', () => {
  const weeks = buildRegularityWeeks(
    TODAY,
    [
      { date: '2026-10-09', duration_min: 45 },
      { date: '2026-10-05', duration_min: 30 },
      // Dimanche 4 oct. : semaine du lundi 28 sept.
      { date: '2026-10-04', duration_min: 60 },
      { date: '2026-07-20', duration_min: 20 },
      // Dimanche 19 juil. : avant la première semaine.
      { date: '2026-07-19', duration_min: 90 },
    ],
    // Deux tests le 8 oct. (deux couples distincts), un le 30 sept., un hors fenêtre.
    ['2026-10-08', '2026-10-08', '2026-09-30', '2026-07-01'],
  );
  assert.equal(weeks.length, 12);
  assert.equal(weeks[0].monday, '2026-07-20');
  assert.equal(weeks[11].monday, '2026-10-05');
  assert.deepEqual(weeks[11], { monday: '2026-10-05', minutes: 75, sessions: 2, tests: 2 });
  assert.deepEqual(weeks[10], { monday: '2026-09-28', minutes: 60, sessions: 1, tests: 1 });
  assert.deepEqual(weeks[0], { monday: '2026-07-20', minutes: 20, sessions: 1, tests: 0 });
  assert.deepEqual(
    weeks.slice(1, 10).map((week) => week.minutes + week.sessions + week.tests),
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
  );
  assert.equal(countActiveWeeks(weeks), 3);
});

check('buildRegularityWeeks : passage à l’heure d’hiver (25 oct.) sans décalage de semaine', () => {
  const weeks = buildRegularityWeeks('2026-10-28', [{ date: '2026-10-26', duration_min: 30 }], ['2026-10-25']);
  assert.equal(weeks[11].monday, '2026-10-26');
  assert.equal(weeks[11].sessions, 1);
  assert.equal(weeks[10].monday, '2026-10-19');
  assert.equal(weeks[10].tests, 1);
});

check('countActiveWeeks : une semaine de tests sans séance ne compte pas', () => {
  const weeks = buildRegularityWeeks(TODAY, [], ['2026-10-08']);
  assert.equal(countActiveWeeks(weeks), 0);
});

check('monthVolume : du 1er du mois à aujourd’hui', () => {
  assert.deepEqual(
    monthVolume(TODAY, [
      { date: '2026-10-09', duration_min: 45 },
      { date: '2026-10-01', duration_min: 90 },
      { date: '2026-09-30', duration_min: 60 },
    ]),
    { minutes: 135, sessions: 2 },
  );
  assert.deepEqual(monthVolume(TODAY, []), { minutes: 0, sessions: 0 });
});

check('countTestsSince : depuis un jour inclus, ou tout', () => {
  const days = ['2026-10-08', '2026-09-10', '2026-09-09', '2026-01-01'];
  assert.equal(countTestsSince(days, '2026-09-10'), 2);
  assert.equal(countTestsSince(days), 4);
  assert.equal(countTestsSince([], '2026-09-10'), 0);
});

check('formatMinutes et splitMinutes : minutes, puis heures', () => {
  assert.equal(formatMinutes(0), '0 min');
  assert.equal(formatMinutes(45), '45 min');
  assert.equal(formatMinutes(60), '1 h');
  assert.equal(formatMinutes(125), '2 h 05');
  assert.equal(formatMinutes(400), '6 h 40');
  assert.deepEqual(splitMinutes(400), { hours: 6, minutes: 40 });
  assert.deepEqual(splitMinutes(45), { hours: 0, minutes: 45 });
});

/** Tir : un test en progrès et en recul, un test à un seul résultat, un jamais fait ; Physique : une égalité. */
const TESTS: TestStatsSource[] = [
  testOf(
    'test-tir-1',
    'tir',
    'tir_arret',
    ['2026-10-08', '2026-09-20'],
    [measure('frappes', 'pts /30', true), measure('chrono', 's', false)],
    [
      ['frappes', { value: 20, date: '2026-10-08', previousValue: 18 }],
      ['chrono', { value: 4.1, date: '2026-10-08', previousValue: 4 }],
    ],
    [
      ['frappes', 20],
      ['chrono', 4],
    ],
  ),
  testOf(
    'test-tir-2',
    'tir',
    'tir_surface',
    ['2026-09-20'],
    [measure('buts', '', true)],
    [['buts', { value: 5, date: '2026-09-20', previousValue: null }]],
    [['buts', 5]],
  ),
  testOf('test-tir-3', 'tir', 'tir_mouvement', [], [measure('cadres', '', true)]),
  testOf(
    'test-physique-1',
    'physique',
    'phys_vitesse',
    ['2026-10-01', '2026-09-01'],
    [measure('sprint', 's', false)],
    [['sprint', { value: 3.9, date: '2026-10-01', previousValue: 3.9 }]],
    [['sprint', 3.9]],
  ),
  testOf('test-passe-1', 'passe', 'passe_courte', [], [measure('passes', '', true)]),
];

check('summarizeSkills : compétences faites seulement, dans l’ordre de SKILLS, tendance par mesure', () => {
  assert.deepEqual(summarizeSkills(TESTS), [
    { skill: 'tir', testsDone: 2, lastDate: '2026-10-08', trend: { progress: 1, regress: 1, compared: 2 } },
    { skill: 'physique', testsDone: 1, lastDate: '2026-10-01', trend: { progress: 0, regress: 0, compared: 1 } },
  ]);
  assert.deepEqual(summarizeSkills([]), []);
});

check('describeTrend : parties à 0 omises, mot non répété, égalités et absence de tendance', () => {
  assert.deepEqual(describeTrend({ progress: 2, regress: 1, compared: 4 }), [
    { text: '2 mesures en progrès', direction: 'better' },
    { text: '1 en recul', direction: 'worse' },
  ]);
  assert.deepEqual(describeTrend({ progress: 1, regress: 0, compared: 1 }), [
    { text: '1 mesure en progrès', direction: 'better' },
  ]);
  assert.deepEqual(describeTrend({ progress: 0, regress: 3, compared: 3 }), [
    { text: '3 mesures en recul', direction: 'worse' },
  ]);
  assert.deepEqual(describeTrend({ progress: 0, regress: 0, compared: 2 }), [{ text: 'Stable', direction: 'same' }]);
  assert.deepEqual(describeTrend({ progress: 0, regress: 0, compared: 0 }), [
    { text: 'Pas encore de tendance', direction: 'same' },
  ]);
});

check('buildSkillDetail : familles et tests faits seulement, mesures avec record, dernier et évolution', () => {
  const detail = buildSkillDetail(TESTS, 'tir');
  assert.deepEqual(
    detail.map((family) => [family.family, family.label, family.tests.map((test) => test.slug)]),
    [
      ['tir_arret', 'Frappe à l’arrêt', ['test-tir-1']],
      ['tir_surface', 'Finition dans la surface', ['test-tir-2']],
    ],
  );
  const [first] = detail[0].tests;
  assert.equal(first.lastDate, '2026-10-08');
  assert.equal(first.doneCount, 2);
  assert.deepEqual(
    first.measures.map((stat) => [stat.key, stat.record, stat.latest?.value ?? null, stat.delta.text, stat.delta.direction]),
    [
      // Barème de l'unité retiré de l'écart ; chrono qui monte : moins bien.
      ['frappes', 20, 20, '+2 pts ↑ mieux', 'better'],
      ['chrono', 4, 4.1, '+0,1 s ↓ moins bien', 'worse'],
    ],
  );
  const [single] = detail[1].tests;
  assert.equal(single.measures[0].delta.direction, 'none');
  assert.deepEqual(buildSkillDetail(TESTS, 'dribble'), []);
  assert.deepEqual(buildSkillDetail(TESTS, 'passe'), []);
});

check('buildSkillDetail : mesure jamais saisie d’un test fait, sans record ni dernier', () => {
  const tests = [
    testOf(
      'test-jonglerie-1',
      'jonglerie',
      'jonglerie_pieds',
      ['2026-10-02'],
      [measure('pied_droit', '', true), measure('pied_gauche', '', true)],
      [['pied_droit', { value: 40, date: '2026-10-02', previousValue: null }]],
      [['pied_droit', 40]],
    ),
  ];
  const [stat] = buildSkillDetail(tests, 'jonglerie')[0].tests[0].measures.slice(1);
  assert.deepEqual(stat, {
    key: 'pied_gauche',
    name: 'Mesure pied_gauche',
    unit: '',
    record: null,
    latest: null,
    delta: { text: '', direction: 'none' },
  });
});

check('joinCaption : parties non vides, séparées par « · »', () => {
  assert.equal(joinCaption(['Milieu relayeur', null, ' FC Vaulx ', '', 'Régional 2']), 'Milieu relayeur · FC Vaulx · Régional 2');
  assert.equal(joinCaption([undefined, '  ', null]), null);
});

check('initialsOf : deux lettres, premier et dernier mot, ou les deux premières d’un seul mot', () => {
  assert.equal(initialsOf('Karim Mansouri'), 'KM');
  assert.equal(initialsOf('Jean-Pierre Papin'), 'JP');
  assert.equal(initialsOf('  zizou '), 'ZI');
  assert.equal(initialsOf('élodie de la Tour'), 'ÉT');
  assert.equal(initialsOf('A'), 'A');
  assert.equal(initialsOf(''), null);
  assert.equal(initialsOf('   '), null);
  assert.equal(initialsOf(null), null);
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
