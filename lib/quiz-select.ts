// Choix des questions d'une série : fonction pure, sans import, hasard injecté
// (rng) pour les tests. Tests : lib/quiz-select.test.ts.
//
// Ordre de priorité, critère après critère :
//   1. les questions jamais répondues ;
//   2. puis celles dont la dernière réponse vaut 1 ou 0 ;
//   3. puis les dernières réponses les plus anciennes d'abord ;
// tirage au sort entre questions à égalité (en pratique : entre jamais répondues).
// Une question ne sort qu'une fois par série, même présente deux fois en entrée.

/** Nombre de questions d'une série complète ; moins s'il n'y a pas assez de questions éligibles. */
export const RUN_LENGTH = 5;

export type QuizCandidate = {
  id: string;
  /** Instant de la dernière réponse (timestamptz renvoyé par Supabase), null si jamais répondue. */
  lastAnsweredAt: string | null;
  /** Score de la dernière réponse (0 à 3), null si jamais répondue. */
  lastScore: number | null;
};

/** Dernier score jusqu'auquel une question déjà vue reste prioritaire. */
const WEAK_SCORE_MAX = 1;

/** 0 : jamais répondue ; 1 : dernière réponse faible (≤ 1) ; 2 : les autres. */
function priorityTier(candidate: QuizCandidate): number {
  if (candidate.lastAnsweredAt === null) {
    return 0;
  }
  return candidate.lastScore !== null && candidate.lastScore <= WEAK_SCORE_MAX ? 1 : 2;
}

/** Instant en millisecondes d'un timestamptz (« 2026-10-06T21:30:00.123456+00:00 »). */
function toMillis(timestamp: string): number {
  // Fraction ramenée à 3 chiffres : au-delà comme en deçà, l'analyse de Date dépend du moteur.
  const normalized = timestamp.replace(/\.(\d+)/, (_match, digits: string) => `.${digits.padEnd(3, '0').slice(0, 3)}`);
  const millis = Date.parse(normalized);
  // Instant illisible : erreur de programmation, jamais un classement silencieusement faux.
  if (Number.isNaN(millis)) {
    throw new Error(`Instant invalide : « ${timestamp} ».`);
  }
  return millis;
}

/**
 * Jusqu'à n questions distinctes, dans l'ordre de priorité. Moins de n
 * candidates distinctes : toutes, dans cet ordre ; aucune : liste vide.
 * rng : comme Math.random, un nombre dans [0, 1) à chaque appel.
 */
export function pickQuizQuestions<T extends QuizCandidate>(
  candidates: readonly T[],
  n: number,
  rng: () => number,
): T[] {
  const seen = new Set<string>();
  const ranked: { candidate: T; tier: number; answeredAt: number; draw: number }[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      continue;
    }
    seen.add(candidate.id);
    ranked.push({
      candidate,
      tier: priorityTier(candidate),
      // Jamais répondue : pas d'instant, seul le tirage départage.
      answeredAt: candidate.lastAnsweredAt === null ? 0 : toMillis(candidate.lastAnsweredAt),
      draw: rng(),
    });
  }
  ranked.sort((a, b) => a.tier - b.tier || a.answeredAt - b.answeredAt || a.draw - b.draw);
  return ranked.slice(0, Math.max(0, n)).map((entry) => entry.candidate);
}
