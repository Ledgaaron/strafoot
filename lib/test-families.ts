import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

// Compétences et familles de tests : listes fermées, seule source de vérité côté
// app et script. Une famille est un sous-type d'une compétence (« Tir · Frappe à
// l'arrêt ») ; chaque test atomique (training_sheets kind test) en porte une. La
// contrainte training_sheets_family_check (migration 007) reprend FAMILY_KEYS à
// l'identique : changer la liste demande une nouvelle migration. Une famille sans
// test en base existe ici mais ne s'affiche pas.
// Aucun import à l'exécution : le script de seed la charge avec npx tsx.

/** Nom d'une icône Ionicons (même type que IconName de components/icon-button.tsx, sans importer un composant ici). */
type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type Skill = {
  /** Valeur de training_sheets.skill des tests et des sessions. */
  key: string;
  label: string;
  /** Icône Ionicons de la section de la compétence (onglet Tests). */
  icon: IoniconName;
};

export const SKILLS = [
  { key: 'tir', label: 'Tir', icon: 'football-outline' },
  { key: 'passe', label: 'Passe', icon: 'swap-horizontal' },
  { key: 'dribble', label: 'Dribble', icon: 'shuffle' },
  { key: 'jonglerie', label: 'Jonglerie', icon: 'repeat' },
  { key: 'physique', label: 'Physique', icon: 'speedometer-outline' },
] as const satisfies readonly Skill[];

export type SkillKey = (typeof SKILLS)[number]['key'];

export type TestFamily = {
  key: string;
  /** Libellé court, lu après la compétence : « Tir · Frappe à l’arrêt », « Jonglerie · Tête ». */
  label: string;
  skill: SkillKey;
};

export const TEST_FAMILIES = [
  { key: 'tir_arret', label: 'Frappe à l’arrêt', skill: 'tir' },
  { key: 'tir_surface', label: 'Finition dans la surface', skill: 'tir' },
  { key: 'tir_mouvement', label: 'Frappe en mouvement', skill: 'tir' },
  { key: 'tir_loin', label: 'Frappe de loin', skill: 'tir' },
  { key: 'tir_dos', label: 'Dos au jeu', skill: 'tir' },
  { key: 'passe_courte', label: 'Passe courte', skill: 'passe' },
  { key: 'passe_longue', label: 'Passe longue', skill: 'passe' },
  { key: 'passe_remise', label: 'Remise en une touche', skill: 'passe' },
  { key: 'passe_mouvement', label: 'Passe en mouvement', skill: 'passe' },
  { key: 'passe_centre', label: 'Centre', skill: 'passe' },
  { key: 'dribble_slalom', label: 'Changements de direction', skill: 'dribble' },
  { key: 'dribble_conduite', label: 'Conduite de vitesse', skill: 'dribble' },
  { key: 'dribble_controle', label: 'Prise de balle', skill: 'dribble' },
  { key: 'dribble_aerien', label: 'Contrôle aérien', skill: 'dribble' },
  { key: 'jonglerie_pieds', label: 'Pieds', skill: 'jonglerie' },
  { key: 'jonglerie_tete', label: 'Tête', skill: 'jonglerie' },
  { key: 'jonglerie_enchainement', label: 'Enchaînements', skill: 'jonglerie' },
  { key: 'phys_vitesse', label: 'Vitesse', skill: 'physique' },
  { key: 'phys_agilite', label: 'Agilité', skill: 'physique' },
  { key: 'phys_endurance', label: 'Endurance', skill: 'physique' },
  { key: 'phys_gainage', label: 'Gainage', skill: 'physique' },
] as const satisfies readonly TestFamily[];

export type FamilyKey = (typeof TEST_FAMILIES)[number]['key'];

export const SKILL_KEYS: readonly SkillKey[] = SKILLS.map((skill) => skill.key);

export const FAMILY_KEYS: readonly FamilyKey[] = TEST_FAMILIES.map((family) => family.key);

/**
 * Rang d'une famille dans une session (ordre fixe, résultats comparables d'une
 * fois sur l'autre) : vitesse puis agilité d'abord, à frais ; l'endurance, qui
 * épuise, en dernier ; les autres entre les deux, à égalité.
 */
const SESSION_FIRST: readonly FamilyKey[] = ['phys_vitesse', 'phys_agilite'];
const SESSION_LAST: readonly FamilyKey[] = ['phys_endurance'];

export function isSkillKey(value: string): value is SkillKey {
  return SKILL_KEYS.some((key) => key === value);
}

export function isFamilyKey(value: string): value is FamilyKey {
  return FAMILY_KEYS.some((key) => key === value);
}

export function getSkill(key: SkillKey): Skill {
  const found = SKILLS.find((skill) => skill.key === key);
  if (!found) {
    // Inatteignable : key est typé SkillKey.
    throw new Error(`Compétence inconnue : ${key}`);
  }
  return found;
}

export function getFamily(key: FamilyKey): TestFamily {
  const found = TEST_FAMILIES.find((family) => family.key === key);
  if (!found) {
    // Inatteignable : key est typé FamilyKey.
    throw new Error(`Famille inconnue : ${key}`);
  }
  return found;
}

/** « Tir · Frappe à l’arrêt » : la famille lue avec sa compétence. */
export function familyCaption(key: FamilyKey): string {
  const family = getFamily(key);
  return `${getSkill(family.skill).label} · ${family.label}`;
}

/** Rang d'une famille dans TEST_FAMILIES : ordre d'affichage et dernier départage. */
export function familyIndex(key: FamilyKey): number {
  return FAMILY_KEYS.indexOf(key);
}

/** Place d'un test dans une session selon sa famille : 0 vitesse, 1 agilité, 2 les autres, 3 endurance. */
export function sessionRank(key: FamilyKey): number {
  const first = SESSION_FIRST.indexOf(key);
  if (first !== -1) {
    return first;
  }
  return SESSION_LAST.includes(key) ? SESSION_FIRST.length + 1 : SESSION_FIRST.length;
}
