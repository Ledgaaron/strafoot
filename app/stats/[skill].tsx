import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { formatShortDay, localToday, relativeDay } from '../../lib/dates';
import { listTestCatalog } from '../../lib/db/test-results';
import { listTests } from '../../lib/db/training';
import { formatDecimal, formatMeasure, type Delta } from '../../lib/measure-delta';
import { buildSkillDetail, type MeasureStat, type TestStat } from '../../lib/profile-stats';
import { getSkill, isSkillKey, type Skill, type SkillKey } from '../../lib/test-families';
import { colors, layout, size, spacing, text } from '../../lib/theme';

const PLACEHOLDER = '—';
/** Espace insécable : un nombre ne se sépare jamais de son mot en fin de ligne (« 3 fois »). */
const NBSP = ' ';
const NEVER_MEASURED = 'Jamais mesurée';
const MISSING_CATALOG_MESSAGE = 'Mesure absente du catalogue tests : exécuter supabase/seed_sheets_001.sql.';

/** Mesure prête à afficher : une carte, vers sa courbe quand le catalogue la connaît. */
type MeasureItem = {
  key: string;
  name: string;
  /** « 12,5 », la valeur seule ; null si jamais mesurée. */
  value: string | null;
  /** Unité du contenu ; '' pour une mesure sans unité. */
  unit: string;
  /** « hier · record : 18 pts /30 », ou « Jamais mesurée ». */
  details: string;
  delta: Delta;
  /** Ligne du catalogue tests (courbe de app/measure/[testId]) ; null si absente du catalogue. */
  catalogId: string | null;
  accessibilityLabel: string;
};

type TestItem = {
  slug: string;
  title: string;
  /** « dernière fois : hier · fait 3 fois » */
  details: string;
  measures: MeasureItem[];
};

type FamilyItem = { family: string; label: string; tests: TestItem[] };

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; families: FamilyItem[]; problems: string[] };

/** skill : segment d'URL, une clé de SKILLS (tir, passe, dribble, jonglerie, physique). */
type SkillParams = { skill?: string };

export default function SkillStatsScreen() {
  const { skill } = useLocalSearchParams<SkillParams>();
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  const skillKey = typeof skill === 'string' && isSkillKey(skill) ? skill : null;

  if (skillKey === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Tests' }} />
        <Screen>
          <EmptyState
            title="Compétence introuvable"
            message="Ouvre les statistiques depuis la carte Tests du Profil."
            action={{ label: 'Retour', onPress: leaveUnknownSkill }}
          />
        </Screen>
      </>
    );
  }
  // key : une autre compétence repart d'un état neuf.
  return <SkillStats key={skillKey} skill={getSkill(skillKey)} skillKey={skillKey} />;
}

/** Compétence inconnue (lien retouché à la main) : écran précédent ; sans historique, l'onglet Profil. */
function leaveUnknownSkill() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/profile');
  }
}

/**
 * Statistiques d'une compétence : ses familles, leurs tests faits, et pour
 * chaque mesure le dernier résultat (chiffre dominant), sa date, le record et
 * l'évolution ; tap sur une mesure → sa courbe et son historique.
 */
