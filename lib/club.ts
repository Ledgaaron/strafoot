// Entraînement club proposé par l'Accueil, sans planning à déclarer : les
// habitudes se lisent dans les séances club des 14 derniers jours. Un jour J,
// la séance est proposée si une séance club existe le même jour de la semaine
// à J-7 ou J-14, qu'aucune ne l'est encore à J et que la proposition n'a pas été
// écartée ce jour-là (« Pas ce soir », lib/club-dismissal.ts). Calcul pur, sans
// dépendance native : testé par lib/club.test.ts (npx tsx lib/club.test.ts).

import { daysBetween, shiftDay, timestampMs, weekdayOf } from './dates';
import { buildSessionName, CLUB_MODULE_KEY } from './modules';

/** Séance lue en base : jour, module, nom, durée et instant d'enregistrement (départage d'un même jour). */
export type ClubSessionSource = {
  date: string;
  module: string;
  name: string | null;
  duration_min: number;
  created_at: string;
};

/** Séance club proposée pour aujourd'hui : nom et durée de la dernière de ce jour de la semaine. */
export type ClubProposal = { name: string; durationMin: number };

/** Fenêtre des habitudes, en jours avant aujourd'hui : J-7 et J-14 tombent le même jour de la semaine. */
export const CLUB_LOOKBACK_DAYS = 14;
/** Jours à venir où la bande des jours montre un club prévu (point creux). */
export const CLUB_PLANNED_HORIZON_DAYS = 14;

const DAYS_PER_WEEK = 7;

/**
 * Jours de club habituels : jours de la semaine (0 = dimanche … 6 = samedi)
 * ayant une séance club de today − 14 à today, bornes comprises. Les autres
 * modules sont ignorés.
 */
export function usualClubWeekdays(
  sessions: readonly Pick<ClubSessionSource, 'date' | 'module'>[],
  today: string,
): Set<number> {
  const from = shiftDay(today, -CLUB_LOOKBACK_DAYS);
  const weekdays = new Set<number>();
  for (const session of sessions) {
    // Jours YYYY-MM-DD : l'ordre des chaînes est l'ordre chronologique.
    if (session.module === CLUB_MODULE_KEY && session.date >= from && session.date <= today) {
      weekdays.add(weekdayOf(session.date));
    }
  }
  return weekdays;
}

/** Jour à venir, de demain à today + 14, qui tombe un jour de club habituel. */
export function isClubPlannedDay(day: string, today: string, weekdays: ReadonlySet<number>): boolean {
  const ahead = daysBetween(today, day);
  return ahead >= 1 && ahead <= CLUB_PLANNED_HORIZON_DAYS && weekdays.has(weekdayOf(day));
}

/**
 * Séance club à proposer pour today, ou null : proposition écartée ce jour-là
 * (dismissedDay = today), séance club déjà enregistrée aujourd'hui, ou aucune à
 * J-7 ni à J-14. Nom et durée : ceux de la dernière séance club de ce jour de
 * la semaine (J-7 avant J-14, puis la plus récemment enregistrée). Un nom
 * automatique (« Entraînement club — mar. 6 oct. ») est refait pour today ; un
 * nom choisi est repris tel quel.
 */
export function proposeClubSession(
  sessions: readonly ClubSessionSource[],
  today: string,
  dismissedDay: string | null,
): ClubProposal | null {
  if (dismissedDay === today) {
    return null;
  }
  const clubs = sessions.filter((session) => session.module === CLUB_MODULE_KEY);
  if (clubs.some((session) => session.date === today)) {
    return null;
  }
  const sameWeekday = new Set([shiftDay(today, -DAYS_PER_WEEK), shiftDay(today, -CLUB_LOOKBACK_DAYS)]);
  const last = clubs
    .filter((session) => sameWeekday.has(session.date))
    .sort(
      (a, b) =>
        // Jour le plus récent d'abord, puis l'enregistrement le plus récent.
        (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || timestampMs(b.created_at) - timestampMs(a.created_at),
    )[0];
  if (last === undefined) {
    return null;
  }
  const name = last.name?.trim() ?? '';
  const automatic = name === '' || name === buildSessionName(CLUB_MODULE_KEY, last.date);
  return {
    name: automatic ? buildSessionName(CLUB_MODULE_KEY, today) : name,
    durationMin: last.duration_min,
  };
}
