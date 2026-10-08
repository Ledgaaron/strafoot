import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { colors, motion, radius, size, spacing, text } from '../lib/theme';

type SaveToastProps = {
  /** « Séance enregistrée : Tir. » */
  message: string;
};

/**
 * Confirmation d'un enregistrement (micro-interaction c) : glisse de 24 px
 * depuis le bas en 200 ms, puis disparaît après 2 s, sans animation de sortie.
 * Se pose dans la prop toast de Screen, avec pour key l'id de ce qui vient
 * d'être enregistré : une nouvelle key rejoue la confirmation, un simple
 * rendu de l'écran ne la rejoue pas.
 */
export function SaveToast({ message }: SaveToastProps) {
  const [visible, setVisible] = useState(true);
  const [offset] = useState(() => new Animated.Value(motion.toastOffset));

  useEffect(() => {
    const slide = Animated.timing(offset, {
      toValue: 0,
      duration: motion.toastInMs,
      useNativeDriver: motion.useNativeDriver,
    });
    slide.start();
    const timer = setTimeout(() => setVisible(false), motion.toastVisibleMs);
    return () => {
      slide.stop();
      clearTimeout(timer);
    };
  }, [offset]);

  if (!visible) {
    return null;
  }
  return (
    <Animated.View
      role="status"
      // Lu par le lecteur d'écran sans lui prendre le focus.
      accessibilityLiveRegion="polite"
      style={[styles.toast, { transform: [{ translateY: offset }] }]}
    >
      <Ionicons name="checkmark-circle" size={size.icon} color={colors.success} aria-hidden />
      <Text style={[text.body, styles.message]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: size.border,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  message: {
    // Un titre long passe à la ligne à côté de l'icône au lieu de déborder.
    flex: 1,
  },
});
