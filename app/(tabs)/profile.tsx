import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ScrollView,
} from 'react-native';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { IconButton } from '../../components/icon-button';
import { SaveToast } from '../../components/save-toast';
import { Screen } from '../../components/screen';
import { useAuth } from '../../lib/auth-context';
import { daysBetween, formatNumericDay, formatShortDay, localToday, relativeDay, shiftDay } from '../../lib/dates';
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
import { colors, fontSize, layout, radius, size, spacing, text } from '../../lib/theme';

const PLACEHOLDER = '—';
const NOT_SET = 'non renseigné';
const NEVER_MEASURED = 'jamais mesurée';
const SIGN_OUT_QUESTION = 'Se déconnecter de cet appareil ?';
/** Email de l'en-tête réduit pour tenir sur une ligne, jamais sous la taille du corps : 20 × 0,8 = 16 px. */
const EMAIL_MIN_FONT_SCALE = fontSize.body / fontSize.title;
/** Fenêtre de la colonne « 30 jours » : aujourd'hui et les 29 jours précédents. */
const RECENT_DAY_COUNT = 30;
/** Colonne « Module » du tableau des volumes : ses libellés sont plus longs que « 12 séances ». */
const MODULE_COLUMN_FLEX = 1.4;

/** Posés par router.dismissTo à l'arrivée sur l'onglet. */
type ProfileParams = {
  /** « Voir ma progression » d'un test : fiche dont la carte est mise en évidence et amenée à l'écran. */
  focusTest?: string;
  /** Séance qui a produit les résultats : nonce, une mise en évidence par test passé. */
  focusSession?: string;
  /** Nonce posé par l'écran d'édition après un enregistrement : rejoue la confirmation. */
  saved?: string;
};

type LoadingState = { status: 'loading' };
type ErrorState = { status: 'error'; message: string };

type IdentityField = { label: string; value: string };

/** Objectif du profil prêt à afficher. */
type GoalView = {
  text: string;
  /** « J-42 » avant l'échéance, « J+3 » après ; null sans échéance. */
  countdown: string | null;
  /** « Objectif : …, échéance le 18/11/2026 ». */
  accessibilityLabel: string;
};

