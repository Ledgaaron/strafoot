// Thèmes des fiches de lecture (kind training) : liste fermée, une section par
// thème dans la liste des fiches (app/training/[theme].tsx, ouverte par la carte
// Fiches du Profil ; le thème de l'URL passe en premier). Une fiche appartient à
// un seul thème, déduit de skill. Les tests ont leur propre onglet
// (lib/test-families.ts).

/** skill des fiches de récupération (étirements, massages, mental). */
export const RECOVERY_SKILL = 'recuperation';

export type TrainingTheme = {
  /** Segment d'URL : /training/specifique. */
  key: string;
  label: string;
  /** État vide de sa section : ce qui manque et pourquoi (aucun bouton : le contenu vient des seeds). */
  empty: { title: string; message: string };
};

export const TRAINING_THEMES = [
  {
    key: 'specifique',
    label: 'Entraînements spécifiques',
    empty: { title: 'Aucune fiche', message: 'Le contenu d’entraînement n’est pas encore chargé dans la base.' },
  },
  {
    key: 'recuperation',
    label: 'Récupération',
    empty: { title: 'Bientôt : étirements, massages, mental', message: 'Aucune fiche de récupération pour l’instant.' },
  },
] as const satisfies readonly TrainingTheme[];

export type TrainingThemeKey = (typeof TRAINING_THEMES)[number]['key'];

/** Thème placé en premier quand la carte Fiches du Profil ouvre la liste. */
export const DEFAULT_TRAINING_THEME: TrainingThemeKey = 'specifique';

export function isTrainingThemeKey(value: string): value is TrainingThemeKey {
  return TRAINING_THEMES.some((theme) => theme.key === value);
}

export function getTrainingTheme(key: TrainingThemeKey): TrainingTheme {
  const found = TRAINING_THEMES.find((theme) => theme.key === key);
  if (!found) {
    // Inatteignable : key est typé TrainingThemeKey.
    throw new Error(`Thème inconnu : ${key}`);
  }
  return found;
}

/** Thème d'une fiche de lecture : Récupération ou Entraînements spécifiques selon skill. */
export function sheetTheme(sheet: { skill: string }): TrainingThemeKey {
  return sheet.skill === RECOVERY_SKILL ? 'recuperation' : 'specifique';
}
