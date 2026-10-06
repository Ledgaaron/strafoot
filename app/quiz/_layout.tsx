import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../lib/auth-context';

export default function QuizLayout() {
  const { session } = useAuth();

  // Écran de série hors des onglets, donc hors de la garde de app/(tabs)/_layout.tsx.
  // Le layout racine a déjà attendu la fin du chargement : pas de session = pas connecté.
  if (!session) {
    return <Redirect href="/login" />;
  }

  // /quiz reste l'onglet app/(tabs)/quiz.tsx : cette pile ne porte que /quiz/run.
  // En-tête natif par défaut (le layout racine masque le sien) : titre posé par
  // l'écran de série, flèche retour fournie par la pile parente.
  return <Stack />;
}
