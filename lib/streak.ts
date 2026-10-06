// Streaks calculées côté app, jamais stockées. Fonctions pures, sans dépendance :
// aucun import, aucun Date, donc aucun fuseau horaire. Tests : lib/streak.test.ts.
//
// Un jour (YYYY-MM-DD, jour local) est actif s'il figure dans l'ensemble reçu.
// - Courante : jours actifs consécutifs qui finissent aujourd'hui, ou hier si
//   aujourd'hui n'a pas encore d'activité. Elle vaut 0 dès qu'hier et
//   aujourd'hui sont tous deux inactifs.
// - Meilleure : plus longue suite de jours actifs consécutifs de l'historique.

export type Streaks = { current: number; best: number };

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function invalidDay(day: string): Error {
  return new Error(`Jour invalide : « ${day} » (attendu YYYY-MM-DD).`);
}

/** Rang du jour (0 = 1970-01-01) : deux jours consécutifs ont des rangs consécutifs. */
function toDayNumber(day: string): number {
  const match = DAY_PATTERN.exec(day);
  if (!match) {
    throw invalidDay(day);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayOfMonth = Number(match[3]);
  if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > daysInMonth(year, month)) {
    throw invalidDay(day);
  }
  // days_from_civil (H. Hinnant), calendrier grégorien, en arithmétique entière.
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const dayOfYear = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + dayOfMonth - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

export function computeStreaks(activeDays: ReadonlySet<string>, today: string): Streaks {
  const todayNumber = toDayNumber(today);
  const active = new Set<number>();
  for (const day of activeDays) {
    active.add(toDayNumber(day));
  }

  // Aujourd'hui sans activité ne casse rien : on compte alors à partir d'hier.
  let cursor = active.has(todayNumber) ? todayNumber : todayNumber - 1;
  let current = 0;
  while (active.has(cursor)) {
    current += 1;
    cursor -= 1;
  }

  let best = 0;
  for (const dayNumber of active) {
    // On ne mesure une suite qu'à partir de son premier jour.
    if (active.has(dayNumber - 1)) {
      continue;
    }
    let length = 1;
    while (active.has(dayNumber + length)) {
      length += 1;
    }
    best = Math.max(best, length);
  }

  return { current, best };
}
