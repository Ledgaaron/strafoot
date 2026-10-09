import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Alert, Platform } from 'react-native';

import {
  clearActiveSession,
  elapsedMs,
  formatElapsed,
  getActiveSession,
  saveActiveSession,
  startActiveSession,
  type ActiveSession,
  type ActiveSessionStart,
  type ActiveTestRun,
} from './active-session';
import { hapticMedium } from './haptics';

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
  /** Démarre la fiche, le test ou la session à sa première étape ; renvoie l'erreur de mémorisation (rien n'a démarré), ou null. */
  start: (start: ActiveSessionStart) => Promise<string | null>;
  /** Étape affichée de la séance en cours ; sans effet sans séance ou si elle ne change pas. */
  setIndex: (index: number) => void;
  /**
   * Session de tests : test en cours et séance créée, mis à jour d'un coup (un
   * test enregistré fait passer au suivant) ; sans effet hors session.
   */
  updateRun: (patch: Partial<Pick<ActiveTestRun, 'lastExerciseIndex' | 'sessionId'>>) => void;
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

  const start = useCallback(async (input: ActiveSessionStart): Promise<string | null> => {
    const result = await enqueue(queueRef, () => startActiveSession(input));
    if (result.error !== null) {
      return result.error;
    }
    sessionRef.current = result.data;
    setSession(result.data);
    setError(null);
    return null;
  }, []);

  /** Mémoire d'abord : le bandeau ramène à la bonne étape même si l'écriture échoue. */
  const remember = useCallback((next: ActiveSession) => {
    sessionRef.current = next;
    setSession(next);
    enqueue(queueRef, () => saveActiveSession(next)).then((result) => {
      if (result.error !== null) {
        setError(result.error);
      }
    });
  }, []);

  const setIndex = useCallback(
    (index: number) => {
      const current = sessionRef.current;
      if (current === null || current.lastExerciseIndex === index) {
        return;
      }
      remember({ ...current, lastExerciseIndex: index });
    },
    [remember],
  );

  const updateRun = useCallback(
    (patch: Partial<Pick<ActiveTestRun, 'lastExerciseIndex' | 'sessionId'>>) => {
      const current = sessionRef.current;
      if (current === null || current.kind !== 'session') {
        return;
      }
      remember({ ...current, ...patch });
    },
    [remember],
  );

  const clear = useCallback(async () => {
    sessionRef.current = null;
    setSession(null);
    const result = await enqueue(queueRef, clearActiveSession);
    // Échec : la séance reviendra au prochain lancement ; le bandeau le dit.
    setError(result.error);
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({ loading, session, error, start, setIndex, updateRun, clear, dismissError }),
    [loading, session, error, start, setIndex, updateRun, clear, dismissError],
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

/**
 * Écran de la séance en cours : la fiche (qui reprend elle-même à
 * lastExerciseIndex), le test, ou le test en cours de la session ; une session
 * dont tous les tests sont passés, sa fin à enregistrer.
 */
export function openActiveSession(session: ActiveSession, mode: NavigationMode): void {
  navigate(activeSessionHref(session), mode);
}

/**
 * Terminer depuis un autre écran : une fiche ou une session passe par l'écran de
 * fin ; un test se termine sur son propre écran, où se saisissent ses mesures.
 */
export function finishActiveSession(session: ActiveSession, mode: NavigationMode): void {
  navigate(session.kind === 'test' ? activeSessionHref(session) : '/session/finish', mode);
}

type ActiveSessionHref =
  | { pathname: '/sheet/[id]'; params: { id: string } }
  | { pathname: '/test/[slug]'; params: { slug: string } }
  | '/session/finish';

function activeSessionHref(session: ActiveSession): ActiveSessionHref {
  switch (session.kind) {
    case 'training':
      return { pathname: '/sheet/[id]', params: { id: session.sheetId } };
    case 'test':
      return { pathname: '/test/[slug]', params: { slug: session.slug } };
    case 'session': {
      const slug = session.tests[session.lastExerciseIndex - 1];
      return slug === undefined ? '/session/finish' : { pathname: '/test/[slug]', params: { slug } };
    }
  }
}

function navigate(href: ActiveSessionHref, mode: NavigationMode): void {
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

/**
 * Confirmation avant d'abandonner la séance en cours (Alert natif, confirmation
 * du navigateur sur le web) ; subject reprend le libellé du bouton : « la
 * séance » (fiche, test seul) ou « la session » (session de tests).
 */
export function confirmAbandon(onConfirm: () => void, subject: 'la séance' | 'la session' = 'la séance'): void {
  const message = 'Le chrono s’arrête et rien n’est enregistré.';
  if (Platform.OS === 'web') {
    if (window.confirm(`Abandonner ${subject} ? ${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(`Abandonner ${subject}`, message, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Abandonner', style: 'destructive', onPress: onConfirm },
  ]);
}

/** Vibration Medium à l'enregistrement d'une séance chronométrée (lib/haptics.ts : rien sur le web). */
export function vibrateOnSave(): void {
  hapticMedium();
}
