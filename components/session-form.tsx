import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatDateLine } from '../lib/dates';
import type { SessionDefaults, SessionRow } from '../lib/db/sessions';
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
import { colors, fontSize, input, inputProps, layout, lineHeight, radius, size, spacing, text } from '../lib/theme';
import { BottomSheet } from './bottom-sheet';
import { Button } from './button';
import { Chip } from './chip';
import { FieldError } from './field-error';
import { ModuleIcon } from './module-icon';
import { MonthSheet } from './month-sheet';
import { Screen } from './screen';

/** Modules proposés : tous sauf `test`, créé seulement par l'écran de test. */
const FORM_MODULES = MODULES.filter((entry) => entry.key !== TEST_MODULE_KEY);
const DIFFICULTIES = [1, 2, 3, 4, 5];
/** Pas des boutons de durée, en minutes. */
const DURATION_STEP = 5;
/** Bornes d'une durée, en minutes : saisie au clavier comme boutons ±5. */
export const MIN_DURATION = 1;
export const MAX_DURATION = 600;
/** 600 : trois chiffres au plus. */
const DURATION_MAX_LENGTH = 3;
const DURATION_ERROR = `Durée attendue : un nombre entier de ${MIN_DURATION} à ${MAX_DURATION} min.`;
const INVALID_FORM_MESSAGE = 'À corriger : durée.';
/** Zone tactile d'un bouton compact ramenée à size.touch en hauteur (sa largeur y est déjà). */
const COMPACT_HIT_SLOP = { top: (size.touch - size.compactButton) / 2, bottom: (size.touch - size.compactButton) / 2 };

/** Dernière durée de chaque module (lib/db/sessions.ts) ; vide : la durée par défaut du module. */
export type DurationDefaults = SessionDefaults['lastDurationByModule'];

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
  /** Jour local figé par l'écran : libellé de la date, jours à venir inertes dans le calendrier. */
  today: string;
  /** Lu une seule fois, au montage : l'édition remonte le formulaire avec key. */
  initialValues: SessionFormValues;
  /** Durée automatique de chaque module : sa dernière durée enregistrée, sinon celle du module. */
  durationDefaults?: DurationDefaults;
  /** Au-dessus des champs : la lecture des derniers réglages a échoué, la séance reste saisissable. */
  warning?: string | null;
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

/** Durée proposée pour un module : sa dernière durée enregistrée, sinon celle du module. */
export function automaticDuration(moduleKey: ModuleKey, defaults: DurationDefaults = {}): number {
  return defaults[moduleKey] ?? getModule(moduleKey).defaultDurationMin;
}

/**
 * Valeurs de départ d'une séance libre : dernier module utilisé (hors test) et
 * sa durée automatique ; sans historique, le module par défaut et sa durée.
 */
