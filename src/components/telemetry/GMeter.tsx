import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { formatG } from '@/lib/motion';
import type { MotionSample } from '@/types/telemetry';

export type MeterMode = 'standby' | 'preflight' | 'live' | 'playback';

type GMeterProps = {
  motion: MotionSample | null;
  isActive: boolean;
  meterMode?: MeterMode;
  /** G-Meter サークルサイズ (px)。Landscape では小さめに渡す。デフォルト: 280 */
  meterSize?: number;
  /** 結果画面プレイバックモード */
  playback?: boolean;
};
const MAX_G = 1.5;
const DOT_RADIUS = 8;

export function GMeter({
  motion,
  isActive,
  meterMode,
  meterSize = 280,
  playback = false,
}: GMeterProps) {
  const styles = useStyles();
  const sweep = useRef(new Animated.Value(0)).current;

  const mode: MeterMode = meterMode
    ?? (playback ? 'playback' : isActive ? 'live' : 'standby');
  const isPreflight = mode === 'preflight';
  const showLiveDot = mode === 'live' || mode === 'preflight';

  useEffect(() => {
    if (!isPreflight) {
      sweep.stopAnimation();
      sweep.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [isPreflight, sweep]);

  const lateral = motion?.lateralG ?? 0;
  const longitudinal = motion?.longitudinalG ?? 0;
  const peak = motion?.peakG ?? 0;

  const range = meterSize * 0.35;
  const dotX = (lateral / MAX_G) * range;
  const dotY = (-longitudinal / MAX_G) * range;

  const sweepRotate = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const modeLabel =
    mode === 'playback'
      ? 'REPLAY'
      : mode === 'preflight'
        ? 'CALIB'
        : mode === 'live'
          ? 'LIVE'
          : 'STANDBY';

  return (
    <TelemetryFrame style={[styles.container, playback ? styles.containerPlayback : undefined]}>
      <View style={styles.labelBar}>
        <Text style={styles.label}>G-METER</Text>
        <Text style={[styles.subLabel, isPreflight && styles.subLabelPreflight]}>
          {modeLabel}
        </Text>
      </View>

      <View style={[styles.meterArea, { minHeight: meterSize }]}>
        <View style={[styles.crosshairH, { width: meterSize * 0.7 }]} />
        <View style={[styles.crosshairV, { height: meterSize * 0.7 }]} />
        <View style={[styles.ring, { width: meterSize * 0.7, height: meterSize * 0.7 }, isPreflight && styles.ringPreflight]} />
        <View style={[styles.ring, { width: meterSize * 0.45, height: meterSize * 0.45 }]} />
        <View style={[styles.ring, { width: meterSize * 0.2, height: meterSize * 0.2 }]} />

        {isPreflight ? (
          <Animated.View
            style={[
              styles.sweepArm,
              { width: meterSize * 0.35, transform: [{ rotate: sweepRotate }] },
            ]}
          />
        ) : null}

        {motion && showLiveDot ? (
          <View
            style={[
              styles.dot,
              isPreflight && styles.dotPreflight,
              {
                transform: [
                  { translateX: dotX },
                  { translateY: dotY },
                ],
              },
            ]}
          />
        ) : isPreflight ? (
          <Text style={styles.placeholderText}>CALIBRATING…</Text>
        ) : (
          <Text style={styles.placeholderText}>AWAITING SENSOR</Text>
        )}
      </View>
      <View style={styles.readoutRow}>
        <Readout label="LAT" value={motion ? formatG(lateral) : '—.—'} />
        <Readout label="LON" value={motion ? formatG(longitudinal) : '—.—'} />
        <Readout label="PEAK" value={motion ? formatG(peak) : '—.—'} isLast />
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
  const styles = useStyles();
  return (
    <View style={[styles.readout, isLast && styles.readoutLast]}>
      <Text style={styles.readoutLabel}>{label}</Text>
      <Text style={styles.readoutValue}>{value}</Text>
    </View>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  container: {
    flex: 1,
    marginHorizontal: spacing.md,
    overflow: 'hidden',
  },
  containerPlayback: {
    marginHorizontal: 0,
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
  subLabelPreflight: {
    color: colors.amber,
  },  meterArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairH: {
    position: 'absolute',
    height: 1,
    backgroundColor: colors.border,
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    backgroundColor: colors.border,
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
  },
  ringPreflight: {
    borderColor: colors.amber + '66',
  },
  sweepArm: {
    position: 'absolute',
    height: 2,
    backgroundColor: colors.amber,
    opacity: 0.75,
    transformOrigin: 'left center',
    left: '50%',
  },  dot: {
    position: 'absolute',
    width: DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    backgroundColor: colors.neonGreen,
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  dotPreflight: {
    backgroundColor: colors.amber,
    shadowColor: colors.amber,
  },  placeholderText: {
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
});
}

function useStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createStyles(colors, typography, spacing),
    [colors, typography, spacing],
  );
}
