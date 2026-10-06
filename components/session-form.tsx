import { Stack } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDayChip, lastDays } from '../lib/dates';
import type { SessionRow } from '../lib/db/sessions';
import {
  buildSessionName,
  DEFAULT_MODULE_KEY,
  getModule,
  isModuleKey,
  MODULES,
  type ModuleKey,
} from '../lib/modules';

/** Difficulté enregistrée quand aucune puce n'est choisie. */
const DEFAULT_DIFFICULTY = 3;
const DIFFICULTIES = [1, 2, 3, 4, 5];
/** Puces de date : aujourd'hui puis les 13 jours précédents. */
const RECENT_DAY_COUNT = 14;
/** Pas des boutons de durée et durée minimale, en minutes. */
const DURATION_STEP = 5;
const MIN_DURATION = 5;

/** État du formulaire ; difficulty null : aucune puce choisie. */
export type SessionFormValues = {
  date: string;
  module: ModuleKey;
  durationMin: number;
  difficulty: number | null;
  name: string;
  comment: string;
};

/** Champs prêts à étaler dans SessionInput / SessionPatch ; le type, déduit du module, reste à l'écran. */
export type SessionFormResult = {
  date: string;
  module: ModuleKey;
  duration_min: number;
  difficulty: number;
  name: string;
  comment: string | null;
};

type SessionFormProps = {
  title: string;
  /** Jour local figé par l'écran : base des puces de date. */
  today: string;
  /** Lu une seule fois, au montage : l'édition remonte le formulaire avec key. */
  initialValues: SessionFormValues;
  submitting: boolean;
  error: string | null;
  onSubmit: (result: SessionFormResult) => void;
  /** Ajouté en bas du contenu (bouton Supprimer de l'édition). */
  footer?: ReactNode;
};

export function newSessionFormValues(today: string): SessionFormValues {
  const moduleKey = DEFAULT_MODULE_KEY;
  return {
    date: today,
    module: moduleKey,
    durationMin: getModule(moduleKey).defaultDurationMin,
    difficulty: null,
    name: buildSessionName(moduleKey, today),
    comment: '',
  };
}

export function sessionFormValuesFromRow(row: SessionRow): SessionFormValues {
  const moduleKey = isModuleKey(row.module) ? row.module : DEFAULT_MODULE_KEY;
  return {
    date: row.date,
    module: moduleKey,
    durationMin: row.duration_min,
    difficulty: row.difficulty,
    name: row.name ?? buildSessionName(moduleKey, row.date),
    comment: row.comment ?? '',
  };
}

