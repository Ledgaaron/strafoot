import { supabase } from '../supabase';
import type { Tables } from '../types';
import type { DbResult } from './result';

export type QuestionRow = Tables<'questions'>;

/** Questions, filtrées par thème exact et/ou par poste (contenu dans positions). */
export async function listQuestions({
  theme,
  position,
}: {
  theme?: string;
  position?: string;
} = {}): Promise<DbResult<QuestionRow[]>> {
  let query = supabase.from('questions').select('*');
  if (theme) {
    query = query.eq('theme', theme);
  }
  if (position) {
    query = query.contains('positions', [position]);
  }
  const { data, error } = await query.order('created_at', { ascending: true });
  return { data, error: error?.message ?? null };
}
