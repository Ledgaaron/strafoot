import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { HeaderHeightContext, HeaderShownContext } from 'expo-router/react-navigation';
import { useContext, type ReactNode, type RefObject } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, size, spacing, text } from '../lib/theme';

type ScreenProps = {
  /** Titre d'écran (28 px) en tête du contenu ; absent sous un en-tête natif qui porte déjà le titre. */
  title?: string;
  /** Zone fixe en bas, hors défilement : l'action principale de l'écran, sous le pouce. */
  footer?: ReactNode;
  /** Confirmation flottante (SaveToast) au bas du contenu, au-dessus du pied ou de la barre d'onglets. */
  toast?: ReactNode;
  /** true par défaut : contenu dans un ScrollView. false : écran court, sans défilement. */
  scroll?: boolean;
  /** ScrollView du contenu, pour revenir en haut (nouvelle étape, nouvelle question). */
  scrollRef?: RefObject<ScrollView | null>;
  children?: ReactNode;
};

/**
 * Cadre de tout écran : fond bg, marges de 16 px, titre, contenu et pied fixe.
 * Zones sûres : l'en-tête porte déjà la barre d'état, la barre d'onglets
 * l'indicateur d'accueil ; sur le web, Screen ne double ni l'une ni l'autre.
 */
export function Screen({ title, footer, toast, scroll = true, scrollRef, children }: ScreenProps) {
  // Le clavier se mesure depuis le haut de la fenêtre, l'écran commence sous
  // l'en-tête natif : décalage de sa hauteur (0 sans en-tête).
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  // Sur le web, SafeAreaView ajoute la marge entière de la fenêtre à chaque bord
  // listé, où que soit l'écran : seuls restent les bords que rien ne couvre.
  // Natif : bords par défaut.
  const headerShown = useContext(HeaderShownContext);
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const edges = Platform.OS === 'web' ? webEdges(headerShown, inTabs) : undefined;
  const body = (
    <>
      {title !== undefined ? (
        <Text role="heading" style={text.screen}>
          {title}
        </Text>
      ) : null}
      {children}
    </>
  );
  return (
    <SafeAreaView edges={edges} style={styles.screen}>
      {/* Clavier ouvert (natif) : le pied remonte au-dessus de lui au lieu d'être recouvert. Sans effet sur le web. */}
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={styles.fill}>
        <View style={styles.fill}>
          {scroll ? (
            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              style={styles.fill}
              contentContainerStyle={styles.content}
            >
              {body}
            </ScrollView>
          ) : (
            <View style={[styles.fill, styles.content]}>{body}</View>
          )}
          {/* Par-dessus le bas du contenu ; les touches passent à travers, hors de la confirmation. */}
          {toast ? <View style={styles.toast}>{toast}</View> : null}
        </View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Bords sûrs d'un écran web : côtés toujours, haut sans en-tête, bas hors des onglets. */
function webEdges(headerShown: boolean, inTabs: boolean): Edge[] {
  const edges: Edge[] = ['left', 'right'];
  if (!headerShown) {
    edges.push('top');
  }
  if (!inTabs) {
    edges.push('bottom');
  }
  return edges;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  fill: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.md,
    pointerEvents: 'box-none',
  },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: size.border,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
});
