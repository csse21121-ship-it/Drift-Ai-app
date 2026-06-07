/**
 * Landscape 向けコンパクトスコアストリップ
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import type { LiveScore } from '@/lib/scoring';

type Props = {
  live: LiveScore;
  driftPhase: 'idle' | 'active';
};

export function LiveScoreStrip({ live, driftPhase }: Props) {
  const { colors, typography, spacing } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        strip: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: 6,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        scoreVal: {
          ...typography.mono,
          color: colors.neonGreen,
          fontSize: 18,
          fontWeight: '700',
        },
        unit: {
          ...typography.label,
          color: colors.textMuted,
          fontSize: 9,
          marginBottom: 1,
        },
        evalBadge: {
          ...typography.mono,
          color: colors.amber,
          fontSize: 11,
          fontWeight: '700',
          marginLeft: spacing.xs,
        },
        evalUnit: {
          ...typography.label,
          color: colors.textMuted,
          fontSize: 8,
          marginBottom: 1,
        },
        sep: {
          width: 1,
          height: 16,
          backgroundColor: colors.border,
          marginHorizontal: spacing.sm,
        },
        comboVal: {
          ...typography.mono,
          color: colors.textPrimary,
          fontSize: 15,
          fontWeight: '700',
        },
        comboValActive: {
          color: colors.neonGreen,
        },
        driftsVal: {
          ...typography.mono,
          color: colors.textSecondary,
          fontSize: 15,
        },
        zoneBadge: {
          ...typography.label,
          color: colors.amber,
          fontSize: 8,
          marginRight: spacing.sm,
        },
        preview: {
          ...typography.mono,
          color: colors.neonGreen,
          fontSize: 12,
        },
      }),
    [colors, typography, spacing],
  );

  const isDrifting = driftPhase === 'active' && live.previewPoints > 0;
  const mainScore = isDrifting ? live.liveTotal : live.totalPoints;
  const isCombo = live.displayCombo > 1;

  return (
    <View style={styles.strip}>
      <Text style={styles.scoreVal}>{mainScore.toLocaleString()}</Text>
      <Text style={styles.unit}> pt</Text>
      <Text style={styles.evalBadge}>{live.evalScore}</Text>
      <Text style={styles.evalUnit}>/100</Text>
      <View style={styles.sep} />
      <Text style={[styles.comboVal, isCombo && styles.comboValActive]}>
        ×{live.displayCombo}
      </Text>
      <Text style={styles.unit}> COMBO</Text>
      <View style={styles.sep} />
      <Text style={styles.driftsVal}>{live.totalDrifts}</Text>
      <Text style={styles.unit}> DRIFTS</Text>
      {isDrifting ? (
        <>
          <View style={{ flex: 1 }} />
          {live.activeZoneMultiplier > 1 ? (
            <Text style={styles.zoneBadge}>
              ZONE ×{live.activeZoneMultiplier.toFixed(1)}
            </Text>
          ) : null}
          <Text style={styles.preview}>● +{live.previewPoints.toLocaleString()}</Text>
        </>
      ) : (
        <View style={{ flex: 1 }} />
      )}
    </View>
  );
}
