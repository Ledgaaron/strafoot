// Contenu attendu des colonnes jsonb, que supabase gen types type en `Json`.
// Volontairement hors de lib/types.ts, écrasé à chaque génération.
// training_sheets.exercises et training_sheets.intro : lib/sheet-types.ts.

/** Élément de questions.options (exactement 4 par question). */
export type QuestionOption = {
  text: string;
  score: 0 | 1 | 2 | 3;
  explanation: string;
};
