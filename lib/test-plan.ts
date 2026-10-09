// Session de tests : proposée (la famille la moins testée récemment) ou composée
// pour une famille choisie ; ses tests les moins récents, complétés s'ils sont trop
// peu par les autres familles de la compétence, jamais par une famille écartée,
// dans un ordre de passage fixe. Calcul pur, sans dépendance native : testé par
// lib/test-plan.test.ts (npx tsx lib/test-plan.test.ts).

import { shiftDay } from './dates';
import { familyIndex, getFamily, sessionRank, type FamilyKey, type SkillKey } from './test-families';

export type PlanTest = { slug: string; family: FamilyKey; durationMin: number };

/** Un test fait un jour : une entrée par résultat, doublons permis (dédoublonnés par (slug, date)). */
export type PlanHistoryEntry = { slug: string; date: string };

export type SessionProposal = {
  /** Famille de la session : la moins testée récemment (proposeSession), ou celle choisie (composeSession). */
  family: FamilyKey;
  skill: SkillKey;
  /** Tests retenus, dans l'ordre de passage de la session. */
  tests: PlanTest[];
  /** Somme des durées des tests. */
  durationMin: number;
};

/** Fenêtre « récemment », aujourd'hui compris. */
export const RECENT_DAYS = 28;
/** En deçà, la session est complétée par les autres familles de la compétence. */
export const MIN_SESSION_TESTS = 3;
export const MAX_SESSION_TESTS = 4;
export const MAX_SESSION_MIN = 60;

/** Historique d'un test : dernier jour fait (null si jamais) et jours distincts dans la fenêtre récente. */
type TestStats = { lastDate: string | null; recentDays: Set<string> };

/** Test du catalogue avec sa place d'entrée (dernier départage) et son historique. */
type RankedTest = { test: PlanTest; index: number; stats: TestStats };

type FamilySummary = { family: FamilyKey; recentCount: number; lastDate: string | null };

/**
 * Session proposée pour le jour local now (YYYY-MM-DD), ou null si aucune
 * famille n'est candidate. tests suit l'ordre du catalogue, dernier départage.
 * - Famille : celles qui ont un test tenant seul en MAX_SESSION_MIN, hors
 *   excluded ; la moins testée sur RECENT_DAYS jours (couples (slug, date)
 *   distincts), puis jamais testée d'abord, puis la plus anciennement testée,
 *   puis l'ordre de TEST_FAMILIES.
 * - Tests et ordre de passage : ceux de composeSession pour cette famille. La
 *   complétion ne prend aucun test d'une famille de excluded : « Changer de
 *   famille » ne reprend pas les tests de la famille écartée.
 * Un historique dont le slug n'est pas dans tests est ignoré ; une date après
 * now compte comme récente.
 */
export function proposeSession(
  tests: readonly PlanTest[],
  history: readonly PlanHistoryEntry[],
  now: string,
  excluded: readonly FamilyKey[] = [],
): SessionProposal | null {
  const ranked = rankTests(tests, history, now);
  const chosen = summarizeFamilies(ranked, excluded).sort(compareFamilies)[0];
  if (chosen === undefined) {
    return null;
  }
  // Famille candidate : un de ses tests tient seul en MAX_SESSION_MIN, la composition n'est pas null.
  return composeRanked(ranked, chosen.family, excluded);
}

/**
 * Session de la famille choisie pour le jour local now (YYYY-MM-DD), ou null si
 * aucun de ses tests n'est retenu (famille absente de tests, ou chacun de ses
 * tests dépasse MAX_SESSION_MIN). family est prise même si elle figure dans
 * excluded, qui ne vaut que pour la complétion.
 * - Tests : ceux de la famille, jamais faits d'abord puis les plus anciens, puis
 *   l'ordre d'entrée, jusqu'à MAX_SESSION_TESTS et MAX_SESSION_MIN (un test trop
 *   long est sauté) ; en deçà de MIN_SESSION_TESTS, complétés jusqu'à ce nombre
 *   par les autres familles de la même compétence hors excluded, même priorité.
 * - Ordre de passage : sessionRank (vitesse, agilité, les autres, endurance),
 *   puis ordre d'entrée.
 * Un historique dont le slug n'est pas dans tests est ignoré.
 */
export function composeSession(
  tests: readonly PlanTest[],
  history: readonly PlanHistoryEntry[],
  now: string,
  family: FamilyKey,
  excluded: readonly FamilyKey[] = [],
): SessionProposal | null {
  return composeRanked(rankTests(tests, history, now), family, excluded);
}

/** Chaque test avec sa place d'entrée et son historique. */
function rankTests(tests: readonly PlanTest[], history: readonly PlanHistoryEntry[], now: string): RankedTest[] {
  const stats = collectStats(tests, history, now);
  return tests.map((test, index) => ({
    test,
    index,
    // Toujours présent : collectStats crée une entrée par slug de tests.
    stats: stats.get(test.slug) ?? { lastDate: null, recentDays: new Set<string>() },
  }));
}

