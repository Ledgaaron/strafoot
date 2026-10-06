import { formatShortDay } from './dates';
import type { Enums } from './types';

// Modules de séance proposés par le formulaire : liste fermée, seule source de
// vérité côté app. La contrainte sessions_module_check (migration 002) reprend
// MODULE_KEYS à l'identique : changer la liste demande une nouvelle migration.
// `match` et `test` ne sont pas des modules (chantiers ultérieurs).

export type SessionType = Enums<'session_type'>;

export type SessionModule = {
  key: string;
  label: string;
  /** Valeur de sessions.type quand ce module est choisi. */
  type: SessionType;
  defaultDurationMin: number;
};

export const MODULES = [
  { key: 'entrainement_club', label: 'Entraînement club', type: 'collectif', defaultDurationMin: 90 },
  { key: 'entrainement_specifique', label: 'Entraînement spécifique', type: 'solo', defaultDurationMin: 45 },
  { key: 'seance_libre', label: 'Séance libre', type: 'solo', defaultDurationMin: 45 },
  { key: 'recup_active', label: 'Récup active', type: 'recup', defaultDurationMin: 30 },
  { key: 'etirements', label: 'Étirements', type: 'recup', defaultDurationMin: 20 },
  { key: 'massage', label: 'Massage', type: 'recup', defaultDurationMin: 20 },
  { key: 'piscine', label: 'Piscine', type: 'recup', defaultDurationMin: 45 },
] as const satisfies readonly SessionModule[];

export type ModuleKey = (typeof MODULES)[number]['key'];

export const MODULE_KEYS: readonly ModuleKey[] = MODULES.map((entry) => entry.key);

/** Module présélectionné à la création, et défaut de la colonne en base. */
export const DEFAULT_MODULE_KEY: ModuleKey = 'seance_libre';

export function isModuleKey(value: string): value is ModuleKey {
  return MODULE_KEYS.some((key) => key === value);
}

export function getModule(key: ModuleKey): SessionModule {
  const found = MODULES.find((entry) => entry.key === key);
  if (!found) {
    // Inatteignable : key est typé ModuleKey.
    throw new Error(`Module inconnu : ${key}`);
  }
  return found;
}

/** Libellé d'une valeur lue en base ; la valeur brute si elle n'est pas dans la liste. */
export function moduleLabel(value: string): string {
  return isModuleKey(value) ? getModule(value).label : value;
}

/** Nom proposé par défaut : « Séance libre — mar. 7 oct. ». */
export function buildSessionName(key: ModuleKey, day: string): string {
  return `${getModule(key).label} — ${formatShortDay(day)}`;
}
