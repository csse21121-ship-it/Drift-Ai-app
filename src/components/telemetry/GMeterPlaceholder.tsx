import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { useTheme } from '@/contexts/ThemeContext';

const METER_SIZE = 280;

/**
 * Gメーター表示領域のプレースホルダー
 * 後続タスクでカルマンフィルタ処理済みの加速度データを描画
 */
function usePlaceholderStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          marginHorizontal: spacing.md,
          overflow: 'hidden',
        },
        labelBar: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        label: {
          ...typography.label,
          color: colors.neonGreen,
        },
        subLabel: {
          ...typography.label,
          color: colors.textMuted,
          fontSize: 8,
        },
        meterArea: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: METER_SIZE,
        },
        crosshairH: {
          position: 'absolute',
          width: METER_SIZE * 0.7,
          height: 1,
          backgroundColor: colors.border,
        },
        crosshairV: {
          position: 'absolute',
          width: 1,
          height: METER_SIZE * 0.7,
          backgroundColor: colors.border,
        },
        ring: {
          position: 'absolute',
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 999,
        },
        ringOuter: {
          width: METER_SIZE * 0.7,
          height: METER_SIZE * 0.7,
        },
        ringMid: {
          width: METER_SIZE * 0.45,
          height: METER_SIZE * 0.45,
        },
        ringInner: {
          width: METER_SIZE * 0.2,
          height: METER_SIZE * 0.2,
        },
        placeholderText: {
          ...typography.label,
          color: colors.textMuted,
          fontSize: 9,
          letterSpacing: 3,
        },
        readoutRow: {
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        readout: {
          flex: 1,
          alignItems: 'center',
          paddingVertical: spacing.sm,
          borderRightWidth: 1,
          borderRightColor: colors.border,
        },
        readoutLast: {
          borderRightWidth: 0,
        },
        readoutLabel: {
          ...typography.label,
          color: colors.textMuted,
          fontSize: 8,
          marginBottom: 2,
        },
        readoutValue: {
          ...typography.mono,
          color: colors.neonGreen,
          fontSize: 16,
        },
      }),
    [colors, typography, spacing],
  );
}

export function GMeterPlaceholder() {
  const styles = usePlaceholderStyles();
  return (
    <TelemetryFrame style={styles.container}>
      <View style={styles.labelBar}>
        <Text style={styles.label}>G-METER</Text>
        <Text style={styles.subLabel}>LATERAL / LONGITUDINAL</Text>
      </View>

      <View style={styles.meterArea}>
        {/* 十字ガイドライン */}
        <View style={styles.crosshairH} />
        <View style={styles.crosshairV} />

        {/* 同心円ガイド */}
        <View style={[styles.ring, styles.ringOuter]} />
        <View style={[styles.ring, styles.ringMid]} />
        <View style={[styles.ring, styles.ringInner]} />

        <Text style={styles.placeholderText}>AWAITING SENSOR</Text>
      </View>

      <View style={styles.readoutRow}>
        <Readout label="LAT" value="—.—" isLast={false} />
        <Readout label="LON" value="—.—" isLast={false} />
        <Readout label="PEAK" value="—.—" isLast />
      </View>
    </TelemetryFrame>
  );
}

function Readout({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  const styles = usePlaceholderStyles();
  return (
    <View style={[styles.readout, isLast && styles.readoutLast]}>
      <Text style={styles.readoutLabel}>{label}</Text>
      <Text style={styles.readoutValue}>{value}</Text>
    </View>
  );
}
