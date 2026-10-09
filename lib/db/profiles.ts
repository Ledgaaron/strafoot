import type { ProfilePositionKey, StrongFootKey } from '../profile-taxonomy';
import { supabase } from '../supabase';
import type { Tables } from '../types';
import type { DbResult } from './result';

export type ProfileRow = Tables<'profiles'>;

/**
 * Champs modifiables du profil ; une clé absente n'est pas modifiée. Jamais de
 * user_id : il vient du JWT (défaut auth.uid() en base et trigger set_user_id).
 */
export type ProfilePatch = {
  /**
   * Nom affiché dans l'en-tête du Profil, d'où les initiales de l'avatar ; 40
   * caractères au plus (limite de l'écran d'édition).
   */
  display_name?: string | null;
  main_position?: ProfilePositionKey | null;
  secondary_position?: ProfilePositionKey | null;
  strong_foot?: StrongFootKey | null;
  club?: string | null;
  club_level?: string | null;
  /** Jour YYYY-MM-DD. */
  birth_date?: string | null;
  /**
   * Objectif, 140 caractères au plus. N'est plus modifié par l'app depuis le
   * chantier 12 (objectifs : chantier 14) : la valeur en base est conservée.
   */
  goal?: string | null;
  /**
   * Échéance de l'objectif, jour YYYY-MM-DD. N'est plus modifiée par l'app
   * depuis le chantier 12 (objectifs : chantier 14), comme goal.
   */
  goal_deadline?: string | null;
};

/** Profil de l'utilisateur connecté (la RLS ne laisse voir que le sien), ou null s'il n'en a pas. */
export async function getMyProfile(): Promise<DbResult<ProfileRow>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return { data, error: error?.message ?? null };
}

/**
 * Crée le profil de l'utilisateur connecté s'il n'en a pas, le modifie sinon :
 * un seul upsert sur l'index unique profiles (user_id) de la migration 005. À
 * la création, user_id vient du JWT (le trigger le pose avant le test de
 * conflit) et les champs absents du patch restent null ; à la modification,
 * seuls les champs du patch changent. Renvoie la ligne enregistrée.
 */
export async function upsertMyProfile(patch: ProfilePatch): Promise<DbResult<ProfileRow>> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(patch, { onConflict: 'user_id' })
    .select()
    .single();
  return { data, error: error?.message ?? null };
}
