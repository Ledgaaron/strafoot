import { supabase } from '../supabase';
import type { Tables } from '../types';
import type { DbResult } from './result';

export type TrainingSheetRow = Tables<'training_sheets'>;
export type TestRow = Tables<'tests'>;

/** Fiches d'entraînement, par titre. */
export async function listTrainingSheets(): Promise<DbResult<TrainingSheetRow[]>> {
  const { data, error } = await supabase
    .from('training_sheets')
    .select('*')
    .order('title', { ascending: true });
  return { data, error: error?.message ?? null };
}

/** Tests physiques et techniques, par nom. */
export async function listTests(): Promise<DbResult<TestRow[]>> {
  const { data, error } = await supabase
    .from('tests')
    .select('*')
    .order('name', { ascending: true });
  return { data, error: error?.message ?? null };
}
