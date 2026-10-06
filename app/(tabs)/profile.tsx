import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../../components/action-button';
import { useAuth } from '../../lib/auth-context';
import { formatNumericDay, localToday, shiftDay } from '../../lib/dates';
import { getMyProfile, type ProfileRow } from '../../lib/db/profiles';
import { countByModule, type ModuleVolume } from '../../lib/db/sessions';
import {
  listAllLatestWithPrevious,
  listTestCatalog,
  type LatestWithPrevious,
  type TestRow,
} from '../../lib/db/test-results';
import { listSheets, type SheetRow } from '../../lib/db/training';
import { describeDelta, formatMeasure } from '../../lib/measure-delta';
import { moduleLabel } from '../../lib/modules';
import { positionLabel, strongFootLabel } from '../../lib/profile-taxonomy';
import { parseExercises } from '../../lib/sheet-types';

const PLACEHOLDER = '—';
const NOT_SET = 'non renseigné';
/** Fenêtre de la colonne « 30 jours » : aujourd'hui et les 29 jours précédents. */
const RECENT_DAY_COUNT = 30;
const NO_RESULTS_TEXT = 'Aucun résultat. Fais ton premier test depuis l’onglet Entraînement.';

type ErrorState = { status: 'error'; message: string };

type IdentityField = { label: string; value: string };

type IdentityState = { status: 'loading' } | ErrorState | { status: 'ready'; fields: IdentityField[] };

/** Mesure du catalogue prête à afficher : une ligne tappable. */
type MeasureLine = {
  testId: string;
  name: string;
  /** « 25 touches · 06/10/2026 · +3 touches ↑ mieux » ; « — » si jamais testée. */
  details: string;
  tested: boolean;
};

/** Mesures d'un test (fiche kind = test), dans l'ordre de ses blocs. */
type MeasureGroup = {
  sheetId: string;
  title: string;
  lines: MeasureLine[];
  /** Exercices illisibles ou mesures absentes du catalogue : affiché, jamais avalé. */
  problem: string | null;
};

type MeasuresState =
  | { status: 'loading' }
  | ErrorState
  | { status: 'ready'; groups: MeasureGroup[]; hasResults: boolean };

/** Cellule du tableau des volumes : « 3 séances » sur « 2 h 15 ». */
type VolumeCell = { sessions: string; duration: string };

type VolumeLine = {
  key: string;
  label: string;
  /** null : aucune séance sur les 30 derniers jours. */
  recent: VolumeCell | null;
  total: VolumeCell;
};

