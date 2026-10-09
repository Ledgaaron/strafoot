import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/button';
import { Card } from '../components/card';
import { FieldError } from '../components/field-error';
import { IconButton } from '../components/icon-button';
import { Screen } from '../components/screen';
import { useAuth } from '../lib/auth-context';
import {
  buildMonthGrid,
  dayOfMonth,
  formatMonthTitle,
  formatShortDay,
  isLocalDateString,
  localToday,
  monthOf,
  shiftMonth,
} from '../lib/dates';
import { listAnswerDays } from '../lib/db/answers';
import { listActiveDays } from '../lib/db/sessions';
import { colors, layout, radius, size, spacing, text } from '../lib/theme';

// Tout l'historique est chargé une fois à l'ouverture : n'importe quel mois en a
// besoin, pas de rechargement par mois.
const HISTORY_START = '2000-01-01';

const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

type ActivityState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; trainingDays: ReadonlySet<string>; quizDays: ReadonlySet<string> };

export default function CalendarScreen() {
  const { session } = useAuth();

  // Écran hors des onglets, donc hors de la garde de app/(tabs)/_layout.tsx.
  // Le layout racine a déjà attendu la fin du chargement : pas de session = pas connecté.
  if (!session) {
    return <Redirect href="/login" />;
  }
  // Les autres hooks vivent dans MonthCalendar : jamais appelés après le retour anticipé.
  return <MonthCalendar />;
}

/** Jour reçu en paramètre ; null s'il manque ou n'est pas un jour YYYY-MM-DD. */
function dayParam(value: string | undefined): string | null {
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  return typeof value === 'string' && isLocalDateString(value) ? value : null;
}

/**
 * Calendrier du mois, ouvert par « Voir le mois » de l'Accueil : day est le jour
 * sélectionné là-bas (mis en évidence), anchor un jour du mois à afficher. Un tap
 * sur un jour revient à l'Accueil, ce jour sélectionné et sa semaine affichée.
 */
function MonthCalendar() {
  const { day, anchor } = useLocalSearchParams<{ day?: string; anchor?: string }>();
  // Jour figé à l'ouverture, comme l'historique chargé jusqu'à lui.
  const [today] = useState(localToday);
  const selectedDay = dayParam(day) ?? today;
  const [displayedMonth, setDisplayedMonth] = useState(() => monthOf(dayParam(anchor) ?? today));
  const [activity, setActivity] = useState<ActivityState>({ status: 'loading' });
  // Incrémenté par « Réessayer » : seul rôle, relancer le chargement.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      listActiveDays({ from: HISTORY_START, to: today }),
      listAnswerDays({ from: HISTORY_START, to: today }),
    ])
      .then(([sessionDays, answerDays]) => {
        if (!active) {
          return;
        }
        const errors = [sessionDays.error, answerDays.error].filter((message) => message !== null);
        if (errors.length > 0) {
          // Une même panne (réseau, session expirée) remonte souvent sur les deux requêtes.
          setActivity({ status: 'error', message: [...new Set(errors)].join('\n') });
          return;
        }
        setActivity({
          status: 'ready',
          trainingDays: new Set(sessionDays.data ?? []),
          quizDays: new Set(answerDays.data ?? []),
        });
      })
      .catch((exception: unknown) => {
        // Exception inattendue : affichée, jamais avalée.
        if (active) {
          setActivity({
            status: 'error',
            message: exception instanceof Error ? exception.message : String(exception),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [today, attempt]);

  function retry() {
    setActivity({ status: 'loading' });
    setAttempt((count) => count + 1);
  }

  function pickDay(cellDay: string) {
    // picked change à chaque tap : l'Accueil resélectionne le jour même s'il a déjà reçu ce day.
    router.dismissTo({ pathname: '/', params: { day: cellDay, picked: String(Date.now()) } });
  }

  // Points seulement une fois l'historique chargé ; la grille reste utilisable avant.
  // Pas d'état vide : une grille sans point est un mois sans activité, et un tap sur
  // un jour ouvre ses séances sur l'Accueil, qui porte « Nouvelle séance ».
  const days = activity.status === 'ready' ? activity : null;

  return (
    <Screen>
      {/* Le layout racine masque les en-têtes : celui-ci porte le titre et la flèche retour (règle 11). */}
      <Stack.Screen options={{ headerShown: true, title: 'Calendrier' }} />
      <View style={layout.section}>
        <Card>
          <View style={styles.header}>
            <IconButton
              icon="chevron-back"
              accessibilityLabel="Mois précédent"
              onPress={() => setDisplayedMonth((current) => shiftMonth(current, -1))}
            />
            <Text style={[text.title, styles.monthTitle]}>{formatMonthTitle(displayedMonth)}</Text>
            <IconButton
              icon="chevron-forward"
              accessibilityLabel="Mois suivant"
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
                    <View key={cellIndex} style={styles.cell} />
                  ) : (
                    <DayCell
                      key={cellIndex}
                      day={cellDay}
                      isToday={cellDay === today}
                      isSelected={cellDay === selectedDay}
                      hasTraining={days !== null && days.trainingDays.has(cellDay)}
                      hasQuiz={days !== null && days.quizDays.has(cellDay)}
                      onPress={() => pickDay(cellDay)}
                    />
                  ),
                )}
              </View>
            ))}
          </View>

          <View style={styles.legend}>
            <Text style={text.meta}>
              <Text style={styles.trainingMark}>●</Text> Entraînement
            </Text>
            <Text style={text.meta}>
              <Text style={styles.quizMark}>●</Text> Quiz
            </Text>
          </View>
        </Card>

        {activity.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {activity.status === 'error' ? (
          <>
            <FieldError message={`Erreur : ${activity.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={retry} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

type DayCellProps = {
  day: string;
  isToday: boolean;
  isSelected: boolean;
  hasTraining: boolean;
  hasQuiz: boolean;
  onPress: () => void;
};

function DayCell({ day, isToday, isSelected, hasTraining, hasQuiz, onPress }: DayCellProps) {
  const label = `${formatShortDay(day)}${hasTraining ? ', entraînement' : ''}${hasQuiz ? ', quiz' : ''}`;
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cell,
        isToday && styles.todayCell,
        isSelected && styles.selectedCell,
        pressed && styles.pressedCell,
      ]}
    >
      <Text style={[text.body, text.tabular]}>{dayOfMonth(day)}</Text>
      {/* Rangée de hauteur fixe : le numéro ne bouge pas quand les points apparaissent.
          Deux places fixes, entraînement à gauche, quiz à droite (ordre de la légende) :
          la place double la couleur (orange, violet). */}
      <View style={styles.dots}>
        <View style={[styles.dot, hasTraining && styles.trainingDot]} />
        <View style={[styles.dot, hasQuiz && styles.quizDot]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
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
  cell: {
    flex: 1,
    minHeight: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
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
  trainingMark: {
    color: colors.accent,
  },
  quizMark: {
    color: colors.quiz,
  },
});
