// Test suggéré pour aujourd'hui : une seule règle, partagée par l'Accueil et
// (au chantier 17) l'onglet Entraînement. Dans l'ordre :
//   1. un test d'un objectif actif non atteint, pas fait depuis 7 jours ou plus
//      (un objectif atteint reste affiché sur l'Accueil et compte dans la
//      limite de 3, mais ne déclenche plus ce critère) ;
//   2. sinon, un test jamais fait ;
//   3. sinon, le test le plus anciennement fait, s'il date de 14 jours ou plus ;
//   4. sinon, le test le plus ancien de la compétence qui a le plus de mesures
//      en recul (dernier résultat moins bon que le précédent) ;
//   5. sinon, le test le plus ancien.
// Départage : le plus ancien d'abord (jamais fait avant tout jour), puis l'ordre
// du catalogue (ordre reçu). Calcul pur, sans dépendance native : testé par
// lib/suggestion.test.ts (npx tsx lib/suggestion.test.ts).

import { daysBetween, relativeDay } from './dates';
import type { GoalState } from './goals';
import { describeDelta } from './measure-delta';
import type { MeasureLatest } from './records';

/** Ce que la règle lit d'un test atomique : TestSummary (lib/db/training.ts) le fournit tel quel. */
export type SuggestionTest = {
  slug: string;
  skill: string;
  /** Jour du dernier résultat ; null si jamais fait. */
  lastDate: string | null;
  exercise: { measures: readonly { key: string; unit: string; higher_is_better: boolean }[] };
  /** Dernier résultat de chaque mesure (key) et la valeur du précédent. */
  latest: ReadonlyMap<string, MeasureLatest>;
};

/** Objectif actif (non retiré) : le slug de son test et son état (lib/goals.ts). */
export type SuggestionGoal = { slug: string; state: GoalState };

export type SuggestionReason =
  | { kind: 'goal' }
  | { kind: 'never' }
  | { kind: 'stale'; lastDate: string }
  | { kind: 'regress' }
  | { kind: 'oldest'; lastDate: string | null };

export type Suggestion<T> = { test: T; reason: SuggestionReason };

/** Un test d'objectif revient après ce nombre de jours sans être fait. */
export const GOAL_TEST_DAYS = 7;
/** Un test fait il y a au moins ce nombre de jours est suggéré avant les tendances. */
export const STALE_TEST_DAYS = 14;
/** En deçà de 7 jours, relativeDay écrit une date passée en relatif (« hier »). */
const RELATIVE_DAY_LIMIT = 7;

/**
 * Test suggéré le jour today, avec sa raison ; null sans aucun test.
 * goals : objectifs actifs et leur état ; seuls ceux qui ne sont pas atteints
 * comptent pour le critère 1.
 */
export function suggestTest<T extends SuggestionTest>(
  tests: readonly T[],
  goals: readonly SuggestionGoal[],
  today: string,
): Suggestion<T> | null {
  const goalSlugs = new Set(goals.filter((goal) => goal.state.kind !== 'reached').map((goal) => goal.slug));
  const ranked = tests.map((test, index) => ({ test, index }));
  const oldest = (candidates: typeof ranked) =>
    [...candidates].sort((a, b) => compareLastDate(a.test.lastDate, b.test.lastDate) || a.index - b.index)[0]?.test;

  const goalTest = oldest(
    ranked.filter(
      ({ test }) =>
        goalSlugs.has(test.slug) && (test.lastDate === null || daysBetween(test.lastDate, today) >= GOAL_TEST_DAYS),
    ),
  );
  if (goalTest !== undefined) {
    return { test: goalTest, reason: { kind: 'goal' } };
  }

  const neverDone = oldest(ranked.filter(({ test }) => test.lastDate === null));
  if (neverDone !== undefined) {
    return { test: neverDone, reason: { kind: 'never' } };
  }

  // Tous les tests ont été faits au moins une fois.
  const first = oldest(ranked);
  if (first === undefined) {
    return null;
  }
  if (first.lastDate !== null && daysBetween(first.lastDate, today) >= STALE_TEST_DAYS) {
    return { test: first, reason: { kind: 'stale', lastDate: first.lastDate } };
  }

  const regressBySkill = new Map<string, number>();
  for (const test of tests) {
    regressBySkill.set(test.skill, (regressBySkill.get(test.skill) ?? 0) + countRegress(test));
  }
  const maxRegress = Math.max(0, ...regressBySkill.values());
  if (maxRegress > 0) {
    const regressing = oldest(ranked.filter(({ test }) => regressBySkill.get(test.skill) === maxRegress));
    if (regressing !== undefined) {
      return { test: regressing, reason: { kind: 'regress' } };
    }
  }

  return { test: first, reason: { kind: 'oldest', lastDate: first.lastDate } };
}

/**
 * Raison lisible : « Objectif », « Jamais fait », « Pas fait depuis le
 * 30 sept. », « En recul », « Fait il y a 3 j ».
 */
export function formatSuggestionReason(reason: SuggestionReason, today: string): string {
  switch (reason.kind) {
    case 'goal':
      return 'Objectif';
    case 'never':
      return 'Jamais fait';
    case 'stale':
      return `Pas fait depuis le ${relativeDay(reason.lastDate, today)}`;
    case 'regress':
      return 'En recul';
    case 'oldest':
      return reason.lastDate === null ? 'Jamais fait' : `Fait ${withArticle(reason.lastDate, today)}`;
  }
}

/** « hier », « il y a 3 j », sinon « le 30 sept. » (relativeDay passe en absolu à 7 jours). */
function withArticle(day: string, today: string): string {
  const label = relativeDay(day, today);
  return daysBetween(day, today) < RELATIVE_DAY_LIMIT ? label : `le ${label}`;
}

/** Mesures du test dont le dernier résultat est moins bon que le précédent. */
function countRegress(test: SuggestionTest): number {
  let count = 0;
  for (const measure of test.exercise.measures) {
    const latest = test.latest.get(measure.key);
    if (latest === undefined || latest.previousValue === null) {
      continue;
    }
    // Même comparaison que la tendance du Profil : arrondie aux décimales saisies.
    if (describeDelta(latest.value, latest.previousValue, measure.unit, measure.higher_is_better).direction === 'worse') {
      count += 1;
    }
  }
  return count;
}

/** null (jamais) avant tout jour, puis du plus ancien au plus récent. */
function compareLastDate(a: string | null, b: string | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return -1;
  }
  if (b === null) {
    return 1;
  }
  return a < b ? -1 : 1;
}
