import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { isClubPlannedDay, usualClubWeekdays } from '../lib/club';
import { buildMonthGrid, formatMonthTitle, monthOf, shiftMonth, type YearMonth } from '../lib/dates';
import { listActivityHistory, type ActivityHistory } from '../lib/db/activity';
import { colors, spacing, text } from '../lib/theme';
import { BottomSheet } from './bottom-sheet';
import { Button } from './button';
import { ActivityLegend, DayCell, WEEKDAY_INITIALS } from './day-cell';
import { FieldError } from './field-error';
import { IconButton } from './icon-button';

/**
 * browse : calendrier de l'Accueil, jours passés et aujourd'hui, jours à venir
 * inertes avec leurs clubs prévus ; pick : date d'une séance, jours à venir
 * inertes et estompés ; deadline : échéance d'un objectif, jours à venir
 * seulement (aujourd'hui et avant inertes et estompés), sans points.
 */
export type CalendarMode = 'browse' | 'pick' | 'deadline';

/** La feuille du mois porte les deux premiers ; l'échéance se choisit dans la feuille d'un objectif. */
export type MonthSheetMode = Exclude<CalendarMode, 'deadline'>;

type ActivityState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; days: ActivityHistory };

type MonthSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Jour touché : le parent ferme la feuille (visible à false) et s'y place. */
  onPickDay: (day: string) => void;
  today: string;
  /** Jour mis en évidence (fond surface2). */
  selectedDay: string;
  /** Jour du mois affiché à l'ouverture (Accueil : les jours visibles de la bande) ; sinon celui de selectedDay. */
  anchorDay?: string;
  mode: MonthSheetMode;
};

/**
 * Calendrier du mois en feuille du bas : MonthCalendar et sa légende.
 * L'historique d'activité est relu à chaque ouverture ; la grille reste
 * utilisable avant qu'il n'arrive. Pas d'état vide : un mois sans point est un
 * mois sans activité.
 */
export function MonthSheet({ visible, onClose, onPickDay, today, selectedDay, anchorDay, mode }: MonthSheetProps) {
  const [activity, setActivity] = useState<ActivityState>({ status: 'loading' });
  // Incrémenté par « Réessayer » : seul rôle, relancer la lecture.
  const [attempt, setAttempt] = useState(0);

  // À chaque ouverture, historique relu (une séance a pu être ajoutée entre-temps).
  // Le mois affiché repart de anchorDay : la grille est remontée à chaque ouverture.
  useEffect(() => {
    if (!visible) {
      return;
    }
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
  }, [visible, today, attempt]);

  function retry() {
    setAttempt((count) => count + 1);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={mode === 'pick' ? 'Date de la séance' : 'Calendrier'}>
      <MonthCalendar
        today={today}
        selectedDay={selectedDay}
        anchorDay={anchorDay}
        mode={mode}
        activity={activity.status === 'ready' ? activity.days : null}
        onPickDay={onPickDay}
      />

      {activity.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
      {activity.status === 'error' ? (
        <>
          <FieldError error={activity.message} />
          <Button variant="secondary" label="Réessayer" onPress={retry} />
        </>
      ) : null}
    </BottomSheet>
  );
}

type MonthCalendarProps = {
  today: string;
  /** Jour mis en évidence (fond surface2). */
  selectedDay: string;
  /** Jour du mois affiché au montage ; sinon celui de selectedDay. */
  anchorDay?: string;
  mode: CalendarMode;
  /** Points et clubs prévus ; null : aucun (historique pas encore lu, ou choix d'une échéance). */
  activity: ActivityHistory | null;
  onPickDay: (day: string) => void;
};

/**
 * Grille d'un mois : mois précédent / suivant, initiales des jours, cases du
 * lundi au dimanche (les mêmes que la bande des jours), légende des points.
 * Le mois affiché vit dans la grille : la remonter le remet sur anchorDay.
 */
export function MonthCalendar({ today, selectedDay, anchorDay, mode, activity, onPickDay }: MonthCalendarProps) {
  const [displayedMonth, setDisplayedMonth] = useState<YearMonth>(() => monthOf(anchorDay ?? selectedDay));
  const todayMonth = monthOf(today);
  // Jours de club habituels : points creux des jours à venir, au calendrier de l'Accueil seulement.
  const clubWeekdays = useMemo(
    () => (mode === 'browse' && activity !== null ? usualClubWeekdays(activity.sessions, today) : new Set<number>()),
    [mode, activity, today],
  );
  // Choix d'une date passée : rien à choisir après le mois courant ; d'une échéance : rien avant.
  const nextDisabled = mode === 'pick' && !isBefore(displayedMonth, todayMonth);
  const previousDisabled = mode === 'deadline' && !isBefore(todayMonth, displayedMonth);

  return (
    <>
      <View style={styles.nav}>
        <IconButton
          icon="chevron-back"
          subtle
          accessibilityLabel="Mois précédent"
          disabled={previousDisabled}
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
            {week.map((cellDay, cellIndex) => {
              if (cellDay === null) {
                return <View key={cellIndex} style={styles.blank} />;
              }
              // Jours YYYY-MM-DD : l'ordre des chaînes est l'ordre des jours.
              const future = cellDay > today;
              const disabled = mode === 'deadline' ? !future : future;
              return (
                <DayCell
                  key={cellIndex}
                  day={cellDay}
                  isToday={cellDay === today}
                  isSelected={cellDay === selectedDay}
                  isFuture={future}
                  disabled={disabled}
                  // Calendrier de l'Accueil : jours à venir inertes sans être estompés, comme la bande.
                  faded={disabled && mode !== 'browse'}
                  hasTraining={activity !== null && activity.trainingDays.has(cellDay)}
                  hasQuiz={activity !== null && activity.quizDays.has(cellDay)}
                  clubPlanned={future && isClubPlannedDay(cellDay, today, clubWeekdays)}
                  onPress={() => onPickDay(cellDay)}
                />
              );
            })}
          </View>
        ))}
      </View>

      {mode !== 'deadline' ? <ActivityLegend clubPlanned={mode === 'browse'} /> : null}
    </>
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
