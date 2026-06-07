import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { qualityTierLabel } from '@/lib/telemetryQuality';
import type { TelemetryQualitySnapshot } from '@/types/telemetry';
import { useTheme } from '@/contexts/ThemeContext';

type QualityIndicatorProps = {
  quality: TelemetryQualitySnapshot | null;
  visible?: boolean;
  /** 横長コンパクト（ランドスケープ HUD 用） */
  compact?: boolean;
};

function tierColor(
  tier: TelemetryQualitySnapshot['tier'],
  colors: ReturnType<typeof useTheme>['colors'],
): string {
  switch (tier) {
    case 'high':
      return colors.neonGreen;
    case 'medium':
      return colors.amber;
    default:
      return colors.recRed;
  }
}

export function QualityIndicator({
  quality,
  visible = true,
  compact = false,
}: QualityIndicatorProps) {
  const { colors, typography, spacing } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          paddingHorizontal: spacing.md,
          paddingVertical: compact ? 4 : spacing.xs,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        },
        labelCol: {
          minWidth: compact ? 52 : 58,
        },
        label: {
          ...typography.label,
          color: colors.textMuted,
          fontSize: compact ? 7 : 8,
          letterSpacing: 1.2,
        },
        tier: {
          ...typography.label,
          fontSize: compact ? 7 : 8,
          letterSpacing: 1,
          marginTop: 1,
        },
        barTrack: {
          flex: 1,
          height: compact ? 4 : 5,
          backgroundColor: colors.border,
          borderRadius: 2,
          overflow: 'hidden',
        },
        barFill: {
          height: '100%',
          borderRadius: 2,
        },
        scoreText: {
          ...typography.mono,
          fontSize: compact ? 9 : 10,
          minWidth: 28,
          textAlign: 'right',
        },
        signalRow: {
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 2,
          marginLeft: 2,
        },
        signalBar: {
          width: 3,
          borderRadius: 1,
          backgroundColor: colors.border,
        },
      }),
    [colors, typography, spacing, compact],
  );

  if (!visible || !quality) return null;

  const tint = tierColor(quality.tier, colors);
  const fillPct = Math.min(100, Math.max(0, quality.score));
  const bars = [25, 50, 75, 100];

  return (
    <View style={styles.wrap} accessibilityLabel={`計測品質 ${quality.score}パーセント`}>
      <View style={styles.row}>
        <View style={styles.labelCol}>
          <Text style={styles.label}>QUALITY</Text>
          <Text style={[styles.tier, { color: tint }]}>
            {qualityTierLabel(quality.tier)}
          </Text>
        </View>

        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              {
                width: `${fillPct}%`,
                backgroundColor: tint,
                shadowColor: tint,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: quality.tier === 'high' ? 0.55 : 0.35,
                shadowRadius: 4,
              },
            ]}
          />
        </View>

        <View style={styles.signalRow}>
          {bars.map((threshold) => (
            <View
              key={threshold}
              style={[
                styles.signalBar,
                {
                  height: 4 + threshold / 25,
                  backgroundColor:
                    quality.score >= threshold ? tint : colors.border,
                },
              ]}
            />
          ))}
        </View>

        <Text style={[styles.scoreText, { color: tint }]}>
          {Math.round(quality.score)}
        </Text>
      </View>
    </View>
  );
}
