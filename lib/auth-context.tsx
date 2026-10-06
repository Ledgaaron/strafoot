import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

// Seul point d'accès à supabase.auth pour l'app (hors plomberie de lib/supabase.ts).

type AuthResult = { error: string | null };

type AuthContextValue = {
  session: Session | null;
  /** Vrai tant que la session persistée n'a pas été relue. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Le premier événement (INITIAL_SESSION) arrive une fois la session relue
    // depuis AsyncStorage : il met fin au chargement, connecté ou non.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async (): Promise<AuthResult> => {
    // scope local : ne déconnecte que cet appareil (le web et l'émulateur restent indépendants).
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    return { error: error?.message ?? null };
  }, []);

  const value = useMemo(
    () => ({ session, loading, signIn, signOut }),
    [session, loading, signIn, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth doit être appelé sous <AuthProvider>.');
  }
  return value;
}
