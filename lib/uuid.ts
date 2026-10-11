// Identifiants tirés côté client, sans dépendance : série du quiz (quiz_run_id),
// réponse, séance. Un id tiré avant le premier envoi et renvoyé à chaque réessai
// rend l'enregistrement idempotent (insert … on conflict (id) do nothing).

/**
 * UUID v4. crypto.randomUUID existe sur le web (contexte sécurisé seulement),
 * pas sous Hermes dans Expo Go, qui n'a pas Web Crypto : repli sur Math.random,
 * suffisant pour des identifiants qui ne sont pas des secrets.
 */
export function randomUuid(): string {
  // Le type DOM déclare crypto.randomUUID toujours présent : test à l'exécution.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return fallbackUuid(Math.random);
}

/** UUID v4 tiré de `random` (Math.random en production) : exporté pour les tests. */
export function fallbackUuid(random: () => number): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const nibble = Math.floor(random() * 16);
    // y : variante RFC 4122, bits 10xx (8, 9, a ou b).
    return (char === 'x' ? nibble : (nibble & 0x3) | 0x8).toString(16);
  });
}
