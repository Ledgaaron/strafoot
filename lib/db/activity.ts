import { listAnswerDays } from './answers';
import type { DbResult } from './result';
import { listActiveDays } from './sessions';

/** Jours locaux (YYYY-MM-DD) ayant au moins une séance, au moins une réponse au quiz. */
export type ActivityDays = {
  trainingDays: ReadonlySet<string>;
  quizDays: ReadonlySet<string>;
};

// Tout l'historique est lu d'un coup : la streak, la bande de n'importe quelle
// semaine et le mois de la feuille en ont besoin, pas de rechargement par période.
const HISTORY_START = '2000-01-01';

/**
 * Jours actifs de tout l'historique jusqu'à today inclus, séances et réponses
 * lues ensemble. Une même panne (réseau, session expirée) remonte souvent sur les
 * deux lectures : les messages distincts sont réunis.
 */
export async function listActivityHistory(today: string): Promise<DbResult<ActivityDays>> {
  const range = { from: HISTORY_START, to: today };
  const [sessionDays, answerDays] = await Promise.all([listActiveDays(range), listAnswerDays(range)]);
  const errors = [sessionDays.error, answerDays.error].filter((message): message is string => message !== null);
  if (errors.length > 0) {
    return { data: null, error: [...new Set(errors)].join('\n') };
  }
  return {
    data: { trainingDays: new Set(sessionDays.data ?? []), quizDays: new Set(answerDays.data ?? []) },
    error: null,
  };
}
