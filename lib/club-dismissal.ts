import AsyncStorage from '@react-native-async-storage/async-storage';

import type { StoredResult } from './active-session';
import { isLocalDateString } from './dates';

// « Pas ce soir » : la proposition d'entraînement club de l'Accueil (lib/club.ts)
// est écartée pour la journée, mémorisée sur l'appareil sous une clé fixe (le
// jour local écarté, YYYY-MM-DD). Rien en base : le lendemain, la clé ne vaut
// plus aujourd'hui et la proposition revient d'elle-même. Les fonctions ne
// lancent pas d'exception : { data, error }, comme lib/db.

const STORAGE_KEY = 'strafoot.clubDismissedDay';

/** Jour où la proposition a été écartée ; data null sans erreur s'il n'y en a pas (ou une valeur illisible). */
export async function getClubDismissal(): Promise<StoredResult<string | null>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    // Une valeur retouchée ou d'un ancien format ne vaut aucun jour : la proposition reste.
    return { data: raw !== null && isLocalDateString(raw) ? raw : null, error: null };
  } catch (exception) {
    return { data: null, error: `« Pas ce soir » non relu : ${describe(exception)}` };
  }
}

/** Écarte la proposition pour le jour local day ; renvoie ce jour. */
export async function saveClubDismissal(day: string): Promise<StoredResult<string>> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, day);
    return { data: day, error: null };
  } catch (exception) {
    return { data: null, error: `« Pas ce soir » non mémorisé sur l’appareil : ${describe(exception)}` };
  }
}

function describe(exception: unknown): string {
  return exception instanceof Error ? exception.message : String(exception);
}
