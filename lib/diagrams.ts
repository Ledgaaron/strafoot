// Schémas des exercices : fichiers du bucket Storage public `diagrams`
// (migration 004), déposés à la main dans le dashboard sous le nom exact du
// champ diagram des JSON.

/** Dimensions des PNG du bucket (722 × 646 px) : cadre de tout schéma, et du terrain par défaut. */
export const DIAGRAM_WIDTH = 722;
export const DIAGRAM_HEIGHT = 646;

// Accès littéral obligatoire : Expo n'injecte que process.env.EXPO_PUBLIC_* écrit tel quel.
// Sans cette variable, lib/supabase.ts lève déjà une erreur explicite au démarrage.
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');

/** URL publique d'un schéma : « https://<projet>.supabase.co/storage/v1/object/public/diagrams/tir-exo1.png ». */
export function diagramUrl(file: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/diagrams/${encodeURIComponent(file)}`;
}
