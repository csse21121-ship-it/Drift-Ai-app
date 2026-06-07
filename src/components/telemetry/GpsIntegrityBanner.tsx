import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { practiceReasonLabel } from '@/lib/gpsIntegrityMonitor';
import type { GpsIntegritySnapshot } from '@/types/telemetry';
import { useTheme } from '@/contexts/ThemeContext';

type Props = {
  integrity: GpsIntegritySnapshot | null;
  visible?: boolean;
  compact?: boolean;
};

export function GpsIntegrityBanner({
  integrity,
  visible = true,
  compact = false,
}: Props) {
  const { colors, typography, spacing } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          marginHorizontal: spacing.md,
          marginTop: compact ? 2 : spacing.xs,
          paddingHorizontal: spacing.sm,
          paddingVertical: compact ? 4 : spacing.xs,
          borderRadius: 4,
          borderWidth: 1,
        },
        practice: {
          borderColor: colors.amber,
          backgroundColor: `${colors.amber}18`,
        },
        anomaly: {
          borderColor: colors.recRed,
          backgroundColor: `${colors.recRed}14`,
        },
        title: {
          ...typography.label,
          fontWeight: '700',
          letterSpacing: 0.6,
          textTransform: 'none',
        },
        sub: {
          ...typography.label,
          marginTop: 2,
          opacity: 0.85,
          textTransform: 'none',
        },
      }),
    [colors, typography, spacing, compact],
  );

  if (!visible || !integrity) return null;

  const showPractice = integrity.isPracticeMode;
  const showAnomaly = integrity.isGpsAnomalous && !showPractice;

  if (!showPractice && !showAnomaly) return null;

  const reason = practiceReasonLabel(integrity.practiceReason);

  if (showPractice) {
    return (
      <View style={[styles.wrap, styles.practice]}>
        <Text style={[styles.title, { color: colors.amber }]}>
          PRACTICE MODE — 参考記録
        </Text>
        {reason ? (
          <Text style={[styles.sub, { color: colors.amber }]}>
            {reason} · 精度 {Math.round(integrity.accuracyM)}m
          </Text>
        ) : (
          <Text style={[styles.sub, { color: colors.amber }]}>
            ランキング・デイリー対象外
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, styles.anomaly]}>
      <Text style={[styles.title, { color: colors.recRed }]}>
        GPS 異常検知
      </Text>
      <Text style={[styles.sub, { color: colors.recRed }]}>
        センサーと GPS の不整合 · 精度 {Math.round(integrity.accuracyM)}m
      </Text>
    </View>
  );
}
