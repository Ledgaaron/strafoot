import { Pressable, StyleSheet, Text } from 'react-native';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

/** Bouton texte à zone tactile d'au moins 44 px (Connexion, Déconnexion). */
export function ActionButton({ label, onPress, disabled = false }: ActionButtonProps) {
  return (
    <Pressable
      role="button"
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.5,
  },
  label: {
    fontSize: 16,
  },
});
