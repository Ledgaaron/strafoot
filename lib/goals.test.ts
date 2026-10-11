// Tests de lib/goals.ts, sans framework : npx tsx lib/goals.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import {
  defaultDeadline,
  formatDeadlineLine,
  formatGoalRange,
  formatGoalState,
  goalProgress,
  parseTarget,
  type GoalResult,
  type GoalSource,
} from './goals';

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

// Objectif créé le samedi 10 octobre 2026 à 10 h (UTC), échéance au 21 novembre (J+42).
const CREATED = '2026-10-10T10:00:00.000000+00:00';
const TODAY = '2026-10-20';

function goal(start: number | null, target: number, deadline = '2026-11-21'): GoalSource {
  return { created_at: CREATED, start_value: start, target_value: target, deadline };
}

function result(value: number, date: string, time = '18:00:00'): GoalResult {
  return { value, date, created_at: `${date}T${time}.000000+00:00` };
}

check('goalProgress : score, meilleur résultat depuis la création, J-32', () => {
  const progress = goalProgress(
    goal(8, 20),
    [result(15, '2026-10-01'), result(12, '2026-10-12'), result(10, '2026-10-15')],
    true,
    TODAY,
  );
  assert.equal(progress.best, 12);
  assert.equal(progress.ratio, (12 - 8) / (20 - 8));
  assert.deepEqual(progress.state, { kind: 'ongoing', daysLeft: 32 });
});

check('goalProgress : un résultat d’avant la création ne compte pas, même le même jour', () => {
  const progress = goalProgress(goal(8, 20), [result(19, '2026-10-10', '09:00:00')], true, TODAY);
  assert.equal(progress.best, null);
  assert.equal(progress.ratio, 0);
  assert.deepEqual(progress.state, { kind: 'ongoing', daysLeft: 32 });
});

check('goalProgress : chrono, le plus bas gagne et atteint la cible', () => {
  const progress = goalProgress(
    goal(5.2, 4.8),
    [result(5, '2026-10-12'), result(4.7, '2026-10-14'), result(4.9, '2026-10-16')],
    false,
    TODAY,
  );
  assert.equal(progress.best, 4.7);
  assert.equal(progress.ratio, 1);
  assert.deepEqual(progress.state, { kind: 'reached', date: '2026-10-14' });
});

check('goalProgress : atteint, même après l’échéance', () => {
  const progress = goalProgress(goal(8, 20, '2026-10-15'), [result(21, '2026-10-12')], true, TODAY);
  assert.deepEqual(progress.state, { kind: 'reached', date: '2026-10-12' });
});

check('goalProgress : échéance dépassée, jamais de J négatif', () => {
  const progress = goalProgress(goal(8, 20, '2026-10-19'), [result(12, '2026-10-12')], true, TODAY);
  assert.deepEqual(progress.state, { kind: 'overdue' });
  assert.equal(formatGoalState(progress.state, TODAY), 'Échéance dépassée');
});

check('goalProgress : jour de l’échéance, Jour J', () => {
  const progress = goalProgress(goal(8, 20, TODAY), [], true, TODAY);
  assert.deepEqual(progress.state, { kind: 'ongoing', daysLeft: 0 });
  assert.equal(formatGoalState(progress.state, TODAY), 'Jour J');
});

check('goalProgress : jamais mesuré, puis mesuré depuis la création', () => {
  const never = goalProgress(goal(null, 20), [], true, TODAY);
  assert.deepEqual(never.state, { kind: 'unmeasured' });
  assert.equal(never.ratio, 0);
  // Sans départ, le premier résultat depuis la création sert de base.
  const measured = goalProgress(goal(null, 20), [result(10, '2026-10-12'), result(15, '2026-10-14')], true, TODAY);
  assert.equal(measured.best, 15);
  assert.equal(measured.ratio, (15 - 10) / (20 - 10));
  assert.deepEqual(measured.state, { kind: 'ongoing', daysLeft: 32 });
});

check('goalProgress : un recul sous le départ reste à 0, valeurs non finies écartées', () => {
  const progress = goalProgress(goal(8, 20), [result(6, '2026-10-12'), result(Number.NaN, '2026-10-13')], true, TODAY);
  assert.equal(progress.best, 6);
  assert.equal(progress.ratio, 0);
});

check('parseTarget : nombre, virgule ou point', () => {
  assert.deepEqual(parseTarget('20', 8, 'touches', true), { value: 20, error: null });
  assert.deepEqual(parseTarget(' 4,35 ', 4.8, 's', false), { value: 4.35, error: null });
  assert.deepEqual(parseTarget('4.35', null, 's', false), { value: 4.35, error: null });
});

check('parseTarget : saisie illisible ou nulle refusée', () => {
  assert.equal(parseTarget('', 8, 'touches', true).error, 'Cible attendue : un nombre, par exemple 20 ou 12,5.');
  assert.notEqual(parseTarget('vingt', 8, 'touches', true).error, null);
  assert.notEqual(parseTarget('-3', null, 'touches', true).error, null);
  assert.equal(parseTarget('0', null, 'touches', true).error, 'Cible attendue : un nombre plus grand que 0.');
});

check('parseTarget : la cible doit battre le départ, dans le sens de la mesure', () => {
  assert.equal(parseTarget('8', 8, 'touches', true).error, 'Cible à viser au-dessus du départ (8 touches).');
  assert.equal(
    parseTarget('5,2', 4.8, 's', false).error,
    'Cible à viser sous le départ (4,8 s) : un temps plus bas est meilleur.',
  );
  assert.equal(parseTarget('4,8', 4.8, 's', false).error !== null, true);
});

check('parseTarget : barème d’une unité de score', () => {
  assert.equal(parseTarget('12', 6, '/10', true).error, 'Cible au plus 10 : le barème est sur 10.');
  assert.deepEqual(parseTarget('30', 18, 'pts /30', true), { value: 30, error: null });
});

check('formatGoalRange : départ et cible, ou cible seule', () => {
  assert.equal(formatGoalRange(8, 20, 'touches'), '8 → 20 touches');
  assert.equal(formatGoalRange(4.8, 4.5, 's'), '4,8 → 4,5 s');
  assert.equal(formatGoalRange(null, 20, 'touches'), 'Cible : 20 touches');
});

check('formatGoalState : atteint en relatif sous 7 jours, en absolu ensuite', () => {
  assert.equal(formatGoalState({ kind: 'reached', date: '2026-10-19' }, TODAY), 'Atteint ✓ hier');
  assert.equal(formatGoalState({ kind: 'reached', date: '2026-10-20' }, TODAY), 'Atteint ✓ auj.');
  assert.equal(formatGoalState({ kind: 'reached', date: '2026-10-03' }, TODAY), 'Atteint ✓ le 3 oct.');
  assert.equal(formatGoalState({ kind: 'ongoing', daysLeft: 12 }, TODAY), 'J-12');
  assert.equal(formatGoalState({ kind: 'unmeasured' }, TODAY), 'Pas encore mesuré');
});

check('defaultDeadline et formatDeadlineLine : J+42', () => {
  assert.equal(defaultDeadline('2026-10-11'), '2026-11-22');
  assert.equal(formatDeadlineLine('2026-11-22', '2026-10-11'), 'Dim. 22 nov. · J-42');
  assert.equal(formatDeadlineLine('2026-10-11', '2026-10-11'), 'Dim. 11 oct. · Jour J');
  assert.equal(formatDeadlineLine('2026-10-09', '2026-10-11'), 'Ven. 9 oct. · dépassée');
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
