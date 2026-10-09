import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect } from 'expo-router';
import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { ActiveSessionBar } from '../../components/active-session-bar';
import { useAuth } from '../../lib/auth-context';
import { colors, fontSize, lineHeight, size } from '../../lib/theme';

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
      // Hauteur de la barre : son contenu plus l'indicateur d'accueil, compté une seule fois
      // (BottomTabBar pose ce même insets.bottom en marge basse).
      tabBar={(props) => (
        <>
          <ActiveSessionBar />
          <BottomTabBar {...props} style={{ height: size.tabBar + props.insets.bottom }} />
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
        // Interligne explicite : la hauteur de la barre (size.tabBar) en dépend.
        tabBarLabelStyle: { fontSize: fontSize.meta, lineHeight: lineHeight.meta },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="quiz" options={{ title: 'Quizz', tabBarIcon: tabIcon('help-circle') }} />
      {/* Libellé d'onglet seul : l'écran garde son titre « Entraînement » pour l'instant. */}
      <Tabs.Screen
        name="training"
        options={{ title: 'Entraînement', tabBarLabel: 'Tests', tabBarIcon: tabIcon('fitness') }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: tabIcon('person') }} />
    </Tabs>
  );
}