export function SessionForm({
  title,
  today,
  initialValues,
  submitting,
  error,
  onSubmit,
  footer,
}: SessionFormProps) {
  const [date, setDate] = useState(initialValues.date);
  const [moduleKey, setModuleKey] = useState<ModuleKey>(initialValues.module);
  const [durationMin, setDurationMin] = useState(initialValues.durationMin);
  const [difficulty, setDifficulty] = useState<number | null>(initialValues.difficulty);
  const [name, setName] = useState(initialValues.name);
  const [comment, setComment] = useState(initialValues.comment);
  // Durée et nom suivent le module et la date tant qu'ils n'ont pas été modifiés
  // à la main ; une valeur égale à la valeur automatique reste automatique.
  const [durationTouched, setDurationTouched] = useState(
    () => initialValues.durationMin !== getModule(initialValues.module).defaultDurationMin,
  );
  const [nameTouched, setNameTouched] = useState(
    () =>
      initialValues.name.trim() !== '' &&
      initialValues.name !== buildSessionName(initialValues.module, initialValues.date),
  );
  const scrollRef = useRef<ScrollView>(null);

  // L'erreur s'affiche en haut du contenu : on y remonte à chaque nouvelle erreur.
  useEffect(() => {
    if (error) {
      scrollRef.current?.scrollTo({ y: 0 });
    }
  }, [error]);

  // Une séance plus ancienne que les puces récentes garde sa date en dernière puce.
  const recentDays = lastDays(today, RECENT_DAY_COUNT);
  const dayOptions = recentDays.includes(initialValues.date)
    ? recentDays
    : [...recentDays, initialValues.date];

  function selectDate(day: string) {
    setDate(day);
    if (!nameTouched) {
      setName(buildSessionName(moduleKey, day));
    }
  }

  function selectModule(key: ModuleKey) {
    setModuleKey(key);
    if (!durationTouched) {
      setDurationMin(getModule(key).defaultDurationMin);
    }
    if (!nameTouched) {
      setName(buildSessionName(key, date));
    }
  }

  function stepDuration(delta: number) {
    setDurationTouched(true);
    setDurationMin((current) => Math.max(MIN_DURATION, current + delta));
  }

  function toggleDifficulty(level: number) {
    setDifficulty((current) => (current === level ? null : level));
  }

  function changeName(text: string) {
    setName(text);
    // Vider le champ rend la main au nom automatique.
    setNameTouched(text.trim() !== '');
  }

  function handleSubmit() {
    if (submitting) {
      return;
    }
    onSubmit({
      date,
      module: moduleKey,
      duration_min: durationMin,
      difficulty: difficulty ?? DEFAULT_DIFFICULTY,
      name: name.trim() || buildSessionName(moduleKey, date),
      comment: comment.trim() || null,
    });
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <Stack.Screen
        options={{
          title,
          // Dans l'en-tête : visible sans défiler, même clavier ouvert.
          headerRight: () => (
            <Pressable
              role="button"
              accessibilityLabel="Enregistrer"
              aria-disabled={submitting}
              disabled={submitting}
              onPress={handleSubmit}
              style={({ pressed }) => [styles.headerButton, (pressed || submitting) && styles.dimmed]}
            >
              <Text style={styles.headerButtonLabel}>
                {submitting ? 'Enregistrement…' : 'Enregistrer'}
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.label}>Date</Text>
          {/* Sans keyboardShouldPersistTaps ici aussi, le premier tap ne ferait que fermer le clavier. */}
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.dayRow}
          >
            {dayOptions.map((day) => (
              <Chip
                key={day}
                label={formatDayChip(day, today)}
                selected={day === date}
                onPress={() => selectDate(day)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Module</Text>
          <View style={styles.wrapRow}>
            {MODULES.map((entry) => (
              <Chip
                key={entry.key}
                label={entry.label}
                selected={entry.key === moduleKey}
                onPress={() => selectModule(entry.key)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Durée</Text>
          <View style={styles.durationRow}>
            <Pressable
              role="button"
              accessibilityLabel={`Diminuer de ${DURATION_STEP} minutes`}
              onPress={() => stepDuration(-DURATION_STEP)}
              style={({ pressed }) => [styles.box, pressed && styles.dimmed]}
            >
              <Text style={styles.boxLabel}>{`\u2212${DURATION_STEP}`}</Text>
            </Pressable>
            <Text style={styles.durationValue}>{durationMin} min</Text>
            <Pressable
              role="button"
              accessibilityLabel={`Augmenter de ${DURATION_STEP} minutes`}
              onPress={() => stepDuration(DURATION_STEP)}
              style={({ pressed }) => [styles.box, pressed && styles.dimmed]}
            >
              <Text style={styles.boxLabel}>+{DURATION_STEP}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Difficulté (facultatif, {DEFAULT_DIFFICULTY} si vide)</Text>
          <View style={styles.wrapRow}>
            {DIFFICULTIES.map((level) => (
              <Chip
                key={level}
                label={String(level)}
                accessibilityLabel={`Difficulté ${level}`}
                selected={difficulty === level}
                onPress={() => toggleDifficulty(level)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Nom</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={changeName}
            placeholder={buildSessionName(moduleKey, date)}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Commentaire</Text>
          <TextInput
            style={[styles.input, styles.commentInput]}
            value={comment}
            onChangeText={setComment}
            placeholder="Commentaire (facultatif)"
            multiline
          />
        </View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

/** Puce de choix : fond sombre si sélectionnée, bordure seule sinon. */
function Chip({ label, selected, onPress, accessibilityLabel }: ChipProps) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.box, selected && styles.boxSelected, pressed && styles.dimmed]}
    >
      <Text style={[styles.boxLabel, selected && styles.boxLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  error: {
    color: '#b00020',
  },
  section: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  dayRow: {
    gap: 8,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  durationValue: {
    fontSize: 18,
  },
  box: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxSelected: {
    backgroundColor: '#222',
    borderColor: '#222',
  },
  boxLabel: {
    fontSize: 16,
  },
  boxLabelSelected: {
    color: '#fff',
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 16,
  },
  commentInput: {
    minHeight: 88,
    paddingVertical: 8,
    textAlignVertical: 'top',
  },
  footer: {
    marginTop: 8,
  },
  headerButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  headerButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  dimmed: {
    opacity: 0.5,
  },
});