type VolumesState =
  | { status: 'loading' }
  | ErrorState
  | { status: 'ready'; modules: VolumeLine[]; total: VolumeLine | null };

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [identity, setIdentity] = useState<IdentityState>({ status: 'loading' });
  const [measures, setMeasures] = useState<MeasuresState>({ status: 'loading' });
  const [volumes, setVolumes] = useState<VolumesState>({ status: 'loading' });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const isActive = () => active;
      // Relu à chaque focus, avec les données : l'app peut rester ouverte après minuit.
      const today = localToday();
      // Trois sections indépendantes : la panne de l'une n'empêche pas les autres de
      // s'afficher. Pas de retour à « chargement » : au retour sur l'onglet (après
      // l'édition du profil, un test, une suppression), les données précédentes
      // restent affichées jusqu'à la réponse.
      settle(loadIdentity(), isActive, setIdentity);
      settle(loadMeasures(), isActive, setMeasures);
      settle(loadVolumes(today), isActive, setVolumes);
      return () => {
        active = false;
      };
    }, []),
  );

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    // En cas de succès, la session disparaît et le layout des onglets redirige vers /login.
    const { error } = await signOut();
    if (error) {
      setSignOutError(error);
      setSigningOut(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.section}>
        <Text style={styles.heading}>Identité</Text>
        <Text style={styles.text}>Email : {session?.user.email ?? PLACEHOLDER}</Text>
        {identity.status === 'loading' ? <ActivityIndicator /> : null}
        {identity.status === 'error' ? <Text style={styles.error}>Erreur : {identity.message}</Text> : null}
        {identity.status === 'ready'
          ? identity.fields.map((field) => (
              <Text key={field.label} style={styles.text}>
                {field.label} : {field.value}
              </Text>
            ))
          : null}
        {/* Toujours proposé : l'écran d'édition relit le profil lui-même. */}
        <ActionButton label="Modifier" onPress={() => router.push('/profile/edit')} />
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>Mesures</Text>
        {measures.status === 'loading' ? <ActivityIndicator /> : null}
        {measures.status === 'error' ? <Text style={styles.error}>Erreur : {measures.message}</Text> : null}
        {measures.status === 'ready' && !measures.hasResults ? <Text style={styles.text}>{NO_RESULTS_TEXT}</Text> : null}
        {measures.status === 'ready'
          ? measures.groups.map((group) => (
              // Sans aucun résultat, seuls les problèmes restent affichés : 23 lignes « — » n'apprennent rien.
              <MeasureGroupView key={group.sheetId} group={group} showLines={measures.hasResults} />
            ))
          : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>Volumes</Text>
        {volumes.status === 'loading' ? <ActivityIndicator /> : null}
        {volumes.status === 'error' ? <Text style={styles.error}>Erreur : {volumes.message}</Text> : null}
        {volumes.status === 'ready' && volumes.total === null ? <Text style={styles.text}>Aucune séance.</Text> : null}
        {volumes.status === 'ready' && volumes.total !== null ? (
          <View>
            <View style={styles.tableRow}>
              <Text style={[styles.labelCell, styles.bold]}>Module</Text>
              <Text style={[styles.valueCell, styles.bold]}>30 jours</Text>
              <Text style={[styles.valueCell, styles.bold]}>Total</Text>
            </View>
            {volumes.modules.map((line) => (
              <VolumeRow key={line.key} line={line} />
            ))}
            <VolumeRow line={volumes.total} bold />
          </View>
        ) : null}
      </View>

      <ActionButton label="Déconnexion" onPress={handleSignOut} disabled={signingOut} />
      {signOutError ? <Text style={styles.error}>{signOutError}</Text> : null}
    </ScrollView>
  );
}

/**
 * Pose l'état chargé tant que l'écran est actif. Une exception inattendue (jour
 * mal formé refusé par formatNumericDay, par exemple) devient une erreur
 * affichée, jamais avalée.
 */
function settle<S>(
  load: Promise<S>,
  isActive: () => boolean,
  // NoInfer : S vient de load seul, pas du setter (dont le type accepte aussi une fonction).
  apply: (state: NoInfer<S> | ErrorState) => void,
): void {
  load
    .then((state) => {
      if (isActive()) {
        apply(state);
      }
    })
    .catch((exception: unknown) => {
      if (isActive()) {
        apply({ status: 'error', message: exception instanceof Error ? exception.message : String(exception) });
      }
    });
}

async function loadIdentity(): Promise<IdentityState> {
  const { data, error } = await getMyProfile();
  if (error !== null) {
    return { status: 'error', message: error };
  }
  return { status: 'ready', fields: toIdentityFields(data) };
}

/** Champs affichés du profil ; « non renseigné » pour un champ vide ou un profil absent. */
function toIdentityFields(profile: ProfileRow | null): IdentityField[] {
  const fields: { label: string; value: string | null }[] = [
    { label: 'Poste principal', value: profile?.main_position ? positionLabel(profile.main_position) : null },
    {
      label: 'Poste secondaire',
      value: profile?.secondary_position ? positionLabel(profile.secondary_position) : null,
    },
    { label: 'Pied fort', value: profile?.strong_foot ? strongFootLabel(profile.strong_foot) : null },
    { label: 'Club', value: profile?.club?.trim() || null },
    { label: 'Niveau', value: profile?.club_level?.trim() || null },
    { label: 'Date de naissance', value: profile?.birth_date ? formatNumericDay(profile.birth_date) : null },
  ];
  return fields.map(({ label, value }) => ({ label, value: value ?? NOT_SET }));
}

