import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// « Réduire les animations » du système (iOS, Android) ou du navigateur
// (prefers-reduced-motion) : seul l'appui (micro-interaction a) reste animé, les
// autres (b à e) posent leur état final sans transition. Une seule souscription
// pour toute l'app, démarrée au premier abonné ; la valeur courante se lit aussi
// hors d'un rendu (isReduceMotionEnabled). Jamais d'exception : en cas de doute,
// les animations restent.

let enabled = false;
let watching = false;
const listeners = new Set<() => void>();

function update(next: boolean): void {
  if (enabled === next) {
    return;
  }
  enabled = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Lit le réglage puis suit ses changements, une fois pour toute la vie de l'app. */
export function watchReduceMotion(): void {
  if (watching) {
    return;
  }
  watching = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then(update)
    .catch(() => undefined);
  // Jamais désabonné : la souscription vit autant que l'app.
  AccessibilityInfo.addEventListener('reduceMotionChanged', update);
}

function subscribe(listener: () => void): () => void {
  watchReduceMotion();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(): boolean {
  return enabled;
}

/** Vrai si l'utilisateur demande moins d'animations ; suit le réglage en direct. */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, read, read);
}

/** Même valeur, hors d'un rendu (gestionnaire d'événement, LayoutAnimation). */
export function isReduceMotionEnabled(): boolean {
  return enabled;
}
