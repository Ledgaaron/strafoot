import { Text } from 'react-native';

import { formatMinutes, splitMinutes } from '../lib/profile-stats';
import { text } from '../lib/theme';

type DurationValueProps = {
  /** Durée en minutes. */
  minutes: number;
};

/**
 * Durée en chiffre dominant (text.number, police d'affichage) : « 6 h 40 »,
 * « 2 h », « 45 min », l'unité en secondaire dans le chiffre comme la carte
 * Volume de la DA. Lue d'un trait (« 6 h 40 »). Carte Volume du Profil et
 * écran des volumes.
 */
export function DurationValue({ minutes }: DurationValueProps) {
  const split = splitMinutes(minutes);
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.5}
      accessibilityLabel={formatMinutes(minutes)}
      style={text.number}
    >
      {split.hours > 0 ? split.hours : split.minutes}
      <Text style={text.unit}>{split.hours > 0 ? (split.minutes > 0 ? ' h ' : ' h') : ' min'}</Text>
      {split.hours > 0 && split.minutes > 0 ? String(split.minutes).padStart(2, '0') : null}
    </Text>
  );
}
