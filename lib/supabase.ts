import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from './types';

// Accès littéral obligatoire : Expo n'injecte que process.env.EXPO_PUBLIC_* écrit tel quel.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    supabaseUrl ? null : 'EXPO_PUBLIC_SUPABASE_URL',
    supabaseAnonKey ? null : 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ].filter((name): name is string => name !== null);
  throw new Error(
    `Configuration Supabase manquante : ${missing.join(', ')}. ` +
      'Renseigne ces variables dans .env (modèle : .env.example) puis relance `npx expo start --clear`.',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Natif uniquement : le jeton n'est rafraîchi qu'au premier plan.
// Sur web, supabase-js suit lui-même la visibilité de l'onglet.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
