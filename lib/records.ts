// Records des mesures : meilleure valeur selon higher_is_better (le plus grand
// score, le plus petit chrono) et nouveau record à l'enregistrement d'un test.
// Calcul pur, sans dépendance : testé par lib/records.test.ts
// (npx tsx lib/records.test.ts).

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

/** Strictement meilleur : plus grand si higherIsBetter, plus petit sinon (chrono). */
function isBetter(value: number, other: number, higherIsBetter: boolean): boolean {
  return higherIsBetter ? value > other : value < other;
}
