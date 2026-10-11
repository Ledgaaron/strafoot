import { appMessage } from '../errors';
import { supabase } from '../supabase';
import type { Tables } from '../types';
import { fetchAllRows } from './fetch-all';
import type { DbResult } from './result';

/** Objectif du joueur (données de l'utilisateur, migration 011). */
export type GoalRow = Tables<'goals'>;

/**
 * Champs envoyés à la création. Jamais de user_id : il vient du JWT (défaut
 * auth.uid() en base et trigger set_user_id).
 */
export type GoalInput = {
  /**
   * Uuid tiré côté client (lib/uuid.ts) une seule fois par objectif à créer,
   * avant le premier envoi, puis renvoyé tel quel à chaque réessai : un second
   * envoi du même id ne crée pas de doublon.
   */
  id: string;
  /** Test atomique (training_sheets kind test). */
  sheet_id: string;
  /** Mesure : ligne du catalogue tests, celle des résultats et de la courbe. */
  test_id: string;
  /** Dernier résultat de la mesure à la création ; null si jamais mesurée. */
  start_value: number | null;
  target_value: number;
  /** Jour local YYYY-MM-DD. */
  deadline: string;
};

/** Champs modifiables d'un objectif actif : cible et échéance. */
export type GoalPatch = Partial<Pick<GoalInput, 'target_value' | 'deadline'>>;

/** Objectifs actifs (non retirés), du plus ancien au plus récent ; lus page par page. */
export async function listActiveGoals(): Promise<DbResult<GoalRow[]>> {
  return fetchAllRows((first, last) =>
    supabase
      .from('goals')
      .select('*')
      .is('retired_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(first, last),
  );
}

/**
 * Crée un objectif sans jamais le doubler : insert … on conflict (id) do
 * nothing, puis relecture si l'envoi était un réessai. Renvoie toujours une
 * ligne lue en base, seule confirmation de l'enregistrement. Un second objectif
 * actif sur la même mesure est refusé par l'index goals_one_active_per_test
 * (011) : error est le message brut de Postgres, que describeError lit comme un
 * doublon.
 */
export async function createGoal(input: GoalInput): Promise<DbResult<GoalRow>> {
  const { data, error } = await supabase.from('goals').upsert(input, { onConflict: 'id', ignoreDuplicates: true }).select();
  if (error) {
    return { data: null, error: error.message };
  }
  // Ligne insérée : renvoyée par l'insert. Conflit ignoré : tableau vide.
  if (data.length > 0) {
    return { data: data[0], error: null };
  }
  const existing = await supabase.from('goals').select('*').eq('id', input.id).maybeSingle();
  if (existing.error) {
    return { data: null, error: existing.error.message };
  }
  if (!existing.data) {
    return { data: null, error: appMessage('Objectif introuvable après envoi : enregistrement non confirmé.') };
  }
  return { data: existing.data, error: null };
}

/** Modifie la cible ou l'échéance d'un objectif ; renvoie la ligne à jour. */
export async function updateGoal(id: string, patch: GoalPatch): Promise<DbResult<GoalRow>> {
  const { data, error } = await supabase.from('goals').update(patch).eq('id', id).select().maybeSingle();
  if (error) {
    return { data: null, error: error.message };
  }
  if (!data) {
    return { data: null, error: appMessage('Objectif introuvable : aucune modification enregistrée.') };
  }
  return { data, error: null };
}

/**
 * Retire un objectif : il n'est plus actif, la ligne est conservée
 * (retired_at posé maintenant). Un objectif déjà retiré n'est pas touché : sa
 * date de retrait reste, et le message le dit. Renvoie la ligne à jour.
 */
export async function retireGoal(id: string): Promise<DbResult<GoalRow>> {
  const { data, error } = await supabase
    .from('goals')
    .update({ retired_at: new Date().toISOString() })
    .eq('id', id)
    .is('retired_at', null)
    .select()
    .maybeSingle();
  if (error) {
    return { data: null, error: error.message };
  }
  if (!data) {
    return { data: null, error: appMessage('Objectif introuvable ou déjà retiré : rien n’a changé.') };
  }
  return { data, error: null };
}