/** Composition commune à proposeSession et composeSession, la famille une fois connue (règles : composeSession). */
function composeRanked(
  ranked: readonly RankedTest[],
  family: FamilyKey,
  excluded: readonly FamilyKey[],
): SessionProposal | null {
  const skill = getFamily(family).skill;

  const selected: RankedTest[] = [];
  takeByPriority(
    ranked.filter((candidate) => candidate.test.family === family),
    selected,
    MAX_SESSION_TESTS,
  );
  if (selected.length === 0) {
    return null;
  }
  if (selected.length < MIN_SESSION_TESTS) {
    takeByPriority(
      ranked.filter(
        (candidate) =>
          candidate.test.family !== family &&
          !excluded.includes(candidate.test.family) &&
          getFamily(candidate.test.family).skill === skill,
      ),
      selected,
      MIN_SESSION_TESTS,
    );
  }

  // Ordre fixe, indépendant de l'historique : résultats comparables d'une session à l'autre.
  selected.sort((a, b) => sessionRank(a.test.family) - sessionRank(b.test.family) || a.index - b.index);
  return {
    family,
    skill,
    tests: selected.map((candidate) => candidate.test),
    durationMin: totalDuration(selected),
  };
}

/** Dernier jour et jours récents de chaque slug de tests ; le reste de l'historique est ignoré. */
function collectStats(
  tests: readonly PlanTest[],
  history: readonly PlanHistoryEntry[],
  now: string,
): Map<string, TestStats> {
  const stats = new Map<string, TestStats>();
  for (const test of tests) {
    if (!stats.has(test.slug)) {
      stats.set(test.slug, { lastDate: null, recentDays: new Set<string>() });
    }
  }
  // Jours YYYY-MM-DD : l'ordre alphabétique est l'ordre chronologique.
  const windowStart = shiftDay(now, -(RECENT_DAYS - 1));
  for (const entry of history) {
    const entryStats = stats.get(entry.slug);
    if (entryStats === undefined) {
      continue;
    }
    if (entryStats.lastDate === null || entry.date > entryStats.lastDate) {
      entryStats.lastDate = entry.date;
    }
    // Pas de borne haute : une date après now compte comme récente.
    if (entry.date >= windowStart) {
      entryStats.recentDays.add(entry.date);
    }
  }
  return stats;
}

/** Familles candidates avec leur nombre de tests récents et leur dernier jour testé. */
function summarizeFamilies(ranked: readonly RankedTest[], excluded: readonly FamilyKey[]): FamilySummary[] {
  // Slugs distincts : un slug répété dans tests ne compte pas deux fois son historique.
  const slugsByFamily = new Map<FamilyKey, Map<string, TestStats>>();
  for (const { test, stats } of ranked) {
    if (excluded.includes(test.family)) {
      continue;
    }
    const slugs = slugsByFamily.get(test.family) ?? new Map<string, TestStats>();
    slugs.set(test.slug, stats);
    slugsByFamily.set(test.family, slugs);
  }
  // Une famille dont aucun test ne tient seul dans MAX_SESSION_MIN ne donnerait aucun test.
  const playable = [...slugsByFamily].filter(([family]) =>
    ranked.some(({ test }) => test.family === family && test.durationMin <= MAX_SESSION_MIN),
  );
  return playable.map(([family, slugs]) => {
    let recentCount = 0;
    let lastDate: string | null = null;
    for (const stats of slugs.values()) {
      recentCount += stats.recentDays.size;
      if (compareLastDate(stats.lastDate, lastDate) > 0) {
        lastDate = stats.lastDate;
      }
    }
    return { family, recentCount, lastDate };
  });
}

/** La moins testée récemment, puis jamais testée, puis la plus anciennement testée, puis TEST_FAMILIES. */
function compareFamilies(a: FamilySummary, b: FamilySummary): number {
  return (
    a.recentCount - b.recentCount ||
    compareLastDate(a.lastDate, b.lastDate) ||
    familyIndex(a.family) - familyIndex(b.family)
  );
}

/**
 * Ajoute à selected les candidats par priorité (jamais faits, puis les plus
 * anciens, puis l'ordre d'entrée) tant que selected compte moins de limit tests
 * et que la durée totale reste dans MAX_SESSION_MIN ; un test trop long est sauté.
 */
function takeByPriority(candidates: readonly RankedTest[], selected: RankedTest[], limit: number): void {
  const byPriority = [...candidates].sort(
    (a, b) => compareLastDate(a.stats.lastDate, b.stats.lastDate) || a.index - b.index,
  );
  for (const candidate of byPriority) {
    if (selected.length >= limit) {
      return;
    }
    if (totalDuration(selected) + candidate.test.durationMin <= MAX_SESSION_MIN) {
      selected.push(candidate);
    }
  }
}

function totalDuration(selected: readonly RankedTest[]): number {
  return selected.reduce((sum, candidate) => sum + candidate.test.durationMin, 0);
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
