// Tests de lib/suggestion.ts, sans framework : npx tsx lib/suggestion.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import type { GoalState } from './goals';
import type { MeasureLatest } from './records';
import { formatSuggestionReason, suggestTest, type SuggestionGoal, type SuggestionTest } from './suggestion';

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

// Mardi 20 octobre 2026.
const TODAY = '2026-10-20';
const NO_GOAL: SuggestionGoal[] = [];
/** États d'un objectif actif (lib/goals.ts). */
const ONGOING: GoalState = { kind: 'ongoing', daysLeft: 20 };
const REACHED: GoalState = { kind: 'reached', date: '2026-10-01' };

/** Objectif actif sur le test slug ; en cours par défaut. */
function goal(slug: string, state: GoalState = ONGOING): SuggestionGoal {
  return { slug, state };
}

type Measure = { key: string; higherIsBetter?: boolean; latest?: MeasureLatest };

function test(slug: string, skill: string, lastDate: string | null, measures: Measure[] = []): SuggestionTest {
  return {
    slug,
    skill,
    lastDate,
    exercise: {
      measures: measures.map((measure) => ({
        key: measure.key,
        unit: 'touches',
        higher_is_better: measure.higherIsBetter ?? true,
      })),
    },
    latest: new Map(
      measures.flatMap((measure): [string, MeasureLatest][] =>
        measure.latest === undefined ? [] : [[measure.key, measure.latest]],
      ),
    ),
  };
}

/** Dernier résultat d'une mesure et le précédent. */
function latest(value: number, previousValue: number | null, date = '2026-10-15'): MeasureLatest {
  return { value, date, previousValue };
}

check('aucun test : rien à suggérer', () => {
  assert.equal(suggestTest([], NO_GOAL, TODAY), null);
});

check('1. test d’un objectif pas fait depuis 7 jours, avant un test jamais fait', () => {
  const tests = [test('jamais', 'tir', null), test('objectif', 'passe', '2026-10-13'), test('autre', 'tir', '2026-10-01')];
  const suggestion = suggestTest(tests, [goal('objectif')], TODAY);
  assert.equal(suggestion?.test.slug, 'objectif');
  assert.deepEqual(suggestion?.reason, { kind: 'goal' });
});

check('1. test d’objectif fait il y a 6 jours : on passe à la règle suivante', () => {
  const tests = [test('objectif', 'passe', '2026-10-14'), test('jamais', 'tir', null)];
  const suggestion = suggestTest(tests, [goal('objectif')], TODAY);
  assert.equal(suggestion?.test.slug, 'jamais');
  assert.deepEqual(suggestion?.reason, { kind: 'never' });
});

check('1. plusieurs tests d’objectif : le plus ancien, jamais fait d’abord', () => {
  const tests = [test('a', 'tir', '2026-10-01'), test('b', 'tir', null), test('c', 'tir', '2026-09-01')];
  assert.equal(suggestTest(tests, [goal('a'), goal('b'), goal('c')], TODAY)?.test.slug, 'b');
  assert.equal(suggestTest(tests, [goal('a'), goal('c')], TODAY)?.test.slug, 'c');
});

check('1. objectif atteint : son test ne passe plus en premier', () => {
  const tests = [test('jamais', 'tir', null), test('objectif', 'passe', '2026-10-01')];
  // En cours, il passerait avant le test jamais fait…
  assert.equal(suggestTest(tests, [goal('objectif')], TODAY)?.test.slug, 'objectif');
  // … atteint, il ne déclenche plus le critère 1 : la règle continue (jamais fait).
  const suggestion = suggestTest(tests, [goal('objectif', REACHED)], TODAY);
  assert.equal(suggestion?.test.slug, 'jamais');
  assert.deepEqual(suggestion?.reason, { kind: 'never' });
});

check('1. objectif atteint et objectif en cours : seul celui en cours compte', () => {
  const tests = [test('atteint', 'tir', '2026-09-01'), test('en-cours', 'passe', '2026-10-05')];
  const suggestion = suggestTest(tests, [goal('atteint', REACHED), goal('en-cours')], TODAY);
  assert.equal(suggestion?.test.slug, 'en-cours');
  assert.deepEqual(suggestion?.reason, { kind: 'goal' });
});

