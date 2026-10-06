// Évolution d'une mesure entre ses deux derniers résultats, et format des
// valeurs affichées. Calcul pur, sans dépendance : testé par
// lib/measure-delta.test.ts (npx tsx lib/measure-delta.test.ts).

/** better / worse : selon higher_is_better ; same : égalité ; none : pas d'avant-dernier résultat. */
export type DeltaDirection = 'better' | 'worse' | 'same' | 'none';

export type Delta = {
  /** Texte affiché tel quel : « +2 pts ↑ mieux », « −0,4 s ↑ mieux », « = » ; vide si direction vaut none. */
  text: string;
  direction: DeltaDirection;
};

/** Signe moins typographique (U+2212) : jamais le trait d'union. */
const MINUS = '−';
/** Au-delà, un écart vient de l'arrondi binaire (0,1 + 0,2), pas de la saisie. */
const MAX_DECIMALS = 10;
/** Barème en fin d'unité de score : « /30 » dans « pts /30 », « /10 ». */
const SCALE_SUFFIX = /\s*\/\s*\d+(?:[.,]\d+)?\s*$/;
/** Le sens se lit dans le texte : la couleur n'est jamais seule à le porter. */
const DIRECTION_LABELS = { better: '↑ mieux', worse: '↓ moins bien' } as const;

/**
 * Évolution = dernière valeur − avant-dernière, signée avec l'unité, puis le
 * sens selon higherIsBetter : un chrono qui baisse s'améliore (« −0,4 s ↑ mieux »).
 * Égalité : « = ». L'écart est arrondi au nombre de décimales des valeurs
 * (16,2 − 15,5 donne 0,7, pas 0,6999999999999993). Le barème d'une unité de
 * score ne se répète pas dans l'écart : 18 → 20 en « pts /30 » donne « +2 pts »,
 * 6 → 8 en « /10 » donne « +2 ».
 */
export function describeDelta(
  latest: number,
  previous: number | null,
  unit: string,
  higherIsBetter: boolean,
): Delta {
  if (previous === null) {
    return { text: '', direction: 'none' };
  }
  const decimals = Math.min(Math.max(decimalCount(latest), decimalCount(previous)), MAX_DECIMALS);
  const delta = Number((latest - previous).toFixed(decimals));
  // -0 (écart négatif arrondi à zéro) est égal à 0 : égalité aussi.
  if (delta === 0) {
    return { text: '=', direction: 'same' };
  }
  const direction = (delta > 0) === higherIsBetter ? 'better' : 'worse';
  const deltaUnit = unit.replace(SCALE_SUFFIX, '').trim();
  const amount = `${delta > 0 ? '+' : ''}${formatDecimal(delta)}`;
  return {
    text: `${deltaUnit === '' ? amount : `${amount} ${deltaUnit}`} ${DIRECTION_LABELS[direction]}`,
    direction,
  };
}

/** « 12,5 », « −3 » : virgule et signe moins écrits à la main (Intl diffère entre web et Hermes). */
export function formatDecimal(value: number): string {
  const digits = String(Math.abs(value)).replace('.', ',');
  return value < 0 ? `${MINUS}${digits}` : digits;
}

/** Valeur suivie de son unité : « 12,5 s », « 18 pts /30 », « 8 /10 ». */
export function formatMeasure(value: number, unit: string): string {
  const trimmed = unit.trim();
  return trimmed === '' ? formatDecimal(value) : `${formatDecimal(value)} ${trimmed}`;
}

/** Décimales écrites par String (12.5 → 1, 4.32 → 2) ; MAX_DECIMALS pour une écriture à exposant. */
function decimalCount(value: number): number {
  const text = String(value);
  if (/e/i.test(text)) {
    return MAX_DECIMALS;
  }
  const point = text.indexOf('.');
  return point === -1 ? 0 : text.length - point - 1;
}
