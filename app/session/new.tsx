import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import {
  newSessionFormValues,
  parseDuration,
  SessionForm,
  type SessionFormResult,
  type SessionFormValues,
} from '../../components/session-form';
import { localToday } from '../../lib/dates';
import { createSession, type SessionInput } from '../../lib/db/sessions';
import { hapticMedium } from '../../lib/haptics';
import { buildSessionName, getModule, isModuleKey, TEST_MODULE_KEY } from '../../lib/modules';

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

export default function NewSessionScreen() {
  const params = useLocalSearchParams<NewSessionParams>();
  // typeof : à l'exécution, un paramètre répété arrive sous forme de tableau.
  const sheetId = typeof params.sheetId === 'string' && params.sheetId !== '' ? params.sheetId : null;
  // Jour figé à l'ouverture : les puces de date ne bougent pas pendant la saisie.
  const [today] = useState(localToday);
  // Pré-remplissage lu une seule fois, à l'ouverture ; tout reste modifiable.
  const [initialValues] = useState(() => prefilledValues(today, params));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <SessionForm
      title={sheetId !== null ? 'Séance déjà faite' : 'Nouvelle séance'}
      today={today}
      initialValues={initialValues}
      submitting={submitting}
      error={error}
      onSubmit={handleSubmit}
    />
  );
}

/**
 * Valeurs de départ d'une séance libre, remplacées par celles de la fiche
 * d'origine quand elles sont lisibles ; date du jour dans tous les cas.
 */
function prefilledValues(today: string, params: NewSessionParams): SessionFormValues {
  const defaults = newSessionFormValues(today);
  // `test` écarté : réservé à l'enregistrement d'un test, absent du formulaire.
  const moduleKey =
    typeof params.module === 'string' && isModuleKey(params.module) && params.module !== TEST_MODULE_KEY
      ? params.module
      : defaults.module;
  const name = typeof params.name === 'string' ? params.name.trim() : '';
  // Durée hors bornes (1 à 600) ou illisible : celle du module.
  const durationMin = typeof params.durationMin === 'string' ? parseDuration(params.durationMin) : null;
  return {
    ...defaults,
    module: moduleKey,
    name: name !== '' ? name : buildSessionName(moduleKey, today),
    durationMin: durationMin ?? getModule(moduleKey).defaultDurationMin,
  };
}
