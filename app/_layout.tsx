import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../lib/auth-context';
import { colors, navigationTheme } from '../lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* Sombre seulement : fonds, en-têtes natifs et barre d'onglets suivent les tokens. */}
      <ThemeProvider value={navigationTheme}>
        <AuthProvider>
          <RootNavigator />
          <StatusBar style="light" />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { loading } = useAuth();

  // Tant que la session n'est pas relue, aucun écran : pas de flash du login ni des onglets.
  if (loading) {
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
