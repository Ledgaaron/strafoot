import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { useAuth } from '../../lib/auth-context';

export default function TabsLayout() {
  const { session } = useAuth();

  // Le layout racine a déjà attendu la fin du chargement : ici, pas de session = pas connecté.
  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="quiz" options={{ title: 'Quizz' }} />
      <Tabs.Screen name="training" options={{ title: 'Entraînement' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
