import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../lib/auth-context';

export default function DevLayout() {
  const { session } = useAuth();

  // Écrans de vérification, ouverts seulement par l'URL (/dev/diagrams), hors des
  // onglets donc hors de la garde de app/(tabs)/_layout.tsx. Le layout racine a
  // déjà attendu la fin du chargement : pas de session = pas connecté.
  if (!session) {
    return <Redirect href="/login" />;
  }

  // En-tête natif par défaut (le layout racine masque le sien) : titre posé par l'écran.
  return <Stack />;
}
