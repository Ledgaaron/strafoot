import { localDateOfTimestamp, shiftDay, startOfLocalDayTimestamp } from '../dates';
import { supabase } from '../supabase';
import type { DbResult } from './result';

/**
 * Jours locaux distincts (YYYY-MM-DD) ayant au moins une réponse entre from et
 * to inclus, du plus récent au plus ancien. answered_at est un timestamptz : les
 * bornes sont les minuits locaux de from et du lendemain de to.
 */
export async function listAnswerDays({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<DbResult<string[]>> {
  const { data, error } = await supabase
    .from('answers')
    .select('answered_at')
    .gte('answered_at', startOfLocalDayTimestamp(from))
    .lt('answered_at', startOfLocalDayTimestamp(shiftDay(to, 1)))
    .order('answered_at', { ascending: false });
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: [...new Set(data.map((row) => localDateOfTimestamp(row.answered_at)))], error: null };
}
