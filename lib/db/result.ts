/** Contrat de lib/db : jamais d'exception ; l'erreur Supabase en texte brut. */
export type DbResult<T> = { data: T | null; error: string | null };
