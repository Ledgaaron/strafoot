import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { Screen } from '../../components/screen';
import {
  automaticDuration,
  newSessionFormValues,
  parseDuration,
  SessionForm,
  type SessionFormResult,
  type SessionFormValues,
} from '../../components/session-form';
import { localToday } from '../../lib/dates';
import { createSession, getSessionDefaults, type SessionDefaults, type SessionInput } from '../../lib/db/sessions';
import { hapticMedium } from '../../lib/haptics';
import { buildSessionName, getModule, isModuleKey, TEST_MODULE_KEY } from '../../lib/modules';
import { colors } from '../../lib/theme';

/**
 * Posés par « Séance déjà faite » sur la présentation d'une fiche
 * (app/sheet/[id].tsx) ; tous facultatifs, absents pour une séance libre.
 */
type NewSessionParams = {
  /** Fiche d'origine : la séance lui est liée et l'écran revient sur l'onglet Entraînement. */
  sheetId?: string;
  module?: string;
  name?: string;
  /** Durée prévue de la fiche, en minutes (entier en chaîne). */
  durationMin?: string;
};

/** Derniers réglages (dernier module, dernières durées), lus une fois à l'ouverture. */
type DefaultsState =
  | { status: 'loading' }
  | { status: 'ready'; defaults: SessionDefaults }
  // Lecture en échec : le formulaire s'ouvre quand même, avec les valeurs par défaut, et le dit.
  | { status: 'error'; message: string };

const NO_DEFAULTS_MESSAGE = 'Supabase n’a renvoyé ni les derniers réglages ni d’erreur.';

export default function NewSessionScreen() {
  const params = useLocalSearchParams<NewSessionParams>();
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  const sheetId = typeof params.sheetId === 'string' && params.sheetId !== '' ? params.sheetId : null;
  // Jour figé à l'ouverture : la date proposée ne bouge pas pendant la saisie.
  const [today] = useState(localToday);
  const [defaultsState, setDefaultsState] = useState<DefaultsState>({ status: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = sheetId !== null ? 'Séance déjà faite' : 'Nouvelle séance';

  useEffect(() => {
    let active = true;
    getSessionDefaults().then(({ data, error: loadError }) => {
      if (!active) {
        return;
      }
      if (loadError !== null || data === null) {
        setDefaultsState({ status: 'error', message: loadError ?? NO_DEFAULTS_MESSAGE });
      } else {
        setDefaultsState({ status: 'ready', defaults: data });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(result: SessionFormResult) {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    // Jamais de user_id : la base le tire du JWT. sheet_id seulement pour une fiche.
    const input: SessionInput = { ...result, type: getModule(result.module).type };
    if (sheetId !== null) {
      input.sheet_id = sheetId;
    }
    const { data, error: createError } = await createSession(input);
    if (createError) {
      setError(createError);
      setSubmitting(false);
      return;
    }
    if (!data) {
      setError(
        'Supabase n’a renvoyé ni la séance ni d’erreur : vérifier l’Accueil avant de réessayer.',
      );
      setSubmitting(false);
      return;
    }
    // submitting reste vrai : l'écran se ferme, pas de second envoi possible.
    hapticMedium();
    const savedTitle = data.name ?? result.name;
    if (sheetId !== null) {
      // Séance d'une fiche : retour à l'onglet Entraînement, qui confirme l'enregistrement.
      router.dismissTo({ pathname: '/training', params: { savedSession: data.id, savedTitle } });
    } else {
      router.dismissTo({ pathname: '/', params: { day: data.date, session: data.id, savedTitle } });
    }
  }

  if (defaultsState.status === 'loading') {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen>
          <ActivityIndicator size="large" color={colors.accent} />
        </Screen>
      </>
    );
  }

  const defaults = defaultsState.status === 'ready' ? defaultsState.defaults : null;

  return (
    <SessionForm
      title={title}
      today={today}
      // Le formulaire lit ses valeurs de départ une seule fois : il n'est monté qu'une fois les réglages lus.
      initialValues={prefilledValues(today, params, defaults)}
      durationDefaults={defaults?.lastDurationByModule}
      warning={
        defaultsState.status === 'error'
          ? `Derniers réglages non lus, valeurs par défaut proposées : ${defaultsState.message}`
          : null
      }
      submitting={submitting}
      error={error}
      onSubmit={handleSubmit}
    />
  );
}

/**
 * Valeurs de départ d'une séance libre (dernier module et sa durée), remplacées
 * par celles de la fiche d'origine quand elles sont lisibles ; date du jour dans
 * tous les cas.
 */
function prefilledValues(today: string, params: NewSessionParams, defaults: SessionDefaults | null): SessionFormValues {
  const base = newSessionFormValues(today, defaults);
  // `test` écarté : réservé à l'enregistrement d'un test, absent du formulaire.
  const moduleKey =
    typeof params.module === 'string' && isModuleKey(params.module) && params.module !== TEST_MODULE_KEY
      ? params.module
      : base.module;
  const name = typeof params.name === 'string' ? params.name.trim() : '';
  // Durée hors bornes (1 à 600) ou illisible : la durée automatique du module.
  const durationMin = typeof params.durationMin === 'string' ? parseDuration(params.durationMin) : null;
  return {
    ...base,
    module: moduleKey,
    name: name !== '' ? name : buildSessionName(moduleKey, today),
    durationMin: durationMin ?? automaticDuration(moduleKey, defaults?.lastDurationByModule),
  };
}
