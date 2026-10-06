import { router } from 'expo-router';
import { useState } from 'react';

import { newSessionFormValues, SessionForm, type SessionFormResult } from '../../components/session-form';
import { localToday } from '../../lib/dates';
import { createSession } from '../../lib/db/sessions';
import { getModule } from '../../lib/modules';

export default function NewSessionScreen() {
  // Jour figé à l'ouverture : les puces de date ne bougent pas pendant la saisie.
  const [today] = useState(localToday);
  const [initialValues] = useState(() => newSessionFormValues(today));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(result: SessionFormResult) {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    // Jamais de user_id : la base le tire du JWT.
    const { data, error: createError } = await createSession({
      ...result,
      type: getModule(result.module).type,
    });
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
    router.dismissTo({ pathname: '/', params: { day: data.date, session: data.id } });
  }

  return (
    <SessionForm
      title="Nouvelle séance"
      today={today}
      initialValues={initialValues}
      submitting={submitting}
      error={error}
      onSubmit={handleSubmit}
    />
  );
}
