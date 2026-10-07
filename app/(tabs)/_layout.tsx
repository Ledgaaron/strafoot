import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect } from 'expo-router';
import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { ActiveSessionBar } from '../../components/active-session-bar';
import { useAuth } from '../../lib/auth-context';
import { colors, fontSize, size } from '../../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Icône d'onglet : accent si actif, textMuted sinon (couleurs passées par la barre). */
function tabIcon(name: IconName) {
  return ({ color, size: iconSize }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color} size={iconSize} />
  );
}

export default function TabsLayout() {
  const { session } = useAuth();

  // Le layout racine a déjà attendu la fin du chargement : ici, pas de session = pas connecté.
  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      // Séance en cours : bandeau posé juste au-dessus de la barre d'onglets, le même sur les 4 onglets.
      tabBar={(props) => (
        <>
          <ActiveSessionBar />
          <BottomTabBar {...props} />
        </>
      )}
      screenOptions={{
        // Chaque onglet pose son titre (Screen, 28 px) : pas d'en-tête natif.
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: size.border,
        },
        tabBarLabelStyle: { fontSize: fontSize.meta },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="quiz" options={{ title: 'Quizz', tabBarIcon: tabIcon('help-circle') }} />
      <Tabs.Screen name="training" options={{ title: 'Entraînement', tabBarIcon: tabIcon('fitness') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: tabIcon('person') }} />
    </Tabs>
  );
}
