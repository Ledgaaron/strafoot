import { ALL_POSITIONS, POSITIONS, type PositionKey, type TaxonomyEntry } from './quiz-taxonomy';

// Taxonomie du profil : listes fermées, seule source de vérité côté app (clé +
// libellé). Les contraintes profiles_main_position_check,
// profiles_secondary_position_check et profiles_strong_foot_check (migration
// 005) reprennent les clés à l'identique : changer une liste demande une
// nouvelle migration.

export { positionLabel } from './quiz-taxonomy';

/** Poste d'un joueur : un poste du quizz, sauf 'tous' (qui qualifie une question, pas un joueur). */
export type ProfilePositionKey = Exclude<PositionKey, typeof ALL_POSITIONS>;

type ProfilePosition = Extract<(typeof POSITIONS)[number], { key: ProfilePositionKey }>;

/** Les 8 postes de POSITIONS (lib/quiz-taxonomy.ts), dans le même ordre, sans 'tous'. */
export const PROFILE_POSITIONS: readonly ProfilePosition[] = POSITIONS.filter(
  (entry): entry is ProfilePosition => entry.key !== ALL_POSITIONS,
);

export const PROFILE_POSITION_KEYS: readonly ProfilePositionKey[] = PROFILE_POSITIONS.map((entry) => entry.key);

export const STRONG_FEET = [
  { key: 'droit', label: 'Droit' },
  { key: 'gauche', label: 'Gauche' },
  { key: 'ambidextre', label: 'Ambidextre' },
] as const satisfies readonly TaxonomyEntry[];

export type StrongFootKey = (typeof STRONG_FEET)[number]['key'];

export const STRONG_FOOT_KEYS: readonly StrongFootKey[] = STRONG_FEET.map((entry) => entry.key);

export function isProfilePositionKey(value: string): value is ProfilePositionKey {
  return PROFILE_POSITION_KEYS.some((key) => key === value);
}

export function isStrongFootKey(value: string): value is StrongFootKey {
  return STRONG_FOOT_KEYS.some((key) => key === value);
}

/** Libellé d'une valeur lue en base ; la valeur brute si elle n'est pas dans la liste. */
export function strongFootLabel(value: string): string {
  return STRONG_FEET.find((entry) => entry.key === value)?.label ?? value;
}