export function newSessionFormValues(today: string, defaults: SessionDefaults | null = null): SessionFormValues {
  const moduleKey = defaults?.lastModule ?? DEFAULT_MODULE_KEY;
  return {
    date: today,
    module: moduleKey,
    durationMin: automaticDuration(moduleKey, defaults?.lastDurationByModule),
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
  durationDefaults = {},
  warning = null,
  submitting,
  disabled = false,
  error,
  onSubmit,
  footer,
}: SessionFormProps) {
  const [date, setDate] = useState(initialValues.date);
  const [moduleKey, setModuleKey] = useState<ModuleKey>(initialValues.module);
  // Saisie brute : vide ou hors bornes pendant la frappe, lue à l'enregistrement.
  const [durationText, setDurationText] = useState(() => String(initialValues.durationMin));
  const [difficulty, setDifficulty] = useState<number | null>(initialValues.difficulty);
  const [name, setName] = useState(initialValues.name);
  const [comment, setComment] = useState(initialValues.comment);
  // Durée et nom suivent le module et la date tant qu'ils n'ont pas été modifiés
  // à la main ; une valeur égale à la valeur automatique reste automatique.
  const [durationTouched, setDurationTouched] = useState(
    () => initialValues.durationMin !== automaticDuration(initialValues.module, durationDefaults),
  );
  const [nameTouched, setNameTouched] = useState(
    () =>
      initialValues.name.trim() !== '' &&
      initialValues.name !== buildSessionName(initialValues.module, initialValues.date),
  );
  // Enregistrer refusé : durée illisible ou hors bornes (le détail est sous le champ).
  const [invalidSubmit, setInvalidSubmit] = useState(false);
  const [moduleSheetVisible, setModuleSheetVisible] = useState(false);
  const [dateSheetVisible, setDateSheetVisible] = useState(false);

  // Une séance test (écran de test) garde son module dans la liste, en dernier.
  const moduleOptions: readonly (typeof MODULES)[number][] =
    initialValues.module === TEST_MODULE_KEY ? MODULES : FORM_MODULES;

  function selectDate(day: string) {
    setDateSheetVisible(false);
    setDate(day);
    if (!nameTouched) {
      setName(buildSessionName(moduleKey, day));
    }
  }

  function selectModule(key: ModuleKey) {
    setModuleSheetVisible(false);
    setModuleKey(key);
    if (!durationTouched) {
      setDurationText(String(automaticDuration(key, durationDefaults)));
      setInvalidSubmit(false);
    }
    if (!nameTouched) {
      setName(buildSessionName(key, date));
    }
  }

  function stepDuration(delta: number) {
    setDurationTouched(true);
    setInvalidSubmit(false);
    // Saisie illisible : on repart de la durée automatique du module.
    setDurationText((current) => stepDurationText(current, delta, automaticDuration(moduleKey, durationDefaults)));
  }

  function changeDurationText(value: string) {
    setDurationTouched(true);
    setInvalidSubmit(false);
    setDurationText(value);
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
    const durationMin = parseDuration(durationText);
    if (durationMin === null) {
      // Saisie conservée ; le message détaillé est déjà sous le champ.
      setInvalidSubmit(true);
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

  const moduleLabel = getModule(moduleKey).label;

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen
        // Pied fixe, au-dessus du clavier ouvert : Enregistrer reste sous le pouce sans défiler.
        footer={
          <>
            {/* Le champ en erreur peut être hors de l'écran : le pied, toujours visible, le dit. */}
            <FieldError message={invalidSubmit ? INVALID_FORM_MESSAGE : error} />
            <Button label="Enregistrer" onPress={handleSubmit} loading={submitting} disabled={disabled} />
            {footer}
          </>
        }
      >
        <FieldError message={warning} />

        <View style={layout.section}>
          <Text style={text.overline}>Module</Text>
          <PickerRow
            leading={<ModuleIcon module={moduleKey} />}
            label={moduleLabel}
            accessibilityLabel={`Module : ${moduleLabel}. Changer de module`}
            onPress={() => setModuleSheetVisible(true)}
          />
        </View>

        <View style={layout.section}>
          <Text style={text.overline}>Date</Text>
          <PickerRow
            leading={<Ionicons name="calendar-outline" size={size.icon} color={colors.textMuted} aria-hidden />}
            label={formatDateLine(date, today)}
            accessibilityLabel={`Date : ${formatDateLine(date, today)}. Changer de date`}
            onPress={() => setDateSheetVisible(true)}
          />
        </View>

        <DurationField text={durationText} onChangeText={changeDurationText} onStep={stepDuration} />

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

      <BottomSheet visible={moduleSheetVisible} onClose={() => setModuleSheetVisible(false)} title="Module">
        <View>
          {moduleOptions.map((entry) => (
            <ModuleOption
              key={entry.key}
              moduleKey={entry.key}
              label={entry.label}
              selected={entry.key === moduleKey}
              onPress={() => selectModule(entry.key)}
            />
          ))}
        </View>
      </BottomSheet>

      <MonthSheet
        visible={dateSheetVisible}
        mode="pick"
        today={today}
        selectedDay={date}
        onClose={() => setDateSheetVisible(false)}
        onPickDay={selectDate}
      />
    </>
  );
}

type PickerRowProps = {
  /** Tuile du module, ou icône du calendrier. */
  leading: ReactNode;
  label: string;
  /** Valeur courante et action, pour le lecteur d'écran. */
  accessibilityLabel: string;
  onPress: () => void;
};

/** Ligne de choix : valeur courante avec son icône, chevron ; le tap ouvre une feuille du bas. */
function PickerRow({ leading, label, accessibilityLabel, onPress }: PickerRowProps) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.pickerRow, pressed && styles.rowPressed]}
    >
      {leading}
      <Text numberOfLines={1} style={[text.bodyStrong, styles.rowLabel]}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={size.icon} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}

type ModuleOptionProps = {
  moduleKey: ModuleKey;
  label: string;
  selected: boolean;
  onPress: () => void;
};

