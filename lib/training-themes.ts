import type { SheetKind } from './sheet-types';

// Thèmes de l'onglet Entraînement : liste fermée, une carte par thème sur
// l'onglet, puis la liste de ses fiches (app/training/[theme].tsx). Une fiche
// appartient à un seul thème, déduit de kind et de skill.

/** skill des fiches de récupération (étirements, massages, mental). */
export const RECOVERY_SKILL = 'recuperation';

export type TrainingTheme = {
  /** Segment d'URL : /training/tests. */
  key: string;
  label: string;
  /** Fiches lues pour ce thème. */
  kind: SheetKind;
  /** « 1 test », « 3 tests » ; 0 au singulier. */
  noun: { singular: string; plural: string };
  /** État vide de la liste : ce qui manque et pourquoi (aucun bouton : le contenu vient des seeds). */
  empty: { title: string; message: string };
};

export const TRAINING_THEMES = [
  {
    key: 'tests',
    label: 'Tests',
    kind: 'test',
    noun: { singular: 'test', plural: 'tests' },
    empty: { title: 'Aucun test', message: 'Le contenu d’entraînement n’est pas encore chargé dans la base.' },
  },
  {
    key: 'specifique',
    label: 'Entraînements spécifiques',
    kind: 'training',
    noun: { singular: 'fiche', plural: 'fiches' },
    empty: { title: 'Aucune fiche', message: 'Le contenu d’entraînement n’est pas encore chargé dans la base.' },
  },
  {
    key: 'recuperation',
    label: 'Récupération',
    kind: 'training',
    noun: { singular: 'fiche', plural: 'fiches' },
    empty: { title: 'Bientôt : étirements, massages, mental', message: 'Aucune fiche de récupération pour l’instant.' },
  },
] as const satisfies readonly TrainingTheme[];

export type TrainingThemeKey = (typeof TRAINING_THEMES)[number]['key'];

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

/** Thème d'une fiche : un test va dans Tests ; une fiche de lecture, en Récupération ou en Entraînements spécifiques selon skill. */
export function sheetTheme(sheet: { kind: string; skill: string }): TrainingThemeKey {
  if (sheet.kind === 'test') {
    return 'tests';
  }
  return sheet.skill === RECOVERY_SKILL ? 'recuperation' : 'specifique';
}