check('1. échéance dépassée ou pas encore mesuré : le critère 1 vaut toujours', () => {
  const tests = [test('jamais', 'tir', null), test('objectif', 'passe', '2026-10-01')];
  assert.equal(suggestTest(tests, [goal('objectif', { kind: 'overdue' })], TODAY)?.test.slug, 'objectif');
  assert.equal(suggestTest(tests, [goal('objectif', { kind: 'unmeasured' })], TODAY)?.test.slug, 'objectif');
});

check('2. jamais faits : l’ordre du catalogue', () => {
  const tests = [test('fait', 'tir', '2026-10-19'), test('premier', 'tir', null), test('second', 'passe', null)];
  assert.equal(suggestTest(tests, NO_GOAL, TODAY)?.test.slug, 'premier');
});

check('3. le plus anciennement fait, à 14 jours ou plus', () => {
  const tests = [test('recent', 'tir', '2026-10-19'), test('vieux', 'passe', '2026-10-06'), test('moyen', 'tir', '2026-10-10')];
  const suggestion = suggestTest(tests, NO_GOAL, TODAY);
  assert.equal(suggestion?.test.slug, 'vieux');
  assert.deepEqual(suggestion?.reason, { kind: 'stale', lastDate: '2026-10-06' });
  assert.equal(formatSuggestionReason(suggestion?.reason ?? { kind: 'never' }, TODAY), 'Pas fait depuis le 6 oct.');
});

check('3. à égalité de jour : l’ordre du catalogue', () => {
  const tests = [test('a', 'tir', '2026-10-01'), test('b', 'passe', '2026-10-01')];
  assert.equal(suggestTest(tests, NO_GOAL, TODAY)?.test.slug, 'a');
});

check('4. tout a moins de 14 jours : la compétence qui a le plus de mesures en recul', () => {
  const tests = [
    test('tir-1', 'tir', '2026-10-08', [{ key: 't1', latest: latest(5, 8) }]),
    test('passe-1', 'passe', '2026-10-12', [
      { key: 'p1', latest: latest(4, 6) },
      { key: 'p2', latest: latest(3, 7) },
    ]),
    test('passe-2', 'passe', '2026-10-10', [{ key: 'p3', latest: latest(9, 7) }]),
  ];
  const suggestion = suggestTest(tests, NO_GOAL, TODAY);
  // Passe : 2 mesures en recul contre 1 au tir ; son test le plus ancien.
  assert.equal(suggestion?.test.slug, 'passe-2');
  assert.deepEqual(suggestion?.reason, { kind: 'regress' });
  assert.equal(formatSuggestionReason({ kind: 'regress' }, TODAY), 'En recul');
});

check('4. un chrono qui monte est un recul', () => {
  const tests = [
    test('sprint', 'physique', '2026-10-15', [{ key: 's', higherIsBetter: false, latest: latest(4.5, 4.3) }]),
    test('jongle', 'jonglerie', '2026-10-09', [{ key: 'j', latest: latest(30, 20) }]),
  ];
  assert.equal(suggestTest(tests, NO_GOAL, TODAY)?.test.slug, 'sprint');
});

check('5. aucun recul : le test le plus ancien', () => {
  const tests = [
    test('a', 'tir', '2026-10-15', [{ key: 'a1', latest: latest(9, 8) }]),
    test('b', 'tir', '2026-10-13', [{ key: 'b1', latest: latest(8, 8) }]),
    test('c', 'passe', '2026-10-19', [{ key: 'c1', latest: latest(5, null) }]),
  ];
  const suggestion = suggestTest(tests, NO_GOAL, TODAY);
  assert.equal(suggestion?.test.slug, 'b');
  assert.deepEqual(suggestion?.reason, { kind: 'oldest', lastDate: '2026-10-13' });
  assert.equal(formatSuggestionReason(suggestion?.reason ?? { kind: 'never' }, TODAY), 'Fait le 13 oct.');
});

check('formatSuggestionReason : libellés', () => {
  assert.equal(formatSuggestionReason({ kind: 'goal' }, TODAY), 'Objectif');
  assert.equal(formatSuggestionReason({ kind: 'never' }, TODAY), 'Jamais fait');
  assert.equal(formatSuggestionReason({ kind: 'oldest', lastDate: '2026-10-19' }, TODAY), 'Fait hier');
  assert.equal(formatSuggestionReason({ kind: 'oldest', lastDate: '2026-10-17' }, TODAY), 'Fait il y a 3 j');
  assert.equal(formatSuggestionReason({ kind: 'oldest', lastDate: '2026-10-13' }, TODAY), 'Fait le 13 oct.');
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
