import { BlurView } from 'expo-blur';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceMotion } from '../lib/reduce-motion';
import { colors, motion, radius, spacing, text } from '../lib/theme';
import { IconButton } from './icon-button';

/** Flou du voile, sur 100 : 8 px sur le web (expo-blur : intensité × 0,2), flou natif sur iOS. */
const BLUR_INTENSITY = 40;
/** Part de la hauteur de la fenêtre que la feuille ne dépasse pas ; au-delà, son contenu défile. */
const MAX_HEIGHT_RATIO = 0.9;

type BottomSheetProps = {
  visible: boolean;
  /**
   * Fermeture demandée (tap sur le voile, bouton Fermer, retour Android, Échap
   * sur le web) : le parent passe visible à false, la feuille redescend puis se démonte.
   */
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/**
 * Feuille du bas : Modal transparente, voile flouté (expo-blur, seul import de
 * l'app ; sur Android sans cible de flou, simple voile) et assombri (scrim), feuille
 * sur surface aux coins xl qui glisse depuis le bas en motion.screen avec la courbe
 * de la DA, le voile apparaissant en même temps ; « Réduire les animations » : posée
 * d'emblée. Porte le calendrier du mois (MonthSheet) et le choix du module.
 */
export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Montée tant qu'elle est visible ou qu'elle redescend.
  const [mounted, setMounted] = useState(visible);
  // Hauteur mesurée au montage, hors écran : point de départ du glissement.
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  // 0 : feuille sous le bord bas et voile transparent ; 1 : en place.
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (sheetHeight === null) {
        // Pas encore mesurée : elle attend hors écran, le glissement part de sa hauteur.
        return;
      }
      if (reduceMotion) {
        progress.setValue(1);
        return;
      }
      const slide = Animated.timing(progress, {
        toValue: 1,
        duration: motion.screen,
        easing: motion.easing,
        useNativeDriver: motion.useNativeDriver,
      });
      slide.start();
      return () => {
        slide.stop();
      };
    }
    if (!mounted) {
      return;
    }
    if (reduceMotion) {
      progress.setValue(0);
      setMounted(false);
      setSheetHeight(null);
      return;
    }
    const slide = Animated.timing(progress, {
      toValue: 0,
      duration: motion.screen,
      easing: motion.easing,
      useNativeDriver: motion.useNativeDriver,
    });
    slide.start(({ finished }) => {
      if (finished) {
        setMounted(false);
        // Remesurée à la prochaine ouverture : son contenu peut avoir changé.
        setSheetHeight(null);
      }
    });
    // Rouverte pendant la descente : l'arrêt laisse la montée repartir d'où elle en est.
    return () => {
      slide.stop();
    };
  }, [visible, mounted, sheetHeight, reduceMotion, progress]);

  if (!mounted) {
    return null;
  }

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    // Avant la mesure, toute la fenêtre : la feuille reste hors écran.
    outputRange: [sheetHeight ?? windowHeight, 0],
  });

  function measure(event: LayoutChangeEvent) {
    setSheetHeight(event.nativeEvent.layout.height);
  }

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <BlurView tint="dark" intensity={BLUR_INTENSITY} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        </Animated.View>
        {/* Le voile ferme au tap ; le bouton Fermer de l'en-tête porte l'action pour le lecteur d'écran. */}
        <Pressable aria-hidden importantForAccessibility="no" onPress={onClose} style={StyleSheet.absoluteFill} />
        <Animated.View
          role="dialog"
          aria-modal
          accessibilityViewIsModal
          onLayout={measure}
          style={[
            styles.sheet,
            { maxHeight: windowHeight * MAX_HEIGHT_RATIO, paddingBottom: insets.bottom + spacing.lg },
            { transform: [{ translateY }] },
          ]}
        >
          <View style={styles.header}>
            <Text role="heading" style={[text.title, styles.title]}>
              {title}
            </Text>
            <IconButton icon="close" subtle accessibilityLabel="Fermer" onPress={onClose} />
          </View>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    pointerEvents: 'none',
  },
  scrim: {
    backgroundColor: colors.scrim,
  },
  sheet: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  content: {
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
});
