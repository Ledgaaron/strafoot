import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Button } from '../../components/button';
import { FieldError } from '../../components/field-error';
import { Screen } from '../../components/screen';
import { useAuth } from '../../lib/auth-context';
import { input, inputProps, layout, text } from '../../lib/theme';

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
    <Screen title="Strafoot" footer={<Button label="Connexion" onPress={handleSubmit} loading={submitting} />}>
      {/* Libellé au-dessus du champ, repris en accessibilityLabel : il remplace le placeholder. */}
      <View style={layout.section}>
        <Text style={text.overline}>Email</Text>
        <TextInput
          {...inputProps}
          style={input.field}
          accessibilityLabel="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          inputMode="email"
        />
      </View>
      <View style={layout.section}>
        <Text style={text.overline}>Mot de passe</Text>
        <TextInput
          {...inputProps}
          style={input.field}
          accessibilityLabel="Mot de passe"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          onSubmitEditing={handleSubmit}
        />
        {/* Message brut de Supabase Auth, en anglais (« Invalid login credentials ») : préfixe français. */}
        <FieldError message={error ? `Connexion impossible : ${error}` : null} />
      </View>
    </Screen>
  );
}
