import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '../../components/bottom-sheet';
import { Button } from '../../components/button';
import { Chip } from '../../components/chip';
import { EmptyState } from '../../components/empty-state';
import { FieldError } from '../../components/field-error';
import { SaveToast } from '../../components/save-toast';
import { Screen } from '../../components/screen';
import { StartRow } from '../../components/start-row';
import { askAboutActiveSession, openActiveSession, useActiveSession } from '../../lib/active-session-context';
import { localToday, relativeDay } from '../../lib/dates';
import { listLastSessionDates, listSessions, listTests, type TestSummary } from '../../lib/db/training';
import { formatMeasure } from '../../lib/measure-delta';
import { composeSession, MAX_SESSION_MIN, proposeSession, type PlanHistoryEntry } from '../../lib/test-plan';
import {
  familyCaption,
  getSkill,
  SKILLS,
  TEST_FAMILIES,
  type FamilyKey,
  type SkillKey,
} from '../../lib/test-families';
import { colors, layout, size, spacing, text } from '../../lib/theme';

/** Espace insécable : un nombre et son unité restent sur la même ligne (« 45 min »). */
const NBSP = ' ';

/** Session prédéfinie prête à afficher : ses tests résolus depuis ses slugs. */
type SessionItem = {
  id: string;
  title: string;
  tests: TestSummary[];
  durationMin: number;
  /** « 4 tests · 25 min · dernière fois : hier » */
  details: string;
  accessibilityLabel: string;
};

/** Ligne d'un test : titre, durée, dernière fois, record principal. */
type TestItem = {
  test: TestSummary;
  details: string;
  accessibilityLabel: string;
};

/** Une famille et ses tests, sous sa compétence ; seules les familles qui ont un test s'affichent. */
type FamilyGroup = { family: FamilyKey; label: string; items: TestItem[] };

type SkillGroup = { skill: SkillKey; families: FamilyGroup[] };

type TabData = {
  tests: TestSummary[];
  sessions: SessionItem[];
  skills: SkillGroup[];
  /** Tests faits, un par jour de résultat : historique de proposeSession et composeSession. */
  history: PlanHistoryEntry[];
  /** « Jamais testée » ou « Dernière fois : il y a 12 j », par famille. */
  familyLastLabels: ReadonlyMap<FamilyKey, string>;
  /** Contenu en base hors format : affiché, jamais avalé. */
  problems: string[];
  /** Jour local de la lecture. */
  today: string;
};

type TabState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: TabData };

/** Suite de tests à démarrer : session prédéfinie (sheetId) ou proposée (sheetId null). */
type RunPlan = {
  sheetId: string | null;
  title: string;
  tests: TestSummary[];
  durationMin: number;
};

/**
 * Feuille ouverte, une seule pour trois vues : la session proposée, le choix
 * d'une famille, ou le détail d'une session prédéfinie. open false : elle redescend.
 */
type SheetState =
  | { kind: 'proposal'; open: boolean }
  | { kind: 'families'; open: boolean }
  | { kind: 'session'; open: boolean; session: SessionItem };

/**
 * Session de la vue proposition. chosen : famille choisie (« Choisir une
 * famille »), null pour la proposition automatique. excluded : familles écartées
 * par « Changer de famille », jamais reprises, pas même pour compléter la session.
 */
type PlanChoice = { chosen: FamilyKey | null; excluded: FamilyKey[] };

/**
 * Posés au retour ici par router.dismissTo : « Séance faite » d'une fiche sans
 * chrono (app/sheet/[id].tsx), fin d'une fiche ou d'une session chronométrée
 * (app/session/finish.tsx), « Séance déjà faite » (app/session/new.tsx ouvert
 * avec sheetId).
 */
type SavedParams = {
  /** Id de la séance créée : sa présence seule déclenche la confirmation, dont il est la key. */
  savedSession?: string;
  savedTitle?: string;
};

// Famille dépliée par compétence : survit au démontage de l'écran tant que l'app
// tourne, jamais persistée (règle 12, comme le filtre du quiz). Repliées au lancement.
let lastOpenFamilies: Partial<Record<SkillKey, FamilyKey>> = {};

