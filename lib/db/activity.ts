import { activityDays } from '../personal-work';
import { listAnswerDays } from './answers';
import type { DbResult } from './result';
import { listSessionActivity, type ActivitySession } from './sessions';

/** Jours locaux (YYYY-MM-DD) ayant au moins une séance (tout module), au moins une réponse au quiz. */
export type ActivityDays = {
  trainingDays: ReadonlySet<string>;
  quizDays: ReadonlySet<string>;
};

/** Historique de l'Accueil et du calendrier du mois. */
export type ActivityHistory = ActivityDays & {
  /** Jours ayant au moins une séance de travail personnel (hors entraînement club) : flamme d'entraînement. */
  personalDays: ReadonlySet<string>;
  /** Toutes les séances, les plus récentes d'abord : entraînement club proposé, jours de club, semaine en cours. */
  sessions: readonly ActivitySession[];
};

// Tout l'historique est lu d'un coup : les streaks, la bande des jours et le
// mois de la feuille en ont besoin, pas de rechargement par période.
const HISTORY_START = '2000-01-01';

/**
 * Activité de tout l'historique jusqu'à today inclus, séances et réponses lues
 * ensemble. Une même panne (réseau, session expirée) remonte souvent sur les
 * deux lectures : les messages distincts sont réunis.
 */
export async function listActivityHistory(today: string): Promise<DbResult<ActivityHistory>> {
  const range = { from: HISTORY_START, to: today };
  const [sessions, answerDays] = await Promise.all([listSessionActivity(range), listAnswerDays(range)]);
  const errors = [sessions.error, answerDays.error].filter((message): message is string => message !== null);
  if (errors.length > 0) {
    return { data: null, error: [...new Set(errors)].join('\n') };
  }
  const rows = sessions.data ?? [];
  const { trainingDays, personalDays } = activityDays(rows);
  return {
    data: { trainingDays, personalDays, quizDays: new Set(answerDays.data ?? []), sessions: rows },
    error: null,
  };
}
