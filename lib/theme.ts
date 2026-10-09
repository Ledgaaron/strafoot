import { DarkTheme, type Theme } from 'expo-router';
import { Easing, Platform, StyleSheet } from 'react-native';

// Design system : seule source de style de l'app, avec components/ (Screen, Card,
// Chip, Button, IconButton, Stat, DurationValue, Flame, EmptyState, FieldError,
// SaveToast, PitchPlaceholder, Diagram, DayCell, BottomSheet, MonthSheet,
// ModuleIcon, StartRow, exercise-content). Référence :
// design/Strafoot_Direction_Artistique.html
// (Palette, Typographie, Composants, Illustration, Mouvement, Tokens) et design/maquettes/.
// Un écran n'écrit aucune couleur, taille ni espacement en dur : il combine ces
// tokens et ces composants. Sombre seulement, pas de mode clair ; police système
// pour tout le texte, une seule police d'affichage (Barlow Condensed) pour les
// chiffres de 28 px et plus (text.number, text.hero), et l'encart score · minute
// des schémas (text.scoreboard, 20 px, DA).

export const colors = {
  /** Fond de tous les écrans ; recopié en dur dans public/index.html et public/manifest.webmanifest. */
  bg: '#101013',
  /** Cartes, barre d'onglets, schémas. */
  surface: '#18181C',
  /** Champs, bouton secondaire, puces, bouton icône. */
  surface2: '#222228',
  /** État pressé de toute surface (carte, bouton secondaire, bouton icône, ligne, case). */
  surfacePressed: '#2A2A31',
  /** Bordures et séparateurs : décoratif (1,4:1), jamais seul porteur d'information. */
  border: '#2E2E36',
  /** Texte principal et chiffres : 17,3:1 sur bg. */
  text: '#F4F4F5',
  /** Secondaire, unités, dénominateurs : 7,4:1 sur bg, 6,2:1 sur surface2 (textSecondary de la DA). */
  textMuted: '#A1A1AB',
  /** Action principale, série d'entraînement, onglet actif : 6,6:1 sur bg, 5,5:1 sur surface2. */
  accent: '#FF6A1A',
  /** Bouton principal pressé : 5,0:1 sur bg. */
  accentPressed: '#E0580F',
  /** accent à 14 % : fond d'une puce choisie, d'une carte mise en évidence ; texte orange dessus (5,1:1). */
  accentTint: 'rgba(255,106,26,0.14)',
  /** Texte posé sur orange, violet ou vert (= bg) : le blanc sur orange tombe à 2,6:1. */
  onAccent: '#101013',
  /** Alertes, erreurs, régressions, choix faible : 5,7:1 sur bg, 4,8:1 sur surface2. */
  danger: '#F05A5C',
  /** Pastille « Erreur » du quiz (chantier 13) seulement, glyphe blanc ; jamais en texte (3,6:1). */
  error: '#C23A3D',
  /** Progression, record, coche de mesure, meilleur choix : 10,1:1 sur bg. */
  success: '#3DD68C',
  /** success à 14 % : fond d'une ligne de mesure validée. */
  successSoft: 'rgba(61,214,140,0.14)',
  /** Tout ce qui touche au quiz (série, options, bouton) : 7,0:1 sur bg, 5,8:1 sur surface2. */
  quiz: '#A78BFA',
  /** Bouton quiz pressé : 5,3:1 sur bg. */
  quizPressed: '#8F72F0',
  /** quiz à 14 % : réponse sélectionnée, puce choisie du quiz, étiquette de thème. */
  quizTint: 'rgba(167,139,250,0.14)',
  /** quiz à 22 % → 0 : lueur du haut des écrans quiz (chantier 13), seule lueur de l'app. */
  quizGlow: 'rgba(167,139,250,0.22)',
  /** Lignes des schémas et du terrain par défaut ; barre d'une semaine vide du graphe de régularité (DA). */
  pitchLine: '#3A3A44',
  /** bg à 60 % : voile derrière une feuille du bas, sous le flou (ou seul quand le flou manque). */
  scrim: 'rgba(16,16,19,0.6)',
} as const;

/** Dégradé réservé au quiz : barre de palier Elo (chantier 13), jamais derrière du texte. */
export const quizGradient = {
  colors: [colors.accent, colors.quiz],
  angle: 135,
} as const;

/**
 * Échelle de la DA. Noms gardés d'avant : meta = caption (14), screen = headline
 * (28). number (44) et hero (72) sont les deux styles en police d'affichage, avec
 * l'encart des schémas (text.scoreboard, à la taille title).
 */
