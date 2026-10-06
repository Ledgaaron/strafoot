import { DarkTheme, type Theme } from 'expo-router';
import { StyleSheet } from 'react-native';

// Design system : seule source de style de l'app, avec components/ (Screen, Card,
// Chip, Button, Stat, EmptyState, FieldError). Un écran n'écrit aucune couleur,
// taille ni espacement en dur : il combine ces tokens et ces composants. Sombre
// seulement, pas de mode clair ; police système, aucune police custom.

export const colors = {
  bg: '#0B0B0D',
  surface: '#141417',
  surface2: '#1E1E23',
  border: '#2A2A31',
  text: '#F4F4F5',
  textMuted: '#9C9CA6',
  accent: '#FF6A1A',
  accentPressed: '#E55C12',
  onAccent: '#0B0B0D',
  // #E5383B demandé : 4,34:1 sur surface et 3,92:1 sur surface2, sous le minimum
  // de 4,5:1. Même teinte, éclaircie au minimum : 4,51:1 sur surface2.
  danger: '#E85052',
  success: '#3DD68C',
  quiz: '#FF8F5E',
} as const;

export const fontSize = {
  // 13 demandé : sous le minimum de 14 px du texte secondaire.
  meta: 14,
  body: 16,
  title: 20,
  screen: 28,
  hero: 44,
} as const;

const LINE_HEIGHT_RATIO = 1.4;
/** Grands chiffres : interligne serré, le chiffre reste collé à son libellé. */
const HERO_LINE_HEIGHT_RATIO = 1.1;

export const lineHeight: Readonly<Record<keyof typeof fontSize, number>> = {
  meta: fontSize.meta * LINE_HEIGHT_RATIO,
  body: fontSize.body * LINE_HEIGHT_RATIO,
  title: fontSize.title * LINE_HEIGHT_RATIO,
  screen: fontSize.screen * LINE_HEIGHT_RATIO,
  hero: fontSize.hero * HERO_LINE_HEIGHT_RATIO,
};

/** Échelle d'espacement : 4, 8, 12, 16, 24, 32. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  card: 12,
  chip: 999,
  button: 12,
} as const;

/** Dimensions fixes partagées par les composants et les écrans. */
export const size = {
  /** Cible tactile minimale. */
  touch: 48,
  chip: 44,
  button: 52,
  input: 48,
  /** Option de quizz : hauteur minimale. */
  option: 56,
  /** Trait des bordures et des repères. */
  border: 1,
  /** Point d'activité du calendrier. */
  dot: 6,
  /** Icônes d'interface (chevrons). */
  icon: 24,
  /** Courbe d'une mesure : épaisseur du trait, rayon des points. */
  chartStroke: 2,
  chartPoint: 4,
} as const;

const SLOP = (size.touch - size.chip) / 2;

/**
 * Zone tactile agrandie de 2 px par côté : une Chip de 44 px répond sur 48 px.
 * Deux éléments qui la portent s'espacent de spacing.md (layout.chipRow) : il
 * reste 8 px entre leurs zones tactiles.
 */
export const hitSlop = { top: SLOP, bottom: SLOP, left: SLOP, right: SLOP } as const;

/** Opacité d'un élément désactivé. */
export const disabledOpacity = 0.4;

/** Styles de texte : une taille, son interligne de 1,4 et sa couleur. */
export const text = StyleSheet.create({
  /** Secondaire : unités, dates, détails, libellés de chiffres. */
  meta: {
    fontSize: fontSize.meta,
    lineHeight: lineHeight.meta,
    color: colors.textMuted,
  },
  body: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    color: colors.text,
  },
  /** Titre d'une carte, valeur mise en avant dans une ligne. */
  bodyStrong: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: '600',
    color: colors.text,
  },
  /** Titre de section ou de contenu. */
  title: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: '600',
    color: colors.text,
  },
  /** Titre d'écran, posé par Screen. */
  screen: {
    fontSize: fontSize.screen,
    lineHeight: lineHeight.screen,
    fontWeight: '700',
    color: colors.text,
  },
  /** Chiffre dominant, posé par Stat. */
  hero: {
    fontSize: fontSize.hero,
    lineHeight: lineHeight.hero,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  /** Intertitre et libellé de champ : meta en majuscules espacées (« OBJECTIF », « DATE »). */
  overline: {
    fontSize: fontSize.meta,
    lineHeight: lineHeight.meta,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  /** Chiffres de même largeur : une colonne de nombres reste alignée. */
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  /**
   * Unité imbriquée dans le Text d'un nombre plus grand (« 45 min ») : taille et
   * couleur de meta, sans interligne propre. Sur Android, le dernier interligne
   * posé sur une ligne l'emporte : celui de meta (20 px) écraserait celui du nombre.
   */
  unit: {
    fontSize: fontSize.meta,
    color: colors.textMuted,
  },
});

/** Mises en page répétées d'un écran à l'autre. */
export const layout = StyleSheet.create({
  /** Puces à la ligne, 12 px entre elles : 8 px entre leurs zones tactiles. */
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  /** Boutons côte à côte (pied d'écran) : 8 px entre deux cibles. */
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  /** Bloc titre + contenu d'une section. */
  section: {
    gap: spacing.md,
  },
});

/** Champs de saisie : surface2, 48 px de haut, texte body. */
export const input = StyleSheet.create({
  field: {
    minHeight: size.input,
    paddingHorizontal: spacing.md,
    borderWidth: size.border,
    // Bordure de la couleur du fond : le passage à « invalid » ne décale rien.
    borderColor: colors.surface2,
    borderRadius: radius.button,
    backgroundColor: colors.surface2,
    color: colors.text,
    fontSize: fontSize.body,
  },
  /** Champ refusé, au-dessus de sa FieldError. */
  invalid: {
    borderColor: colors.danger,
  },
  multiline: {
    minHeight: size.input * 2,
    paddingVertical: spacing.md,
    textAlignVertical: 'top',
  },
});

/** Props communes de tout TextInput, à étaler avant les siennes. */
export const inputProps = {
  placeholderTextColor: colors.textMuted,
  selectionColor: colors.accent,
  keyboardAppearance: 'dark',
} as const;

/** Thème de navigation : fond des écrans, en-têtes natifs et barre d'onglets aux couleurs des tokens. */
export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};
