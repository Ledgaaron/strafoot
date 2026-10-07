import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatShortDay, lastDays, relativeDay } from '../lib/dates';
import type { SessionRow } from '../lib/db/sessions';
import {
  buildSessionName,
  DEFAULT_DIFFICULTY,
  DEFAULT_MODULE_KEY,
  getModule,
  isModuleKey,
  MODULES,
  TEST_MODULE_KEY,
  type ModuleKey,
} from '../lib/modules';
import { hitSlop, input, inputProps, layout, spacing, text } from '../lib/theme';
import { Button } from './button';
import { Chip } from './chip';
import { FieldError } from './field-error';
import { Screen } from './screen';

/** Modules proposés : tous sauf `test`, créé seulement par l'écran de test. */
const FORM_MODULES = MODULES.filter((entry) => entry.key !== TEST_MODULE_KEY);
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
  /** Titre de l'en-tête natif. */
  title: string;
  /** Jour local figé par l'écran : base des puces de date. */
  today: string;
  /** Lu une seule fois, au montage : l'édition remonte le formulaire avec key. */
  initialValues: SessionFormValues;
  /** Enregistrement en cours : indicateur sur Enregistrer. */
  submitting: boolean;
  /** Autre requête de l'écran en cours (suppression) : Enregistrer seulement désactivé. */
  disabled?: boolean;
  /** Affichée au-dessus d'Enregistrer : erreur d'enregistrement, ou de l'autre requête. */
  error: string | null;
  onSubmit: (result: SessionFormResult) => void;
  /** Dans le pied, sous Enregistrer (bouton Supprimer de l'édition). */
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
  disabled = false,
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

  // Une séance plus ancienne que les puces récentes garde sa date en dernière puce.
  const recentDays = lastDays(today, RECENT_DAY_COUNT);
  const dayOptions = recentDays.includes(initialValues.date)
    ? recentDays
    : [...recentDays, initialValues.date];
  // De même, une séance test (écran de test) garde sa puce de module, en dernier.
  const moduleOptions: readonly (typeof MODULES)[number][] =
    initialValues.module === TEST_MODULE_KEY ? MODULES : FORM_MODULES;

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
    if (submitting || disabled) {
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
    <>
      <Stack.Screen options={{ title }} />
      <Screen
        // Pied fixe, au-dessus du clavier ouvert : Enregistrer reste sous le pouce sans défiler.
        footer={
          <>
            <FieldError message={error} />
            <Button label="Enregistrer" onPress={handleSubmit} loading={submitting} disabled={disabled} />
            {footer}
          </>
        }
      >
        <View style={layout.section}>
          <Text style={text.overline}>Date</Text>
          {/* Sans keyboardShouldPersistTaps ici aussi, le premier tap ne ferait que fermer le clavier. */}
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.dayRow}
          >
            {dayOptions.map((day) => (
              <Chip
                key={day}
                label={relativeDay(day, today)}
                accessibilityLabel={formatShortDay(day)}
                selected={day === date}
                onPress={() => selectDate(day)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={layout.section}>
          <Text style={text.overline}>Module</Text>
          <View style={layout.chipRow}>
            {moduleOptions.map((entry) => (
              <Chip
                key={entry.key}
                label={entry.label}
                selected={entry.key === moduleKey}
                onPress={() => selectModule(entry.key)}
              />
            ))}
          </View>
        </View>

        <DurationField value={durationMin} onStep={stepDuration} />

        <DifficultyField value={difficulty} onToggle={toggleDifficulty} />

        <View style={layout.section}>
          <Text style={text.overline}>Nom</Text>
          <TextInput
            {...inputProps}
            style={input.field}
            value={name}
            onChangeText={changeName}
            placeholder={buildSessionName(moduleKey, date)}
            accessibilityLabel="Nom"
          />
        </View>

        <CommentField value={comment} onChange={setComment} />
      </Screen>
    </>
  );
}

// Champs partagés avec l'écran de fin d'une séance chronométrée
// (app/session/finish.tsx) : une même durée, une même difficulté, un même
// commentaire partout.

type DurationFieldProps = {
  /** Minutes affichées. */
  value: number;
  /** −5 ou +5 ; l'écran applique son propre minimum. */
  onStep: (delta: number) => void;
};

/** Durée : −5, valeur en minutes, +5. */
export function DurationField({ value, onStep }: DurationFieldProps) {
  return (
    <View style={layout.section}>
      <Text style={text.overline}>Durée</Text>
      <View style={[layout.buttonRow, styles.durationRow]}>
        <Button
          variant="secondary"
          label={`−${DURATION_STEP}`}
          accessibilityLabel={`Diminuer de ${DURATION_STEP} minutes`}
          onPress={() => onStep(-DURATION_STEP)}
          style={styles.durationCell}
        />
        <Text style={[text.title, text.tabular, styles.durationCell, styles.durationValue]}>
          {value}
          {/* Espace insécable : l'unité ne passe jamais seule à la ligne. */}
          <Text style={text.unit}>{' min'}</Text>
        </Text>
        <Button
          variant="secondary"
          label={`+${DURATION_STEP}`}
          accessibilityLabel={`Augmenter de ${DURATION_STEP} minutes`}
          onPress={() => onStep(DURATION_STEP)}
          style={styles.durationCell}
        />
      </View>
    </View>
  );
}

type DifficultyFieldProps = {
  /** null : aucune puce choisie, DEFAULT_DIFFICULTY sera enregistrée. */
  value: number | null;
  /** Puce touchée : l'écran la choisit, ou la retire si c'était déjà elle. */
  onToggle: (level: number) => void;
};

/** Difficulté facultative, de 1 à 5. */
export function DifficultyField({ value, onToggle }: DifficultyFieldProps) {
  return (
    <View style={layout.section}>
      <View style={styles.labelGroup}>
        <Text style={text.overline}>Difficulté</Text>
        <Text style={text.meta}>{`Facultative : ${DEFAULT_DIFFICULTY} si aucune n’est choisie.`}</Text>
      </View>
      <View style={layout.chipRow}>
        {DIFFICULTIES.map((level) => (
          <Chip
            key={level}
            label={String(level)}
            accessibilityLabel={`Difficulté ${level}`}
            selected={value === level}
            onPress={() => onToggle(level)}
          />
        ))}
      </View>
    </View>
  );
}

/** Commentaire facultatif, sur plusieurs lignes. */
export function CommentField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  return (
    <View style={layout.section}>
      <Text style={text.overline}>Commentaire</Text>
      <TextInput
        {...inputProps}
        style={[input.field, input.multiline]}
        value={value}
        onChangeText={onChange}
        placeholder="Facultatif"
        multiline
        accessibilityLabel="Commentaire"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dayRow: {
    gap: spacing.md,
    // La ScrollView coupe ce qui la dépasse : place pour la zone tactile agrandie
    // des puces (hitSlop), 48 px de haut au lieu de 44.
    paddingVertical: hitSlop.top,
  },
  /** Libellé et sa précision serrés ; les puces restent à 12 px dessous. */
  labelGroup: {
    gap: spacing.xs,
  },
  durationRow: {
    alignItems: 'center',
  },
  /** −5, valeur, +5 : trois colonnes de même largeur. */
  durationCell: {
    flex: 1,
  },
  durationValue: {
    textAlign: 'center',
  },
});
