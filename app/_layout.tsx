// Dossiers par graisse : l'index du paquet embarquerait les 18 fichiers de la famille.
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActiveSessionProvider } from '../lib/active-session-context';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { watchReduceMotion } from '../lib/reduce-motion';
import { colors, navigationTheme } from '../lib/theme';

// « Réduire les animations » lu dès le lancement : la première confirmation ou
// la première flamme connaît déjà le réglage.
watchReduceMotion();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* Sombre seulement : fonds, en-têtes natifs et barre d'onglets suivent les tokens. */}
      <ThemeProvider value={navigationTheme}>
        <AuthProvider>
          {/* Séance en cours relue au lancement, partagée par les onglets, la fiche et l'écran de fin. */}
          <ActiveSessionProvider>
            <RootNavigator />
          </ActiveSessionProvider>
          <StatusBar style="light" />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { loading } = useAuth();
  // Police d'affichage des chiffres (text.number, text.hero de lib/theme.ts), chargée
  // avant le premier écran : aucun saut de police. Échec de chargement : police
  // système à sa place, l'app s'ouvre quand même.
  const [fontsLoaded, fontError] = useFonts({ BarlowCondensed_600SemiBold, BarlowCondensed_700Bold });
  const fontsSettled = fontsLoaded || fontError !== null;

  // Tant que la session n'est pas relue et la police pas chargée, aucun écran :
  // pas de flash du login ni des onglets.
  if (loading || !fontsSettled) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Les <Redirect> vivent dans app/(tabs)/_layout.tsx et app/(auth)/login.tsx :
  // Expo Router refuse toute navigation avant que ce navigateur soit monté.
  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
