import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { buildMonthGrid, formatMonthTitle, monthOf, shiftMonth, type YearMonth } from '../lib/dates';
import { listActivityHistory, type ActivityDays } from '../lib/db/activity';
import { colors, spacing, text } from '../lib/theme';
import { BottomSheet } from './bottom-sheet';
import { Button } from './button';
import { ActivityLegend, DayCell, WEEKDAY_INITIALS } from './day-cell';
import { FieldError } from './field-error';
import { IconButton } from './icon-button';

/** browse : calendrier de l'Accueil, tous les jours ; pick : date d'une séance, jours à venir inertes. */
export type MonthSheetMode = 'browse' | 'pick';

type ActivityState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; days: ActivityDays };

type MonthSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Jour touché : le parent ferme la feuille (visible à false) et s'y place. */
  onPickDay: (day: string) => void;
  today: string;
  /** Jour mis en évidence (fond surface2). */
  selectedDay: string;
  /** Jour du mois affiché à l'ouverture (Accueil : la semaine affichée) ; sinon celui de selectedDay. */
  anchorDay?: string;
  mode: MonthSheetMode;
};

/**
 * Calendrier du mois en feuille du bas : mois précédent / suivant, grille du
 * lundi au dimanche avec les mêmes cases et points que la bande de la semaine,
 * légende. L'historique d'activité est relu à chaque ouverture ; la grille reste
 * utilisable avant qu'il n'arrive. Pas d'état vide : un mois sans point est un
 * mois sans activité.
 */
export function MonthSheet({ visible, onClose, onPickDay, today, selectedDay, anchorDay, mode }: MonthSheetProps) {
  const [displayedMonth, setDisplayedMonth] = useState<YearMonth>(() => monthOf(anchorDay ?? selectedDay));
  const [activity, setActivity] = useState<ActivityState>({ status: 'loading' });
  // Incrémenté par « Réessayer » : seul rôle, relancer la lecture.
  const [attempt, setAttempt] = useState(0);
  const todayMonth = monthOf(today);

  // À chaque ouverture : mois d'ancrage et historique relus (une séance a pu être ajoutée entre-temps).
  useEffect(() => {
    if (!visible) {
      return;
    }
    setDisplayedMonth(monthOf(anchorDay ?? selectedDay));
    setActivity({ status: 'loading' });
    let active = true;
    listActivityHistory(today).then(({ data, error }) => {
      if (!active) {
        return;
      }
      if (error !== null || data === null) {
        setActivity({ status: 'error', message: error ?? 'Supabase n’a renvoyé ni les jours actifs ni d’erreur.' });
        return;
      }
      setActivity({ status: 'ready', days: data });
    });
    return () => {
      active = false;
    };
  }, [visible, today, anchorDay, selectedDay, attempt]);

  function retry() {
    setAttempt((count) => count + 1);
  }

  const days = activity.status === 'ready' ? activity.days : null;
  // Choix d'une date : rien à choisir après le mois courant.
  const nextDisabled = mode === 'pick' && !isBefore(displayedMonth, todayMonth);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={mode === 'pick' ? 'Date de la séance' : 'Calendrier'}>
      <View style={styles.nav}>
        <IconButton
          icon="chevron-back"
          subtle
          accessibilityLabel="Mois précédent"
          onPress={() => setDisplayedMonth((current) => shiftMonth(current, -1))}
        />
        <Text role="heading" style={[text.title, styles.monthTitle]}>
          {formatMonthTitle(displayedMonth)}
        </Text>
        <IconButton
          icon="chevron-forward"
          subtle
          accessibilityLabel="Mois suivant"
          disabled={nextDisabled}
          onPress={() => setDisplayedMonth((current) => shiftMonth(current, 1))}
        />
      </View>

      <View>
        <View style={styles.week}>
          {WEEKDAY_INITIALS.map((initial, index) => (
            <Text key={index} style={[text.meta, styles.weekday]}>
              {initial}
            </Text>
          ))}
        </View>
        {buildMonthGrid(displayedMonth).map((week, weekIndex) => (
          <View key={weekIndex} style={styles.week}>
            {week.map((cellDay, cellIndex) =>
              cellDay === null ? (
                <View key={cellIndex} style={styles.blank} />
              ) : (
                <DayCell
                  key={cellIndex}
                  day={cellDay}
                  isToday={cellDay === today}
                  isSelected={cellDay === selectedDay}
                  // Jours YYYY-MM-DD : l'ordre des chaînes est l'ordre des jours.
                  isFuture={cellDay > today}
                  disabled={mode === 'pick' && cellDay > today}
                  hasTraining={days !== null && days.trainingDays.has(cellDay)}
                  hasQuiz={days !== null && days.quizDays.has(cellDay)}
                  onPress={() => onPickDay(cellDay)}
                />
              ),
            )}
          </View>
        ))}
      </View>

      <ActivityLegend />

      {activity.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
      {activity.status === 'error' ? (
        <>
          <FieldError message={`Erreur : ${activity.message}`} />
          <Button variant="secondary" label="Réessayer" onPress={retry} />
        </>
      ) : null}
    </BottomSheet>
  );
}

function isBefore(a: YearMonth, b: YearMonth): boolean {
  return a.year < b.year || (a.year === b.year && a.month < b.month);
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  monthTitle: {
    flex: 1,
    textAlign: 'center',
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
  },
  // Sept colonnes sans écart : chaque case garde toute la largeur disponible.
  blank: {
    flex: 1,
  },
});
