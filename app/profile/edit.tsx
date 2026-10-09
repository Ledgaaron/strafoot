import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { Button } from '../../components/button';
import { Chip } from '../../components/chip';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { formatNumericDay, localToday, parseNumericDay } from '../../lib/dates';
import { getMyProfile, upsertMyProfile, type ProfileRow } from '../../lib/db/profiles';
import { hapticMedium } from '../../lib/haptics';
import {
  isProfilePositionKey,
  isStrongFootKey,
  PROFILE_POSITIONS,
  STRONG_FEET,
  type ProfilePositionKey,
  type StrongFootKey,
} from '../../lib/profile-taxonomy';
import { colors, input, inputProps, layout, text } from '../../lib/theme';

const TITLE = 'Modifier le profil';
const NO_PROFILE_MESSAGE = 'Supabase n’a renvoyé ni le profil ni d’erreur.';
const MISSING_MAIN_POSITION_MESSAGE = 'Choisis ton poste principal.';
const INVALID_BIRTH_DATE_MESSAGE = 'Date de naissance invalide : attendu JJ/MM/AAAA, jour passé (ex. 12/04/1998).';
/** Nom affiché : texte libre court (« Karim Mansouri »), d'où les initiales de l'avatar du Profil. */
const DISPLAY_NAME_MAX_LENGTH = 40;
/** Niveau : texte libre court (« D2 district »). */
const CLUB_LEVEL_MAX_LENGTH = 40;
/** Longueur de « 12/04/1998 » : date de naissance. */
const NUMERIC_DAY_MAX_LENGTH = 10;

/**
 * État initial du formulaire ; null : aucune puce choisie. Date de naissance en
 * JJ/MM/AAAA, '' si absente.
 */
type ProfileFormValues = {
  displayName: string;
  mainPosition: ProfilePositionKey | null;
  secondaryPosition: ProfilePositionKey | null;
  strongFoot: StrongFootKey | null;
  club: string;
  clubLevel: string;
  birthDate: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; initialValues: ProfileFormValues };

/** Jour lu dans une saisie JJ/MM/AAAA ; day null : champ vide. */
type DayInput = { valid: true; day: string | null } | { valid: false };

