import { MODULE_KEYS, type ModuleKey, type SessionType } from '../modules';
import { supabase } from '../supabase';
import type { Tables } from '../types';
import type { DbResult } from './result';

export type SessionRow = Tables<'sessions'>;

/**
 * Champs envoyés à la création. Jamais de user_id : il vient du JWT (défaut
 * auth.uid() en base et trigger set_user_id).
 */
export type SessionInput = {
  date: string;
  module: ModuleKey;
  type: SessionType;
  name: string;
  duration_min: number;
  difficulty: number;
  comment: string | null;
  /** Fiche ou test d'origine (« Séance faite », test enregistré) ; absent pour une séance saisie. */
  sheet_id?: string | null;
};

/** Champs modifiables d'une séance existante. */
export type SessionPatch = Partial<SessionInput>;

/** Volume d'un module : nombre de séances et minutes cumulées. */
export type ModuleVolume = {
  /** Valeur de sessions.module : une clé de MODULE_KEYS, ou une valeur inconnue lue en base. */
  module: string;
  count: number;
  minutes: number;
};

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

/** Séances d'un jour local (YYYY-MM-DD), dans l'ordre de saisie. */
export async function listSessionsForDay(date: string): Promise<DbResult<SessionRow[]>> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('date', date)
    .order('created_at', { ascending: true });
  return { data, error: error?.message ?? null };
}

/** Une séance par id, ou null si elle n'existe pas (ou plus). */
export async function getSession(id: string): Promise<DbResult<SessionRow>> {
  const { data, error } = await supabase.from('sessions').select('*').eq('id', id).maybeSingle();
  return { data, error: error?.message ?? null };
}

export async function createSession(input: SessionInput): Promise<DbResult<SessionRow>> {
  const { data, error } = await supabase.from('sessions').insert(input).select().single();
  return { data, error: error?.message ?? null };
}

export async function updateSession(id: string, patch: SessionPatch): Promise<DbResult<SessionRow>> {
  const { data, error } = await supabase
    .from('sessions')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) {
    return { data: null, error: error.message };
  }
  if (!data) {
    return { data: null, error: 'Séance introuvable : aucune modification enregistrée.' };
  }
  return { data, error: null };
}

/** Supprime une séance ; renvoie son id. */
export async function deleteSession(id: string): Promise<DbResult<string>> {
  // select('id') : sans ligne renvoyée, rien n'a été supprimé (id inconnu ou masqué par la RLS).
  const { data, error } = await supabase.from('sessions').delete().eq('id', id).select('id');
  if (error) {
    return { data: null, error: error.message };
  }
  if (data.length === 0) {
    return { data: null, error: 'Séance introuvable : rien n’a été supprimé.' };
  }
  return { data: id, error: null };
}

/**
 * Jours distincts (YYYY-MM-DD) ayant au moins une séance entre from et to
 * inclus, du plus récent au plus ancien. PostgREST n'a pas de distinct : une
 * ligne par séance revient, dans la limite du max rows du projet (1000 par défaut).
 */
export async function listActiveDays({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<DbResult<string[]>> {
  const { data, error } = await supabase
    .from('sessions')
    .select('date')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false });
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: [...new Set(data.map((row) => row.date))], error: null };
}

/** Nombre de séances, éventuellement bornées par jour (bornes incluses). */
export async function countSessions({
  from,
  to,
}: {
  from?: string;
  to?: string;
} = {}): Promise<DbResult<number>> {
  // GET + limit(1) plutôt que head: true : en HEAD, une erreur arrive sans message.
  let query = supabase.from('sessions').select('id', { count: 'exact' });
  if (from) {
    query = query.gte('date', from);
  }
  if (to) {
    query = query.lte('date', to);
  }
  const { count, error } = await query.limit(1);
  if (error) {
    return { data: null, error: error.message };
  }
  if (count === null) {
    return { data: null, error: 'Supabase n’a pas renvoyé le nombre de séances.' };
  }
  return { data: count, error: null };
}

/**
 * Séances et minutes par module, éventuellement bornées par jour (bornes
 * incluses) : un élément par module ayant au moins une séance, dans l'ordre de
 * MODULES (modules inconnus à la fin). Les agrégats PostgREST étant désactivés
 * par défaut sur Supabase, une ligne par séance revient, dans la limite du max
 * rows du projet (1000 par défaut).
 */
export async function countByModule({
  from,
  to,
}: {
  from?: string;
  to?: string;
} = {}): Promise<DbResult<ModuleVolume[]>> {
  let query = supabase.from('sessions').select('module, duration_min');
  if (from) {
    query = query.gte('date', from);
  }
  if (to) {
    query = query.lte('date', to);
  }
  const { data, error } = await query;
  if (error) {
    return { data: null, error: error.message };
  }
  const volumes = new Map<string, ModuleVolume>();
  for (const row of data) {
    const volume = volumes.get(row.module) ?? { module: row.module, count: 0, minutes: 0 };
    volumes.set(row.module, { ...volume, count: volume.count + 1, minutes: volume.minutes + row.duration_min });
  }
  const sorted = [...volumes.values()].sort(
    (a, b) => moduleRank(a.module) - moduleRank(b.module) || a.module.localeCompare(b.module),
  );
  return { data: sorted, error: null };
}

/** Rang du module dans MODULE_KEYS ; les modules hors liste passent après. */
function moduleRank(module: string): number {
  const index = MODULE_KEYS.findIndex((key) => key === module);
  return index === -1 ? MODULE_KEYS.length : index;
}
