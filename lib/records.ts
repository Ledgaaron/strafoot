// Records des mesures : meilleure valeur selon higher_is_better (le plus grand
// score, le plus petit chrono), nouveau record à l'enregistrement d'un test,
// dernier résultat de chaque mesure avec la valeur du précédent (tendances du
// Profil) et records battus, les plus récents d'abord (Accueil). Calcul pur,
// sans dépendance native : testé par lib/records.test.ts
// (npx tsx lib/records.test.ts).

import { timestampMs } from './dates';

/** Dernier résultat d'une mesure et la valeur de celui d'avant. */
export type MeasureLatest = {
  value: number;
  /** Jour local (YYYY-MM-DD) du dernier résultat. */
  date: string;
  /** Valeur de l'avant-dernier résultat ; null si la mesure n'en a qu'un. */
  previousValue: number | null;
};

/** Meilleure valeur selon le sens (max si higherIsBetter, min sinon) ; null sans valeur. */
export function bestValue(values: readonly number[], higherIsBetter: boolean): number | null {
  let best: number | null = null;
  for (const value of values) {
    // NaN ou Infinity viennent d'une saisie corrompue : ils ne battent rien.
    if (Number.isFinite(value) && (best === null || isBetter(value, best, higherIsBetter))) {
      best = value;
    }
  }
  return best;
}

/**
 * Record de chaque mesure (key → meilleure valeur) à partir de résultats { key, value } ;
 * le sens de chaque key vient de higherIsBetterByKey ; un résultat dont la key n'y est pas
 * est ignoré ; une mesure sans résultat est absente. Une valeur non finie est écartée,
 * comme dans bestValue.
 */
export function recordsByKey(
  results: readonly { key: string; value: number }[],
  higherIsBetterByKey: ReadonlyMap<string, boolean>,
): Map<string, number> {
  const records = new Map<string, number>();
  for (const { key, value } of results) {
    const higherIsBetter = higherIsBetterByKey.get(key);
    if (higherIsBetter === undefined || !Number.isFinite(value)) {
      continue;
    }
    const current = records.get(key);
    if (current === undefined || isBetter(value, current, higherIsBetter)) {
      records.set(key, value);
    }
  }
  return records;
}

/**
 * Dernier résultat de chaque mesure (key → résultat) avec la valeur de
 * l'avant-dernier, à partir de résultats déjà triés du plus récent au plus ancien
 * (jour, puis saisie) : le premier vu d'une key est son dernier, le deuxième son
 * avant-dernier. Une mesure sans résultat est absente.
 */
export function latestByKey(
  results: readonly { key: string; value: number; date: string }[],
): Map<string, MeasureLatest> {
  const latest = new Map<string, MeasureLatest>();
  for (const { key, value, date } of results) {
    const known = latest.get(key);
    if (known === undefined) {
      latest.set(key, { value, date, previousValue: null });
    } else if (known.previousValue === null) {
      // value est un nombre : une fois posé, previousValue le reste.
      latest.set(key, { ...known, previousValue: value });
    }
  }
  return latest;
}

/**
 * Nouveau record : strictement meilleur que le record précédent selon le sens ; false sans
 * record précédent (premier résultat : rien à battre) et à égalité. Une valeur non finie
 * n'est jamais un record (Infinity battrait tout score).
 */
export function isNewRecord(value: number, previous: number | null, higherIsBetter: boolean): boolean {
  if (previous === null || !Number.isFinite(value)) {
    return false;
  }
  return isBetter(value, previous, higherIsBetter);
}

/** Résultat d'une mesure (testId : sa ligne du catalogue tests), pour l'historique des records. */
export type RecordSource = { testId: string; value: number; date: string; created_at: string };

/** Record battu : le résultat et le record qu'il a battu (previous). */
export type RecordEvent = RecordSource & { previous: number };

/**
 * Records battus, du plus récent au plus ancien (jour, puis saisie) : un
 * résultat strictement meilleur que tous les précédents de sa mesure, dans
 * l'ordre jour puis saisie ; le premier résultat d'une mesure n'en est pas un,
 * une égalité non plus. Le sens de chaque mesure vient de higherIsBetterById ;
 * une mesure absente de la table est ignorée, une valeur non finie écartée.
 * limit : les plus récents seulement (Accueil : 3).
 */
export function recordHistory(
  results: readonly RecordSource[],
  higherIsBetterById: ReadonlyMap<string, boolean>,
  limit?: number,
): RecordEvent[] {
  const chronological = results
    .filter((result) => Number.isFinite(result.value) && higherIsBetterById.has(result.testId))
    .sort((a, b) => compareEntries(a, b));
  const best = new Map<string, number>();
  const events: RecordEvent[] = [];
  for (const result of chronological) {
    const higherIsBetter = higherIsBetterById.get(result.testId) ?? true;
    const previous = best.get(result.testId);
    if (previous === undefined) {
      best.set(result.testId, result.value);
    } else if (isBetter(result.value, previous, higherIsBetter)) {
      best.set(result.testId, result.value);
      events.push({ ...result, previous });
    }
  }
  const latestFirst = events.reverse();
  return limit === undefined ? latestFirst : latestFirst.slice(0, limit);
}

/** Ordre d'enregistrement : jour, puis instant de saisie. */
function compareEntries(a: RecordSource, b: RecordSource): number {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }
  return timestampMs(a.created_at) - timestampMs(b.created_at);
}

/** Strictement meilleur : plus grand si higherIsBetter, plus petit sinon (chrono). */
function isBetter(value: number, other: number, higherIsBetter: boolean): boolean {
  return higherIsBetter ? value > other : value < other;
}