export const fontSize = {
  meta: 14,
  body: 16,
  title: 20,
  screen: 28,
  number: 44,
  hero: 72,
} as const;

/** Interlignes de la DA : 14/20, 16/24, 20/26, 28/32, 44/44, 72/68 ; libellé de bouton 16/20 ; encart d'un schéma 20/28. */
export const lineHeight = {
  meta: 20,
  body: 24,
  title: 26,
  screen: 32,
  number: 44,
  hero: 68,
  button: 20,
  scoreboard: 28,
} as const;

/** Intertitres et libellés en majuscules : espacement de 6 % (0,84 px à 14 px). */
const LABEL_LETTER_SPACING = fontSize.meta * 0.06;

/** Dénominateur d'un chiffre number (« /99 ») : 40 % de sa taille, même police héritée, même ligne de base. */
const DENOMINATOR_FONT_SIZE = fontSize.number * 0.4;

/**
 * Police d'affichage : Barlow Condensed 600 et 700, chargée au démarrage par
 * app/_layout.tsx (@expo-google-fonts/barlow-condensed). Référencée ici seulement,
 * par text.number, text.hero et text.scoreboard. Si elle n'a pas chargé : police
 * système, par le repli déclaré sur le web, par le système lui-même en natif
 * (nom inconnu).
 */
const DISPLAY_FONT = {
  semiBold: displayFamily('BarlowCondensed_600SemiBold'),
  bold: displayFamily('BarlowCondensed_700Bold'),
} as const;

function displayFamily(name: string): string {
  return Platform.OS === 'web' ? `${name}, system-ui, sans-serif` : name;
}

/** Échelle d'espacement : 4, 8, 12, 16, 24, 32, 48. Marge d'écran 16, entre cartes 12, dans une carte 16. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Rayons : sm encarts, md boutons et champs, lg cartes, xl feuilles, pill puces. */
const RADIUS_SCALE = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** L'échelle, plus les noms des objets qui la portent. */
export const radius = {
  ...RADIUS_SCALE,
  card: RADIUS_SCALE.lg,
  button: RADIUS_SCALE.md,
  chip: RADIUS_SCALE.pill,
  /** Haut d'une barre du graphe de régularité (DA : 4 px en haut, 2 px en bas). */
  bar: 4,
} as const;

/**
 * Onglet de react-navigation, libellé sous l'icône : 5 px de marge en haut et
 * en bas, icône de 28 px, puis le libellé (meta, sur son interligne).
 */
const TAB_ITEM_PADDING = 5;
const TAB_ICON_HEIGHT = 28;

/** Dimensions fixes partagées par les composants et les écrans. */
export const size = {
  /** Cible tactile minimale (touch.min). */
  touch: 48,
  chip: 48,
  /** Bouton principal et secondaire (touch.button). */
  button: 56,
  input: 48,
  /** Option de quiz : hauteur minimale. */
  option: 56,
  /** Trait des bordures et des repères. */
  border: 1,
  /** Contour d'une puce choisie. */
  chipBorder: 1.5,
  /** Point d'activité du calendrier. */
  dot: 6,
  /** Icônes d'interface (chevrons). */
  icon: 24,
  /** Coche d'une puce choisie. */
  iconSmall: 16,
  /** Flamme de série : de la hauteur des capitales du chiffre number (0,7 × 44). */
  flame: 32,
  /**
   * Bouton compact (‹ › d'une carte, −5 / +5 de la durée) : 32 px visibles, zone
   * tactile ramenée à touch par un hitSlop de (touch − compactButton) / 2 ; deux
   * boutons compacts voisins se tiennent à 16 px pour que leurs zones ne se recouvrent pas.
   */
  compactButton: 32,
  /**
   * Barre d'onglets, hors indicateur d'accueil : le libellé de 14 px tient en
   * entier sous l'icône (les 49 px par défaut le coupaient à mi-hauteur).
   */
  tabBar: Math.ceil(TAB_ITEM_PADDING * 2 + TAB_ICON_HEIGHT + lineHeight.meta),
  /** Traits dessinés (courbe d'une mesure, terrain par défaut, flamme) ; rayon des points de la courbe. */
  chartStroke: 2,
  chartPoint: 4,
  /** Avatar rond de l'en-tête du Profil (maquette ecran-profil.png). */
  avatar: 56,
  /** Hauteur des barres du graphe de régularité du Profil (DA, carte Régularité) : la plus haute semaine. */
  barChart: 80,
} as const;

