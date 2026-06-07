import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { DriftIndicator } from '@/components/telemetry/DriftIndicator';
import { GMeter } from '@/components/telemetry/GMeter';
import {
  sampleTelemetryLog,
  telemetryToDriftStatus,
  telemetryToMotion,
} from '@/lib/telemetryLog';
import type { DriftEvent } from '@/types/drift';
import type { TelemetryLogPoint } from '@/types/score';

type Props = {
  log: TelemetryLogPoint[];
  playMs: number;
  sessionStartedAt: number;
  events: DriftEvent[];
};

const METER_SIZE = 200;

/** G-Meter + スリップ角インジケーターのプレイバック表示 */
export function SessionTelemetryReplay({
  log,
  playMs,
  sessionStartedAt,
  events,
}: Props) {
  const styles = useStyles();
  const sample = sampleTelemetryLog(log, playMs);
  if (!sample) return null;

  const motion = telemetryToMotion(sample);
  const driftStatus = telemetryToDriftStatus(sample, events, sessionStartedAt);
  const isDrifting = driftStatus.phase === 'active';

  return (
    <View style={styles.wrap}>
      <View style={styles.labelBar}>
        <Text style={styles.label}>TELEMETRY REPLAY</Text>
        <Text style={[styles.badge, isDrifting && styles.badgeActive]}>
          {isDrifting ? 'DRIFT' : 'CRUISE'}
        </Text>
      </View>

      <View style={styles.metersRow}>
        <View style={styles.meterCol}>
          <GMeter motion={motion} isActive={true} playback meterSize={METER_SIZE} />
        </View>
        <View style={styles.meterCol}>
          <DriftIndicator
            status={driftStatus}
            motion={motion}
            slipAngleDeg={sample.slipAngleDeg}
            compact
            playback
          />
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  labelBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 9,
  },
  badge: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 2,
  },
  badgeActive: {
    color: colors.neonGreen,
    borderColor: colors.neonGreenDim,
  },
  metersRow: {
    gap: spacing.sm,
  },
  meterCol: {
    overflow: 'hidden',
  },
});
}

function useStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createStyles(colors, typography, spacing),
    [colors, typography, spacing],
  );
}
