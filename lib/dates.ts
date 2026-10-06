// Jours calendaires en heure locale, jamais en UTC (une séance à 23h30 compte
// pour le jour même), au format des colonnes `date` : YYYY-MM-DD.

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Jour local courant. */
export function localToday(): string {
  return toLocalDateString(new Date());
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Vrai pour un jour YYYY-MM-DD qui existe au calendrier (rejette 2026-02-30). */
export function isLocalDateString(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toLocalDateString(date) === value;
}

/** Minuit local du jour YYYY-MM-DD (new Date('YYYY-MM-DD') donnerait minuit UTC). */
export function fromLocalDateString(day: string): Date {
  const match = DAY_PATTERN.exec(day);
  if (!match) {
    throw new Error(`Jour invalide : « ${day} » (attendu YYYY-MM-DD).`);
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Numéro du jour dans son mois (1 à 31). */
export function dayOfMonth(day: string): number {
  return fromLocalDateString(day).getDate();
}

/** Jour décalé de `days` jours (négatif : dans le passé). */
export function shiftDay(day: string, days: number): string {
  return toLocalDateString(addDays(fromLocalDateString(day), days));
}

/** `count` jours en partant de `today` puis en reculant : [aujourd'hui, J-1, …]. */
export function lastDays(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftDay(today, -index));
}

// Libellés écrits à la main : Intl ne rend pas la même chose sur web et sur Hermes.
const WEEKDAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « mar. 7 oct. » */
export function formatShortDay(day: string): string {
  const date = fromLocalDateString(day);
  return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** Libellé d'une puce de date : « auj. », « hier », puis « mer. 1 oct. ». */
export function formatDayChip(day: string, today: string): string {
  if (day === today) {
    return 'auj.';
  }
  if (day === shiftDay(today, -1)) {
    return 'hier';
  }
  return formatShortDay(day);
}

/** Mois calendaire ; month va de 1 à 12, comme dans YYYY-MM-DD. */
export type YearMonth = { year: number; month: number };

export function monthOf(day: string): YearMonth {
  const date = fromLocalDateString(day);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function shiftMonth({ year, month }: YearMonth, months: number): YearMonth {
  const date = new Date(year, month - 1 + months, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** Premier et dernier jour du mois, inclus. */
export function monthBounds({ year, month }: YearMonth): { from: string; to: string } {
  return {
    from: toLocalDateString(new Date(year, month - 1, 1)),
    // Le jour 0 du mois suivant est le dernier jour de ce mois.
    to: toLocalDateString(new Date(year, month, 0)),
  };
}

/** « octobre 2026 » */
export function formatMonthTitle({ year, month }: YearMonth): string {
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

/** Grille du mois, lundi en premier : semaines de 7 cases, null hors du mois. */
export function buildMonthGrid({ year, month }: YearMonth): (string | null)[][] {
  const daysInMonth = new Date(year, month, 0).getDate();
  // getDay() : 0 = dimanche ; décalage pour que lundi = 0.
  const leadingBlanks = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: leadingBlanks }, () => null);
  for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth += 1) {
    cells.push(toLocalDateString(new Date(year, month - 1, dayOfMonth)));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  const weeks: (string | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) {
    weeks.push(cells.slice(start, start + 7));
  }
  return weeks;
}

// Colonnes timestamptz (answers.answered_at) : un jour local se traduit en
// intervalle d'instants, et un instant se ramène à son jour local.

/** Instant ISO du minuit local de `day`, pour borner une colonne timestamptz. */
export function startOfLocalDayTimestamp(day: string): string {
  return fromLocalDateString(day).toISOString();
}

/** Jour local d'un timestamptz renvoyé par Supabase (« 2026-10-06T21:30:00.123456+00:00 »). */
export function localDateOfTimestamp(timestamp: string): string {
  // Au-delà des millisecondes, l'analyse de Date dépend du moteur : on tronque.
  return toLocalDateString(new Date(timestamp.replace(/(\.\d{3})\d+/, '$1')));
}
