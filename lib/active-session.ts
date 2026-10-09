import AsyncStorage from '@react-native-async-storage/async-storage';

// Séance en cours : une seule à la fois, mémorisée sur l'appareil sous une clé
// fixe pour survivre à la fermeture de l'app. Le chrono n'est ni stocké ni
// compté : c'est maintenant − startedAt, recalculé à l'affichage. Aucun timer
// d'arrière-plan, aucune notification.
// Les fonctions de stockage ne lancent pas d'exception : { data, error }, comme
// lib/db. formatElapsed et elapsedMinutes sont pures (lib/active-session.test.ts).

const STORAGE_KEY = 'strafoot.activeSession';

/**
 * Étapes d'une fiche (app/sheet/[id].tsx) : 0 présentation ; 1 à n un exercice.
 * Une séance démarre au premier exercice. Session de tests : 1 à n le test en
 * cours (app/test/[slug].tsx), n + 1 tous passés, fin à enregistrer
 * (app/session/finish.tsx). Test seul : toujours 1, un seul écran.
 */
export const FIRST_EXERCISE_INDEX = 1;

/** Durée minimale enregistrée d'une séance chronométrée, en minutes. */
export const MIN_TIMED_DURATION = 1;

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const SECONDS_PER_HOUR = 3600;

type ActiveSessionBase = {
  /** Titre de la fiche, du test ou de la session, repris par le bandeau et par le nom de la séance enregistrée. */
  title: string;
  /** Instant du démarrage, ISO 8601 (toISOString). */
  startedAt: string;
  /** Dernière étape affichée (voir FIRST_EXERCISE_INDEX) : le bandeau y ramène. */
  lastExerciseIndex: number;
};

/** Fiche de lecture démarrée (app/sheet/[id].tsx). */
export type ActiveSheetSession = ActiveSessionBase & { kind: 'training'; sheetId: string };

/** Test atomique démarré seul par ▶ (app/test/[slug].tsx). */
export type ActiveTestSession = ActiveSessionBase & { kind: 'test'; sheetId: string; slug: string };

/** Session de tests : prédéfinie (sheetId de la session) ou proposée par l'app (sheetId null). */
export type ActiveTestRun = ActiveSessionBase & {
  kind: 'session';
  sheetId: string | null;
  /** Slugs des tests, dans l'ordre de passage ; lastExerciseIndex désigne le test en cours. */
  tests: string[];
  /** Durée prévue (somme des tests), proposée à la fin pour une séance oubliée. */
  plannedMin: number;
  /** Séance créée au premier test enregistré, à laquelle les suivants se rattachent ; null avant. */
  sessionId: string | null;
};

export type ActiveSession = ActiveSheetSession | ActiveTestSession | ActiveTestRun;

/** Fiche, test ou session à démarrer. */
export type ActiveSessionStart =
  | Pick<ActiveSheetSession, 'kind' | 'sheetId' | 'title'>
  | Pick<ActiveTestSession, 'kind' | 'sheetId' | 'slug' | 'title'>
  | Pick<ActiveTestRun, 'kind' | 'sheetId' | 'title' | 'tests' | 'plannedMin'>;

/** Lecture ou écriture sur l'appareil : la donnée, ou une erreur lisible (jamais d'exception). */
export type StoredResult<T> = { data: T; error: null } | { data: null; error: string };

/** Séance en cours mémorisée ; data null sans erreur s'il n'y en a pas. Une valeur illisible est effacée et signalée. */
export async function getActiveSession(): Promise<StoredResult<ActiveSession | null>> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch (exception) {
    return { data: null, error: `Séance en cours non relue : ${describe(exception)}` };
  }
  if (raw === null) {
    return { data: null, error: null };
  }
  const session = parseActiveSession(raw);
  if (session !== null) {
    return { data: session, error: null };
  }
  // Format changé ou valeur retouchée : elle ne redeviendra pas lisible.
  const removed = await clearActiveSession();
  return {
    data: null,
    error:
      removed.error === null
        ? 'Séance en cours illisible : elle a été effacée.'
        : `Séance en cours illisible, non effacée : ${removed.error}`,
  };
}

