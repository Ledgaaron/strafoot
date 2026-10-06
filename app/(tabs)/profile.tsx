import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { useAuth } from '../../lib/auth-context';
import { formatNumericDay, formatShortDay, localToday, relativeDay, shiftDay } from '../../lib/dates';
import { getMyProfile, type ProfileRow } from '../../lib/db/profiles';
import { countByModule, type ModuleVolume } from '../../lib/db/sessions';
import {
  listAllLatestWithPrevious,
  listTestCatalog,
  type LatestWithPrevious,
  type TestRow,
} from '../../lib/db/test-results';
import { listSheets, type SheetRow } from '../../lib/db/training';
import { describeDelta, formatDecimal, formatMeasure, type Delta } from '../../lib/measure-delta';
import { moduleLabel } from '../../lib/modules';
import { positionLabel, strongFootLabel } from '../../lib/profile-taxonomy';
import { parseExercises } from '../../lib/sheet-types';
import { colors, layout, radius, size, spacing, text } from '../../lib/theme';

const PLACEHOLDER = '—';
const NOT_SET = 'non renseigné';
const NEVER_MEASURED = 'jamais mesurée';
/** Fenêtre de la colonne « 30 jours » : aujourd'hui et les 29 jours précédents. */
const RECENT_DAY_COUNT = 30;
/** Colonne « Module » du tableau des volumes : ses libellés sont plus longs que « 12 séances ». */
const MODULE_COLUMN_FLEX = 1.4;

type LoadingState = { status: 'loading' };
type ErrorState = { status: 'error'; message: string };

type IdentityField = { label: string; value: string };

type IdentityState = LoadingState | ErrorState | { status: 'ready'; fields: IdentityField[] };

/** Dernier résultat d'une mesure, prêt à afficher. */
type LatestLine = {
  /** « 12,5 » : la valeur seule, l'unité s'affiche à côté en secondaire. */
  value: string;
  /** Unité du catalogue ; '' pour une mesure sans unité. */
  unit: string;
  /** « auj. », « il y a 3 j », « 30 sept. ». */
  date: string;
  /** Évolution depuis l'avant-dernier résultat ; direction none pour un premier résultat. */
  delta: Delta;
};