async function loadMeasures(): Promise<MeasuresState> {
  const [sheets, catalog, latest] = await Promise.all([
    listSheets({ kind: 'test' }),
    listTestCatalog(),
    listAllLatestWithPrevious(),
  ]);
  const errors = [sheets.error, catalog.error, latest.error].filter((message) => message !== null);
  if (errors.length > 0) {
    // Une même panne (réseau, session expirée) remonte souvent sur les trois requêtes.
    return { status: 'error', message: [...new Set(errors)].join('\n') };
  }
  const groups = buildMeasureGroups(sheets.data ?? [], catalog.data ?? [], latest.data ?? new Map());
  return {
    status: 'ready',
    groups,
    hasResults: groups.some((group) => group.lines.some((line) => line.tested)),
  };
}

/**
 * Un groupe par test (fiche kind = test, par titre, comme l'onglet
 * Entraînement), ses mesures dans l'ordre des blocs. La fiche porte les mesures
 * par key ; la ligne du catalogue tests donne l'id, le nom, l'unité et
 * higher_is_better. Les 2 tests de démonstration (key null, sans fiche) ne
 * sont pas affichés.
 */
function buildMeasureGroups(
  sheets: readonly SheetRow[],
  catalog: readonly TestRow[],
  latest: ReadonlyMap<string, LatestWithPrevious>,
): MeasureGroup[] {
  const byKey = new Map<string, TestRow>();
  for (const row of catalog) {
    if (row.key !== null) {
      byKey.set(row.key, row);
    }
  }
  return sheets.map((sheet) => {
    const exercises = parseExercises(sheet.exercises, 'test');
    if (exercises.error !== null) {
      return { sheetId: sheet.id, title: sheet.title, lines: [], problem: `Mesures illisibles en base.\n${exercises.error}` };
    }
    const lines: MeasureLine[] = [];
    const missing: string[] = [];
    for (const measure of exercises.data.flatMap((block) => block.measures)) {
      const test = byKey.get(measure.key);
      if (!test) {
        missing.push(measure.key);
        continue;
      }
      const result = latest.get(test.id);
      lines.push({
        testId: test.id,
        name: test.name,
        details: result ? formatLatest(result, test) : PLACEHOLDER,
        tested: result !== undefined,
      });
    }
    return {
      sheetId: sheet.id,
      title: sheet.title,
      lines,
      problem:
        missing.length > 0
          ? `Mesures absentes du catalogue tests : ${missing.join(', ')}. Exécuter supabase/seed_sheets_001.sql.`
          : null,
    };
  });
}

/** « 25 touches · 06/10/2026 · +3 touches ↑ mieux » ; sans évolution pour un premier résultat. */
function formatLatest(result: LatestWithPrevious, test: TestRow): string {
  const delta = describeDelta(result.value, result.previousValue, test.unit, test.higher_is_better);
  const parts = [formatMeasure(result.value, test.unit), formatNumericDay(result.date)];
  return (delta.direction === 'none' ? parts : [...parts, delta.text]).join(' · ');
}

