import type { QuestionOption } from './json-types';

// Taxonomie du quizz : listes fermées, seule source de vérité côté app (clé +
// libellé). Les contraintes questions_theme_check et questions_positions_check
// (migration 003) reprennent les clés à l'identique : changer une liste demande
// une nouvelle migration. scripts/build-seed-questions.ts valide le contenu avec.
// Aucun import à l'exécution : le script la charge hors de l'app, avec npx tsx.

export type TaxonomyEntry = { key: string; label: string };

export const THEMES = [
  { key: 'situation', label: 'Situation' },
  { key: 'tactique', label: 'Tactique' },
  { key: 'technique', label: 'Technique' },
  { key: 'culture', label: 'Culture' },
  { key: 'mental', label: 'Mental' },
] as const satisfies readonly TaxonomyEntry[];

export type ThemeKey = (typeof THEMES)[number]['key'];

export const THEME_KEYS: readonly ThemeKey[] = THEMES.map((entry) => entry.key);

export const POSITIONS = [
  { key: 'gardien', label: 'Gardien' },
  { key: 'defenseur_central', label: 'Défenseur central' },
  { key: 'lateral', label: 'Latéral' },
  { key: 'milieu_defensif', label: 'Milieu défensif' },
  { key: 'milieu_central', label: 'Milieu central' },
  { key: 'milieu_offensif', label: 'Milieu offensif' },
  { key: 'ailier', label: 'Ailier' },
  { key: 'avant_centre', label: 'Avant-centre' },
  { key: 'tous', label: 'Tous postes' },
] as const satisfies readonly TaxonomyEntry[];

export type PositionKey = (typeof POSITIONS)[number]['key'];

export const POSITION_KEYS: readonly PositionKey[] = POSITIONS.map((entry) => entry.key);

/**
 * Poste d'une question valable pour tous les postes : elle est éligible quel
 * que soit le poste filtré. Ce n'est pas un filtre : « tous postes » à l'écran
 * veut dire aucun filtre de poste.
 */
export const ALL_POSITIONS = 'tous' satisfies PositionKey;

export function isThemeKey(value: string): value is ThemeKey {
  return THEME_KEYS.some((key) => key === value);
}

export function isPositionKey(value: string): value is PositionKey {
  return POSITION_KEYS.some((key) => key === value);
}

/** Libellé d'une valeur lue en base ; la valeur brute si elle n'est pas dans la liste. */
export function themeLabel(value: string): string {
  return THEMES.find((entry) => entry.key === value)?.label ?? value;
}

/** Libellé d'une valeur lue en base ; la valeur brute si elle n'est pas dans la liste. */
export function positionLabel(value: string): string {
  return POSITIONS.find((entry) => entry.key === value)?.label ?? value;
}

/** Score maximal d'une option : une série de n questions se note sur n × 3. */
export const MAX_OPTION_SCORE = 3;

/**
 * Barème affiché. Plusieurs options peuvent valoir 3 (choix risqué ou assuré) :
 * jamais « la bonne réponse » au singulier, toujours le score de chaque option.
 */
export const SCORE_LABELS: Readonly<Record<QuestionOption['score'], string>> = {
  3: 'Bon choix',
  2: 'Défendable',
  1: 'Faible',
  0: 'Erreur',
};
