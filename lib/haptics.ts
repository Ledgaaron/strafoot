import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Vibrations de l'app : seul fichier qui importe expo-haptics. Simple retour
// physique, jamais bloquant : sur le web (pas de vibreur fiable, avertissements
// du navigateur) rien ne part ; un appareil sans vibreur ne signale rien.

/** Ligne de mesure validée dans la saisie d'un test. */
export function hapticSuccess(): void {
  if (Platform.OS === 'web') {
    return;
  }
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

/** Enregistrement : séance (libre, déjà faite, terminée), test, profil. */
export function hapticMedium(): void {
  if (Platform.OS === 'web') {
    return;
  }
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}
