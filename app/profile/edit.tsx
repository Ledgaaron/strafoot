import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '../../components/action-button';
import { formatNumericDay, localToday, parseNumericDay } from '../../lib/dates';
import { getMyProfile, upsertMyProfile, type ProfileRow } from '../../lib/db/profiles';
import {
  isProfilePositionKey,
  isStrongFootKey,
  PROFILE_POSITIONS,
  STRONG_FEET,
  type ProfilePositionKey,
  type StrongFootKey,
} from '../../lib/profile-taxonomy';

const TITLE = 'Modifier le profil';
const NO_PROFILE_MESSAGE = 'Supabase n’a renvoyé ni le profil ni d’erreur.';
const MISSING_MAIN_POSITION_MESSAGE = 'Choisis ton poste principal.';
const INVALID_BIRTH_DATE_MESSAGE = 'Date de naissance invalide : attendu JJ/MM/AAAA, jour passé (ex. 12/04/1998).';
/** Niveau : texte libre court (« D2 district »). */
const CLUB_LEVEL_MAX_LENGTH = 40;
/** Longueur de « 12/04/1998 ». */
const BIRTH_DATE_MAX_LENGTH = 10;

/** État initial du formulaire ; null : aucune puce choisie. Date de naissance en JJ/MM/AAAA, '' si absente. */
type ProfileFormValues = {
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

/** Date de naissance lue dans la saisie ; day null : champ vide. */
type BirthDateInput = { valid: true; day: string | null } | { valid: false };

/** Objet neuf à chaque échec : l'effet remonte en haut même si le message n'a pas changé. */
type FormError = { message: string };

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
      <View style={styles.container}>
        <Stack.Screen options={{ title: TITLE }} />
        {state.status === 'loading' ? <ActivityIndicator /> : null}
        {state.status === 'error' ? (
          <>
            <Text style={styles.error}>Erreur : {state.message}</Text>
            <ActionButton label="Réessayer" onPress={reload} />
          </>
        ) : null}
      </View>
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
    return { mainPosition: null, secondaryPosition: null, strongFoot: null, club: '', clubLevel: '', birthDate: '' };
  }
  return {
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
function readBirthDate(text: string, today: string): BirthDateInput {
  if (text.trim() === '') {
    return { valid: true, day: null };
  }
  const day = parseNumericDay(text);
  // Jours YYYY-MM-DD : l'ordre des chaînes est l'ordre chronologique.
  return day !== null && day <= today ? { valid: true, day } : { valid: false };
}

function ProfileForm({ initialValues }: { initialValues: ProfileFormValues }) {
  const [mainPosition, setMainPosition] = useState<ProfilePositionKey | null>(initialValues.mainPosition);
  const [secondaryPosition, setSecondaryPosition] = useState<ProfilePositionKey | null>(
    initialValues.secondaryPosition,
  );
  const [strongFoot, setStrongFoot] = useState<StrongFootKey | null>(initialValues.strongFoot);
  const [club, setClub] = useState(initialValues.club);
  const [clubLevel, setClubLevel] = useState(initialValues.clubLevel);
  const [birthDate, setBirthDate] = useState(initialValues.birthDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  // Garde synchrone en plus de l'état : deux taps rapprochés peuvent voir le même rendu.
  const pendingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  // L'erreur s'affiche en haut du contenu : on y remonte à chaque nouvelle erreur.
  useEffect(() => {
    if (error !== null) {
      scrollRef.current?.scrollTo({ y: 0 });
    }
  }, [error]);

  function selectMainPosition(key: ProfilePositionKey) {
    // Choix obligatoire : retaper la puce choisie ne la désélectionne pas.
    setMainPosition(key);
    // Le secondaire devenu principal se vide : jamais deux fois le même poste.
    setSecondaryPosition((current) => (current === key ? null : current));
  }

  function toggleSecondaryPosition(key: ProfilePositionKey) {
    setSecondaryPosition((current) => (current === key ? null : key));
  }

  function toggleStrongFoot(key: StrongFootKey) {
    setStrongFoot((current) => (current === key ? null : key));
  }

  async function handleSubmit() {
    if (pendingRef.current) {
      return;
    }
    // Validation avant tout envoi : tous les problèmes d'un coup, un par ligne.
    const birth = readBirthDate(birthDate, localToday());
    const problems: string[] = [];
    if (mainPosition === null) {
      problems.push(MISSING_MAIN_POSITION_MESSAGE);
    }
    if (!birth.valid) {
      problems.push(INVALID_BIRTH_DATE_MESSAGE);
    }
    if (mainPosition === null || !birth.valid) {
      setError({ message: problems.join('\n') });
      return;
    }

    pendingRef.current = true;
    setSaving(true);
    setError(null);
    // Jamais de user_id : la base le tire du JWT.
    const { data, error: saveError } = await upsertMyProfile({
      main_position: mainPosition,
      secondary_position: secondaryPosition,
      strong_foot: strongFoot,
      club: club.trim() || null,
      club_level: clubLevel.trim() || null,
      birth_date: birth.day,
    });
    if (saveError !== null || data === null) {
      // Saisie conservée, envoi de nouveau possible.
      pendingRef.current = false;
      setSaving(false);
      setError({ message: saveError ?? NO_PROFILE_MESSAGE });
      return;
    }
    // pendingRef et saving restent vrais : l'écran se ferme, pas de second envoi possible.
    // Dépile jusqu'aux onglets ; l'onglet Profil se recharge au focus.
    router.dismissTo('/profile');
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <Stack.Screen
        options={{
          title: TITLE,
          // Dans l'en-tête : visible sans défiler, même clavier ouvert.
          headerRight: () => (
            <Pressable
              role="button"
              accessibilityLabel="Enregistrer"
              aria-disabled={saving}
              disabled={saving}
              onPress={handleSubmit}
              style={({ pressed }) => [styles.headerButton, (pressed || saving) && styles.dimmed]}
            >
              <Text style={styles.headerButtonLabel}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {error !== null ? <Text style={styles.error}>{error.message}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.label}>Poste principal</Text>
          <View style={styles.wrapRow}>
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
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Poste secondaire (facultatif)</Text>
          <View style={styles.wrapRow}>
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

        <View style={styles.section}>
          <Text style={styles.label}>Pied fort (facultatif)</Text>
          <View style={styles.wrapRow}>
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

        <View style={styles.section}>
          <Text style={styles.label}>Club</Text>
          <TextInput
            style={styles.input}
            value={club}
            onChangeText={setClub}
            placeholder="Club (facultatif)"
            accessibilityLabel="Club"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Niveau</Text>
          <TextInput
            style={styles.input}
            value={clubLevel}
            onChangeText={setClubLevel}
            maxLength={CLUB_LEVEL_MAX_LENGTH}
            placeholder="ex. D2 district"
            accessibilityLabel="Niveau"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Date de naissance</Text>
          {/* Clavier par défaut : le pavé numérique n'a pas de « / ». */}
          <TextInput
            style={styles.input}
            value={birthDate}
            onChangeText={setBirthDate}
            maxLength={BIRTH_DATE_MAX_LENGTH}
            placeholder="JJ/MM/AAAA"
            accessibilityLabel="Date de naissance"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
};

/** Puce de choix : fond sombre si sélectionnée, bordure seule sinon ; grisée et inerte si désactivée. */
function Chip({ label, selected, onPress, accessibilityLabel, disabled = false }: ChipProps) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel}
      aria-disabled={disabled}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.box, selected && styles.boxSelected, (pressed || disabled) && styles.dimmed]}
    >
      <Text style={[styles.boxLabel, selected && styles.boxLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  error: {
    fontSize: 16,
    lineHeight: 24,
    color: '#b00020',
  },
  section: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