/** Démarre maintenant la séance d'une fiche, d'un test ou d'une session, à sa première étape ; remplace toute séance mémorisée. */
export async function startActiveSession(
  start: ActiveSessionStart,
  now: Date = new Date(),
): Promise<StoredResult<ActiveSession>> {
  const base: ActiveSessionBase = {
    title: start.title,
    startedAt: now.toISOString(),
    lastExerciseIndex: FIRST_EXERCISE_INDEX,
  };
  switch (start.kind) {
    case 'training':
      return writeActiveSession({ ...base, kind: 'training', sheetId: start.sheetId });
    case 'test':
      return writeActiveSession({ ...base, kind: 'test', sheetId: start.sheetId, slug: start.slug });
    case 'session':
      return writeActiveSession({
        ...base,
        kind: 'session',
        sheetId: start.sheetId,
        tests: [...start.tests],
        plannedMin: start.plannedMin,
        sessionId: null,
      });
  }
}

/** Mémorise la séance en cours telle quelle (étape affichée, séance créée) ; la renvoie. */
export async function saveActiveSession(session: ActiveSession): Promise<StoredResult<ActiveSession>> {
  return writeActiveSession(session);
}

/** Plus de séance en cours : terminée (enregistrée) ou abandonnée. */
export async function clearActiveSession(): Promise<StoredResult<null>> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return { data: null, error: null };
  } catch (exception) {
    return { data: null, error: `Séance en cours non effacée de l’appareil : ${describe(exception)}` };
  }
}

/** Temps écoulé depuis startedAt, en ms ; négatif si l'horloge a reculé, NaN si startedAt est illisible. */
export function elapsedMs(startedAt: string, now: number): number {
  return now - Date.parse(startedAt);
}

/** Chrono : « 0:59 », « 12:34 », puis « 1:02:03 » à partir d'une heure ; négatif ou illisible : « 0:00 ». */
export function formatElapsed(ms: number): string {
  const totalSeconds = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / SECOND_MS) : 0;
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / 60);
  const seconds = pad(totalSeconds % 60);
  return hours > 0 ? `${hours}:${pad(minutes)}:${seconds}` : `${minutes}:${seconds}`;
}

/** Durée enregistrée d'une séance chronométrée : minutes arrondies, au moins MIN_TIMED_DURATION. */
export function elapsedMinutes(ms: number): number {
  const minutes = Number.isFinite(ms) ? Math.round(ms / MINUTE_MS) : 0;
  return Math.max(MIN_TIMED_DURATION, minutes);
}

async function writeActiveSession(session: ActiveSession): Promise<StoredResult<ActiveSession>> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return { data: session, error: null };
  } catch (exception) {
    return { data: null, error: `Séance en cours non mémorisée : ${describe(exception)}` };
  }
}

/**
 * Valeur stockée relue ; null si elle ne suit pas le format d'ActiveSession.
 * Une fiche démarrée avant 007 se relit telle quelle ; un test d'avant (batterie,
 * sans slug) ne se relit plus : effacé et signalé par getActiveSession.
 */
function parseActiveSession(raw: string): ActiveSession | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  const { kind, sheetId, title, startedAt, lastExerciseIndex } = value;
  if (
    typeof title !== 'string' ||
    typeof startedAt !== 'string' ||
    !Number.isFinite(Date.parse(startedAt)) ||
    typeof lastExerciseIndex !== 'number' ||
    !Number.isInteger(lastExerciseIndex) ||
    lastExerciseIndex < 0
  ) {
    return null;
  }
  const base: ActiveSessionBase = { title, startedAt, lastExerciseIndex };
  if (kind === 'training' && isId(sheetId)) {
    return { ...base, kind, sheetId };
  }
  if (kind === 'test' && isId(sheetId) && isId(value.slug)) {
    return { ...base, kind, sheetId, slug: value.slug };
  }
  if (kind === 'session') {
    const { tests, plannedMin, sessionId } = value;
    if (
      (sheetId === null || isId(sheetId)) &&
      Array.isArray(tests) &&
      tests.length > 0 &&
      tests.every(isId) &&
      typeof plannedMin === 'number' &&
      Number.isFinite(plannedMin) &&
      (sessionId === null || isId(sessionId))
    ) {
      return { ...base, kind, sheetId, tests: tests.filter(isId), plannedMin, sessionId };
    }
  }
  return null;
}

/** Identifiant ou slug : chaîne non vide. */
function isId(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function describe(exception: unknown): string {
  return exception instanceof Error ? exception.message : String(exception);
}