/** Opacité d'un élément désactivé. */
export const disabledOpacity = 0.4;

/**
 * Mouvement : liste fermée a–e (CLAUDE.md), API Animated et LayoutAnimation
 * seulement, jamais Reanimated. Le mouvement confirme une action ; les chiffres
 * acquis ne s'animent pas à l'affichage ; le rouge ne clignote jamais ; avec
 * « Réduire les animations » (lib/reduce-motion.ts), seul l'appui reste. Durées
 * en ms, courbe unique, aucun ressort ni dépassement.
 */
export const motion = {
  /** a. Appui : échelle pressScale et fond un cran plus sombre. */
  press: 100,
  /** b, d. Teinte et coche d'une mesure validée ; remplissage de la flamme et chiffre de streak. */
  micro: 160,
  /** b, c, e. Pulsation d'une mesure validée, confirmation d'enregistrement, explications du quiz. */
  base: 240,
  /** Changement d'écran ; feuille du bas (BottomSheet) : glissement et voile. */
  screen: 320,
  /** Décompte de l'Elo après réponse (chantier 13), une seule fois. */
  count: 600,
  /** cubic-bezier(0.2, 0, 0, 1). */
  easing: Easing.bezier(0.2, 0, 0, 1),
  pressScale: 0.98,
  /** b. Ligne de mesure validée : 1 → 1,03 → 1. */
  validateScale: 1.03,
  /** c. Confirmation d'enregistrement : glisse de 24 px vers le haut, visible 2 s. */
  toastOffset: spacing.xl,
  toastVisibleMs: 2000,
  /** Pilote natif hors web : react-native-web n'en a pas et le signale en console. */
  useNativeDriver: Platform.OS !== 'web',
} as const;

/** Styles de texte : une taille, son interligne et sa couleur. */
export const text = StyleSheet.create({
  /** Secondaire (caption) : unités, dates, détails, libellés de chiffres. */
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
  /** Libellé d'un bouton (Button) : 16/20, 700 ; la couleur vient de la variante. */
  button: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.button,
    fontWeight: '700',
  },
  /** Titre de section ou de contenu. */
  title: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: '600',
    color: colors.text,
  },
  /** Titre d'écran (headline), posé par Screen. */
  screen: {
    fontSize: fontSize.screen,
    lineHeight: lineHeight.screen,
    fontWeight: '700',
    color: colors.text,
  },
  /**
   * Chiffre dominant (Stat) : police d'affichage, chiffres tabulaires. Pas de
   * fontWeight : la graisse est celle du fichier de police (le web en ferait un
   * faux gras).
   */
  number: {
    fontSize: fontSize.number,
    lineHeight: lineHeight.number,
    fontFamily: DISPLAY_FONT.semiBold,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  /** Chiffre héros, un par écran au plus (Elo du quiz, chantier 13). */
  hero: {
    fontSize: fontSize.hero,
    lineHeight: lineHeight.hero,
    fontFamily: DISPLAY_FONT.bold,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  /**
   * Encart score · minute d'un schéma (« 2–1 78’ », components/diagram.tsx) :
   * chiffres d'affichage à 20 px, seule exception de la DA aux 28 px et plus.
   */
  scoreboard: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.scoreboard,
    fontFamily: DISPLAY_FONT.semiBold,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  /**
   * Dénominateur imbriqué dans le Text d'un chiffre number (« 74/99 ») : police
   * héritée, 40 % de la taille, secondaire, sans interligne propre (sur Android,
   * le dernier interligne posé sur une ligne l'emporte).
   */
  denominator: {
    fontSize: DENOMINATOR_FONT_SIZE,
    color: colors.textMuted,
  },
  /** Intertitre et libellé de champ (label) : meta en majuscules espacées (« OBJECTIF », « DATE »). */
  overline: {
    fontSize: fontSize.meta,
    lineHeight: lineHeight.meta,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: LABEL_LETTER_SPACING,
  },
  /** Chiffres de même largeur : une colonne de nombres reste alignée. */
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  /**
   * Unité imbriquée dans le Text d'un nombre plus grand (« 45 min ») : taille et
   * couleur de meta, sans interligne propre (voir denominator).
   */
  unit: {
    fontSize: fontSize.meta,
    color: colors.textMuted,
  },
});

/** Mises en page répétées d'un écran à l'autre. */
export const layout = StyleSheet.create({
  /** Puces de 48 px à la ligne, 12 px entre elles. */
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

/** Champs de saisie : surface2, 48 px de haut, coins md, texte body. */
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