type IdentityState =
  | LoadingState
  | ErrorState
  | { status: 'ready'; fields: IdentityField[]; goal: GoalView | null };

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
  const { focusTest, focusSession, saved } = useLocalSearchParams<ProfileParams>();
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  const focusTestId = typeof focusTest === 'string' && focusTest !== '' ? focusTest : null;
  const focusNonce = typeof focusSession === 'string' ? focusSession : null;
  const savedNonce = typeof saved === 'string' && saved !== '' ? saved : null;
  const email = session?.user.email ?? null;
  const [identity, setIdentity] = useState<IdentityState>({ status: 'loading' });
  const [measures, setMeasures] = useState<MeasuresState>({ status: 'loading' });
  const [volumes, setVolumes] = useState<VolumesState>({ status: 'loading' });
  // Incrémenté par « Réessayer » : relance les lectures du focus.
  const [reloadCount, setReloadCount] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  // Carte du test qu'on vient de passer (« Voir ma progression »), le temps de la visite.
  const [highlightedTest, setHighlightedTest] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Fiche dont la carte reste à amener à l'écran ; null une fois fait, ou l'onglet quitté.
  const pendingFocusRef = useRef<string | null>(null);
  // Relevés onLayout : y de la section Évaluations dans le contenu défilant, y de
  // chaque carte de test dans la section.
  const evaluationsYRef = useRef<number | null>(null);
  const cardYsRef = useRef(new Map<string, number>());

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
      settle(loadIdentity(today), isActive, setIdentity);
      settle(loadMeasures(today), isActive, setMeasures);
      settle(loadVolumes(today), isActive, setVolumes);
      return () => {
        active = false;
      };
    }, [reloadCount]),
  );

  // Quitter l'onglet efface la mise en évidence et annule un défilement encore en attente.
  useFocusEffect(
    useCallback(
      () => () => {
        setHighlightedTest(null);
        pendingFocusRef.current = null;
      },
      [],
    ),
  );

  // Arrivée par « Voir ma progression ». Les paramètres restent sur l'onglet : la
  // mise en évidence ne revient pas à chaque focus, seulement avec un nouveau test
  // passé (focusSession).
  useEffect(() => {
    if (focusTestId === null) {
      return;
    }
    setHighlightedTest(focusTestId);
    pendingFocusRef.current = focusTestId;
    scheduleFocusScroll();
  }, [focusTestId, focusNonce]);

  /** « Réessayer » d'une section en erreur : elle repasse à « chargement », puis les trois sections se relisent. */
  function retry(setSection: (state: LoadingState) => void) {
    setSection({ status: 'loading' });
    setReloadCount((count) => count + 1);
  }

  function confirmSignOut() {
    if (signingOut) {
      return;
    }
    // Alert.alert ne fait rien sur web : confirmation du navigateur à la place.
    if (Platform.OS === 'web') {
      if (window.confirm(SIGN_OUT_QUESTION)) {
        handleSignOut();
      }
      return;
    }
    Alert.alert('Déconnexion', SIGN_OUT_QUESTION, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: handleSignOut },
    ]);
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

  function recordEvaluationsLayout(event: LayoutChangeEvent) {
    evaluationsYRef.current = event.nativeEvent.layout.y;
    scheduleFocusScroll();
  }

  function recordCardLayout(sheetId: string, event: LayoutChangeEvent) {
    cardYsRef.current.set(sheetId, event.nativeEvent.layout.y);
    scheduleFocusScroll();
  }

  /**
   * Défilement vers la carte en attente, une image plus tard : les autres
   * onLayout du même passage de mise en page sont alors relevés.
   */
  function scheduleFocusScroll() {
    if (pendingFocusRef.current !== null) {
      requestAnimationFrame(scrollToPendingCard);
    }
  }

  /**
   * Amène la carte en attente à 16 px sous le haut de l'écran, une seule fois,
   * dès que la section et la carte affichée sont mesurées. Attend aussi la fin
   * du chargement de l'Identité : au-dessus, sa hauteur décalerait la carte.
   */
  function scrollToPendingCard() {
    const sheetId = pendingFocusRef.current;
    const sectionY = evaluationsYRef.current;
    const cardY = sheetId !== null ? cardYsRef.current.get(sheetId) : undefined;
    if (
      sheetId === null ||
      sectionY === null ||
      cardY === undefined ||
      identity.status === 'loading' ||
      !isTestCardShown(measures, sheetId)
    ) {
      return;
    }
    pendingFocusRef.current = null;
    scrollRef.current?.scrollTo({ y: sectionY + cardY - spacing.lg, animated: false });
  }

  return (
    <Screen
      title="Profil"
      scrollRef={scrollRef}
      // Retour de l'édition : saved change à chaque enregistrement et rejoue la confirmation.
      toast={savedNonce !== null ? <SaveToast key={savedNonce} message="Profil enregistré." /> : null}
    >
      <View style={styles.headerBlock}>
        <View style={styles.header}>
          <Text
            style={[text.title, styles.email]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={EMAIL_MIN_FONT_SCALE}
            // L'adresse entière pour le lecteur d'écran, même tronquée à l'affichage.
            accessibilityLabel={`Email : ${email ?? NOT_SET}`}
          >
            {email ?? PLACEHOLDER}
          </Text>
          <View style={layout.buttonRow}>
            {/* L'écran d'édition relit le profil lui-même : proposé même si l'Identité est en erreur. */}
            <IconButton
              icon="create-outline"
              accessibilityLabel="Modifier le profil"
              onPress={() => router.push('/profile/edit')}
            />
            <IconButton
              icon="log-out-outline"
              accessibilityLabel="Se déconnecter"
              onPress={confirmSignOut}
              loading={signingOut}
            />
          </View>
        </View>
        <FieldError message={signOutError} />
      </View>

      {/* Fin du chargement : l'Identité grandit et la section Évaluations descend.
          Sur le web, onLayout ne signale que les changements de taille, pas ce
          déplacement : ce relevé-ci relance alors le défilement en attente. */}
      <View style={layout.section} onLayout={scheduleFocusScroll}>
        <Text role="heading" style={text.title}>
          Identité
        </Text>
        {identity.status === 'loading' ? <ActivityIndicator color={colors.accent} /> : null}
        {identity.status === 'error' ? (
          <>
            <FieldError message={`Erreur : ${identity.message}`} />
            <Button variant="secondary" label="Réessayer" onPress={() => retry(setIdentity)} />
          </>
        ) : null}
        {identity.status === 'ready' ? (
          <Card>
            {identity.fields.map((field) => (
              <IdentityRow key={field.label} label={field.label} value={field.value} />
            ))}
            <GoalBlock goal={identity.goal} />
          </Card>
        ) : null}
      </View>

      <View style={layout.section} onLayout={recordEvaluationsLayout}>
        <Text role="heading" style={text.title}>
          Évaluations
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
          ? measures.groups
              .filter((group) => isGroupShown(group, measures.hasResults))
              .map((group) => (
                <MeasureGroupCard
                  key={group.sheetId}
                  group={group}
                  showLines={measures.hasResults}
                  highlighted={group.sheetId === highlightedTest}
                  onLayout={(event) => recordCardLayout(group.sheetId, event)}
                />
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

async function loadIdentity(today: string): Promise<IdentityState> {
  const { data, error } = await getMyProfile();
  if (error !== null) {
    return { status: 'error', message: error };
  }
  return { status: 'ready', fields: toIdentityFields(data), goal: toGoalView(data, today) };
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

/**
 * Objectif et compte à rebours en jours calendaires depuis today ; null sans
 * objectif, même avec une échéance (l'écran d'édition refuse une échéance seule).
 */
function toGoalView(profile: ProfileRow | null, today: string): GoalView | null {
  const goal = profile?.goal?.trim() ?? '';
  if (goal === '') {
    return null;
  }
  const deadline = profile?.goal_deadline ?? null;
  if (deadline === null) {
    return { text: goal, countdown: null, accessibilityLabel: `Objectif : ${goal}` };
  }
  const days = daysBetween(today, deadline);
  return {
    text: goal,
    // Échéance dépassée : jours écoulés depuis (« J+3 »).
    countdown: days >= 0 ? `J-${days}` : `J+${-days}`,
    accessibilityLabel: `Objectif : ${goal}, échéance le ${formatNumericDay(deadline)}`,
  };
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

/** Sans aucun résultat, seuls les problèmes restent affichés : 23 lignes « — » n'apprennent rien. */
function isGroupShown(group: MeasureGroup, hasResults: boolean): boolean {
  return hasResults || group.problem !== null;
}

/** Carte du test à l'écran ; une carte retirée garde son dernier relevé onLayout, périmé. */
function isTestCardShown(measures: MeasuresState, sheetId: string): boolean {
  return (
    measures.status === 'ready' &&
    measures.groups.some((group) => group.sheetId === sheetId && isGroupShown(group, measures.hasResults))
  );
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

/** Bas de la carte Identité : l'objectif et son compte à rebours, ou le lien pour en définir un. */
function GoalBlock({ goal }: { goal: GoalView | null }) {
  if (goal === null) {
    return (
      <View style={styles.goalBlock}>
        <Text style={text.overline}>Objectif</Text>
        <Pressable
          role="button"
          onPress={() => router.push('/profile/edit')}
          style={({ pressed }) => [styles.goalLink, pressed && styles.pressed]}
        >
          <Text style={[text.body, styles.goalLinkLabel]}>Aucun objectif — en définir un</Text>
          <Ionicons name="chevron-forward" size={size.icon} color={colors.textMuted} aria-hidden />
        </Pressable>
      </View>
    );
  }
  return (
    // Lu d'un trait, l'échéance en date plutôt qu'en « J-42 ».
    <View accessible accessibilityLabel={goal.accessibilityLabel} style={styles.goalBlock}>
      <Text style={text.overline}>Objectif</Text>
      <Text style={text.title}>{goal.text}</Text>
      {goal.countdown !== null ? <Text style={text.meta}>{goal.countdown}</Text> : null}
    </View>
  );
}

type MeasureGroupCardProps = {
  group: MeasureGroup;
  showLines: boolean;
  /** Test qu'on vient de passer (« Voir ma progression ») : bordure accent. */
  highlighted: boolean;
  /** Position de la carte dans la section, pour l'amener à l'écran. */
  onLayout: (event: LayoutChangeEvent) => void;
};

function MeasureGroupCard({ group, showLines, highlighted, onLayout }: MeasureGroupCardProps) {
  return (
    // Card ne prend pas onLayout : la vue qui l'enveloppe relève sa position.
    <View onLayout={onLayout}>
      <Card highlighted={highlighted}>
        <Text style={text.bodyStrong}>{group.title}</Text>
        <FieldError message={group.problem} />
        {showLines ? group.lines.map((line) => <MeasureRow key={line.testId} line={line} />) : null}
      </Card>
    </View>
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
  /** En-tête et son erreur de déconnexion, serrés. */
  headerBlock: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  email: {
    flex: 1,
  },
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
  /** Séparé des lignes d'identité par un trait. */
  goalBlock: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: size.border,
    borderTopColor: colors.border,
  },
  goalLink: {
    minHeight: size.touch,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  goalLinkLabel: {
    flex: 1,
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
    backgroundColor: colors.surfacePressed,
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
