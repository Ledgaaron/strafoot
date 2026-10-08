import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext, type ReactNode, type RefObject } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
 * Les marges sûres ne comptent que là où l'écran touche le bord de la fenêtre :
 * elles valent 0 sous un en-tête natif et au-dessus de la barre d'onglets.
 */
export function Screen({ title, footer, toast, scroll = true, scrollRef, children }: ScreenProps) {
  // Le clavier se mesure depuis le haut de la fenêtre, l'écran commence sous
  // l'en-tête natif : décalage de sa hauteur (0 sans en-tête).
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
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
    <SafeAreaView style={styles.screen}>
      {/* Clavier ouvert : le pied remonte au-dessus de lui au lieu d'être recouvert. */}
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
