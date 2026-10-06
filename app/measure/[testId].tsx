import { Stack, useLocalSearchParams } from 'expo-router';
import { Fragment, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { ActionButton } from '../../components/action-button';
import { formatNumericDay } from '../../lib/dates';
import {
  deleteTestResult,
  getTest,
  listResultsForTest,
  type TestResultWithSession,
  type TestRow,
} from '../../lib/db/test-results';
import { formatDecimal, formatMeasure } from '../../lib/measure-delta';

const NO_DELETE_MESSAGE = 'Supabase n’a renvoyé ni le résultat supprimé ni d’erreur.';
/** Hauteur de la courbe ; sa largeur est celle du conteneur, mesurée par onLayout. */
const CHART_HEIGHT = 200;
/** Marges intérieures : étiquettes Y à gauche, dernière valeur en haut, dates en bas. */
const CHART_PADDING = { left: 48, right: 16, top: 28, bottom: 28 } as const;
const CHART_INK = '#222';
const GUIDE_COLOR = '#999';
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
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Mesure' }} />
        {state.status === 'loading' ? <ActivityIndicator /> : null}
        {state.status === 'error' ? (
          <>
            <Text style={styles.error}>Erreur : {state.message}</Text>
            <ActionButton label="Réessayer" onPress={reload} />
          </>
        ) : null}
        {state.status === 'missing' ? <Text style={styles.text}>Mesure introuvable.</Text> : null}
      </View>
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

type MeasureDetailProps = {
  test: TestRow;
  /** Du plus récent au plus ancien. */
  results: readonly TestResultWithSession[];
  /** Suppression confirmée par Supabase : le résultat est à retirer de l'état de l'écran. */
  onDeleted: (resultId: string) => void;
};

/** Mesure chargée : en-tête, courbe (ou valeur seule), historique avec suppression. */
function MeasureDetail({ test, results, onDeleted }: MeasureDetailProps) {
  // Résultat en cours de suppression ; null : aucun envoi en cours.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Garde synchrone en plus de l'état : deux appuis rapprochés peuvent voir le même rendu.
  const pendingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  // Ordonnée de la section Historique dans le contenu défilant, relevée par onLayout.
  const historyYRef = useRef(0);

  // L'erreur s'affiche en tête de l'historique, hors de l'écran si la ligne
  // supprimée était plus bas : on y remonte à chaque nouvelle erreur.
  useEffect(() => {
    if (deleteError !== null) {
      scrollRef.current?.scrollTo({ y: historyYRef.current, animated: false });
    }
  }, [deleteError]);

  // Une suppression à la fois : tous les boutons Supprimer et les appuis longs sont inactifs pendant l'envoi.
  const busy = deletingId !== null;
  // La courbe se lit de gauche à droite : du plus ancien au plus récent.
  const chronological = [...results].reverse();

  function confirmDelete(row: TestResultWithSession) {
    if (pendingRef.current) {
      return;
    }
    const day = formatNumericDay(row.date);
    const value = formatMeasure(row.value, test.unit);
    // Alert.alert ne fait rien sur web : confirmation du navigateur à la place.
    if (Platform.OS === 'web') {
      if (window.confirm(`Supprimer le résultat du ${day} (${value}) ? La séance liée reste.`)) {
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
      // Rien n'est retiré : la ligne reste, l'erreur s'affiche au-dessus de l'historique.
      setDeleteError(error ?? NO_DELETE_MESSAGE);
      return;
    }
    onDeleted(resultId);
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <Stack.Screen options={{ title: test.name }} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <View style={styles.block}>
          <Text style={styles.title}>{test.name}</Text>
          <Text style={styles.text}>{test.protocol}</Text>
          <Text style={styles.text}>
            {`Unité : ${test.unit} · ${test.higher_is_better ? 'plus haut' : 'plus bas'} = mieux`}
          </Text>
        </View>

        {results.length >= 2 ? <MeasureChart results={chronological} unit={test.unit} /> : null}
        {results.length === 1 ? (
          <Text style={styles.text}>
            {`Un seul résultat : ${formatMeasure(results[0].value, test.unit)} le ${formatNumericDay(results[0].date)}.`}
          </Text>
        ) : null}
        {results.length === 0 ? <Text style={styles.text}>Aucun résultat pour cette mesure.</Text> : null}

        {results.length > 0 ? (
          <View
            style={styles.section}
            onLayout={(event) => {
              historyYRef.current = event.nativeEvent.layout.y;
            }}
          >
            {deleteError !== null ? <Text style={styles.error}>Erreur : {deleteError}</Text> : null}
            <Text style={styles.heading}>Historique</Text>
            {results.map((row) => (
              <ResultRow
                key={row.id}
                row={row}
                unit={test.unit}
                busy={busy}
                deleting={row.id === deletingId}
                onDelete={() => confirmDelete(row)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

type ResultRowProps = {
  row: TestResultWithSession;
  unit: string;
  /** Une suppression est en cours, sur cette ligne ou une autre. */
  busy: boolean;
  /** Cette ligne est celle en cours de suppression. */
  deleting: boolean;
  /** Ouvre la confirmation de suppression. */
  onDelete: () => void;
};

/** Ligne de l'historique : date, valeur, commentaire de la séance liée ; appui long ou bouton pour supprimer. */
function ResultRow({ row, unit, busy, deleting, onDelete }: ResultRowProps) {
  const day = formatNumericDay(row.date);
  const value = formatMeasure(row.value, unit);
  // Séance d'origine absente (résultat du seed, séance supprimée) ou sans commentaire : rien à afficher.
  const comment = row.session?.comment?.trim() ?? '';
  return (
    <View style={styles.row}>
      {/* Bouton à côté, pas dedans : deux zones tactiles voisines plutôt qu'imbriquées. */}
      <Pressable
        disabled={busy}
        onLongPress={onDelete}
        style={({ pressed }) => [styles.rowInfo, pressed && styles.dimmed]}
      >
        <Text style={styles.rowTitle}>{`${day} · ${value}`}</Text>
        {comment !== '' ? <Text style={styles.text}>{comment}</Text> : null}
      </Pressable>
      <Pressable
        role="button"
        accessibilityLabel={`Supprimer le résultat du ${day} (${value})`}
        aria-disabled={busy}
        disabled={busy}
        onPress={onDelete}
        style={({ pressed }) => [styles.deleteButton, (pressed || busy) && styles.dimmed]}
      >
        <Text style={styles.deleteLabel}>{deleting ? 'Suppression…' : 'Supprimer'}</Text>
      </Pressable>
    </View>
  );
}

type MeasureChartProps = {
  /** Du plus ancien au plus récent ; deux résultats ou plus (en dessous, l'écran écrit la valeur). */
  results: readonly TestResultWithSession[];
  unit: string;
};

/**
 * Courbe dessinée à la main : un point par résultat à pas régulier, pas
 * proportionnel au temps (deux tests le même jour restent deux points), axe Y
 * borné au minimum et au maximum avec une marge. Le libellé d'accessibilité
 * reprend ce que montre le dessin : le sens ne repose pas sur lui seul.
 */
function MeasureChart({ results, unit }: MeasureChartProps) {
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

  const firstDay = formatNumericDay(first.date);
  const lastDay = formatNumericDay(last.date);
  const lastLabel = formatMeasure(last.value, unit);
  const summary =
    `Courbe de ${results.length} résultats, du ${firstDay} au ${lastDay} : ` +
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
                stroke={GUIDE_COLOR}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              {/* + 4 : chiffres de 11 px centrés verticalement sur leur repère. */}
              <SvgText x={left - 8} y={yOf(value) + 4} textAnchor="end" fontSize={11} fill={CHART_INK}>
                {formatDecimal(value)}
              </SvgText>
            </Fragment>
          ))}
          <Polyline
            points={points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={CHART_INK}
            strokeWidth={2}
          />
          {points.map((point) => (
            <Circle key={point.id} cx={point.x} cy={point.y} r={4} fill={CHART_INK} />
          ))}
          <SvgText
            x={lastPoint.x}
            y={lastPoint.y - 10}
            textAnchor="end"
            fontSize={12}
            fontWeight="bold"
            fill={CHART_INK}
          >
            {lastLabel}
          </SvgText>
          <SvgText x={firstPoint.x} y={CHART_HEIGHT - 8} textAnchor="start" fontSize={11} fill={CHART_INK}>
            {firstDay}
          </SvgText>
          <SvgText x={lastPoint.x} y={CHART_HEIGHT - 8} textAnchor="end" fontSize={11} fill={CHART_INK}>
            {lastDay}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  content: {
    padding: 16,
    gap: 20,
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
  },
  error: {
    fontSize: 16,
    lineHeight: 24,
    color: '#b00020',
  },
  dimmed: {
    opacity: 0.5,
  },
  title: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: 'bold',
  },
  heading: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: 'bold',
  },
  block: {
    gap: 4,
  },
  section: {
    gap: 8,
  },
  chart: {
    height: CHART_HEIGHT,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowInfo: {
    flex: 1,
    // Toute la hauteur de la ligne répond à l'appui long, même quand le bouton est plus haut.
    alignSelf: 'stretch',
    minHeight: 44,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 'bold',
  },
  deleteButton: {
    minHeight: 44,
    marginVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
    borderColor: '#b00020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: {
    fontSize: 16,
    color: '#b00020',
  },
});
