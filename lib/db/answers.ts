import { localDateOfTimestamp, localToday, shiftDay, startOfLocalDayTimestamp } from '../dates';
import { THEME_KEYS } from '../quiz-taxonomy';
import { supabase } from '../supabase';
import type { Tables } from '../types';
import type { DbResult } from './result';

export type AnswerRow = Tables<'answers'>;

/**
 * Champs envoyés à l'enregistrement d'une réponse. Jamais de user_id : il vient
 * du JWT (défaut auth.uid() en base et trigger set_user_id) ; answered_at vaut
 * now() en base au premier envoi, flagged false.
 */
export type AnswerInput = {
  /**
   * Uuid tiré côté client une seule fois, avant le premier envoi, puis renvoyé
   * tel quel à chaque réessai : un second envoi du même id ne crée pas de doublon.
   */
  id: string;
  question_id: string;
  chosen_index: number;
  score: number;
  /** Identifiant client de la série, partagé par toutes ses réponses. */
  quiz_run_id: string;
};

/** Score moyen (sur 3) des réponses d'un thème. */
export type ThemeStats = {
  theme: string;
  count: number;
  average: number;
};

export type QuizStats = {
  /** Nombre total de réponses enregistrées. */
  total: number;
  /** Score moyen (sur 3) des réponses des 7 derniers jours, aujourd'hui compris ; null s'il n'y en a aucune. */
  last7DaysAvg: number | null;
  /** Un élément par thème répondu, dans l'ordre de THEMES (thèmes hors liste à la fin). */
  byTheme: ThemeStats[];
};

/** Fenêtre du score moyen récent : aujourd'hui et les 6 jours précédents. */
const RECENT_DAY_COUNT = 7;

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

/**
 * Enregistre une réponse sans jamais la dupliquer : insert … on conflict (id) do
 * nothing. Un réessai après une confirmation perdue (premier envoi arrivé en base)
 * ne trouve rien à insérer : la ligne déjà enregistrée est alors relue. Renvoie
 * toujours une ligne lue en base, seule confirmation de l'enregistrement.
 */
export async function createAnswer(input: AnswerInput): Promise<DbResult<AnswerRow>> {
  const { data, error } = await supabase
    .from('answers')
    .upsert(input, { onConflict: 'id', ignoreDuplicates: true })
    .select();
  if (error) {
    return { data: null, error: error.message };
  }
  // Ligne insérée : renvoyée par l'insert. Conflit ignoré : tableau vide.
  if (data.length > 0) {
    return { data: data[0], error: null };
  }
  const existing = await supabase.from('answers').select().eq('id', input.id).maybeSingle();
  if (existing.error) {
    return { data: null, error: existing.error.message };
  }
  if (!existing.data) {
    return { data: null, error: 'Réponse introuvable après envoi : enregistrement non confirmé.' };
  }
  return { data: existing.data, error: null };
}

/** Marque (true) ou démarque (false) une réponse comme contestable ; renvoie la ligne à jour. */
export async function flagAnswer(id: string, flagged: boolean): Promise<DbResult<AnswerRow>> {
  const { data, error } = await supabase
    .from('answers')
    .update({ flagged })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) {
    return { data: null, error: error.message };
  }
  if (!data) {
    return { data: null, error: 'Réponse introuvable : signalement non enregistré.' };
  }
  return { data, error: null };
}

/**
 * Statistiques du quiz. total est exact ; byTheme porte sur les réponses lues,
 * dans la limite du max rows du projet (1000 par défaut, les plus récentes).
 */
export async function getQuizStats(): Promise<DbResult<QuizStats>> {
  const recentStart = startOfLocalDayTimestamp(shiftDay(localToday(), -(RECENT_DAY_COUNT - 1)));
  const [counted, recent, all] = await Promise.all([
    // GET + limit(1) plutôt que head: true : en HEAD, une erreur arrive sans message.
    supabase.from('answers').select('id', { count: 'exact' }).limit(1),
    supabase.from('answers').select('score').gte('answered_at', recentStart),
    supabase
      .from('answers')
      .select('score, questions(theme)')
      .order('answered_at', { ascending: false }),
  ]);
  if (counted.error) {
    return { data: null, error: counted.error.message };
  }
  if (counted.count === null) {
    return { data: null, error: 'Supabase n’a pas renvoyé le nombre de réponses.' };
  }
  if (recent.error) {
    return { data: null, error: recent.error.message };
  }
  if (all.error) {
    return { data: null, error: all.error.message };
  }

  const totals = new Map<string, { count: number; sum: number }>();
  for (const row of all.data) {
    // Typée non nulle (clé étrangère not null), mais une question masquée par la RLS arrive à null.
    const question: { theme: string } | null = row.questions;
    if (!question) {
      continue;
    }
    const theme = question.theme;
    const entry = totals.get(theme) ?? { count: 0, sum: 0 };
    entry.count += 1;
    entry.sum += row.score;
    totals.set(theme, entry);
  }
  const byTheme = [...totals]
    .map(([theme, { count, sum }]) => ({ theme, count, average: sum / count }))
    .sort((a, b) => themeRank(a.theme) - themeRank(b.theme) || a.theme.localeCompare(b.theme));

  return {
    data: {
      total: counted.count,
      last7DaysAvg: average(recent.data.map((row) => row.score)),
      byTheme,
    },
    error: null,
  };
}

/** Rang du thème dans THEMES ; les thèmes hors liste passent après. */
function themeRank(theme: string): number {
  const index = THEME_KEYS.findIndex((key) => key === theme);
  return index === -1 ? THEME_KEYS.length : index;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
