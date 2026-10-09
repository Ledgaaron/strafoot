import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { DurationValue } from '../../components/duration-value';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { localToday, shiftDay } from '../../lib/dates';
import { countByModule, type ModuleVolume } from '../../lib/db/sessions';
import { listTests } from '../../lib/db/training';
import { moduleLabel, TEST_MODULE_KEY } from '../../lib/modules';
import { countTestsSince, formatMinutes } from '../../lib/profile-stats';
import { colors, layout, size, spacing, text } from '../../lib/theme';

const PLACEHOLDER = '—';
/** Espace insécable : un nombre ne se sépare jamais de son mot en fin de ligne (« 12 séances »). */
const NBSP = ' ';
/** Fenêtre de la colonne « 30 jours » : aujourd'hui et les 29 jours précédents. */
const RECENT_DAY_COUNT = 30;
/** Colonne « Module » du tableau : ses libellés sont plus longs que « 12 séances ». */
const MODULE_COLUMN_FLEX = 1.4;

/** Volume d'une période : minutes, séances (tout module) et tests passés. */
type PeriodVolume = { minutes: number; sessions: number; tests: number };

/** Cellule du tableau : « 3 séances », « 2 h 15 », et « 4 tests » pour le module Test. */
type VolumeCell = { sessions: string; duration: string; tests: string | null };

type VolumeLine = {
  key: string;
  label: string;
  /** null : aucune séance sur les 30 derniers jours. */
  recent: VolumeCell | null;
  total: VolumeCell;
};

type VolumeData = {
  recent: PeriodVolume;
  total: PeriodVolume;
  modules: VolumeLine[];
  totalLine: VolumeLine;
};

type VolumeState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; data: VolumeData };