export default function EditProfileScreen() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  // Incrémenté par « Réessayer » : relance le chargement.
  const [loadCount, setLoadCount] = useState(0);

  // Au montage, pas au focus : le formulaire part du profil lu à l'ouverture.
  useEffect(() => {
    let active = true;
    loadInitialValues()
      .then((next) => {
        if (active) {
          setState(next);
        }
      })
      .catch((exception: unknown) => {
        // Exception inattendue (ex. date de naissance refusée par formatNumericDay) : affichée, jamais avalée.
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
  }, [loadCount]);

  function reload() {
    setState({ status: 'loading' });
    setLoadCount((count) => count + 1);
  }

  if (state.status !== 'ready') {
    return (
      <>
        <Stack.Screen options={{ title: TITLE }} />
        <Screen>
          {state.status === 'loading' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
          {state.status === 'error' ? (
            <View style={layout.section}>
              <FieldError message={`Erreur : ${state.message}`} />
              <Button variant="secondary" label="Réessayer" onPress={reload} />
            </View>
          ) : null}
        </Screen>
      </>
    );
  }

  return <ProfileForm initialValues={state.initialValues} />;
}

/** Profil de l'utilisateur, traduit en valeurs du formulaire. formatNumericDay peut lever : l'appelant l'affiche. */
async function loadInitialValues(): Promise<LoadState> {
  const { data, error } = await getMyProfile();
  if (error !== null) {
    return { status: 'error', message: error };
  }
  return { status: 'ready', initialValues: profileFormValuesFromRow(data) };
}

/** Pas encore de profil : tous les champs vides. Une valeur hors liste ne présélectionne aucune puce. */
function profileFormValuesFromRow(row: ProfileRow | null): ProfileFormValues {
  if (row === null) {
    return {
      displayName: '',
      mainPosition: null,
      secondaryPosition: null,
      strongFoot: null,
      club: '',
      clubLevel: '',
      birthDate: '',
    };
  }
  return {
    displayName: row.display_name ?? '',
    mainPosition: keyOrNull(row.main_position, isProfilePositionKey),
    secondaryPosition: keyOrNull(row.secondary_position, isProfilePositionKey),
    strongFoot: keyOrNull(row.strong_foot, isStrongFootKey),
    club: row.club ?? '',
    clubLevel: row.club_level ?? '',
    birthDate: row.birth_date !== null ? formatNumericDay(row.birth_date) : '',
  };
}

function keyOrNull<K extends string>(value: string | null, isKey: (value: string) => value is K): K | null {
  return value !== null && isKey(value) ? value : null;
}

/** Champ vide (espaces compris) : day null. Invalide : illisible, absent du calendrier ou postérieur à today. */
function readBirthDate(text: string, today: string): DayInput {
  if (text.trim() === '') {
    return { valid: true, day: null };
  }
  const day = parseNumericDay(text);
  // Jours YYYY-MM-DD : l'ordre des chaînes est l'ordre chronologique.
  return day !== null && day <= today ? { valid: true, day } : { valid: false };
}

type ProfileFormProps = {
  initialValues: ProfileFormValues;
};

function ProfileForm({ initialValues }: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(initialValues.displayName);
  const [mainPosition, setMainPosition] = useState<ProfilePositionKey | null>(initialValues.mainPosition);
  const [secondaryPosition, setSecondaryPosition] = useState<ProfilePositionKey | null>(
    initialValues.secondaryPosition,
  );
  const [strongFoot, setStrongFoot] = useState<StrongFootKey | null>(initialValues.strongFoot);
  const [club, setClub] = useState(initialValues.club);
  const [clubLevel, setClubLevel] = useState(initialValues.clubLevel);
  const [birthDate, setBirthDate] = useState(initialValues.birthDate);
  const [saving, setSaving] = useState(false);
  // Erreurs de validation, chacune sous son champ, effacées dès que le champ change.
  const [mainPositionError, setMainPositionError] = useState<string | null>(null);
  const [birthDateError, setBirthDateError] = useState<string | null>(null);
  // Refus de Supabase, au-dessus d'Enregistrer.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Garde synchrone en plus de l'état : deux taps rapprochés peuvent voir le même rendu.
  const pendingRef = useRef(false);

  // Un champ en erreur peut être hors de l'écran : le pied, toujours visible, les résume.
  const invalidFields: string[] = [];
  if (mainPositionError !== null) {
    invalidFields.push('poste principal');
  }
  if (birthDateError !== null) {
    invalidFields.push('date de naissance');
  }
  const footerError = invalidFields.length > 0 ? `À corriger : ${invalidFields.join(', ')}.` : saveError;

  function selectMainPosition(key: ProfilePositionKey) {
    // Choix obligatoire : retaper la puce choisie ne la désélectionne pas.
    setMainPosition(key);
    setMainPositionError(null);
    // Le secondaire devenu principal se vide : jamais deux fois le même poste.
    setSecondaryPosition((current) => (current === key ? null : current));
  }

  function toggleSecondaryPosition(key: ProfilePositionKey) {
    setSecondaryPosition((current) => (current === key ? null : key));
  }

  function toggleStrongFoot(key: StrongFootKey) {
    setStrongFoot((current) => (current === key ? null : key));
  }

  function changeBirthDate(value: string) {
    setBirthDate(value);
    setBirthDateError(null);
  }

  async function handleSubmit() {
    if (pendingRef.current) {
      return;
    }
    // Validation avant tout envoi : tous les problèmes d'un coup, chacun sous son champ.
    const today = localToday();
    const birth = readBirthDate(birthDate, today);
    setMainPositionError(mainPosition === null ? MISSING_MAIN_POSITION_MESSAGE : null);
    setBirthDateError(birth.valid ? null : INVALID_BIRTH_DATE_MESSAGE);
    // Le refus précédent de Supabase ne vaut plus : nouvel essai ou champs à corriger.
    setSaveError(null);
    if (mainPosition === null || !birth.valid) {
      return;
    }

    pendingRef.current = true;
    setSaving(true);
    // Jamais de user_id : la base le tire du JWT. Ni goal ni goal_deadline : une
    // clé absente n'est pas modifiée, l'objectif déjà en base est donc conservé
    // (objectifs : chantier 14).
    const { data, error } = await upsertMyProfile({
      display_name: displayName.trim() || null,
      main_position: mainPosition,
      secondary_position: secondaryPosition,
      strong_foot: strongFoot,
      club: club.trim() || null,
      club_level: clubLevel.trim() || null,
      birth_date: birth.day,
    });
    if (error !== null || data === null) {
      // Saisie conservée, envoi de nouveau possible.
      pendingRef.current = false;
      setSaving(false);
      setSaveError(error ?? NO_PROFILE_MESSAGE);
      return;
    }
    // pendingRef et saving restent vrais : l'écran se ferme, pas de second envoi possible.
    hapticMedium();
    // Dépile jusqu'aux onglets ; l'onglet Profil se recharge au focus et confirme
    // l'enregistrement (saved, nonce : un nouvel enregistrement rejoue la confirmation).
    router.dismissTo({ pathname: '/profile', params: { saved: String(Date.now()) } });
  }

  return (
    <>
      <Stack.Screen options={{ title: TITLE }} />
      <Screen
        footer={
          <>
            <FieldError message={footerError} />
            <Button label="Enregistrer" onPress={handleSubmit} loading={saving} />
          </>
        }
      >
        <View style={layout.section}>
          <View>
            <Text style={text.overline}>Nom affiché</Text>
            <Text style={text.meta}>Facultatif · initiales de l’avatar du Profil.</Text>
          </View>
          <TextInput
            {...inputProps}
            style={input.field}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            placeholder="ex. Karim Mansouri"
            accessibilityLabel="Nom affiché"
            autoCapitalize="words"
            autoComplete="name"
            // Un nom propre : le correcteur proposerait de le « corriger ».
            autoCorrect={false}
          />
        </View>

        <View style={layout.section}>
          <Text style={text.overline}>Poste principal</Text>
          <View style={layout.chipRow}>
            {PROFILE_POSITIONS.map((entry) => (
              <Chip
                key={entry.key}
                label={entry.label}
                accessibilityLabel={`Poste principal : ${entry.label}`}
                selected={entry.key === mainPosition}
                onPress={() => selectMainPosition(entry.key)}
              />
            ))}
          </View>
          <FieldError message={mainPositionError} />
        </View>

        <View style={layout.section}>
          <View>
            <Text style={text.overline}>Poste secondaire</Text>
            <Text style={text.meta}>Facultatif.</Text>
          </View>
          <View style={layout.chipRow}>
            {PROFILE_POSITIONS.map((entry) => (
              <Chip
                key={entry.key}
                label={entry.label}
                accessibilityLabel={`Poste secondaire : ${entry.label}`}
                selected={entry.key === secondaryPosition}
                // Le poste principal ne peut pas être aussi secondaire.
                disabled={entry.key === mainPosition}
                onPress={() => toggleSecondaryPosition(entry.key)}
              />
            ))}
          </View>
        </View>

        <View style={layout.section}>
          <View>
            <Text style={text.overline}>Pied fort</Text>
            <Text style={text.meta}>Facultatif.</Text>
          </View>
          <View style={layout.chipRow}>
            {STRONG_FEET.map((entry) => (
              <Chip
                key={entry.key}
                label={entry.label}
                selected={entry.key === strongFoot}
                onPress={() => toggleStrongFoot(entry.key)}
              />
            ))}
          </View>
        </View>

        <View style={layout.section}>
          <Text style={text.overline}>Club</Text>
          <TextInput
            {...inputProps}
            style={input.field}
            value={club}
            onChangeText={setClub}
            placeholder="Club (facultatif)"
            accessibilityLabel="Club"
          />
        </View>

        <View style={layout.section}>
          <Text style={text.overline}>Niveau</Text>
          <TextInput
            {...inputProps}
            style={input.field}
            value={clubLevel}
            onChangeText={setClubLevel}
            maxLength={CLUB_LEVEL_MAX_LENGTH}
            placeholder="ex. D2 district"
            accessibilityLabel="Niveau"
          />
        </View>

        <View style={layout.section}>
          <Text style={text.overline}>Date de naissance</Text>
          {/* Clavier par défaut : le pavé numérique n'a pas de « / ». */}
          <TextInput
            {...inputProps}
            style={[input.field, birthDateError !== null && input.invalid]}
            value={birthDate}
            onChangeText={changeBirthDate}
            maxLength={NUMERIC_DAY_MAX_LENGTH}
            placeholder="JJ/MM/AAAA"
            accessibilityLabel="Date de naissance"
          />
          <FieldError message={birthDateError} />
        </View>
      </Screen>
    </>
  );
}
