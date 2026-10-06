import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../lib/auth-context';

export default function SessionLayout() {
  const { session } = useAuth();

  // Écrans hors des onglets, donc hors de la garde de app/(tabs)/_layout.tsx.
  // Le layout racine a déjà attendu la fin du chargement : pas de session = pas connecté.
  if (!session) {
    return <Redirect href="/login" />;
  }

  // En-tête natif par défaut (le layout racine masque le sien) : titre et flèche
  // retour fournie par la pile parente ; Enregistrer est dans le pied du formulaire.
  return <Stack />;
}
