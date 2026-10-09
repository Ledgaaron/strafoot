import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayOfMonth, formatShortDay } from '../lib/dates';
import { colors, disabledOpacity, radius, size, spacing, text } from '../lib/theme';

/** Initiales du lundi au dimanche, au-dessus des cases. */
export const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

type DayCellProps = {
  day: string;
  /** Initiale du jour de la semaine au-dessus du numéro (bande de la semaine) ; absente dans la grille du mois. */
  initial?: string;
  isToday: boolean;
  isSelected: boolean;
  /** Jour après aujourd'hui : numéro en secondaire ; inerte si la case sert à choisir une date passée. */
  isFuture: boolean;
  disabled?: boolean;
  hasTraining: boolean;
  hasQuiz: boolean;
  onPress: () => void;
};

/**
 * Case d'un jour, la même dans la bande de la semaine (Accueil) et la grille du
 * mois (MonthSheet) : numéro, aujourd'hui encadré accent, jour choisi sur
 * surface2, points entraînement / quiz dessous. Dépend de la largeur de la rangée
 * (flex 1) ; au moins 48 px de haut.
 */
export function DayCell({
  day,
  initial,
  isToday,
  isSelected,
  isFuture,
  disabled = false,
  hasTraining,
  hasQuiz,
  onPress,
}: DayCellProps) {
  const label = `${formatShortDay(day)}${hasTraining ? ', entraînement' : ''}${hasQuiz ? ', quiz' : ''}`;
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
        disabled && styles.disabledCell,
      ]}
    >
      {initial !== undefined ? (
        <Text style={[text.meta, isToday && styles.todayInitial]}>{initial}</Text>
      ) : null}
      <Text style={[text.title, text.tabular, isFuture && styles.futureNumber]}>{dayOfMonth(day)}</Text>
      <ActivityDots hasTraining={hasTraining} hasQuiz={hasQuiz} />
    </Pressable>
  );
}

/**
 * Rangée de hauteur fixe : le numéro ne bouge pas quand les points apparaissent.
 * Deux places fixes, entraînement à gauche, quiz à droite (ordre de la légende) :
 * la place double la couleur (orange, violet).
 */
function ActivityDots({ hasTraining, hasQuiz }: { hasTraining: boolean; hasQuiz: boolean }) {
  return (
    <View style={styles.dots}>
      <View style={[styles.dot, hasTraining && styles.trainingDot]} />
      <View style={[styles.dot, hasQuiz && styles.quizDot]} />
    </View>
  );
}

/** Légende des points : entraînement (orange), quiz (violet) ; les mêmes points que les cases. */
export function ActivityLegend() {
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
  disabledCell: {
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
