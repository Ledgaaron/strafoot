import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Alert, Platform } from 'react-native';

import {
  clearActiveSession,
  elapsedMs,
  formatElapsed,
  getActiveSession,
  setActiveSessionIndex,
  startActiveSession,
  type ActiveSession,
  type ActiveSessionSheet,
} from './active-session';

// Séance en cours partagée par toute l'app : relue au lancement, puis tenue en
// mémoire, chaque changement recopié sur l'appareil par lib/active-session.ts.
// Aussi : la navigation vers elle (reprendre, terminer) et les confirmations,
// identiques depuis la liste, la fiche, le bandeau et l'écran de fin.

type ActiveSessionContextValue = {
  /** Vrai tant que la séance mémorisée n'a pas été relue. */
  loading: boolean;
  /** Séance en cours ; null s'il n'y en a pas (ou pendant la relecture). */
  session: ActiveSession | null;
  /** Dernier échec de relecture, d'étape ou d'effacement, affiché par le bandeau des onglets ; null sinon. */
  error: string | null;
  /** Démarre la fiche au premier exercice ; renvoie l'erreur de mémorisation (rien n'a démarré), ou null. */
  start: (sheet: ActiveSessionSheet) => Promise<string | null>;
  /** Étape affichée de la séance en cours ; sans effet sans séance ou si elle ne change pas. */
  setIndex: (index: number) => void;
  /** Séance enregistrée ou abandonnée : plus rien en cours, aussitôt ; l'effacement de l'appareil suit. */
  clear: () => Promise<void>;
  dismissError: () => void;
};

const ActiveSessionContext = createContext<ActiveSessionContextValue | null>(null);

export function ActiveSessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Dernière séance connue, lue sans attendre un rendu : deux Suivant rapprochés partent de la bonne base.
  const sessionRef = useRef<ActiveSession | null>(null);
  // Accès à l'appareil un par un, dans l'ordre des appels : une écriture
  // d'étape en retard ne fait jamais revenir une séance effacée.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    enqueue(queueRef, getActiveSession).then((result) => {
      if (!active) {
        return;
      }
      sessionRef.current = result.data;
      setSession(result.data);
      setError(result.error);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const start = useCallback(async (sheet: ActiveSessionSheet): Promise<string | null> => {
    const result = await enqueue(queueRef, () => startActiveSession(sheet));
    if (result.error !== null) {
      return result.error;
    }
    sessionRef.current = result.data;
    setSession(result.data);
    setError(null);
    return null;
  }, []);

  const setIndex = useCallback((index: number) => {
    const current = sessionRef.current;
    if (current === null || current.lastExerciseIndex === index) {
      return;
    }
    // Mémoire d'abord : le bandeau ramène à la bonne étape même si l'écriture échoue.
    const next: ActiveSession = { ...current, lastExerciseIndex: index };
    sessionRef.current = next;
    setSession(next);
    enqueue(queueRef, () => setActiveSessionIndex(current, index)).then((result) => {
      if (result.error !== null) {
        setError(result.error);
      }
    });
  }, []);

  const clear = useCallback(async () => {
    sessionRef.current = null;
    setSession(null);
    const result = await enqueue(queueRef, clearActiveSession);
    // Échec : la séance reviendra au prochain lancement ; le bandeau le dit.
    setError(result.error);
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({ loading, session, error, start, setIndex, clear, dismissError }),
    [loading, session, error, start, setIndex, clear, dismissError],
  );

  return <ActiveSessionContext value={value}>{children}</ActiveSessionContext>;
}

export function useActiveSession(): ActiveSessionContextValue {
  const value = useContext(ActiveSessionContext);
  if (!value) {
    throw new Error('useActiveSession doit être appelé sous <ActiveSessionProvider>.');
  }
  return value;
}

/** Enchaîne `operation` après les précédentes ; elles ne rejettent jamais (contrat de lib/active-session.ts). */
function enqueue<T>(queue: RefObject<Promise<unknown>>, operation: () => Promise<T>): Promise<T> {
  const result = queue.current.then(operation);
  queue.current = result;
  return result;
}

/**
 * push depuis un onglet ; replace depuis une autre fiche : sa lecture est
 * abandonnée au profit de la séance en cours, la pile ne s'allonge pas.
 */
export type NavigationMode = 'push' | 'replace';

/** Fiche de la séance en cours ; l'écran de fiche reprend lui-même à lastExerciseIndex. */
export function openActiveSession(session: ActiveSession, mode: NavigationMode): void {
  const href = { pathname: '/sheet/[id]', params: { id: session.sheetId } } as const;
  if (mode === 'push') {
    router.push(href);
  } else {
    router.replace(href);
  }
}

/** Terminer depuis un autre écran : une fiche passe par l'écran de fin, un test par sa saisie des mesures. */
export function finishActiveSession(session: ActiveSession, mode: NavigationMode): void {
  const href =
    session.kind === 'test'
      ? ({ pathname: '/sheet/[id]', params: { id: session.sheetId, finish: '1' } } as const)
      : '/session/finish';
  if (mode === 'push') {
    router.push(href);
  } else {
    router.replace(href);
  }
}

/**
 * Démarrer alors qu'une autre fiche est en cours : Reprendre / Terminer l'autre
 * d'abord / Annuler. Alert ne fait rien sur le web : deux confirmations du
 * navigateur à la place.
 */
export function askAboutActiveSession(session: ActiveSession, mode: NavigationMode): void {
  const message = `« ${session.title} » est en cours depuis ${formatElapsed(elapsedMs(session.startedAt, Date.now()))}.`;
  if (Platform.OS === 'web') {
    if (window.confirm(`${message}\n\nOK : la reprendre.\nAnnuler : autres choix.`)) {
      openActiveSession(session, mode);
    } else if (window.confirm(`Terminer « ${session.title} » d’abord ?\n\nOK : la terminer.\nAnnuler : ne rien faire.`)) {
      finishActiveSession(session, mode);
    }
    return;
  }
  Alert.alert('Séance déjà en cours', message, [
    { text: 'Reprendre', onPress: () => openActiveSession(session, mode) },
    { text: 'Terminer l’autre d’abord', onPress: () => finishActiveSession(session, mode) },
    { text: 'Annuler', style: 'cancel' },
  ]);
}

/** Confirmation avant d'abandonner la séance en cours (Alert natif, confirmation du navigateur sur le web). */
export function confirmAbandon(onConfirm: () => void): void {
  const message = 'Le chrono s’arrête et rien n’est enregistré.';
  if (Platform.OS === 'web') {
    if (window.confirm(`Abandonner la séance ? ${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert('Abandonner la séance', message, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Abandonner', style: 'destructive', onPress: onConfirm },
  ]);
}

/** Vibration Medium à l'enregistrement d'une séance chronométrée (web : navigator.vibrate s'il existe). */
export function vibrateOnSave(): void {
  // Simple retour physique : un appareil sans vibreur ne bloque ni ne signale rien, la séance est enregistrée.
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}
