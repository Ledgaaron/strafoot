import { supabase } from '../supabase';
import type { Tables } from '../types';
import type { DbResult } from './result';

/** Ligne du catalogue : une mesure (key renseignée) ou un test de démonstration (key null). */
export type TestRow = Tables<'tests'>;
export type TestResultRow = Tables<'test_results'>;

/** Dernier résultat connu d'un test du catalogue. */
export type LatestResult = {
  value: number;
  /** Jour local (YYYY-MM-DD). */
  date: string;
  /** Séance de type test qui l'a produit ; null pour un résultat sans séance (seed). */
  session_id: string | null;
};

/**
 * Champs envoyés à l'enregistrement d'un résultat. Jamais de user_id : il vient
 * du JWT (défaut auth.uid() en base et trigger set_user_id).
 */
export type TestResultInput = {
  test_id: string;
  value: number;
  date: string;
  session_id: string;
  comment?: string | null;
};

/** Catalogue des tests (une ligne par mesure), par nom. */
export async function listTestCatalog(): Promise<DbResult<TestRow[]>> {
  const { data, error } = await supabase.from('tests').select('*').order('name', { ascending: true });
  return { data, error: error?.message ?? null };
}

/**
 * Dernier résultat de chaque test demandé (test_id → résultat) : jour le plus
 * récent, puis saisie la plus récente. Un test sans résultat est absent.
 * Résultats lus du plus récent au plus ancien, dans la limite du max rows du
 * projet (1000 par défaut).
 */
export async function getLatestResults(
  testIds: readonly string[],
): Promise<DbResult<ReadonlyMap<string, LatestResult>>> {
  if (testIds.length === 0) {
    return { data: new Map(), error: null };
  }
  const { data, error } = await supabase
    .from('test_results')
    .select('test_id, value, date, session_id')
    .in('test_id', testIds)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    return { data: null, error: error.message };
  }
  const latest = new Map<string, LatestResult>();
  for (const row of data) {
    // Plus récents d'abord : le premier résultat vu pour un test est son dernier.
    if (!latest.has(row.test_id)) {
      latest.set(row.test_id, { value: row.value, date: row.date, session_id: row.session_id });
    }
  }
  return { data: latest, error: null };
}

/**
 * Enregistre les résultats d'un test en une seule requête : insert multiple,
 * atomique (tous ou aucun). Renvoie les lignes enregistrées.
 */
export async function createTestResults(
  rows: readonly TestResultInput[],
): Promise<DbResult<TestResultRow[]>> {
  const { data, error } = await supabase.from('test_results').insert([...rows]).select();
  if (error) {
    return { data: null, error: error.message };
  }
  if (data.length !== rows.length) {
    return {
      data: null,
      error: `Résultats non confirmés : ${data.length} renvoyés par Supabase sur ${rows.length} envoyés.`,
    };
  }
  return { data, error: null };
}

/** Résultats d'un test, du plus récent au plus ancien (historique, chantier 5). */
export async function listResultsForTest(testId: string): Promise<DbResult<TestResultRow[]>> {
  const { data, error } = await supabase
    .from('test_results')
    .select('*')
    .eq('test_id', testId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  return { data, error: error?.message ?? null };
}