/** Volumes : durée, séances et tests sur 30 jours et depuis le début, puis par module. */
export default function VolumeScreen() {
  const [state, setState] = useState<VolumeState>({ status: 'loading' });
  // Incrémenté par « Réessayer » : relance la lecture.
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    let active = true;
    loadVolumes(localToday())
      .then((next) => {
        if (active) {
          setState(next);
        }
      })
      .catch((exception: unknown) => {
        // Exception inattendue (jour mal formé…) : affichée, jamais avalée.
        if (active) {
          setState({ status: 'error', message: exception instanceof Error ? exception.message : String(exception) });
        }
      });
    return () => {
      active = false;
    };
  }, [loadCount]);

  function reload() {
    setState({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Volume' }} />
      <Screen>
        {state.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
        {state.status === 'error' ? (
          <View style={layout.section}>
            <FieldError message={`Erreur : ${state.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={reload} />
          </View>
        ) : null}
        {state.status === 'empty' ? (
          <EmptyState
            title="Aucune séance"
            message="Enregistre ta première séance : ses minutes et son module s’ajouteront ici."
            action={{ label: 'Nouvelle séance', onPress: () => router.push('/session/new') }}
          />
        ) : null}
        {state.status === 'ready' ? (
          <>
            {/* Un chiffre dominant par carte : la durée ; séances et tests en secondaire. */}
            <View style={styles.cardRow}>
              <PeriodCard title="30 jours" volume={state.data.recent} />
              <PeriodCard title="Total" volume={state.data.total} />
            </View>
            <View style={layout.section}>
              <Text role="heading" style={text.title}>
                Par module
              </Text>
              <VolumeTable modules={state.data.modules} total={state.data.totalLine} />
            </View>
          </>
        ) : null}
      </Screen>
    </>
  );
}

/**
 * Séances par module sur 30 jours et depuis le début, et tests passés (couples
 * test, jour, comme la régularité du Profil) sur les mêmes périodes. Chaque
 * lecture dans la limite du max rows du projet (1000 par défaut).
 */
async function loadVolumes(today: string): Promise<VolumeState> {
  const from = shiftDay(today, -(RECENT_DAY_COUNT - 1));
  const [recent, total, tests] = await Promise.all([
    countByModule({ from, to: today }),
    // Sans borne : depuis la première séance.
    countByModule(),
    listTests(),
  ]);
  const errors = [recent.error, total.error, tests.error].filter((message): message is string => message !== null);
  if (errors.length > 0) {
    // Une même panne (réseau, session expirée) remonte souvent sur toutes les lectures.
    return { status: 'error', message: [...new Set(errors)].join('\n') };
  }
  const recentVolumes = recent.data ?? [];
  const totalVolumes = total.data ?? [];
  if (totalVolumes.length === 0) {
    return { status: 'empty' };
  }
  // Un jour par test passé ; ceux d'après aujourd'hui n'existent pas (date d'une séance passée).
  const testDays = (tests.data?.items ?? []).flatMap((test) => test.resultDates);
  const recentTests = countTestsSince(testDays, from);
  const allTests = countTestsSince(testDays);
  const recentByModule = new Map(recentVolumes.map((volume) => [volume.module, volume]));
  const recentSum = sumVolumes(recentVolumes);
  const totalSum = sumVolumes(totalVolumes);
  return {
    status: 'ready',
    data: {
      recent: { ...recentSum, tests: recentTests },
      total: { ...totalSum, tests: allTests },
      // Un module de la colonne « 30 jours » a forcément des séances au total : les
      // lignes suivent les modules du total, dans l'ordre de MODULES.
      modules: totalVolumes.map((volume) => {
        const recentVolume = recentByModule.get(volume.module);
        // Les tests appartiennent aux séances du module Test.
        const isTest = volume.module === TEST_MODULE_KEY;
        return {
          key: volume.module,
          label: moduleLabel(volume.module),
          recent: recentVolume
            ? toVolumeCell(recentVolume.count, recentVolume.minutes, isTest ? recentTests : null)
            : null,
          total: toVolumeCell(volume.count, volume.minutes, isTest ? allTests : null),
        };
      }),
      totalLine: {
        key: 'total',
        label: 'Total',
        recent: recentSum.sessions > 0 ? toVolumeCell(recentSum.sessions, recentSum.minutes, recentTests) : null,
        total: toVolumeCell(totalSum.sessions, totalSum.minutes, allTests),
      },
    },
  };
}

function sumVolumes(volumes: readonly ModuleVolume[]): { minutes: number; sessions: number } {
  return volumes.reduce(
    (sum, volume) => ({ minutes: sum.minutes + volume.minutes, sessions: sum.sessions + volume.count }),
    { minutes: 0, sessions: 0 },
  );
}

/** Cellule d'une ligne ; tests null hors du module Test et de la ligne Total. */
function toVolumeCell(sessions: number, minutes: number, tests: number | null): VolumeCell {
  return {
    sessions: formatCount(sessions, 'séance', 'séances'),
    duration: formatMinutes(minutes),
    tests: tests !== null ? formatCount(tests, 'test', 'tests') : null,
  };
}

/** Pluriel français, 0 et 1 au singulier : « 1 séance », « 3 séances ». */
function formatCount(count: number, singular: string, plural: string): string {
  return `${count}${NBSP}${count >= 2 ? plural : singular}`;
}

/** Une période : sa durée en chiffre dominant, puis séances et tests en secondaire. */
function PeriodCard({ title, volume }: { title: string; volume: PeriodVolume }) {
  const caption = `${formatCount(volume.sessions, 'séance', 'séances')} · ${formatCount(volume.tests, 'test', 'tests')}`;
  return (
    <Card style={styles.periodCard}>
      <Text role="heading" style={text.overline}>
        {title}
      </Text>
      <DurationValue minutes={volume.minutes} />
      <Text style={text.meta}>{caption}</Text>
    </Card>
  );
}

function VolumeTable({ modules, total }: { modules: readonly VolumeLine[]; total: VolumeLine }) {
  return (
    <Card>
      {/* Un seul enfant : l'écart entre enfants de la carte ne s'ajoute pas aux séparateurs. */}
      <View>
        <View style={styles.tableRow}>
          <Text style={[text.meta, styles.moduleColumn]}>Module</Text>
          <View style={styles.valueColumn}>
            <Text style={text.meta}>30 jours</Text>
          </View>
          <View style={styles.valueColumn}>
            <Text style={text.meta}>Total</Text>
          </View>
        </View>
        {modules.map((line) => (
          <VolumeRow key={line.key} line={line} />
        ))}
        <VolumeRow line={total} strong />
      </View>
    </Card>
  );
}

function VolumeRow({ line, strong = false }: { line: VolumeLine; strong?: boolean }) {
  return (
    <View style={[styles.tableRow, styles.tableLine]}>
      <Text style={[strong ? text.bodyStrong : text.body, styles.moduleColumn]}>{line.label}</Text>
      <VolumeCellView cell={line.recent} strong={strong} />
      <VolumeCellView cell={line.total} strong={strong} />
    </View>
  );
}

/** Séances, durée, puis tests, l'un sous l'autre ; « — » sans séance. */
function VolumeCellView({ cell, strong }: { cell: VolumeCell | null; strong: boolean }) {
  const valueStyle = [text.meta, text.tabular, styles.right, strong && styles.strong];
  return (
    <View style={styles.valueColumn}>
      {cell === null ? (
        <Text style={valueStyle}>{PLACEHOLDER}</Text>
      ) : (
        <>
          <Text style={valueStyle}>{cell.sessions}</Text>
          <Text style={valueStyle}>{cell.duration}</Text>
          {cell.tests !== null ? <Text style={valueStyle}>{cell.tests}</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  /** Moitié de la rangée, même hauteur que sa voisine. */
  periodCard: {
    flex: 1,
    gap: spacing.md,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  tableLine: {
    borderTopWidth: size.border,
    borderTopColor: colors.border,
  },
  moduleColumn: {
    flex: MODULE_COLUMN_FLEX,
  },
  valueColumn: {
    flex: 1,
    alignItems: 'flex-end',
  },
  right: {
    textAlign: 'right',
  },
  strong: {
    fontWeight: '600',
  },
});
