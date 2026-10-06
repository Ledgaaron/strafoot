import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Fragment, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { Stat } from '../../components/stat';
import { formatShortDay, localToday, relativeDay } from '../../lib/dates';
import {
  deleteTestResult,
  getTest,
  listResultsForTest,
  type TestResultWithSession,
  type TestRow,
} from '../../lib/db/test-results';
import { formatDecimal, formatMeasure } from '../../lib/measure-delta';
import { colors, fontSize, layout, lineHeight, radius, size, spacing, text } from '../../lib/theme';

const NO_DELETE_MESSAGE = 'Supabase n’a renvoyé ni le résultat supprimé ni d’erreur.';
/** Hauteur de la courbe ; sa largeur est celle du conteneur, mesurée par onLayout. */
const CHART_HEIGHT = 200;
/** Bande d'étiquettes au-dessus et au-dessous du tracé : une ligne meta et son écart. */
const LABEL_BAND = lineHeight.meta + spacing.sm;
/** Étiquettes Y : jusqu'à 5 caractères (« 12,45 ») d'environ 0,6 em en fontSize.meta. */
const Y_LABEL_WIDTH = 5 * 0.6 * fontSize.meta;
/** Marges intérieures : étiquettes Y à gauche, dernière valeur en haut, dates en bas, dernier point à droite. */
const CHART_PADDING = {
  left: Y_LABEL_WIDTH + spacing.sm,
  right: spacing.sm,
  top: LABEL_BAND,
  bottom: LABEL_BAND,
} as const;
/** Chiffres centrés sur leur repère : ligne de base abaissée de la moitié de leur hauteur (environ 0,7 em). */
const DIGIT_CENTER_OFFSET = 0.35 * fontSize.meta;
/** Repères en pointillés : traits et vides de 4 px. */
const GUIDE_DASH = [spacing.xs, spacing.xs] as const;
/**
 * Sur web, le texte SVG hérite de la police par défaut du navigateur, à
 * empattements : police sans empattement explicite. Sur natif, police système.
 */
const CHART_FONT_FAMILY = Platform.OS === 'web' ? 'sans-serif' : undefined;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'missing' }
  | {
      status: 'ready';
      test: TestRow;
      /** Du plus récent au plus ancien (jour, puis saisie), dans l'ordre de listResultsForTest. */
      results: readonly TestResultWithSession[];
    };

