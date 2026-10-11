// Tests de lib/errors.ts, sans framework : npx tsx lib/errors.test.ts
// TypeScript 6 n'inclut plus @types/node d'office : référence explicite pour node:assert.
/// <reference types="node" />
import assert from 'node:assert/strict';

import { appMessage, describeError, type DescribedError, type ErrorKind } from './errors';

let total = 0;
let failures = 0;

function check(name: string, run: () => void): void {
  total += 1;
  try {
    run();
    console.log(`ok     ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`ÉCHEC  ${name}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Famille et détail attendus ; le message est celui de la famille. */
function expectKind(error: unknown, kind: ErrorKind, detail: string | null): DescribedError {
  const described = describeError(error);
  assert.equal(described.kind, kind);
  assert.equal(described.detail, detail);
  return described;
}

/** Erreur de Supabase Auth telle que la lève auth-js : une Error avec status et code. */
class FakeAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

check('identifiants invalides : message brut de Supabase Auth', () => {
  const described = expectKind('Invalid login credentials', 'credentials', 'Invalid login credentials');
  assert.equal(described.message, 'Email ou mot de passe incorrect.');
});

check('identifiants invalides : AuthError avec son code, ajouté au détail', () => {
  expectKind(
    new FakeAuthError('Invalid login credentials', 400, 'invalid_credentials'),
    'credentials',
    'Invalid login credentials (invalid_credentials)',
  );
});

check('identifiants invalides : reconnus au code seul, quel que soit le message', () => {
  expectKind(new FakeAuthError('Bad credentials', 400, 'invalid_credentials'), 'credentials', 'Bad credentials (invalid_credentials)');
});

check('email non confirmé', () => {
  expectKind(new FakeAuthError('Email not confirmed', 400, 'email_not_confirmed'), 'emailNotConfirmed', 'Email not confirmed (email_not_confirmed)');
});

check('réseau : échecs de fetch de chaque moteur, préfixés par PostgREST', () => {
  for (const message of [
    'TypeError: Failed to fetch',
    'TypeError: Load failed',
    'TypeError: Network request failed',
    'TypeError: NetworkError when attempting to fetch resource.',
    'TypeError: fetch failed',
  ]) {
    const described = expectKind(message, 'network', message);
    assert.equal(described.message, 'Réseau indisponible : vérifie ta connexion, puis réessaie.');
  }
});

check('réseau : AuthRetryableFetchError (Safari, mode avion), statut 0', () => {
  const error = new FakeAuthError('Load failed', 0);
  error.name = 'AuthRetryableFetchError';
  expectKind(error, 'network', 'Load failed');
});

check('réseau : deux lectures en panne, messages réunis par lib/db', () => {
  expectKind('TypeError: Load failed\nTypeError: Load failed', 'network', 'TypeError: Load failed\nTypeError: Load failed');
});

check('session expirée : JWT refusé par PostgREST', () => {
  const described = expectKind('JWT expired', 'session', 'JWT expired');
  assert.equal(described.message, 'Session expirée : reconnecte-toi.');
});

check('session expirée : jeton de rafraîchissement inconnu, session Auth absente', () => {
  expectKind(
    new FakeAuthError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'),
    'session',
    'Invalid Refresh Token: Refresh Token Not Found (refresh_token_not_found)',
  );
  expectKind('Auth session missing!', 'session', 'Auth session missing!');
});

check('session expirée : code PostgREST seul', () => {
  expectKind({ message: 'Unauthorized', code: 'PGRST303' }, 'session', 'Unauthorized (PGRST303)');
});

check('accès refusé : RLS et privilèges (Postgres 42501)', () => {
  const rls = 'new row violates row-level security policy for table "sessions"';
  const described = expectKind(rls, 'forbidden', rls);
  assert.equal(described.message, 'Accès refusé : cette action n’est pas permise à ton compte.');
  expectKind('permission denied for table tests', 'forbidden', 'permission denied for table tests');
  expectKind({ message: 'denied', code: '42501' }, 'forbidden', 'denied (42501)');
});

check('doublon : clé unique (Postgres 23505)', () => {
  const duplicate = 'duplicate key value violates unique constraint "profiles_user_id_idx"';
  const described = expectKind(duplicate, 'duplicate', duplicate);
  assert.equal(described.message, 'Doublon : cette donnée existe déjà.');
  expectKind({ message: 'conflict', code: '23505' }, 'duplicate', 'conflict (23505)');
});

check('trop de tentatives : message ou statut 429', () => {
  expectKind('Request rate limit reached', 'rateLimit', 'Request rate limit reached');
  expectKind(new FakeAuthError('Too Many', 429), 'rateLimit', 'Too Many');
});

check('statut HTTP seul : 401 session, 403 accès refusé', () => {
  expectKind(new FakeAuthError('Unauthorized', 401), 'session', 'Unauthorized');
  expectKind(new FakeAuthError('Forbidden', 403), 'forbidden', 'Forbidden');
});

check('inconnue : message générique, texte brut gardé en détail', () => {
  const raw = 'new row for relation "sessions" violates check constraint "sessions_difficulty_check"';
  const described = expectKind(raw, 'unknown', raw);
  assert.equal(described.message, 'Une erreur inattendue est survenue.');
});

check('message écrit par l’app (appMessage, lib/db) : affiché tel quel, en message principal, sans détail', () => {
  const described = expectKind(appMessage('Séance introuvable : rien n’a été supprimé.'), 'app', null);
  assert.equal(described.message, 'Séance introuvable : rien n’a été supprimé.');
});

check('message de l’app sur plusieurs lignes (contenu invalide en base) : gardé entier', () => {
  const described = expectKind(appMessage('Fiche « A » : intro invalide en base.\nligne 2'), 'app', null);
  assert.equal(described.message, 'Fiche « A » : intro invalide en base.\nligne 2');
});

check('marque de appMessage : jamais dans le message affiché, deux messages réunis restent de l’app', () => {
  const described = expectKind(`${appMessage('A.')}\n${appMessage('B.')}`, 'app', null);
  assert.equal(described.message, 'A.\nB.');
  assert.ok(!described.message.includes('⁣'));
});

check('même texte sans appMessage : erreur inconnue, texte gardé en détail', () => {
  expectKind('Séance introuvable : rien n’a été supprimé.', 'unknown', 'Séance introuvable : rien n’a été supprimé.');
});

check('message de l’app réuni à une cause technique : la cause l’emporte, marque retirée du détail', () => {
  const joined = `${appMessage('Séance introuvable : rien n’a été supprimé.')}\nTypeError: Load failed`;
  expectKind(joined, 'network', 'Séance introuvable : rien n’a été supprimé.\nTypeError: Load failed');
});

check('message de l’app vide : rien à afficher tel quel, message générique sans détail', () => {
  expectKind(appMessage('   '), 'unknown', null);
});

check('inconnue : détail sur plusieurs lignes, espaces autour retirés', () => {
  expectKind('  Fiche « A » : intro invalide en base.\nligne 2  \n', 'unknown', 'Fiche « A » : intro invalide en base.\nligne 2');
});

check('exception : message d’une Error, sinon son nom', () => {
  expectKind(new RangeError('Jour invalide : 2026-02-30'), 'unknown', 'Jour invalide : 2026-02-30');
  expectKind(new TypeError(''), 'unknown', 'TypeError');
});

check('valeur quelconque : texte vide sans détail, jamais d’exception', () => {
  expectKind('', 'unknown', null);
  expectKind('   ', 'unknown', null);
  expectKind(null, 'unknown', null);
  expectKind(undefined, 'unknown', null);
  expectKind(42, 'unknown', '42');
  expectKind({ reason: 'x' }, 'unknown', '{"reason":"x"}');
  const circular: { self?: unknown } = {};
  circular.self = circular;
  expectKind(circular, 'unknown', '[object Object]');
});

check('code vide (échec réseau de PostgREST) : ni code ni parenthèses', () => {
  expectKind({ message: 'TypeError: Load failed', code: '' }, 'network', 'TypeError: Load failed');
});

check('code déjà dans le message : pas répété', () => {
  expectKind({ message: 'PGRST303: JWT expired', code: 'PGRST303' }, 'session', 'PGRST303: JWT expired');
});

check('chaque message est une phrase française terminée par un point', () => {
  const samples: unknown[] = [
    'Invalid login credentials',
    'Email not confirmed',
    'TypeError: Load failed',
    'JWT expired',
    'permission denied for table x',
    'duplicate key value',
    'rate limit',
    appMessage('Séance introuvable : rien n’a été supprimé.'),
    'autre chose',
  ];
  const kinds = new Set<ErrorKind>();
  for (const sample of samples) {
    const described = describeError(sample);
    kinds.add(described.kind);
    assert.match(described.message, /^[A-ZÉ].*\.$/);
  }
  assert.equal(kinds.size, samples.length);
});

if (failures > 0) {
  console.error(`\n${failures} cas en échec sur ${total}.`);
  process.exitCode = 1;
} else {
  console.log(`\n${total} cas, tous passent.`);
}
