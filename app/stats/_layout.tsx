import { Redirect } from 'expo-router';

import { AppStack } from '../../components/app-stack';
import { useAuth } from '../../lib/auth-context';

export default function StatsLayout() {
  const { session } = useAuth();

  // Statistiques du Profil hors des onglets, donc hors de la garde de app/(tabs)/_layout.tsx.
  // Le layout racine a déjà attendu la fin du chargement : pas de session = pas connecté.
  if (!session) {
    return <Redirect href="/login" />;
  }

  // /stats/volume (écran statique, prioritaire) et /stats/[skill] (tir, passe…).
  // En-tête natif par défaut (le layout racine masque le sien) : titre posé par
  // l'écran, flèche retour fournie par la pile parente, vers l'onglet Profil.
  // Pile animée (micro-interaction g) : glisse depuis la droite, fermeture symétrique.
  return <AppStack />;
}
