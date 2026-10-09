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

/** « 06/10/2026 » (JJ/MM/AAAA) : date de naissance (les dates d'événements passent par relativeDay). */
export function formatNumericDay(day: string): string {
  const match = DAY_PATTERN.exec(day);
  if (!match) {
    throw new Error(`Jour invalide : « ${day} » (attendu YYYY-MM-DD).`);
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Saisie JJ/MM/AAAA ; zéros de tête facultatifs (« 1/4/1998 »). */
const NUMERIC_DAY_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * Jour YYYY-MM-DD d'une saisie JJ/MM/AAAA, espaces autour ignorés ; null si le
 * texte ne suit pas ce format, si le jour n'existe pas au calendrier
 * (30/02/2000) ou si l'année précède 1000 (isLocalDateString les refuse).
 */
export function parseNumericDay(text: string): string | null {
  const match = NUMERIC_DAY_PATTERN.exec(text.trim());
  if (!match) {
    return null;
  }
  const day = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return isLocalDateString(day) ? day : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** En deçà de 7 jours, une date passée s'écrit en relatif. */
const RELATIVE_DAY_LIMIT = 7;

/** Jours calendaires de from à to (négatif si to précède from) : « J-42 » d'une échéance. */
export function daysBetween(from: string, to: string): number {
  // Minuits locaux : un changement d'heure donne un écart de 23 ou 25 h, l'arrondi le ramène à un jour.
  return Math.round((fromLocalDateString(to).getTime() - fromLocalDateString(from).getTime()) / DAY_MS);
}

/**
 * Date d'un jour passé, lisible d'un coup d'œil : « auj. », « hier », « il y a
 * 3 j » jusqu'à 6 jours, puis « 30 sept. », avec l'année si elle diffère de
 * celle de today (« 20 déc. 2025 »). Un jour postérieur à today s'écrit aussi
 * en absolu. Seul format des dates d'événements à l'écran (séances, résultats,
 * puces de date).
 */
export function relativeDay(day: string, today: string): string {
  const date = fromLocalDateString(day);
  const reference = fromLocalDateString(today);
  const elapsed = daysBetween(day, today);
  if (elapsed === 0) {
    return 'auj.';
  }
  if (elapsed === 1) {
    return 'hier';
  }
  if (elapsed > 1 && elapsed < RELATIVE_DAY_LIMIT) {
    return `il y a ${elapsed} j`;
  }
  const absolute = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  return date.getFullYear() === reference.getFullYear() ? absolute : `${absolute} ${date.getFullYear()}`;
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

/** Lundi de la semaine (du lundi au dimanche) qui contient day. */
export function startOfWeek(day: string): string {
  // getDay() : 0 = dimanche ; décalage pour que lundi = 0.
  return shiftDay(day, -((fromLocalDateString(day).getDay() + 6) % 7));
}

/** Les 7 jours de la semaine qui commence le lundi monday, dans l'ordre. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => shiftDay(monday, index));
}

/**
 * Semaine du lundi monday : « 5 – 11 oct. », « 28 sept. – 4 oct. ». Hors de
 * l'année de today, l'année suit la fin (« 1 – 7 déc. 2025 »), et chaque date
 * si la semaine change d'année (« 28 déc. 2026 – 3 janv. 2027 »).
 */
export function formatWeekRange(monday: string, today: string): string {
  const start = fromLocalDateString(monday);
  const end = addDays(start, 6);
  const currentYear = fromLocalDateString(today).getFullYear();
  const withYear = start.getFullYear() !== currentYear || end.getFullYear() !== currentYear;
  const yearSuffix = (date: Date) => (withYear ? ` ${date.getFullYear()}` : '');
  const endText = `${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}${yearSuffix(end)}`;
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]}${yearSuffix(start)} – ${endText}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${endText}`;
  }
  return `${start.getDate()} – ${endText}`;
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

// Libellés de l'Accueil (en-tête, carte de la semaine, titre des séances du jour)
// et de la ligne de date du formulaire de séance. Testés par dates.test.ts.

const WEEKDAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function capitalize(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** « Vendredi 9 octobre » : date du jour en tête de l'Accueil, sans année. */
export function formatLongDay(day: string): string {
  const date = fromLocalDateString(day);
  return capitalize(`${WEEKDAYS_LONG[date.getDay()]} ${date.getDate()} ${MONTHS_LONG[date.getMonth()]}`);
}

/**
 * « aujourd’hui », « hier », sinon le jour en court (« mar. 6 oct. »), avec
 * l'année si elle diffère de celle de today : titre des séances d'un jour
 * (« Séances · hier ») et ligne de date du formulaire.
 */
export function formatRecentDay(day: string, today: string): string {
  const elapsed = daysBetween(day, today);
  if (elapsed === 0) {
    return 'aujourd’hui';
  }
  if (elapsed === 1) {
    return 'hier';
  }
  const year = fromLocalDateString(day).getFullYear();
  const short = formatShortDay(day);
  return year === fromLocalDateString(today).getFullYear() ? short : `${short} ${year}`;
}

/** « Aujourd’hui · 09/10/2026 », « Hier · 08/10/2026 », « Mar. 6 oct. · 06/10/2026 » : ligne de date d'une séance. */
export function formatDateLine(day: string, today: string): string {
  return `${capitalize(formatRecentDay(day, today))} · ${formatNumericDay(day)}`;
}

/** « Semaine du 12 oct. » (l'année suit hors de celle de today) : carte de la semaine quand ce n'est pas la semaine courante. */
export function formatWeekOf(monday: string, today: string): string {
  const date = fromLocalDateString(monday);
  const label = `Semaine du ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  return date.getFullYear() === fromLocalDateString(today).getFullYear() ? label : `${label} ${date.getFullYear()}`;
}
