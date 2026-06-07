import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { driftIntensity, formatDriftDuration } from '@/lib/driftDetection';
import type { DriftStatus } from '@/types/drift';
import type { MotionSample } from '@/types/telemetry';

type DriftIndicatorProps = {
  status: DriftStatus;
  motion: MotionSample | null;
  /** センサーフュージョンによるリアルタイムスリップアングル (°) */
  slipAngleDeg: number;
  /** 計測開始前のプリフライト表示 */
  preflight?: boolean;
  compact?: boolean;
  /** 結果画面プレイバックモード */
  playback?: boolean;
};

export function DriftIndicator({
  status,
  motion,
  slipAngleDeg,
  compact = false,
  preflight = false,
  playback = false,
}: DriftIndicatorProps) {
  const styles = useStyles();
  const isActive = status.phase === 'active';
  const intensity = motion
    ? driftIntensity(motion.lateralG, motion.yawRateRad)
    : 0;

  const barWidth = `${Math.round(intensity * 100)}%` as const;
  const lastEvent = status.events[status.events.length - 1];

  // ── スリップアングル表示値 ──────────────────────────────────
  const displaySlip = isActive
    ? slipAngleDeg
    : (lastEvent?.peakSlipAngleDeg ?? 0);
  const slipIsAvailable = Math.abs(displaySlip) > 0.5;
  const slipText = slipIsAvailable
    ? `${Math.round(Math.abs(displaySlip))}°`
    : isActive ? 'ACQ°' : '---°';
  const slipSign = displaySlip > 0 ? 'R' : displaySlip < -0.5 ? 'L' : '';

  // ── 累積回転角度（compact 時は非表示）──────────────────────────
  const rotText = !compact && isActive && status.activeAngleDeg > 1
    ? `Σ ${Math.round(status.activeAngleDeg)}°`
    : !compact && lastEvent
      ? `Σ ${Math.round(lastEvent.peakAngleDeg)}°`
      : '';

  return (
    <TelemetryFrame
      style={
        isActive
          ? [styles.container, playback ? styles.containerPlayback : undefined, styles.containerActive]
          : [styles.container, playback ? styles.containerPlayback : undefined]
      }
    >

      {/* ── ステータスヘッダー ── */}
      <View style={styles.header}>
        <View style={styles.statusGroup}>
          <View style={[styles.dot, isActive && styles.dotActive, preflight && styles.dotPreflight]} />
          <Text style={[styles.statusLabel, isActive && styles.statusLabelActive, preflight && styles.statusLabelPreflight]}>
            {playback
              ? (isActive ? '▶ REPLAY · DRIFT' : '■ REPLAY · MONITOR')
              : preflight
                ? '◉ PRE-RUN CHECK'
              : (isActive ? '▶ DRIFT DETECTED' : '■ DRIFT MONITOR  STANDBY')}
          </Text>
          {isActive && !slipIsAvailable && (
            <Text style={styles.gpsWaiting}> · GPS ACQ…</Text>
          )}
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countLabel}>×{status.driftCount}</Text>
        </View>
      </View>

      {/* ── スリップアングル メイン表示 ── */}
      <View style={[styles.angleSection, compact && styles.angleSectionCompact]}>
        <Text style={styles.angleSupLabel}>SLIP ANGLE</Text>

        <View style={styles.angleRow}>
          {slipSign !== '' && (
            <Text style={[styles.slipSign, compact && styles.slipSignCompact, isActive && styles.slipSignActive]}>
              {slipSign}
            </Text>
          )}
          <Text style={[
            styles.angleValue,
            compact && styles.angleValueCompact,
            isActive && slipIsAvailable && styles.angleValueActive,
          ]}>
            {slipText}
          </Text>
        </View>

        {rotText !== '' && (
          <View style={styles.angleSubRow}>
            <Text style={styles.rotLabel}>{rotText}</Text>
            {!isActive && lastEvent && (
              <Text style={styles.lastDriftLabel}> LAST DRIFT</Text>
            )}
          </View>
        )}
      </View>

      {/* ── 強度バー ── */}
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: barWidth },
            isActive && styles.barFillActive,
          ]}
        />
      </View>

      {/* ── データ行 ── */}
      <View style={styles.dataRow}>
        <View style={styles.dataCell}>
          <Text style={styles.dataLabel}>DURATION</Text>
          <Text style={[styles.dataValue, isActive && styles.dataValueActive]}>
            {isActive
              ? `${formatDriftDuration(status.activeDurationMs)}s`
              : lastEvent ? `${formatDriftDuration(lastEvent.durationMs)}s` : '- -.--s'}
          </Text>
        </View>

        <View style={[styles.dataCell, styles.dataCellMid]}>
          <Text style={styles.dataLabel}>PEAK |G|</Text>
          <Text style={[styles.dataValue, isActive && styles.dataValueActive]}>
            {isActive
              ? `${status.activePeakLateralG.toFixed(2)}`
              : lastEvent
                ? `${lastEvent.peakLateralG.toFixed(2)}`
                : '-.--'}
          </Text>
        </View>

        <View style={[styles.dataCell, styles.dataCellLast]}>
          <Text style={styles.dataLabel}>BEST</Text>
          <Text style={styles.dataValue}>
            {status.events.length > 0
              ? `${formatDriftDuration(Math.max(...status.events.map((e) => e.durationMs)))}s`
              : '- -.--s'}
          </Text>
        </View>
      </View>
    </TelemetryFrame>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  containerPlayback: {
    marginHorizontal: 0,
    marginTop: 0,
  },
  containerActive: {
    borderColor: colors.neonGreen,
    shadowOpacity: 0.2,
  },

  // ── ヘッダー ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
  },
  dotActive: {
    backgroundColor: colors.neonGreen,
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  dotPreflight: {
    backgroundColor: colors.amber,
    shadowColor: colors.amber,
  },
  statusLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
  },
  statusLabelActive: {
    color: colors.neonGreen,
  },
  statusLabelPreflight: {
    color: colors.amber,
  },
  gpsWaiting: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
  },
  countBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
  },
  countLabel: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 10,
  },

  // ── スリップアングル表示 ──
  angleSection: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  angleSectionCompact: {
    paddingVertical: spacing.sm,
  },
  angleSupLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    marginBottom: spacing.xs,
  },
  angleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  slipSign: {
    fontFamily: 'monospace',
    fontSize: 20,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 8,
  },
  slipSignCompact: {
    fontSize: 14,
    marginBottom: 4,
  },
  slipSignActive: {
    color: colors.neonGreenDim,
  },
  angleValue: {
    fontFamily: 'monospace',
    fontSize: 56,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 2,
  },
  angleValueCompact: {
    fontSize: 32,
  },
  angleValueActive: {
    color: colors.neonGreen,
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  angleSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: 4,
  },
  rotLabel: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 9,
  },
  lastDriftLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
  },

  // ── 強度バー ──
  barTrack: {
    height: 3,
    backgroundColor: colors.border,
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.textMuted,
  },
  barFillActive: {
    backgroundColor: colors.neonGreen,
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },

  // ── データ行 ──
  dataRow: {
    flexDirection: 'row',
  },
  dataCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  dataCellMid: {
    borderRightWidth: 1,
  },
  dataCellLast: {
    borderRightWidth: 0,
  },
  dataLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    marginBottom: 3,
  },
  dataValue: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 15,
  },
  dataValueActive: {
    color: colors.neonGreen,
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
