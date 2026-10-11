import { Redirect } from 'expo-router';

import { AppStack } from '../../components/app-stack';
import { useAuth } from '../../lib/auth-context';

export default function MeasureLayout() {
  const { session } = useAuth();

  // Écran d'une mesure hors des onglets, donc hors de la garde de app/(tabs)/_layout.tsx.
  // Le layout racine a déjà attendu la fin du chargement : pas de session = pas connecté.
  if (!session) {
    return <Redirect href="/login" />;
  }

  // En-tête natif par défaut (le layout racine masque le sien) : titre posé par
  // l'écran de mesure, flèche retour fournie par la pile parente, vers l'onglet Profil.
  // Pile animée (micro-interaction g) : glisse depuis la droite, fermeture symétrique.
  return <AppStack />;
}
