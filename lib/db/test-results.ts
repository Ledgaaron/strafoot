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

/** Dernier et avant-dernier résultats d'un test du catalogue. */
export type LatestWithPrevious = {
  value: number;
  /** Jour local (YYYY-MM-DD) du dernier résultat. */
  date: string;
  /** Valeur de l'avant-dernier résultat ; null si le test n'a qu'un résultat. */
  previousValue: number | null;
};

/** Résultat d'un test, avec le commentaire de la séance qui l'a produit. */
export type TestResultWithSession = TestResultRow & {
  /** Séance d'origine ; null pour un résultat sans séance (seed) ou si la séance a été supprimée. */
  session: { comment: string | null } | null;
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

/** Une ligne du catalogue par id ; data null sans erreur si elle n'existe pas (ou plus). */
export async function getTest(id: string): Promise<DbResult<TestRow>> {
  const { data, error } = await supabase.from('tests').select('*').eq('id', id).maybeSingle();
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
 * Dernier et avant-dernier résultats de chaque test (test_id → résultats), en
 * une requête pour tout le catalogue, dans l'ordre de getLatestResults : jour le
 * plus récent, puis saisie la plus récente (deux tests le même jour se
 * départagent ainsi). Un test sans résultat est absent. Résultats lus du plus
 * récent au plus ancien, dans la limite du max rows du projet (1000 par défaut).
 */
export async function listAllLatestWithPrevious(): Promise<DbResult<ReadonlyMap<string, LatestWithPrevious>>> {
  const { data, error } = await supabase
    .from('test_results')
    .select('test_id, value, date')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    return { data: null, error: error.message };
  }
  const byTest = new Map<string, LatestWithPrevious>();
  for (const row of data) {
    const latest = byTest.get(row.test_id);
    // Plus récents d'abord : le premier résultat vu est le dernier, le deuxième
    // l'avant-dernier. value est not null : une fois posé, previousValue le reste.
    if (!latest) {
      byTest.set(row.test_id, { value: row.value, date: row.date, previousValue: null });
    } else if (latest.previousValue === null) {
      byTest.set(row.test_id, { ...latest, previousValue: row.value });
    }
  }
  return { data: byTest, error: null };
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

/**
 * Résultats d'un test, du plus récent au plus ancien (jour, puis saisie), avec
 * le commentaire de leur séance d'origine : historique d'une mesure du Profil.
 */
export async function listResultsForTest(testId: string): Promise<DbResult<TestResultWithSession[]>> {
  const { data, error } = await supabase
    .from('test_results')
    .select('*, session:sessions(comment)')
    .eq('test_id', testId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  return { data, error: error?.message ?? null };
}

/** Supprime un résultat (erreur de saisie) ; renvoie son id. La séance liée n'est pas touchée. */
export async function deleteTestResult(id: string): Promise<DbResult<string>> {
  // select('id') : sans ligne renvoyée, rien n'a été supprimé (id inconnu ou masqué par la RLS).
  const { data, error } = await supabase.from('test_results').delete().eq('id', id).select('id');
  if (error) {
    return { data: null, error: error.message };
  }
  if (data.length === 0) {
    return { data: null, error: 'Résultat introuvable : rien n’a été supprimé.' };
  }
  return { data: id, error: null };
}
