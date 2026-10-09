import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../lib/auth-context';

export default function TrainingLayout() {
  const { session } = useAuth();

  // Liste d'un thème hors des onglets, donc hors de la garde de app/(tabs)/_layout.tsx.
  // Le layout racine a déjà attendu la fin du chargement : pas de session = pas connecté.
  if (!session) {
    return <Redirect href="/login" />;
  }

  // /training reste l'onglet app/(tabs)/training.tsx : cette pile ne porte que
  // /training/[theme] (/training/specifique, /training/recuperation : la liste des
  // fiches, ouverte par la carte Fiches du Profil). En-tête natif par défaut (le
  // layout racine masque le sien) : titre posé par l'écran, flèche retour fournie
  // par la pile parente, vers l'onglet d'où la liste a été ouverte.
  return <Stack />;
}
