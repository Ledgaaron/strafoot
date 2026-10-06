import { supabase } from '../supabase';
import type { Tables } from '../types';
import type { DbResult } from './result';

export type SessionRow = Tables<'sessions'>;

/** Séances entre deux jours locaux inclus (YYYY-MM-DD), les plus récentes d'abord. */
export async function listSessions({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<DbResult<SessionRow[]>> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  return { data, error: error?.message ?? null };
}
