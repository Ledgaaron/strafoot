import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../lib/auth-context';

export default function ProfileLayout() {
  const { session } = useAuth();

  // Écran d'édition du profil hors des onglets, donc hors de la garde de app/(tabs)/_layout.tsx.
  // Le layout racine a déjà attendu la fin du chargement : pas de session = pas connecté.
  if (!session) {
    return <Redirect href="/login" />;
  }

  // /profile reste l'onglet app/(tabs)/profile.tsx : cette pile ne porte que /profile/edit.
  // En-tête natif par défaut (le layout racine masque le sien) : titre et bouton
  // Enregistrer posés par l'écran d'édition, flèche retour fournie par la pile parente.
  return <Stack />;
}