/** Mesure du catalogue prête à afficher : une ligne tappable. */
type MeasureLine = {
  testId: string;
  name: string;
  /** null : mesure jamais prise. */
  latest: LatestLine | null;
  accessibilityLabel: string;
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
  | LoadingState
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
  | LoadingState
  | ErrorState
  | { status: 'ready'; modules: VolumeLine[]; total: VolumeLine | null };

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [identity, setIdentity] = useState<IdentityState>({ status: 'loading' });
  const [measures, setMeasures] = useState<MeasuresState>({ status: 'loading' });
  const [volumes, setVolumes] = useState<VolumesState>({ status: 'loading' });
  // Incrémenté par « Réessayer » : relance les lectures du focus.
  const [reloadCount, setReloadCount] = useState(0);
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
      // restent affichées jusqu'à la réponse. Seul « Réessayer » repasse sa section
      // à « chargement ».
      settle(loadIdentity(), isActive, setIdentity);
      settle(loadMeasures(today), isActive, setMeasures);
      settle(loadVolumes(today), isActive, setVolumes);
      return () => {
        active = false;
      };
    }, [reloadCount]),
  );

  /** « Réessayer » d'une section en erreur : elle repasse à « chargement », puis les trois sections se relisent. */
  function retry(setSection: (state: LoadingState) => void) {
    setSection({ status: 'loading' });
    setReloadCount((count) => count + 1);
  }

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
    <Screen title="Profil">
      <View style={layout.section}>
        <Text role="heading" style={text.title}>
          Identité
        </Text>
        <Card>
          <IdentityRow label="Email" value={session?.user.email ?? PLACEHOLDER} />
          {identity.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
          {identity.status === 'error' ? (
            <>
              <FieldError message={`Erreur : ${identity.message}`} />
              <Button variant="secondary" label="Réessayer" onPress={() => retry(setIdentity)} />
            </>
          ) : null}
          {identity.status === 'ready'
            ? identity.fields.map((field) => <IdentityRow key={field.label} label={field.label} value={field.value} />)
            : null}
          {/* Toujours proposé : l'écran d'édition relit le profil lui-même. */}
          <Button variant="secondary" label="Modifier" onPress={() => router.push('/profile/edit')} />
        </Card>
      </View>

      <View style={layout.section}>
        <Text role="heading" style={text.title}>
          Mesures
        </Text>
        {measures.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {measures.status === 'error' ? (
          <>
            <FieldError message={`Erreur : ${measures.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={() => retry(setMeasures)} />
          </>
        ) : null}
        {measures.status === 'ready' && !measures.hasResults ? (
          // secondary : l'écran n'a pas d'action principale, et les deux sections peuvent être vides ensemble.
          <EmptyState
            title="Aucun résultat"
            message="Fais ton premier test depuis l’onglet Entraînement."
            action={{ label: 'Voir les tests', onPress: () => router.navigate('/training'), variant: 'secondary' }}
          />
        ) : null}
        {measures.status === 'ready'
          ? measures.groups.map((group) => (
              // Sans aucun résultat, seuls les problèmes restent affichés : 23 lignes « — » n'apprennent rien.
              <MeasureGroupCard key={group.sheetId} group={group} showLines={measures.hasResults} />
            ))
          : null}
      </View>

      <View style={layout.section}>
        <Text role="heading" style={text.title}>
          Volumes
        </Text>
        {volumes.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {volumes.status === 'error' ? (
          <>
            <FieldError message={`Erreur : ${volumes.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={() => retry(setVolumes)} />
          </>
        ) : null}
        {volumes.status === 'ready' && volumes.total === null ? (
          <EmptyState
            title="Aucune séance"
            message="Enregistre ta première séance depuis l’Accueil."
            action={{ label: 'Nouvelle séance', onPress: () => router.push('/session/new'), variant: 'secondary' }}
          />
        ) : null}
        {volumes.status === 'ready' && volumes.total !== null ? (
          <VolumeTable modules={volumes.modules} total={volumes.total} />
        ) : null}
      </View>

      <View style={layout.section}>
        <Button variant="danger" label="Déconnexion" onPress={handleSignOut} loading={signingOut} />
        <FieldError message={signOutError} />
      </View>
    </Screen>
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

async function loadMeasures(today: string): Promise<MeasuresState> {
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
  const groups = buildMeasureGroups(sheets.data ?? [], catalog.data ?? [], latest.data ?? new Map(), today);
  return {
    status: 'ready',
    groups,
    hasResults: groups.some((group) => group.lines.some((line) => line.latest !== null)),
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
  today: string,
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
      lines.push(toMeasureLine(test, latest.get(test.id), today));
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

/**
 * Ligne d'une mesure : dernière valeur, unité, date relative à today et
 * évolution (vide pour un premier résultat). Le libellé d'accessibilité dit
 * tout d'un trait, date en absolu (formatShortDay) comme les autres libellés
 * d'accessibilité.
 */
function toMeasureLine(test: TestRow, result: LatestWithPrevious | undefined, today: string): MeasureLine {
  if (result === undefined) {
    return { testId: test.id, name: test.name, latest: null, accessibilityLabel: `${test.name} : ${NEVER_MEASURED}` };
  }
  const delta = describeDelta(result.value, result.previousValue, test.unit, test.higher_is_better);
  const spoken = [formatMeasure(result.value, test.unit), formatShortDay(result.date)];
  return {
    testId: test.id,
    name: test.name,
    latest: {
      value: formatDecimal(result.value),
      unit: test.unit.trim(),
      date: relativeDay(result.date, today),
      delta,
    },
    accessibilityLabel: `${test.name} : ${(delta.direction === 'none' ? spoken : [...spoken, delta.text]).join(', ')}`,
  };
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

/** Ligne de la carte Identité : libellé à gauche, valeur à droite. */
function IdentityRow({ label, value }: IdentityField) {
  return (
    <View style={styles.identityRow}>
      <Text style={text.meta}>{label}</Text>
      <Text style={[text.body, styles.identityValue]}>{value}</Text>
    </View>
  );
}

function MeasureGroupCard({ group, showLines }: { group: MeasureGroup; showLines: boolean }) {
  if (!showLines && group.problem === null) {
    return null;
  }
  return (
    <Card>
      <Text style={text.bodyStrong}>{group.title}</Text>
      <FieldError message={group.problem} />
      {showLines ? group.lines.map((line) => <MeasureRow key={line.testId} line={line} />) : null}
    </Card>
  );
}

/** Mesure : nom et date à gauche, dernière valeur et évolution alignées à droite ; ouvre la courbe. */
function MeasureRow({ line }: { line: MeasureLine }) {
  const { latest } = line;
  return (
    <Pressable
      role="button"
      accessibilityLabel={line.accessibilityLabel}
      onPress={() => router.push({ pathname: '/measure/[testId]', params: { testId: line.testId } })}
      style={({ pressed }) => [styles.measureRow, pressed && styles.pressed]}
    >
      <View style={styles.measureName}>
        <Text style={text.body}>{line.name}</Text>
        <Text style={text.meta}>{latest !== null ? latest.date : NEVER_MEASURED}</Text>
      </View>
      <View style={styles.measureValue}>
        {latest !== null ? (
          <>
            <Text style={[text.title, text.tabular]}>
              {latest.value}
              {latest.unit !== '' ? <Text style={text.unit}>{` ${latest.unit}`}</Text> : null}
            </Text>
            <DeltaText delta={latest.delta} />
          </>
        ) : (
          <Text style={[text.title, text.tabular]}>{PLACEHOLDER}</Text>
        )}
      </View>
    </Pressable>
  );
}

/** Évolution colorée, le sens restant écrit (« ↑ mieux ») ; rien pour un premier résultat. */
function DeltaText({ delta }: { delta: Delta }) {
  if (delta.direction === 'none') {
    return null;
  }
  return <Text style={[text.meta, DELTA_STYLES[delta.direction]]}>{delta.text}</Text>;
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

/** Séances puis durée, l'une sous l'autre ; « — » sans séance. */
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
        </>
      )}
    </View>
  );
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
  identityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  identityValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  measureRow: {
    minHeight: size.touch,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.surface2,
  },
  measureName: {
    flex: 1,
  },
  measureValue: {
    alignItems: 'flex-end',
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
