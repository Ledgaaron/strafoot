// Travail personnel : toute séance sauf les modules hors flamme (liste fermée
// de lib/modules.ts). La flamme d'entraînement et l'objectif hebdomadaire ne
// comptent que lui ; les autres séances restent visibles partout ailleurs
// (points du calendrier, jours actifs, séances du jour, Profil). Calcul pur,
// sans dépendance native : testé par lib/personal-work.test.ts
// (npx tsx lib/personal-work.test.ts).

import { shiftDay, startOfWeek } from './dates';
import { isPersonalWork } from './modules';

/** Séance lue pour l'activité : son jour local, son module et sa durée. */
export type WorkSession = { date: string; module: string; duration_min: number };

/** Objectif hebdomadaire tant que l'utilisateur ne l'a pas réglé (profiles.weekly_session_goal null). */
export const DEFAULT_WEEKLY_SESSION_GOAL = 3;
/** Bornes de l'objectif hebdomadaire, comme la contrainte de la migration 011. */
export const MIN_WEEKLY_SESSION_GOAL = 1;
export const MAX_WEEKLY_SESSION_GOAL = 7;

const DAYS_PER_WEEK = 7;

/** Objectif hebdomadaire lu en base : 3 s'il n'a pas été réglé ; une valeur hors bornes est ramenée de 1 à 7. */
export function weeklyGoalOf(value: number | null): number {
  if (value === null || !Number.isInteger(value)) {
    return DEFAULT_WEEKLY_SESSION_GOAL;
  }
  return Math.min(MAX_WEEKLY_SESSION_GOAL, Math.max(MIN_WEEKLY_SESSION_GOAL, value));
}

/**
 * Jours actifs : trainingDays, au moins une séance de tout module (points du
 * calendrier, jours actifs) ; personalDays, au moins une séance de travail
 * personnel (flamme d'entraînement).
 */
export function activityDays(sessions: readonly Pick<WorkSession, 'date' | 'module'>[]): {
  trainingDays: Set<string>;
  personalDays: Set<string>;
} {
  const trainingDays = new Set<string>();
  const personalDays = new Set<string>();
  for (const session of sessions) {
    trainingDays.add(session.date);
    if (isPersonalWork(session.module)) {
      personalDays.add(session.date);
    }
  }
  return { trainingDays, personalDays };
}

/** Séances et minutes de travail personnel de la semaine, du lundi au dimanche, qui contient today. */
export function weekWork(sessions: readonly WorkSession[], today: string): { sessions: number; minutes: number } {
  const monday = startOfWeek(today);
  const sunday = shiftDay(monday, DAYS_PER_WEEK - 1);
  let count = 0;
  let minutes = 0;
  for (const session of sessions) {
    // Jours YYYY-MM-DD : l'ordre des chaînes est l'ordre chronologique.
    if (session.date >= monday && session.date <= sunday && isPersonalWork(session.module)) {
      count += 1;
      minutes += session.duration_min;
    }
  }
  return { sessions: count, minutes };
}
