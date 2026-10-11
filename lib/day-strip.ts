// Bande des jours de l'Accueil : continue, 7 jours visibles, glissée au doigt
// jour par jour ; aujourd'hui centré à l'ouverture, ‹ › décalent de 7 jours ;
// de 12 semaines en arrière à 14 jours devant. Un jour plus ancien choisi dans
// la feuille du mois agrandit la bande vers le passé, le temps que l'écran vit,
// pour pouvoir le centrer. Calcul pur, sans dépendance native : testé par
// lib/day-strip.test.ts (npx tsx lib/day-strip.test.ts).

import { daysBetween, shiftDay } from './dates';

/** Jours visibles à la fois. */
export const STRIP_VISIBLE_DAYS = 7;
/** Jours en arrière depuis aujourd'hui : 12 semaines. */
export const STRIP_PAST_DAYS = 12 * 7;
/** Jours devant aujourd'hui. */
export const STRIP_FUTURE_DAYS = 14;

/** Rang du jour centré parmi les 7 visibles. */
const CENTER_OFFSET = Math.floor(STRIP_VISIBLE_DAYS / 2);

/** Premier jour de la bande à l'ouverture : today − 12 semaines. */
export function defaultStripStart(today: string): string {
  return shiftDay(today, -STRIP_PAST_DAYS);
}

/** Premier jour de la bande une fois day choisi : reculé s'il le faut pour centrer day, jamais avancé. */
export function stripStartFor(start: string, day: string): string {
  const needed = shiftDay(day, -CENTER_OFFSET);
  // Jours YYYY-MM-DD : l'ordre des chaînes est l'ordre chronologique.
  return needed < start ? needed : start;
}

/** Jours de la bande, de start à today + 14 inclus. */
export function stripDays(start: string, today: string): string[] {
  const count = daysBetween(start, shiftDay(today, STRIP_FUTURE_DAYS)) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, index) => shiftDay(start, index));
}

/** Rang du premier jour visible, borné : la bande ne montre jamais de case vide. */
export function clampStripIndex(dayCount: number, index: number): number {
  return Math.min(Math.max(0, index), Math.max(0, dayCount - STRIP_VISIBLE_DAYS));
}

/** Rang du premier jour visible qui centre day dans la bande days (borné aux extrémités). */
export function centeredStripIndex(days: readonly string[], day: string): number {
  if (days.length === 0) {
    return 0;
  }
  return clampStripIndex(days.length, daysBetween(days[0], day) - CENTER_OFFSET);
}
