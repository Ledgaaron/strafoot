import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayOfMonth, formatShortDay } from '../lib/dates';
import { colors, disabledOpacity, radius, size, spacing, text } from '../lib/theme';

/** Initiales du lundi au dimanche, au-dessus des cases. */
export const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

type DayCellProps = {
  day: string;
  /** Initiale du jour de la semaine au-dessus du numéro (bande des jours) ; absente dans la grille du mois. */
  initial?: string;
  isToday: boolean;
  isSelected: boolean;
  /** Jour après aujourd'hui : numéro en secondaire. */
  isFuture: boolean;
  /** Case inerte : jour à venir (bande, calendrier), jour passé (choix d'une échéance). */
  disabled?: boolean;
  /** Case inerte estompée (choix d'une date) ; par défaut, toute case inerte l'est. */
  faded?: boolean;
  hasTraining: boolean;
  hasQuiz: boolean;
  /** Jour à venir de club habituel : point creux orange à la place du point d'entraînement. */
  clubPlanned?: boolean;
  onPress: () => void;
};

/**
 * Case d'un jour, la même dans la bande des jours (Accueil) et la grille du
 * mois (MonthSheet) : numéro, aujourd'hui encadré accent, jour choisi sur
 * surface2, points entraînement / quiz dessous, point creux d'un club prévu.
 * Dépend de la largeur de la rangée (flex 1) ; au moins 48 px de haut.
 */
export function DayCell({
  day,
  initial,
  isToday,
  isSelected,
  isFuture,
  disabled = false,
  faded = disabled,
  hasTraining,
  hasQuiz,
  clubPlanned = false,
  onPress,
}: DayCellProps) {
  const label = `${formatShortDay(day)}${hasTraining ? ', entraînement' : ''}${hasQuiz ? ', quiz' : ''}${
    clubPlanned ? ', club prévu' : ''
  }`;
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      accessibilityState={{ selected: isSelected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cell,
        isToday && styles.todayCell,
        isSelected && styles.selectedCell,
        pressed && styles.pressedCell,
        faded && styles.fadedCell,
      ]}
    >
      {initial !== undefined ? (
        <Text style={[text.meta, isToday && styles.todayInitial]}>{initial}</Text>
      ) : null}
      <Text style={[text.title, text.tabular, isFuture && styles.futureNumber]}>{dayOfMonth(day)}</Text>
      <ActivityDots hasTraining={hasTraining} hasQuiz={hasQuiz} clubPlanned={clubPlanned} />
    </Pressable>
  );
}

/**
 * Rangée de hauteur fixe : le numéro ne bouge pas quand les points apparaissent.
 * Deux places fixes, entraînement à gauche, quiz à droite (ordre de la légende) :
 * la place double la couleur (orange, violet). Un club prévu occupe la place de
 * l'entraînement, en creux : il n'a pas encore eu lieu.
 */
function ActivityDots({ hasTraining, hasQuiz, clubPlanned }: { hasTraining: boolean; hasQuiz: boolean; clubPlanned: boolean }) {
  return (
    <View style={styles.dots}>
      <View style={[styles.dot, hasTraining ? styles.trainingDot : clubPlanned && styles.plannedDot]} />
      <View style={[styles.dot, hasQuiz && styles.quizDot]} />
    </View>
  );
}

/**
 * Légende des points : entraînement (orange), quiz (violet), et le club prévu
 * (point creux) là où des jours à venir l'affichent ; les mêmes points que les cases.
 */
export function ActivityLegend({ clubPlanned = false }: { clubPlanned?: boolean }) {
  return (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.dot, styles.trainingDot]} />
        <Text style={text.meta}>Entraînement</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.dot, styles.quizDot]} />
        <Text style={text.meta}>Quiz</Text>
      </View>
      {clubPlanned ? (
        <View style={styles.legendItem}>
          <View style={[styles.dot, styles.plannedDot]} />
          <Text style={text.meta}>Club prévu</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    minHeight: size.touch,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.button,
    // Bordure toujours présente, transparente : celle d'aujourd'hui ne décale rien.
    borderWidth: size.border,
    borderColor: 'transparent',
  },
  todayCell: {
    borderColor: colors.accent,
  },
  selectedCell: {
    backgroundColor: colors.surface2,
  },
  pressedCell: {
    backgroundColor: colors.surfacePressed,
  },
  fadedCell: {
    opacity: disabledOpacity,
  },
  todayInitial: {
    color: colors.text,
    fontWeight: '600',
  },
  futureNumber: {
    color: colors.textMuted,
  },
  dots: {
    height: size.dot,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dot: {
    width: size.dot,
    height: size.dot,
    borderRadius: size.dot / 2,
  },
  trainingDot: {
    backgroundColor: colors.accent,
  },
  quizDot: {
    backgroundColor: colors.quiz,
  },
  /** Point creux : contour orange, sans fond, dans la même place de 6 px. */
  plannedDot: {
    borderWidth: size.dotBorder,
    borderColor: colors.accent,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