export default function TestsScreen() {
  const [tabState, setTabState] = useState<TabState>({ status: 'loading' });
  // Incrémenté par « Réessayer » : relance la lecture.
  const [loadCount, setLoadCount] = useState(0);
  const { savedSession, savedTitle } = useLocalSearchParams<SavedParams>();
  const [openFamilies, setOpenFamilies] = useState(lastOpenFamilies);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  // Famille choisie et familles écartées de la vue proposition, le temps que la feuille est ouverte.
  const [choice, setChoice] = useState<PlanChoice>({ chosen: null, excluded: [] });
  // Échec de mémorisation au démarrage par ▶ ou Démarrer : rien n'a démarré.
  const [startError, setStartError] = useState<string | null>(null);
  // Garde synchrone : deux ▶ rapprochés ne démarrent qu'une séance.
  const startingRef = useRef(false);
  const activeSession = useActiveSession();

  // loadCount en dépendance : « Réessayer » donne un nouveau callback, rejoué
  // aussitôt puisque l'onglet a le focus.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Relu à chaque focus, avec les données : l'app peut rester ouverte après minuit.
      const today = localToday();
      // Pas de retour à « chargement » au focus : au retour sur l'onglet, la liste
      // précédente reste affichée jusqu'à la réponse. Seul « Réessayer » y repasse.
      Promise.all([listTests(), listSessions(), listLastSessionDates()])
        .then(([tests, sessions, lastDates]) => {
          if (!active) {
            return;
          }
          const errors = [tests.error, sessions.error, lastDates.error].filter((message) => message !== null);
          if (errors.length > 0 || !tests.data || !sessions.data || !lastDates.data) {
            // Une même panne (réseau, session expirée) remonte souvent sur les trois requêtes.
            setTabState({ status: 'error', message: [...new Set(errors)].join('\n') || 'Lecture incomplète.' });
            return;
          }
          // Libellés calculés ici avec le `today` de la lecture, pas au rendu : une
          // exception (jour mal formé refusé par relativeDay) part dans le catch.
          setTabState({
            status: 'ready',
            data: toTabData(
              tests.data.items,
              sessions.data.items,
              lastDates.data,
              [...tests.data.problems, ...sessions.data.problems],
              today,
            ),
          });
        })
        .catch((exception: unknown) => {
          // Exception inattendue : affichée, jamais avalée.
          if (active) {
            setTabState({
              status: 'error',
              message: exception instanceof Error ? exception.message : String(exception),
            });
          }
        });
      return () => {
        active = false;
      };
    }, [loadCount]),
  );

  function reload() {
    setTabState({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  /** Puce d'une famille : la déplier, ou la replier si elle l'est déjà ; une famille dépliée par compétence. */
  function toggleFamily(skill: SkillKey, family: FamilyKey) {
    const next = { ...openFamilies, [skill]: openFamilies[skill] === family ? undefined : family };
    lastOpenFamilies = next;
    setOpenFamilies(next);
  }

  /** « Proposer une session » : toujours la proposition automatique, aucune famille écartée. */
  function openProposal() {
    setStartError(null);
    setChoice({ chosen: null, excluded: [] });
    setSheet({ kind: 'proposal', open: true });
  }

  function closeSheet() {
    setSheet((current) => (current === null ? null : { ...current, open: false }));
  }

  /** ▶ d'un test : son chrono démarre et il s'ouvre ; déjà en cours, il reprend ; une autre séance : Alert. */
  async function startTest(test: TestSummary) {
    if (activeSession.loading || startingRef.current) {
      return;
    }
    const current = activeSession.session;
    if (current !== null) {
      if (current.kind === 'test' && current.slug === test.slug) {
        openActiveSession(current, 'push');
      } else {
        askAboutActiveSession(current, 'push');
      }
      return;
    }
    startingRef.current = true;
    setStartError(null);
    const error = await activeSession.start({ kind: 'test', sheetId: test.id, slug: test.slug, title: test.title });
    startingRef.current = false;
    if (error !== null) {
      setStartError(`« ${test.title} » n’a pas démarré. ${error}`);
      return;
    }
    router.push({ pathname: '/test/[slug]', params: { slug: test.slug } });
  }

  /** Démarrer une session : chrono lancé, premier test ouvert ; la même déjà en cours reprend ; une autre : Alert. */
  async function startRun(plan: RunPlan) {
    const first = plan.tests[0];
    if (activeSession.loading || startingRef.current || first === undefined) {
      return;
    }
    const current = activeSession.session;
    if (current !== null) {
      // Feuille retirée d'un coup : une Modal resterait par-dessus l'écran ouvert.
      setSheet(null);
      if (plan.sheetId !== null && current.kind === 'session' && current.sheetId === plan.sheetId) {
        openActiveSession(current, 'push');
      } else {
        askAboutActiveSession(current, 'push');
      }
      return;
    }
    startingRef.current = true;
    setStartError(null);
    const error = await activeSession.start({
      kind: 'session',
      sheetId: plan.sheetId,
      title: plan.title,
      tests: plan.tests.map((test) => test.slug),
      plannedMin: plan.durationMin,
    });
    startingRef.current = false;
    if (error !== null) {
      setStartError(`« ${plan.title} » n’a pas démarré. ${error}`);
      return;
    }
    setSheet(null);
    router.push({ pathname: '/test/[slug]', params: { slug: first.slug } });
  }

  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  // key : une nouvelle séance enregistrée rejoue la confirmation, un simple rendu non.
  const toast =
    typeof savedSession === 'string' ? (
      <SaveToast key={savedSession} message={formatSavedMessage(savedTitle)} />
    ) : null;

  const data = tabState.status === 'ready' ? tabState.data : null;

  return (
    <Screen title="Tests" toast={toast}>
      {tabState.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
      {tabState.status === 'error' ? (
        <View style={layout.section}>
          <FieldError message={`Erreur : ${tabState.message}`} />
          <Button variant="secondary" label="Réessayer" onPress={reload} />
        </View>
      ) : null}

      {data !== null ? (
        <>
          <FieldError message={data.problems.length > 0 ? data.problems.join('\n') : null} />
          {/* État vide sans bouton : les tests viennent du seed SQL, exécuté hors de l'app. */}
          {data.tests.length === 0 ? (
            <EmptyState title="Aucun test" message="Le contenu des tests n’est pas encore chargé dans la base." />
          ) : (
            <Button label="Proposer une session" onPress={openProposal} />
          )}
          {/* Hors de la feuille, absente ou refermée : un ▶ de la liste qui n'a pas démarré. */}
          {sheet === null || !sheet.open ? <FieldError message={startError} /> : null}

          {data.sessions.length > 0 ? (
            <View style={layout.section}>
              <Text role="heading" style={text.overline}>
                Sessions
              </Text>
              {data.sessions.map((session) => (
                <StartRow
                  key={session.id}
                  title={session.title}
                  details={session.details}
                  accessibilityLabel={session.accessibilityLabel}
                  onPress={() => {
                    setStartError(null);
                    setSheet({ kind: 'session', open: true, session });
                  }}
                  onStart={() => startRun(sessionPlan(session))}
                />
              ))}
            </View>
          ) : null}

          {data.skills.length > 0 ? (
            <View style={layout.section}>
              <Text role="heading" style={text.overline}>
                Tests par famille
              </Text>
              {data.skills.map((group) => (
                <SkillSection
                  key={group.skill}
                  group={group}
                  openFamily={openFamilies[group.skill] ?? null}
                  onToggleFamily={(family) => toggleFamily(group.skill, family)}
                  onStartTest={startTest}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {data !== null && sheet !== null ? (
        <PlanSheet
          sheet={sheet}
          data={data}
          choice={choice}
          startError={startError}
          onChangeFamily={(family) => {
            // Proposition automatique : la famille montrée rejoint les écartées ; famille choisie : seule écartée.
            const next = choice.chosen === null ? [...choice.excluded, family] : [family];
            // Toutes les familles vues : on repart de la première.
            const remaining = proposeSession(data.tests, data.history, data.today, next);
            setChoice({ chosen: null, excluded: remaining === null ? [] : next });
          }}
          onShowFamilies={() => setSheet({ kind: 'families', open: true })}
          onPickFamily={(family) => {
            setChoice({ chosen: family, excluded: [] });
            setSheet({ kind: 'proposal', open: true });
          }}
          onStart={startRun}
          onClose={closeSheet}
        />
      ) : null}
    </Screen>
  );
}

type PlanSheetProps = {
  sheet: SheetState;
  data: TabData;
  choice: PlanChoice;
  startError: string | null;
  /** « Changer de famille » : family, la famille montrée (proposée ou choisie), est écartée. */
  onChangeFamily: (family: FamilyKey) => void;
  /** « Choisir une famille » : la feuille passe à la vue familles. */
  onShowFamilies: () => void;
  /** Puce d'une famille : sa session, de retour sur la vue proposition. */
  onPickFamily: (family: FamilyKey) => void;
  onStart: (plan: RunPlan) => void;
  onClose: () => void;
};

/**
 * Feuille du bas, une seule pour trois vues : la session proposée, le choix d'une
 * famille, le détail d'une session prédéfinie. Le BottomSheet reste à la même
 * place de l'arbre : changer de vue remplace son titre et son contenu, sans le
 * démonter ni rejouer le glissement.
 */
function PlanSheet({
  sheet,
  data,
  choice,
  startError,
  onChangeFamily,
  onShowFamilies,
  onPickFamily,
  onStart,
  onClose,
}: PlanSheetProps) {
  return (
    <BottomSheet visible={sheet.open} onClose={onClose} title={sheetTitle(sheet)}>
      {sheet.kind === 'proposal' ? (
        <ProposalContent
          data={data}
          choice={choice}
          startError={startError}
          onStart={onStart}
          onChangeFamily={onChangeFamily}
          onShowFamilies={onShowFamilies}
        />
      ) : null}
      {sheet.kind === 'families' ? (
        <FamilyPicker skills={data.skills} chosen={choice.chosen} onPick={onPickFamily} />
      ) : null}
      {sheet.kind === 'session' ? (
        <SessionContent session={sheet.session} startError={startError} onStart={onStart} />
      ) : null}
    </BottomSheet>
  );
}

/** Titre de la feuille selon sa vue. */
function sheetTitle(sheet: SheetState): string {
  switch (sheet.kind) {
    case 'proposal':
      return 'Session proposée';
    case 'families':
      return 'Choisir une famille';
    case 'session':
      return sheet.session.title;
  }
}

type ProposalContentProps = {
  data: TabData;
  choice: PlanChoice;
  startError: string | null;
  onStart: (plan: RunPlan) => void;
  onChangeFamily: (family: FamilyKey) => void;
  onShowFamilies: () => void;
};

/**
 * Vue proposition : la session de la famille choisie, sinon la session proposée,
 * sans les familles écartées ; Démarrer, puis « Changer de famille » et
 * « Choisir une famille ».
 */
function ProposalContent({ data, choice, startError, onStart, onChangeFamily, onShowFamilies }: ProposalContentProps) {
  const { chosen, excluded } = choice;
  const proposal =
    chosen !== null
      ? composeSession(data.tests, data.history, data.today, chosen, excluded)
      : proposeSession(data.tests, data.history, data.today, excluded);

  if (proposal === null && chosen !== null) {
    // La vue familles ne montre que des familles qui ont un test : chacun des siens dépasse MAX_SESSION_MIN.
    return (
      <>
        <Text style={text.body}>{`Aucun test de cette famille ne tient en ${MAX_SESSION_MIN}${NBSP}min.`}</Text>
        <Button variant="secondary" label="Changer de famille" onPress={() => onChangeFamily(chosen)} />
        <Button variant="secondary" label="Choisir une famille" onPress={onShowFamilies} />
      </>
    );
  }
  if (proposal === null) {
    return (
      <>
        <Text style={text.body}>Aucun test à proposer pour l’instant.</Text>
        {data.skills.length > 0 ? (
          <Button variant="secondary" label="Choisir une famille" onPress={onShowFamilies} />
        ) : null}
      </>
    );
  }

  const bySlug = new Map(data.tests.map((test) => [test.slug, test]));
  const tests = proposal.tests.flatMap((planned) => bySlug.get(planned.slug) ?? []);
  return (
    <>
      <View style={styles.planHeading}>
        <Text style={text.title}>{familyCaption(proposal.family)}</Text>
        <Text style={text.meta}>{data.familyLastLabels.get(proposal.family) ?? 'Jamais testée'}</Text>
      </View>
      <PlanTests tests={tests} durationMin={proposal.durationMin} />
      <FieldError message={startError} />
      <Button
        label="Démarrer"
        onPress={() =>
          onStart({
            sheetId: null,
            title: `Session ${getSkill(proposal.skill).label}`,
            tests,
            durationMin: proposal.durationMin,
          })
        }
      />
      <Button variant="secondary" label="Changer de famille" onPress={() => onChangeFamily(proposal.family)} />
      <Button variant="secondary" label="Choisir une famille" onPress={onShowFamilies} />
    </>
  );
}

type FamilyPickerProps = {
  skills: readonly SkillGroup[];
  /** Famille choisie, cochée ; null pour la proposition automatique. */
  chosen: FamilyKey | null;
  onPick: (family: FamilyKey) => void;
};

/** Vue familles : sous chaque compétence, ses familles qui ont un test, en puces. */
function FamilyPicker({ skills, chosen, onPick }: FamilyPickerProps) {
  return (
    <>
      {skills.map((group) => (
        <View key={group.skill} style={layout.section}>
          <SkillHeading skill={group.skill} />
          <View style={layout.chipRow}>
            {group.families.map((family) => (
              <Chip
                key={family.family}
                label={family.label}
                selected={family.family === chosen}
                accessibilityLabel={familyCaption(family.family)}
                onPress={() => onPick(family.family)}
              />
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

type SessionContentProps = {
  session: SessionItem;
  startError: string | null;
  onStart: (plan: RunPlan) => void;
};

/** Vue session prédéfinie : ses tests dans l'ordre de ses blocks, puis Démarrer. */
function SessionContent({ session, startError, onStart }: SessionContentProps) {
  return (
    <>
      <PlanTests tests={session.tests} durationMin={session.durationMin} />
      <FieldError message={startError} />
      <Button label="Démarrer" onPress={() => onStart(sessionPlan(session))} />
    </>
  );
}

/** Tests d'une session dans l'ordre de passage, puis leur nombre et la durée totale. */
function PlanTests({ tests, durationMin }: { tests: readonly TestSummary[]; durationMin: number }) {
  return (
    <View style={layout.section}>
      {tests.map((test, index) => (
        <View key={test.slug} style={styles.planRow}>
          <Text style={[text.bodyStrong, text.tabular, styles.planNumber]}>{`${index + 1}`}</Text>
          <View style={styles.planText}>
            <Text style={text.bodyStrong}>{test.title}</Text>
            <Text style={text.meta}>{`${familyCaption(test.family)} · ${test.durationMin}${NBSP}min`}</Text>
          </View>
        </View>
      ))}
      <Text style={[text.meta, text.tabular]}>
        {`${formatCount(tests.length, 'test', 'tests')} · ${durationMin}${NBSP}min`}
      </Text>
    </View>
  );
}

type SkillSectionProps = {
  group: SkillGroup;
  openFamily: FamilyKey | null;
  onToggleFamily: (family: FamilyKey) => void;
  onStartTest: (test: TestSummary) => void;
};

/** Une compétence : ses familles en puces, repliées ; la famille choisie déplie ses tests. */
function SkillSection({ group, openFamily, onToggleFamily, onStartTest }: SkillSectionProps) {
  const skill = getSkill(group.skill);
  const open = group.families.find((family) => family.family === openFamily) ?? null;
  return (
    <View style={layout.section}>
      <SkillHeading skill={group.skill} />
      <View style={layout.chipRow}>
        {group.families.map((family) => (
          <Chip
            key={family.family}
            label={family.label}
            selected={family.family === openFamily}
            accessibilityLabel={`${skill.label} · ${family.label} : ${formatCount(family.items.length, 'test', 'tests')}`}
            onPress={() => onToggleFamily(family.family)}
          />
        ))}
      </View>
      {open !== null
        ? open.items.map((item) => (
            <StartRow
              key={item.test.slug}
              title={item.test.title}
              details={item.details}
              accessibilityLabel={item.accessibilityLabel}
              onPress={() => router.push({ pathname: '/test/[slug]', params: { slug: item.test.slug } })}
              onStart={() => onStartTest(item.test)}
            />
          ))
        : null}
    </View>
  );
}

/**
 * En-tête d'une compétence, icône puis libellé : le même dans la liste des
 * tests et dans le choix d'une famille (règle 8).
 */
function SkillHeading({ skill }: { skill: SkillKey }) {
  const { icon, label } = getSkill(skill);
  return (
    <View style={styles.skillHeading}>
      <Ionicons name={icon} size={size.icon} color={colors.textMuted} aria-hidden />
      <Text role="heading" style={text.title}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Tout ce que l'onglet affiche, calculé une fois par lecture.
 * `lastSessionDates` : jour de la dernière séance liée, par id de fiche (une
 * session prédéfinie lie sa séance) ; `today` : jour local de la lecture.
 */
function toTabData(
  tests: readonly TestSummary[],
  sessions: readonly { id: string; title: string; durationMin: number; blocks: string[] }[],
  lastSessionDates: ReadonlyMap<string, string>,
  problems: readonly string[],
  today: string,
): TabData {
  const bySlug = new Map(tests.map((test) => [test.slug, test]));
  const sessionProblems: string[] = [];
  const sessionItems: SessionItem[] = [];
  for (const session of sessions) {
    const missing = session.blocks.filter((slug) => !bySlug.has(slug));
    if (missing.length > 0) {
      sessionProblems.push(`Session « ${session.title} » : tests introuvables (${missing.join(', ')}).`);
      continue;
    }
    const sessionTests = session.blocks.flatMap((slug) => bySlug.get(slug) ?? []);
    const lastDate = lastSessionDates.get(session.id);
    const parts = [
      formatCount(sessionTests.length, 'test', 'tests'),
      `${session.durationMin}${NBSP}min`,
      `dernière fois : ${lastDate === undefined ? 'jamais' : relativeDay(lastDate, today)}`,
    ];
    sessionItems.push({
      id: session.id,
      title: session.title,
      tests: sessionTests,
      durationMin: session.durationMin,
      details: parts.join(' · '),
      accessibilityLabel: [session.title, ...parts].join(', '),
    });
  }

  const skills: SkillGroup[] = SKILLS.flatMap((skill) => {
    const families = TEST_FAMILIES.filter((family) => family.skill === skill.key).flatMap((family): FamilyGroup[] => {
      const items = tests.filter((test) => test.family === family.key).map((test) => toTestItem(test, today));
      return items.length > 0 ? [{ family: family.key, label: family.label, items }] : [];
    });
    return families.length > 0 ? [{ skill: skill.key, families }] : [];
  });

  const familyLastLabels = new Map<FamilyKey, string>();
  for (const family of TEST_FAMILIES) {
    // YYYY-MM-DD se compare comme du texte, dans l'ordre chronologique.
    const last = tests
      .filter((test) => test.family === family.key && test.lastDate !== null)
      .reduce<string | null>((latest, test) => (latest === null || (test.lastDate ?? '') > latest ? test.lastDate : latest), null);
    familyLastLabels.set(family.key, last === null ? 'Jamais testée' : `Dernière fois : ${relativeDay(last, today)}`);
  }

  return {
    tests: [...tests],
    sessions: sessionItems,
    skills,
    history: tests.flatMap((test) => test.resultDates.map((date) => ({ slug: test.slug, date }))),
    familyLastLabels,
    problems: [...problems, ...sessionProblems],
    today,
  };
}

/** Ligne d'un test : « 10 min · dernière fois : hier · record : 18 pts /30 » (record de sa première mesure). */
function toTestItem(test: TestSummary, today: string): TestItem {
  const main = test.exercise.measures[0];
  const record = main !== undefined ? test.records.get(main.key) : undefined;
  const parts = [
    `${test.durationMin}${NBSP}min`,
    `dernière fois : ${test.lastDate === null ? 'jamais' : relativeDay(test.lastDate, today)}`,
    ...(main !== undefined && record !== undefined ? [`record : ${formatMeasure(record, main.unit)}`] : []),
  ];
  return {
    test,
    details: parts.join(' · '),
    accessibilityLabel: [test.title, ...parts].join(', '),
  };
}

/** Session prédéfinie à démarrer : ses tests dans l'ordre de ses blocks. */
function sessionPlan(session: SessionItem): RunPlan {
  return { sheetId: session.id, title: session.title, tests: session.tests, durationMin: session.durationMin };
}

/** Pluriel français, 0 et 1 au singulier : « 1 test », « 3 tests ». */
function formatCount(count: number, singular: string, plural: string): string {
  return `${count}${NBSP}${count >= 2 ? plural : singular}`;
}

/** « Séance enregistrée : Test Tir. » ; « Séance enregistrée. » sans titre. */
function formatSavedMessage(savedTitle: string | undefined): string {
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  const title = typeof savedTitle === 'string' ? savedTitle.trim() : '';
  return title === '' ? 'Séance enregistrée.' : `Séance enregistrée : ${title}.`;
}

const styles = StyleSheet.create({
  skillHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  planHeading: {
    gap: spacing.xs,
  },
  planRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  // Colonne des numéros, en orange comme le protocole d'un test.
  planNumber: {
    minWidth: spacing.md,
    color: colors.accent,
  },
  planText: {
    flex: 1,
    gap: spacing.xs,
  },
});
