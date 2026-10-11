import { appMessage } from '../errors';
import { isModuleKey, MODULE_KEYS, TEST_MODULE_KEY, type ModuleKey, type SessionType } from '../modules';
import { supabase } from '../supabase';
import type { Tables } from '../types';
import { fetchAllRows } from './fetch-all';
import type { DbResult } from './result';

export type SessionRow = Tables<'sessions'>;

/**
 * Champs envoyés à la création. Jamais de user_id : il vient du JWT (défaut
 * auth.uid() en base et trigger set_user_id).
 */
export type SessionInput = {
  /**
   * Uuid tiré côté client (lib/uuid.ts) une seule fois par séance à
   * enregistrer, avant le premier envoi, puis renvoyé tel quel à chaque
   * réessai : un second envoi du même id ne crée pas de doublon.
   */
  id: string;
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

/** Champs modifiables d'une séance existante (l'id ne change jamais). */
export type SessionPatch = Partial<Omit<SessionInput, 'id'>>;

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
  return fetchAllRows((first, last) =>
    supabase
      .from('sessions')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(first, last),
  );
}

/** Séances d'un jour local (YYYY-MM-DD), dans l'ordre de saisie. */
export async function listSessionsForDay(date: string): Promise<DbResult<SessionRow[]>> {
  return fetchAllRows((first, last) =>
    supabase
      .from('sessions')
      .select('*')
      .eq('date', date)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(first, last),
  );
}

/** Une séance par id, ou null si elle n'existe pas (ou plus). */
export async function getSession(id: string): Promise<DbResult<SessionRow>> {
  const { data, error } = await supabase.from('sessions').select('*').eq('id', id).maybeSingle();
  return { data, error: error?.message ?? null };
}

/**
 * Crée une séance sans jamais la doubler : insert … on conflict (id) do
 * nothing. Un second envoi du même id (double tap, réessai après une
 * confirmation perdue) ne crée rien : la séance déjà enregistrée est relue et
 * renvoyée, comme un succès. Renvoie toujours une ligne lue en base, seule
 * confirmation de l'enregistrement.
 */
export async function createSession(input: SessionInput): Promise<DbResult<SessionRow>> {
  const { data, error } = await supabase
    .from('sessions')
    .upsert(input, { onConflict: 'id', ignoreDuplicates: true })
    .select();
  if (error) {
    return { data: null, error: error.message };
  }
  // Ligne insérée : renvoyée par l'insert. Conflit ignoré : tableau vide.
  if (data.length > 0) {
    return { data: data[0], error: null };
  }
  const existing = await supabase.from('sessions').select('*').eq('id', input.id).maybeSingle();
  if (existing.error) {
    return { data: null, error: existing.error.message };
  }
  if (!existing.data) {
    return { data: null, error: appMessage('Séance introuvable après envoi : enregistrement non confirmé.') };
  }
  return { data: existing.data, error: null };
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
    return { data: null, error: appMessage('Séance introuvable : aucune modification enregistrée.') };
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
    return { data: null, error: appMessage('Séance introuvable : rien n’a été supprimé.') };
  }
  return { data: id, error: null };
}

/** Séance lue pour l'activité de l'Accueil : jour, module, durée, nom et instant d'enregistrement. */
export type ActivitySession = Pick<SessionRow, 'date' | 'module' | 'duration_min' | 'name' | 'created_at'>;

/**
 * Séances entre deux jours locaux inclus, réduites à ce que l'Accueil en lit
 * (jours actifs, flamme du travail personnel, entraînement club proposé,
 * semaine en cours), les plus récentes d'abord (jour, puis enregistrement).
 * Une ligne par séance, toutes lues page par page.
 */
export async function listSessionActivity({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<DbResult<ActivitySession[]>> {
  return fetchAllRows((first, last) =>
    supabase
      .from('sessions')
      .select('date, module, duration_min, name, created_at')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(first, last),
  );
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
    return { data: null, error: appMessage('Supabase n’a pas renvoyé le nombre de séances.') };
  }
  return { data: count, error: null };
}

/**
 * Séances et minutes par module, éventuellement bornées par jour (bornes
 * incluses) : un élément par module ayant au moins une séance, dans l'ordre de
 * MODULES (modules inconnus à la fin). Les agrégats PostgREST étant désactivés
 * par défaut sur Supabase, une ligne par séance revient, toutes lues page par
 * page.
 */
export async function countByModule({
  from,
  to,
}: {
  from?: string;
  to?: string;
} = {}): Promise<DbResult<ModuleVolume[]>> {
  const { data, error } = await fetchAllRows((first, last) => {
    let query = supabase.from('sessions').select('module, duration_min');
    if (from) {
      query = query.gte('date', from);
    }
    if (to) {
      query = query.lte('date', to);
    }
    return query.order('id', { ascending: true }).range(first, last);
  });
  if (error !== null) {
    return { data: null, error };
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

/** Pré-remplissage d'une nouvelle séance : dernier module choisi, dernière durée de chaque module. */
export type SessionDefaults = {
  /** Module de la dernière séance enregistrée hors `test` ; null sans aucune séance. */
  lastModule: ModuleKey | null;
  /** Durée (minutes) de la dernière séance de chaque module qui en a déjà une. */
  lastDurationByModule: Partial<Record<ModuleKey, number>>;
};

/**
 * Dernier module et dernières durées, dans l'ordre d'enregistrement (created_at),
 * pas de date : la séance saisie en dernier donne le réglage. Une ligne par
 * séance revient, toutes lues page par page.
 */
export async function getSessionDefaults(): Promise<DbResult<SessionDefaults>> {
  const { data, error } = await fetchAllRows((first, last) =>
    supabase
      .from('sessions')
      .select('module, duration_min')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(first, last),
  );
  if (error !== null) {
    return { data: null, error };
  }
  let lastModule: ModuleKey | null = null;
  const lastDurationByModule: Partial<Record<ModuleKey, number>> = {};
  for (const row of data) {
    // Module hors liste (lu en base) : ignoré, le formulaire ne le propose pas.
    if (!isModuleKey(row.module)) {
      continue;
    }
    if (lastModule === null && row.module !== TEST_MODULE_KEY) {
      lastModule = row.module;
    }
    if (lastDurationByModule[row.module] === undefined) {
      lastDurationByModule[row.module] = row.duration_min;
    }
  }
  return { data: { lastModule, lastDurationByModule }, error: null };
}
