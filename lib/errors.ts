// Erreurs affichées en français : une seule fonction, describeError, par laquelle
// passe tout affichage d'erreur (components/field-error.tsx). Elle reçoit
// l'erreur telle qu'elle arrive (message brut de lib/db, AuthError, exception,
// valeur quelconque), en tire une famille et son message français, et garde le
// texte d'origine en détail : une erreur n'est jamais avalée. Seule traduction des
// erreurs techniques ; un message que l'app écrit elle-même en français (lib/db,
// marqué par appMessage) n'est pas traduit : il s'affiche tel quel. L'interface
// est en français seulement, sans système de traduction.
// Pure : ni React Native ni Supabase, testée par lib/errors.test.ts.

/**
 * Famille d'une erreur, d'où vient son message ; app : message écrit par l'app
 * (appMessage), affiché tel quel ; unknown : aucune règle ne la reconnaît.
 */
export type ErrorKind =
  | 'credentials'
  | 'emailNotConfirmed'
  | 'network'
  | 'session'
  | 'forbidden'
  | 'duplicate'
  | 'rateLimit'
  | 'app'
  | 'unknown';

/** Erreur technique : tout sauf un message écrit par l'app. */
type TechnicalKind = Exclude<ErrorKind, 'app'>;

/** Erreur prête à afficher : message français, et texte d'origine en détail (null s'il est vide). */
export type DescribedError = {
  kind: ErrorKind;
  message: string;
  detail: string | null;
};

/**
 * Marque invisible (U+2063, séparateur invisible) en tête d'un message écrit par
 * l'app : describeError le reconnaît sans dépendre de son texte. Sans largeur à
 * l'écran : une chaîne marquée affichée ailleurs reste lisible.
 */
const APP_MESSAGE_MARK = '⁣';

/**
 * Message écrit par l'app, déjà en français (« Séance introuvable : rien n'a été
 * supprimé. ») : describeError l'affichera tel quel, en message principal, sans
 * message générique ni détail. Pour lib/db, dont le contrat rend error en chaîne.
 */
export function appMessage(text: string): string {
  return `${APP_MESSAGE_MARK}${text}`;
}

const MESSAGES: Readonly<Record<TechnicalKind, string>> = {
  credentials: 'Email ou mot de passe incorrect.',
  emailNotConfirmed: 'Email pas encore confirmé : ouvre le lien reçu par email.',
  network: 'Réseau indisponible : vérifie ta connexion, puis réessaie.',
  session: 'Session expirée : reconnecte-toi.',
  forbidden: 'Accès refusé : cette action n’est pas permise à ton compte.',
  duplicate: 'Doublon : cette donnée existe déjà.',
  rateLimit: 'Trop de tentatives : attends un peu, puis réessaie.',
  unknown: 'Une erreur inattendue est survenue.',
};

/** Une famille : codes reconnus (Postgres, PostgREST, Supabase Auth) et motif du message brut. */
type Rule = { kind: Exclude<TechnicalKind, 'unknown'>; codes: readonly string[]; pattern: RegExp };

// Dans l'ordre : la première règle qui reconnaît le code ou le message l'emporte.
const RULES: readonly Rule[] = [
  // Supabase Auth : code depuis l'API 2024-01-01, message historique sinon.
  { kind: 'credentials', codes: ['invalid_credentials'], pattern: /invalid login credentials/i },
  { kind: 'emailNotConfirmed', codes: ['email_not_confirmed'], pattern: /email not confirmed/i },
  // Échec de fetch, préfixé « TypeError: » par PostgREST : Chrome « Failed to fetch »,
  // Safari « Load failed », Firefox « NetworkError when attempting to fetch resource »,
  // React Native « Network request failed », Node « fetch failed ».
  {
    kind: 'network',
    codes: [],
    pattern:
      /failed to fetch|load failed|networkerror|network request failed|fetch failed|network connection was lost|internet connection appears to be offline/i,
  },
  // Jeton expiré ou refusé (PostgREST PGRST301 à 303), session Auth disparue.
  {
    kind: 'session',
    codes: [
      'PGRST301',
      'PGRST302',
      'PGRST303',
      'bad_jwt',
      'no_authorization',
      'session_expired',
      'session_not_found',
      'refresh_token_not_found',
      'refresh_token_already_used',
    ],
    pattern: /\bjwt\b|\bjws|auth session missing|refresh token|session (?:expired|not found)/i,
  },
  // RLS ou privilèges manquants : Postgres 42501.
  { kind: 'forbidden', codes: ['42501'], pattern: /row-level security|permission denied/i },
  // Clé unique : Postgres 23505.
  { kind: 'duplicate', codes: ['23505'], pattern: /duplicate key/i },
  {
    kind: 'rateLimit',
    codes: ['over_request_rate_limit', 'over_email_send_rate_limit', 'over_sms_send_rate_limit'],
    pattern: /rate limit|too many requests/i,
  },
];