async function loadVolumes(today: string): Promise<VolumesState> {
  const [recent, total] = await Promise.all([
    countByModule({ from: shiftDay(today, -(RECENT_DAY_COUNT - 1)), to: today }),
    // Sans borne, comme le « Total » de l'Accueil.
    countByModule(),
  ]);
  const errors = [recent.error, total.error].filter((message) => message !== null);
  if (errors.length > 0) {
    return { status: 'error', message: [...new Set(errors)].join('\n') };
  }
  const recentVolumes = recent.data ?? [];
  const totalVolumes = total.data ?? [];
  if (totalVolumes.length === 0) {
    return { status: 'ready', modules: [], total: null };
  }
  const recentByModule = new Map(recentVolumes.map((volume) => [volume.module, volume]));
  const recentSum = sumVolumes(recentVolumes);
  return {
    status: 'ready',
    // Un module de la colonne « 30 jours » a forcément des séances au total : les
    // lignes suivent les modules du total, dans l'ordre de MODULES.
    modules: totalVolumes.map((volume) => {
      const recentVolume = recentByModule.get(volume.module);
      return {
        key: volume.module,
        label: moduleLabel(volume.module),
        recent: recentVolume ? toVolumeCell(recentVolume) : null,
        total: toVolumeCell(volume),
      };
    }),
    total: {
      key: 'total',
      label: 'Total',
      recent: recentSum.count > 0 ? toVolumeCell(recentSum) : null,
      total: toVolumeCell(sumVolumes(totalVolumes)),
    },
  };
}

function sumVolumes(volumes: readonly ModuleVolume[]): { count: number; minutes: number } {
  return volumes.reduce(
    (sum, volume) => ({ count: sum.count + volume.count, minutes: sum.minutes + volume.minutes }),
    { count: 0, minutes: 0 },
  );
}

function toVolumeCell({ count, minutes }: { count: number; minutes: number }): VolumeCell {
  return { sessions: `${count} séance${count >= 2 ? 's' : ''}`, duration: formatMinutes(minutes) };
}

/** « 45 min » ; en heures à partir de 60 min : « 1 h », « 2 h 05 ». */
function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

function MeasureGroupView({ group, showLines }: { group: MeasureGroup; showLines: boolean }) {
  if (!showLines && group.problem === null) {
    return null;
  }
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{group.title}</Text>
      {group.problem !== null ? <Text style={styles.error}>{group.problem}</Text> : null}
      {showLines ? group.lines.map((line) => <MeasureRow key={line.testId} line={line} />) : null}
    </View>
  );
}

function MeasureRow({ line }: { line: MeasureLine }) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={`${line.name} : ${line.details}`}
      onPress={() => router.push({ pathname: '/measure/[testId]', params: { testId: line.testId } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={[styles.text, styles.bold]}>{line.name}</Text>
      <Text style={styles.text}>{line.details}</Text>
    </Pressable>
  );
}

function VolumeRow({ line, bold = false }: { line: VolumeLine; bold?: boolean }) {
  return (
    <View style={[styles.tableRow, styles.tableLine]}>
      <Text style={[styles.labelCell, bold && styles.bold]}>{line.label}</Text>
      <VolumeCellView cell={line.recent} bold={bold} />
      <VolumeCellView cell={line.total} bold={bold} />
    </View>
  );
}

function VolumeCellView({ cell, bold }: { cell: VolumeCell | null; bold: boolean }) {
  if (cell === null) {
    return <Text style={[styles.valueCell, bold && styles.bold]}>{PLACEHOLDER}</Text>;
  }
  return (
    <View style={styles.valueCell}>
      <Text style={[styles.text, bold && styles.bold]}>{cell.sessions}</Text>
      <Text style={[styles.text, bold && styles.bold]}>{cell.duration}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 24,
  },
  section: {
    gap: 8,
  },
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 'bold',
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  bold: {
    fontWeight: 'bold',
  },
  error: {
    fontSize: 16,
    lineHeight: 22,
    color: '#b00020',
  },
  pressed: {
    opacity: 0.5,
  },
  group: {
    gap: 4,
  },
  groupTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 'bold',
    marginTop: 8,
  },
  row: {
    minHeight: 44,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
  },
  tableLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  labelCell: {
    flex: 1.4,
    fontSize: 16,
    lineHeight: 22,
  },
  valueCell: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
  },
});