/** Ligne de la feuille des modules : tuile, libellé, coche sur le module choisi. */
function ModuleOption({ moduleKey, label, selected, onPress }: ModuleOptionProps) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.moduleOption, pressed && styles.rowPressed]}
    >
      <ModuleIcon module={moduleKey} />
      <Text style={[text.bodyStrong, styles.rowLabel, selected && styles.selectedLabel]}>{label}</Text>
      {selected ? <Ionicons name="checkmark" size={size.icon} color={colors.accent} aria-hidden /> : null}
    </Pressable>
  );
}

// Champs partagés avec l'écran de fin d'une séance chronométrée
// (app/session/finish.tsx) : une même durée, une même difficulté, un même
// commentaire partout.

/** Minutes lues dans la saisie (chiffres seuls, espaces autour ignorés) ; null si vide, illisible ou hors bornes. */
export function parseDuration(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const minutes = Number(trimmed);
  return minutes >= MIN_DURATION && minutes <= MAX_DURATION ? minutes : null;
}

/** −5 ou +5 appliqué à la saisie, borné de 1 à 600 ; une saisie illisible repart de fallback. */
export function stepDurationText(value: string, delta: number, fallback: number): string {
  const current = parseDuration(value) ?? fallback;
  return String(Math.min(MAX_DURATION, Math.max(MIN_DURATION, current + delta)));
}

type DurationFieldProps = {
  /** Saisie en cours, en minutes : peut être vide ou hors bornes pendant la frappe. */
  text: string;
  onChangeText: (text: string) => void;
  /** −5 ou +5 : l'écran applique stepDurationText. */
  onStep: (delta: number) => void;
};

/**
 * Durée : le chiffre domine (text.number, saisissable au clavier numérique de 1 à
 * 600), −5 et +5 en boutons compacts de part et d'autre ; erreur sous le champ.
 */
export function DurationField({ text: value, onChangeText, onStep }: DurationFieldProps) {
  const invalid = parseDuration(value) === null;
  return (
    <View style={layout.section}>
      <Text style={text.overline}>Durée</Text>
      <View style={styles.durationRow}>
        <StepButton label={`−${DURATION_STEP}`} accessibilityLabel={`Diminuer de ${DURATION_STEP} minutes`} onPress={() => onStep(-DURATION_STEP)} />
        <View style={styles.durationValue}>
          <TextInput
            {...inputProps}
            style={[input.field, text.number, styles.durationInput, invalid && input.invalid]}
            value={value}
            onChangeText={onChangeText}
            // Pavé numérique natif, inputmode="numeric" sur le web.
            inputMode="numeric"
            maxLength={DURATION_MAX_LENGTH}
            selectTextOnFocus
            accessibilityLabel="Durée en minutes"
          />
          <Text style={text.meta}>min</Text>
        </View>
        <StepButton label={`+${DURATION_STEP}`} accessibilityLabel={`Augmenter de ${DURATION_STEP} minutes`} onPress={() => onStep(DURATION_STEP)} />
      </View>
      <FieldError message={invalid ? DURATION_ERROR : null} />
    </View>
  );
}

type StepButtonProps = {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
};

/** −5 / +5 : 32 px de haut, 48 de large au moins, surface2 ; zone tactile de 48 de haut par hitSlop. */
function StepButton({ label, accessibilityLabel, onPress }: StepButtonProps) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={COMPACT_HIT_SLOP}
      style={({ pressed }) => [styles.stepButton, pressed && styles.stepPressed]}
    >
      <Text style={styles.stepLabel}>{label}</Text>
    </Pressable>
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
  /** Libellé et sa précision serrés ; les puces restent à 12 px dessous. */
  labelGroup: {
    gap: spacing.xs,
  },
  /** Ligne de choix : même fond et mêmes coins qu'un champ, au moins la hauteur d'un bouton. */
  pickerRow: {
    minHeight: size.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    backgroundColor: colors.surface2,
  },
  moduleOption: {
    minHeight: size.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.button,
  },
  rowPressed: {
    backgroundColor: colors.surfacePressed,
  },
  rowLabel: {
    flex: 1,
  },
  selectedLabel: {
    color: colors.accent,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  /** Champ et unité côte à côte, l'unité collée au champ. */
  durationValue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  /** Chiffre dominant centré ; hauteur d'un bouton, sans marge intérieure (le nombre reste entier). */
  durationInput: {
    flex: 1,
    height: size.button,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlign: 'center',
  },
  stepButton: {
    minWidth: size.touch,
    height: size.compactButton,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  stepPressed: {
    backgroundColor: colors.surfacePressed,
  },
  stepLabel: {
    fontSize: fontSize.meta,
    lineHeight: lineHeight.meta,
    fontWeight: '600',
    color: colors.text,
  },
});
