import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, diagramUrl } from '../lib/diagrams';
import type { Exercise } from '../lib/sheet-types';
import { colors, layout, radius, spacing, text } from '../lib/theme';
import { Diagram } from './diagram';
import { FieldError } from './field-error';
import { PitchPlaceholder } from './pitch-placeholder';

// Morceaux d'un exercice, identiques sur une fiche de lecture (app/sheet/[id].tsx)
// et sur un test (app/test/[slug].tsx) : schéma ou terrain par défaut, intertitre,
// listes, et le contenu replié sous « Plus de tips ».

/**
 * Schéma de l'exercice en pleine largeur : dessiné depuis diagram_data s'il en a,
 * sinon le PNG du champ diagram, sinon le terrain par défaut.
 */
export function ExerciseDiagram({ exercise }: { exercise: Exercise }) {
  if (exercise.diagram_data !== null) {
    return <Diagram diagram={exercise.diagram_data} accessibilityLabel={`Schéma : ${exercise.title}`} />;
  }
  // key : l'état chargé / introuvable repart de zéro à chaque schéma.
  return exercise.diagram !== null ? (
    <DiagramImage key={exercise.diagram} file={exercise.diagram} title={exercise.title} />
  ) : (
    <PitchPlaceholder />
  );
}

/** Un fichier absent du bucket est dit, jamais masqué. */
function DiagramImage({ file, title }: { file: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <FieldError message={`Schéma introuvable : ${file} (bucket Storage diagrams).`} />;
  }
  return (
    <View style={styles.diagram}>
      <Image
        source={{ uri: diagramUrl(file) }}
        resizeMode="contain"
        accessibilityLabel={`Schéma : ${title}`}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={StyleSheet.absoluteFill}
      />
      {!loaded ? <ActivityIndicator color={colors.accent} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

/** Intertitre en overline, puis son contenu. */
export function ContentSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={layout.section}>
      <Text role="heading" style={text.overline}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * Liste à puces « · », ou numérotée (numéros en orange, chiffres alignés) ; une
 * ligne trop longue reste alignée sous son texte.
 */
export function TextList({ items, numbered = false }: { items: readonly string[]; numbered?: boolean }) {
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={index} style={styles.listItem}>
          <Text style={[text.bodyStrong, text.tabular, numbered ? styles.number : styles.bullet]}>
            {numbered ? `${index + 1}` : '·'}
          </Text>
          <Text style={[text.body, styles.listText]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Contenu de « Plus de tips » : critères de réussite, points techniques,
 * variables, puis surface / séquence / effectif. Ce qui précède (objectif, but)
 * est posé par l'écran.
 */
export function ExerciseTips({ exercise }: { exercise: Exercise }) {
  const { setup, variations } = exercise;
  return (
    <>
      <ContentSection title="Critères de réussite">
        <TextList items={exercise.success_criteria} />
      </ContentSection>
      <ContentSection title="Points techniques">
        <TextList items={exercise.technical_points} />
      </ContentSection>
      {variations !== null ? (
        <ContentSection title="Variables">
          <Text style={text.body}>{`Plus facile : ${variations.easier}`}</Text>
          <Text style={text.body}>{`Plus dur : ${variations.harder}`}</Text>
        </ContentSection>
      ) : null}
      <Text style={text.meta}>
        {`Surface : ${setup.surface} · Séquence : ${setup.sequence} · Effectif : ${setup.equipment}`}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  diagram: {
    width: '100%',
    aspectRatio: DIAGRAM_WIDTH / DIAGRAM_HEIGHT,
    borderRadius: radius.card,
    // Les coins arrondis découpent aussi l'image.
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  list: {
    gap: spacing.sm,
  },
  listItem: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  // Colonne des numéros : même largeur jusqu'à 9, le texte s'aligne d'une ligne à l'autre.
  number: {
    minWidth: spacing.md,
    color: colors.accent,
  },
  bullet: {
    minWidth: spacing.md,
    color: colors.textMuted,
  },
  listText: {
    flex: 1,
  },
});
