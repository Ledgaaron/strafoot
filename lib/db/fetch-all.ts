import { appMessage } from '../errors';

/** Toutes les lignes, ou l'erreur (jamais les deux, jamais aucune) : se range dans un DbResult. */
export type AllRows<T> = { data: T[]; error: null } | { data: null; error: string };

/**
 * Lignes par page : le « Max rows » par défaut d'un projet Supabase (Settings →
 * API), au-delà duquel PostgREST coupe une réponse sans le dire. Ne jamais
 * baisser ce réglage sous cette valeur : une page plus courte que demandé
 * passerait pour la dernière.
 */
export const PAGE_SIZE = 1000;

/** Garde-fou : une requête sans .range() renverrait sans fin la même première page. */
export const MAX_PAGES = 100;

/** Réponse d'une page, telle que la renvoie une requête supabase-js. */
type PageResponse<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Toutes les lignes d'une lecture, page après page, au-delà des PAGE_SIZE
 * lignes qu'une requête renvoie au plus. `page(from, to)` construit la requête
 * complète et la termine par .range(from, to) ; son tri doit être total (dernier
 * critère : id, unique), sans quoi deux pages pourraient se chevaucher ou sauter
 * une ligne. S'arrête à la première page incomplète ; une erreur arrête tout,
 * jamais de liste partielle. Seul moyen de lire une liste dans lib/db, hors
 * lecture bornée (une ligne, .limit, quelques keys).
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResponse<T>>,
): Promise<AllRows<T>> {
  const rows: T[] = [];
  for (let index = 0; index < MAX_PAGES; index += 1) {
    const from = index * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) {
      return { data: null, error: error.message };
    }
    if (data === null) {
      return { data: null, error: appMessage('Supabase n’a renvoyé ni les lignes ni d’erreur.') };
    }
    for (const row of data) {
      rows.push(row);
    }
    if (data.length < PAGE_SIZE) {
      return { data: rows, error: null };
    }
  }
  return {
    data: null,
    error: appMessage(
      `Lecture interrompue après ${MAX_PAGES} pages de ${PAGE_SIZE} lignes : requête sans .range(), ou historique hors norme.`,
    ),
  };
}
