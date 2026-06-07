import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import type { MotionSample } from '@/types/telemetry';

type GyroReadoutProps = {
  motion: MotionSample | null;
};

function fmt(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}

function useGyroStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginHorizontal: spacing.md,
          marginTop: spacing.xs,
          paddingVertical: spacing.xs,
        },
        left: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textMuted },
        dotOn: { backgroundColor: colors.neonGreen },
        label: { ...typography.label, color: colors.textMuted, fontSize: 8 },
        labelOn: { color: colors.neonGreen },
        unit: { ...typography.label, color: colors.border, fontSize: 7, marginLeft: 2 },
        values: { flexDirection: 'row', gap: 10 },
        axis: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
        axisLabel: { ...typography.label, color: colors.textMuted, fontSize: 7 },
        axisValue: { ...typography.mono, color: colors.textSecondary, fontSize: 10 },
        standby: { ...typography.label, color: colors.amber, fontSize: 8 },
      }),
    [colors, typography, spacing],
  );
}

export function GyroReadout({ motion }: GyroReadoutProps) {
  const styles = useGyroStyles();
  const on = !!motion;
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={[styles.dot, on && styles.dotOn]} />
        <Text style={[styles.label, on && styles.labelOn]}>IMU</Text>
        <Text style={styles.unit}>rad/s</Text>
      </View>
      {on ? (
        <View style={styles.values}>
          <AxisValue axis="X" value={fmt(motion!.gyroX)} />
          <AxisValue axis="Y" value={fmt(motion!.gyroY)} />
          <AxisValue axis="Z" value={fmt(motion!.gyroZ)} />
        </View>
      ) : (
        <Text style={styles.standby}>◌ SENSOR INIT…</Text>
      )}
    </View>
  );
}

function AxisValue({ axis, value }: { axis: string; value: string }) {
  const styles = useGyroStyles();
  return (
    <View style={styles.axis}>
      <Text style={styles.axisLabel}>{axis}</Text>
      <Text style={styles.axisValue}>{value}</Text>
    </View>
  );
}
