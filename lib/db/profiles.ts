import { supabase } from '../supabase';
import type { Tables } from '../types';
import type { DbResult } from './result';

export type ProfileRow = Tables<'profiles'>;

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
