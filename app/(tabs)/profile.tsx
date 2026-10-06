import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../../components/action-button';
import { useAuth } from '../../lib/auth-context';
import { getMyProfile, type ProfileRow } from '../../lib/db/profiles';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: ProfileRow | null };

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMyProfile().then(({ data, error }) => {
      if (!active) {
        return;
      }
      setState(error ? { status: 'error', message: error } : { status: 'ready', profile: data });
    });
    return () => {
      active = false;
    };
  }, []);

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

  return (
    <View style={styles.container}>
      <Text>Connecté : {session?.user.email ?? '—'}</Text>

      {state.status === 'loading' ? <ActivityIndicator /> : null}
      {state.status === 'error' ? <Text style={styles.error}>Erreur : {state.message}</Text> : null}
      {state.status === 'ready' && state.profile === null ? <Text>Aucun profil enregistré.</Text> : null}
      {state.status === 'ready' && state.profile !== null ? (
        <Text>Poste principal : {state.profile.main_position ?? 'non renseigné'}</Text>
      ) : null}

      <ActionButton label="Déconnexion" onPress={handleSignOut} disabled={signingOut} />
      {signOutError ? <Text style={styles.error}>{signOutError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  error: {
    color: '#b00020',
  },
});