/** Statut HTTP seul (une AuthError en porte un) : dernier recours, après codes et messages. */
const STATUS_KINDS: Readonly<Partial<Record<number, Exclude<TechnicalKind, 'unknown'>>>> = {
  401: 'session',
  403: 'forbidden',
  429: 'rateLimit',
};

/** Ce que l'on sait lire d'une erreur : son texte, et son code et son statut s'il y en a. */
type ErrorFields = { text: string; code: string | null; status: number | null };

/**
 * Message français d'une erreur, et son texte d'origine en détail. Reçoit
 * n'importe quelle valeur : chaîne (message brut ou appMessage de lib/db), Error
 * ou objet { message, code, status } (AuthError, PostgrestError), ou autre chose.
 * Une cause technique reconnue l'emporte ; sinon, un message écrit par l'app
 * (appMessage) s'affiche tel quel, sans détail ; une erreur non reconnue reçoit
 * un message générique et garde tout son texte en détail. Un texte vide n'a pas
 * de détail.
 */
export function describeError(error: unknown): DescribedError {
  const { text, code, status } = readFields(error);
  // Marques retirées partout : un message de l'app réuni à une erreur technique (lib/db) reste lisible.
  const clean = text.split(APP_MESSAGE_MARK).join('').trim();
  const kind = classify(clean, code, status);
  if (kind === 'unknown' && clean !== '' && text.trimStart().startsWith(APP_MESSAGE_MARK)) {
    return { kind: 'app', message: clean, detail: null };
  }
  // Le code, s'il n'est pas déjà dans le texte : de quoi chercher l'erreur dans la documentation.
  const detail = code !== null && !clean.includes(code) ? `${clean} (${code})`.trim() : clean;
  return { kind, message: MESSAGES[kind], detail: detail === '' ? null : detail };
}

function classify(text: string, code: string | null, status: number | null): TechnicalKind {
  for (const rule of RULES) {
    if ((code !== null && rule.codes.includes(code)) || rule.pattern.test(text)) {
      return rule.kind;
    }
  }
  return (status !== null ? STATUS_KINDS[status] : undefined) ?? 'unknown';
}

function readFields(error: unknown): ErrorFields {
  if (typeof error === 'string') {
    return { text: error, code: null, status: null };
  }
  if (error === null || error === undefined) {
    return { text: '', code: null, status: null };
  }
  if (typeof error !== 'object') {
    return { text: String(error), code: null, status: null };
  }
  // Error ou objet d'erreur (AuthError, PostgrestError) : champs lus sans présumer de leur type.
  const message = 'message' in error ? error.message : undefined;
  const code = 'code' in error ? error.code : undefined;
  const status = 'status' in error ? error.status : undefined;
  let text: string;
  if (typeof message === 'string' && message !== '') {
    text = message;
  } else if (error instanceof Error) {
    // Exception sans message : son nom (« AbortError ») plutôt que rien.
    text = error.name;
  } else {
    text = safeJson(error);
  }
  return {
    text,
    code: typeof code === 'string' && code !== '' ? code : null,
    status: typeof status === 'number' ? status : null,
  };
}

/** Objet sans message : son JSON, sinon String (référence circulaire, BigInt). */
function safeJson(value: object): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