export default function MeasureScreen() {
  const { testId } = useLocalSearchParams<{ testId?: string }>();
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  const measureId = typeof testId === 'string' && testId !== '' ? testId : null;
  const [state, setState] = useState<LoadState>(measureId ? { status: 'loading' } : { status: 'missing' });
  // Incrémenté par « Réessayer » : relance le chargement.
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    if (!measureId) {
      return;
    }
    let active = true;
    loadMeasure(measureId)
      .then((next) => {
        if (active) {
          setState(next);
        }
      })
      .catch((exception: unknown) => {
        // Exception inattendue : affichée, jamais avalée.
        if (active) {
          setState({
            status: 'error',
            message: exception instanceof Error ? exception.message : String(exception),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [measureId, loadCount]);

  function reload() {
    setState({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  // Résultat supprimé en base : retiré de l'état, la liste et la courbe suivent
  // sans rechargement. L'onglet Profil, lui, se recharge à son prochain focus.
  function removeResult(resultId: string) {
    setState((current) =>
      current.status === 'ready'
        ? { ...current, results: current.results.filter((row) => row.id !== resultId) }
        : current,
    );
  }

  if (state.status !== 'ready') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Mesure' }} />
        {state.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
        {state.status === 'error' ? (
          <View style={layout.section}>
            <FieldError message={'Erreur : ' + state.message} />
            <Button variant="secondary" label="Réessayer" onPress={reload} />
          </View>
        ) : null}
        {state.status === 'missing' ? (
          <EmptyState
            title="Mesure introuvable"
            message="Elle a peut-être été retirée du catalogue."
            action={{ label: 'Retour', onPress: leaveMeasure }}
          />
        ) : null}
      </Screen>
    );
  }

  return (
    <MeasureDetail key={state.test.id} test={state.test} results={state.results} onDeleted={removeResult} />
  );
}

/**
 * Ligne du catalogue et résultats, en parallèle. Une erreur l'emporte sur
 * « introuvable » : sans les deux réponses, rien ne permet de conclure.
 */
async function loadMeasure(testId: string): Promise<LoadState> {
  const [test, results] = await Promise.all([getTest(testId), listResultsForTest(testId)]);
  // Les deux requêtes échouent souvent pour la même cause (réseau, session) : un message par cause.
  const errors = [...new Set([test.error, results.error])].filter(
    (message): message is string => message !== null,
  );
  if (errors.length > 0) {
    return { status: 'error', message: errors.join('\n') };
  }
  if (!test.data) {
    return { status: 'missing' };
  }
  return { status: 'ready', test: test.data, results: results.data ?? [] };
}

/** Retour à l'écran précédent ; sans historique (lien direct, rechargement web) : l'onglet Profil. */
function leaveMeasure() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/profile');
  }
}

type MeasureDetailProps = {
  test: TestRow;
  /** Du plus récent au plus ancien. */
  results: readonly TestResultWithSession[];
  /** Suppression confirmée par Supabase : le résultat est à retirer de l'état de l'écran. */
  onDeleted: (resultId: string) => void;
};

/** Échec d'une suppression : la ligne reste, sa carte affiche le message. */
type DeleteError = { resultId: string; message: string };

/** Mesure chargée : en-tête, dernier résultat, courbe, historique avec suppression. */
function MeasureDetail({ test, results, onDeleted }: MeasureDetailProps) {
  // Référence des dates relatives, lue au montage.
  const [today] = useState(localToday);
  // Résultat en cours de suppression ; null : aucun envoi en cours.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<DeleteError | null>(null);
  // Garde synchrone en plus de l'état : deux appuis rapprochés peuvent voir le même rendu.
  const pendingRef = useRef(false);

  // Une suppression à la fois : tous les boutons Supprimer et les appuis longs sont inactifs pendant l'envoi.
  const busy = deletingId !== null;
  // La courbe se lit de gauche à droite : du plus ancien au plus récent.
  const chronological = [...results].reverse();

  function confirmDelete(row: TestResultWithSession) {
    if (pendingRef.current) {
      return;
    }
    const day = relativeDay(row.date, today);
    const value = formatMeasure(row.value, test.unit);
    // Alert.alert ne fait rien sur web : confirmation du navigateur à la place.
    if (Platform.OS === 'web') {
      if (window.confirm(`Supprimer ce résultat (${day}, ${value}) ? La séance liée reste.`)) {
        handleDelete(row.id);
      }
      return;
    }
    Alert.alert('Supprimer le résultat', `${day} : ${value}. La séance liée reste.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => handleDelete(row.id) },
    ]);
  }

  async function handleDelete(resultId: string) {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setDeletingId(resultId);
    setDeleteError(null);
    // Le résultat seul : la séance liée n'est pas touchée.
    const { data, error } = await deleteTestResult(resultId);
    pendingRef.current = false;
    setDeletingId(null);
    if (error !== null || data === null) {
      // Rien n'est retiré : la ligne reste, l'erreur s'affiche dans sa carte.
      setDeleteError({ resultId, message: error ?? NO_DELETE_MESSAGE });
      return;
    }
    onDeleted(resultId);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: test.name }} />
      <View style={styles.header}>
        <Text style={text.meta}>{test.protocol}</Text>
        <Text style={text.meta}>
          {`Unité : ${test.unit} · ${test.higher_is_better ? 'plus haut' : 'plus bas'} = mieux`}
        </Text>
      </View>

      {results.length > 0 ? (
        <Stat
          label={'Dernier résultat · ' + relativeDay(results[0].date, today)}
          value={formatDecimal(results[0].value)}
          unit={test.unit}
          tone="accent"
        />
      ) : null}

      {results.length >= 2 ? (
        <Card>
          <MeasureChart results={chronological} unit={test.unit} today={today} />
        </Card>
      ) : null}
      {results.length === 1 ? (
        <Text style={text.meta}>Un seul résultat : la courbe apparaîtra au deuxième.</Text>
      ) : null}
      {results.length === 0 ? (
        <EmptyState
          title="Aucun résultat"
          message="Refais ce test depuis l’onglet Entraînement."
          action={{ label: 'Voir les tests', onPress: () => router.dismissTo('/training') }}
        />
      ) : null}

      {results.length > 0 ? (
        <View style={layout.section}>
          <Text role="heading" style={text.title}>
            Historique
          </Text>
          {results.map((row) => (
            <ResultRow
              key={row.id}
              row={row}
              unit={test.unit}
              today={today}
              busy={busy}
              deleting={row.id === deletingId}
              error={deleteError !== null && deleteError.resultId === row.id ? deleteError.message : null}
              onDelete={() => confirmDelete(row)}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

type ResultRowProps = {
  row: TestResultWithSession;
  unit: string;
  /** Référence des dates relatives. */
  today: string;
  /** Une suppression est en cours, sur cette ligne ou une autre. */
  busy: boolean;
  /** Cette ligne est celle en cours de suppression. */
  deleting: boolean;
  /** Message du dernier échec de suppression de cette ligne ; null sinon. */
  error: string | null;
  /** Ouvre la confirmation de suppression. */
  onDelete: () => void;
};

/**
 * Carte d'un résultat : valeur, date, commentaire de la séance liée ; appui long
 * ou bouton pour supprimer ; un échec de suppression s'affiche dans la carte.
 */
function ResultRow({ row, unit, today, busy, deleting, error, onDelete }: ResultRowProps) {
  // Séance d'origine absente (résultat du seed, séance supprimée) ou sans commentaire : rien à afficher.
  const comment = row.session?.comment?.trim() ?? '';
  return (
    <Card>
      <View style={styles.row}>
        {/* Bouton à côté, pas dedans : deux zones tactiles voisines plutôt qu'imbriquées. */}
        <Pressable
          role="button"
          aria-disabled={busy}
          disabled={busy}
          onLongPress={onDelete}
          style={({ pressed }) => [styles.rowInfo, pressed && styles.rowInfoPressed]}
        >
          <Text style={[text.title, text.tabular]}>
            {formatDecimal(row.value)}
            {unit !== '' ? <Text style={text.unit}>{` ${unit}`}</Text> : null}
          </Text>
          <Text style={text.meta}>{relativeDay(row.date, today)}</Text>
          {comment !== '' ? <Text style={text.body}>{comment}</Text> : null}
        </Pressable>
        <Button
          variant="danger"
          label="Supprimer"
          onPress={onDelete}
          loading={deleting}
          disabled={busy && !deleting}
          accessibilityLabel={`Supprimer le résultat du ${formatShortDay(row.date)} (${formatMeasure(row.value, unit)})`}
        />
      </View>
      <FieldError message={error === null ? null : 'Erreur : ' + error} />
    </Card>
  );
}

type MeasureChartProps = {
  /** Du plus ancien au plus récent ; deux résultats ou plus (en dessous, pas de courbe). */
  results: readonly TestResultWithSession[];
  unit: string;
  /** Référence des dates relatives. */
  today: string;
};

/**
 * Courbe dessinée à la main : un point par résultat à pas régulier, pas
 * proportionnel au temps (deux tests le même jour restent deux points), axe Y
 * borné au minimum et au maximum avec une marge. Le libellé d'accessibilité
 * reprend ce que montre le dessin : le sens ne repose pas sur lui seul.
 */
function MeasureChart({ results, unit, today }: MeasureChartProps) {
  // Largeur du conteneur : rien n'est dessiné tant qu'elle vaut 0 (pas encore mesurée).
  const [width, setWidth] = useState(0);

  const first = results[0];
  const last = results[results.length - 1];
  const values = results.map((row) => row.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  // Marge de 10 % de l'écart ; valeurs toutes égales : 10 % de la valeur, au moins 1.
  const margin = maxValue > minValue ? (maxValue - minValue) * 0.1 : Math.max(Math.abs(maxValue) * 0.1, 1);
  const low = minValue - margin;
  const high = maxValue + margin;

  const left = CHART_PADDING.left;
  const right = width - CHART_PADDING.right;
  const top = CHART_PADDING.top;
  const bottom = CHART_HEIGHT - CHART_PADDING.bottom;
  const step = results.length > 1 ? (right - left) / (results.length - 1) : 0;
  const yOf = (value: number) => bottom - ((value - low) / (high - low)) * (bottom - top);
  const points = results.map((row, index) => ({ id: row.id, x: left + index * step, y: yOf(row.value) }));
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  // Repères au minimum et au maximum ; un seul quand toutes les valeurs sont égales.
  const guides = maxValue > minValue ? [minValue, maxValue] : [maxValue];

  const lastLabel = formatMeasure(last.value, unit);
  // Lu par le lecteur d'écran : dates complètes, « du auj. » ne se lirait pas.
  const summary =
    `Courbe de ${results.length} résultats, du ${formatShortDay(first.date)} au ${formatShortDay(last.date)} : ` +
    `minimum ${formatDecimal(minValue)}, maximum ${formatDecimal(maxValue)}, dernier ${lastLabel}.`;

  return (
    <View
      accessible
      role="img"
      accessibilityLabel={summary}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={styles.chart}
    >
      {width > 0 ? (
        <Svg width={width} height={CHART_HEIGHT} fontFamily={CHART_FONT_FAMILY}>
          {guides.map((value) => (
            <Fragment key={value}>
              <Line
                x1={left}
                y1={yOf(value)}
                x2={right}
                y2={yOf(value)}
                stroke={colors.border}
                strokeWidth={size.border}
                strokeDasharray={GUIDE_DASH}
              />
              <SvgText
                x={left - spacing.sm}
                y={yOf(value) + DIGIT_CENTER_OFFSET}
                textAnchor="end"
                fontSize={fontSize.meta}
                fill={colors.textMuted}
              >
                {formatDecimal(value)}
              </SvgText>
            </Fragment>
          ))}
          <Polyline
            points={points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={colors.accent}
            strokeWidth={size.chartStroke}
          />
          {points.map((point) => (
            <Circle key={point.id} cx={point.x} cy={point.y} r={size.chartPoint} fill={colors.accent} />
          ))}
          {/* Au-dessus du dernier point : son rayon, puis spacing.sm jusqu'à la ligne de base. */}
          <SvgText
            x={lastPoint.x}
            y={lastPoint.y - size.chartPoint - spacing.sm}
            textAnchor="end"
            fontSize={fontSize.meta}
            fontWeight="600"
            fill={colors.text}
          >
            {lastLabel}
          </SvgText>
          <SvgText
            x={firstPoint.x}
            y={CHART_HEIGHT - spacing.sm}
            textAnchor="start"
            fontSize={fontSize.meta}
            fill={colors.textMuted}
          >
            {relativeDay(first.date, today)}
          </SvgText>
          <SvgText
            x={lastPoint.x}
            y={CHART_HEIGHT - spacing.sm}
            textAnchor="end"
            fontSize={fontSize.meta}
            fill={colors.textMuted}
          >
            {relativeDay(last.date, today)}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  chart: {
    height: CHART_HEIGHT,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowInfo: {
    flex: 1,
    // Toute la hauteur de la ligne répond à l'appui long, même quand le bouton est plus haut.
    alignSelf: 'stretch',
    minHeight: size.touch,
    justifyContent: 'center',
    gap: spacing.xs,
    // Le fond pressé déborde un peu du texte au lieu de le coller.
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.button,
  },
  rowInfoPressed: {
    backgroundColor: colors.surface2,
  },
});
