/**
 * Contrat de lib/db : jamais d'exception ; error = message brut de Supabase, ou
 * message écrit par l'app, marqué par appMessage (lib/errors.ts) pour s'afficher
 * tel quel.
 */
export type DbResult<T> = { data: T | null; error: string | null };