function SkillStats({ skill, skillKey }: { skill: Skill; skillKey: SkillKey }) {
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  // Incrémenté par « Réessayer » : relance la lecture.
  const [loadCount, setLoadCount] = useState(0);

  // Relu à chaque focus : au retour de la courbe, un résultat supprimé n'est plus compté.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadDetail(skillKey)
        .then((next) => {
          if (active) {
            setState(next);
          }
        })
        .catch((exception: unknown) => {
          // Exception inattendue (jour mal formé refusé par relativeDay…) : affichée, jamais avalée.
          if (active) {
            setState({ status: 'error', message: exception instanceof Error ? exception.message : String(exception) });
          }
        });
      return () => {
        active = false;
      };
    }, [skillKey, loadCount]),
  );

  function reload() {
    setState({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  return (
    <>
      {/* En-tête natif : la compétence, flèche retour vers le Profil. */}
      <Stack.Screen options={{ title: skill.label }} />
      <Screen>
        {state.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
        {state.status === 'error' ? (
          <View style={layout.section}>
            <FieldError message={`Erreur : ${state.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={reload} />
          </View>
        ) : null}
        {state.status === 'ready' ? (
          <>
            <FieldError message={state.problems.length > 0 ? state.problems.join('\n') : null} />
            {state.families.length === 0 ? (
              <EmptyState
                title={`Aucun test fait en ${skill.label}`}
                message="Passe un test de cette compétence depuis l’onglet Tests."
                action={{ label: 'Voir les tests', onPress: () => router.dismissTo('/training') }}
              />
            ) : (
              state.families.map((family) => (
                <View key={family.family} style={layout.section}>
                  <Text role="heading" style={text.overline}>
                    {family.label}
                  </Text>
                  {family.tests.map((test) => (
                    <TestBlock key={test.slug} test={test} />
                  ))}
                </View>
              ))
            )}
          </>
        ) : null}
      </Screen>
    </>
  );
}

/**
 * Tests de la compétence avec leurs résultats, puis le catalogue des mesures
 * (id de la courbe de chaque mesure, par key). Libellés calculés ici, avec le
 * jour de la lecture : une exception part dans le catch de l'appelant.
 */
async function loadDetail(skill: SkillKey): Promise<DetailState> {
  const [tests, catalog] = await Promise.all([listTests(), listTestCatalog()]);
  const errors = [tests.error, catalog.error].filter((message): message is string => message !== null);
  if (errors.length > 0) {
    // Une même panne (réseau, session expirée) remonte souvent sur les deux lectures.
    return { status: 'error', message: [...new Set(errors)].join('\n') };
  }
  const today = localToday();
  const catalogIds = new Map<string, string>();
  for (const row of catalog.data ?? []) {
    if (row.key !== null) {
      catalogIds.set(row.key, row.id);
    }
  }
  const families = buildSkillDetail(tests.data?.items ?? [], skill).map((family) => ({
    family: family.family,
    label: family.label,
    tests: family.tests.map((test) => toTestItem(test, catalogIds, today)),
  }));
  return { status: 'ready', families, problems: tests.data?.problems ?? [] };
}

function toTestItem(test: TestStat, catalogIds: ReadonlyMap<string, string>, today: string): TestItem {
  return {
    slug: test.slug,
    title: test.title,
    details: `dernière fois : ${relativeDay(test.lastDate, today)} · fait ${test.doneCount}${NBSP}fois`,
    measures: test.measures.map((stat) => toMeasureItem(stat, catalogIds.get(stat.key) ?? null, today)),
  };
}

/** Mesure : dernière valeur, sa date relative et le record ; le libellé d'accessibilité dit tout, date en absolu. */
function toMeasureItem(stat: MeasureStat, catalogId: string | null, today: string): MeasureItem {
  const { latest, record } = stat;
  const recordText = record !== null ? `record : ${formatMeasure(record, stat.unit)}` : null;
  if (latest === null) {
    return {
      key: stat.key,
      name: stat.name,
      value: null,
      unit: stat.unit.trim(),
      details: NEVER_MEASURED,
      delta: stat.delta,
      catalogId,
      accessibilityLabel: `${stat.name} : ${NEVER_MEASURED.toLowerCase()}`,
    };
  }
  const spoken = [
    formatMeasure(latest.value, stat.unit),
    formatShortDay(latest.date),
    ...(recordText !== null ? [recordText] : []),
    ...(stat.delta.direction !== 'none' ? [stat.delta.text] : []),
  ];
  return {
    key: stat.key,
    name: stat.name,
    value: formatDecimal(latest.value),
    unit: stat.unit.trim(),
    details: [relativeDay(latest.date, today), ...(recordText !== null ? [recordText] : [])].join(' · '),
    delta: stat.delta,
    catalogId,
    accessibilityLabel: `${stat.name} : ${spoken.join(', ')}`,
  };
}

/** Un test : son titre, sa dernière fois, puis une carte par mesure (un chiffre dominant chacune). */
function TestBlock({ test }: { test: TestItem }) {
  return (
    <View style={styles.test}>
      <View style={styles.testHeading}>
        <Text role="heading" style={text.title}>
          {test.title}
        </Text>
        <Text style={text.meta}>{test.details}</Text>
      </View>
      {test.measures.map((measure) => (
        <MeasureCard key={measure.key} measure={measure} />
      ))}
    </View>
  );
}

/** Mesure : nom et date à gauche, dernière valeur et évolution alignées à droite ; ouvre la courbe. */
function MeasureCard({ measure }: { measure: MeasureItem }) {
  const { catalogId } = measure;
  return (
    <Card
      accessibilityLabel={measure.accessibilityLabel}
      onPress={
        catalogId !== null
          ? () => router.push({ pathname: '/measure/[testId]', params: { testId: catalogId } })
          : undefined
      }
    >
      <View style={styles.measureRow}>
        <View style={styles.measureName}>
          <Text style={text.body}>{measure.name}</Text>
          <Text style={text.meta}>{measure.details}</Text>
        </View>
        <View style={styles.measureValue}>
          <Text style={[text.title, text.tabular]}>
            {measure.value ?? PLACEHOLDER}
            {measure.value !== null && measure.unit !== '' ? <Text style={text.unit}>{` ${measure.unit}`}</Text> : null}
          </Text>
          <DeltaText delta={measure.delta} />
        </View>
        {catalogId !== null ? (
          <Ionicons name="chevron-forward" size={size.icon} color={colors.textMuted} aria-hidden />
        ) : null}
      </View>
      <FieldError message={catalogId === null ? MISSING_CATALOG_MESSAGE : null} />
    </Card>
  );
}

/** Évolution colorée, le sens restant écrit (« ↑ mieux ») ; rien pour un premier résultat. */
function DeltaText({ delta }: { delta: Delta }) {
  if (delta.direction === 'none') {
    return null;
  }
  return <Text style={[text.meta, DELTA_STYLES[delta.direction]]}>{delta.text}</Text>;
}

const DELTA_STYLES = StyleSheet.create({
  better: {
    color: colors.success,
  },
  worse: {
    color: colors.danger,
  },
  same: {
    color: colors.textMuted,
  },
});

const styles = StyleSheet.create({
  test: {
    gap: spacing.sm,
  },
  testHeading: {
    gap: spacing.xs,
  },
  measureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  measureName: {
    flex: 1,
    gap: spacing.xs,
  },
  measureValue: {
    alignItems: 'flex-end',
  },
});
