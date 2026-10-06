import { Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '../../components/action-button';
import { useAuth } from '../../lib/auth-context';

export default function LoginScreen() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) {
    return <Redirect href="/" />;
  }

  async function handleSubmit() {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    // En cas de succès, la nouvelle session déclenche le <Redirect> ci-dessus.
    const result = await signIn(email.trim(), password);
    setError(result.error);
    setSubmitting(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Strafoot</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        inputMode="email"
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        onSubmitEditing={handleSubmit}
      />
      <ActionButton label="Connexion" onPress={handleSubmit} disabled={submitting} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 32,
    marginBottom: 8,
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 16,
  },
  error: {
    color: '#b00020',
  },
});
