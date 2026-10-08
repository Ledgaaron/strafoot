import { isSheetKind, parseExercises, parseIntro, type Exercise, type SheetKind } from '../sheet-types';
import { supabase } from '../supabase';
import type { Tables } from '../types';
import type { DbResult } from './result';

export type SheetRow = Tables<'training_sheets'>;

/** Fiche prête à lire : kind vérifié, intro et exercices validés (format de lib/sheet-types.ts). */
export type Sheet = Omit<SheetRow, 'kind' | 'intro' | 'exercises'> & {
  kind: SheetKind;
  intro: string[];
  exercises: Exercise[];
};

/**
 * Fiches de lecture (kind 'training') ou tests (kind 'test'), par titre.
 * Lignes brutes : exercises n'est pas validé ici (voir countMeasures).
 */
export async function listSheets({ kind }: { kind: SheetKind }): Promise<DbResult<SheetRow[]>> {
  const { data, error } = await supabase
    .from('training_sheets')
    .select('*')
    .eq('kind', kind)
    .order('title', { ascending: true });
  return { data, error: error?.message ?? null };
}

/**
 * Une fiche par id, prête à lire ; data null sans erreur si elle n'existe pas
 * (ou plus). Un contenu en base hors du format des JSON est une erreur lisible.
 */
export async function getSheet(id: string): Promise<DbResult<Sheet>> {
  const { data, error } = await supabase.from('training_sheets').select('*').eq('id', id).maybeSingle();
  if (error) {
    return { data: null, error: error.message };
  }
  if (!data) {
    return { data: null, error: null };
  }
  if (!isSheetKind(data.kind)) {
    return { data: null, error: `Fiche « ${data.title} » : kind « ${data.kind} » inconnu (attendu : training ou test).` };
  }
  const intro = parseIntro(data.intro);
  if (intro.error !== null) {
    return { data: null, error: `Fiche « ${data.title} » : intro invalide en base.\n${intro.error}` };
  }
  const exercises = parseExercises(data.exercises, data.kind);
  if (exercises.error !== null) {
    return { data: null, error: `Fiche « ${data.title} » : exercices invalides en base.\n${exercises.error}` };
  }
  return { data: { ...data, kind: data.kind, intro: intro.data, exercises: exercises.data }, error: null };
}

/** Durée prévue (minutes) d'une fiche ; data null sans erreur si elle n'existe pas (ou plus). */
export async function getSheetDuration(id: string): Promise<DbResult<number>> {
  const { data, error } = await supabase.from('training_sheets').select('duration_min').eq('id', id).maybeSingle();
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data ? data.duration_min : null, error: null };
}

/** Jour (YYYY-MM-DD) de la dernière séance liée à la fiche ou au test ; null s'il n'y en a aucune. */
export async function getLastSessionForSheet(sheetId: string): Promise<DbResult<string | null>> {
  const { data, error } = await supabase
    .from('sessions')
    .select('date')
    .eq('sheet_id', sheetId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data ? data.date : null, error: null };
}

/**
 * Jour de la dernière séance liée à chaque fiche ou test (sheet_id → YYYY-MM-DD),
 * en une requête pour toute la liste de l'onglet. Une fiche sans séance est
 * absente. Séances lues de la plus récente à la plus ancienne, dans la limite du
 * max rows du projet (1000 par défaut).
 */
export async function listLastSessionDates(): Promise<DbResult<ReadonlyMap<string, string>>> {
  const { data, error } = await supabase
    .from('sessions')
    .select('sheet_id, date')
    .not('sheet_id', 'is', null)
    .order('date', { ascending: false });
  if (error) {
    return { data: null, error: error.message };
  }
  const lastDates = new Map<string, string>();
  for (const row of data) {
    // Plus récentes d'abord : la première séance vue pour une fiche est sa dernière.
    if (row.sheet_id !== null && !lastDates.has(row.sheet_id)) {
      lastDates.set(row.sheet_id, row.date);
    }
  }
  return { data: lastDates, error: null };
}
