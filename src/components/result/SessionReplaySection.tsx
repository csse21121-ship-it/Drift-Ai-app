import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { useTheme } from '@/contexts/ThemeContext';
import { SessionTelemetryReplay } from '@/components/result/SessionTelemetryReplay';
import { SessionTrackReplay } from '@/components/result/SessionTrackReplay';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { REPLAY_SPEED, useSessionReplay } from '@/hooks/useSessionReplay';
import { formatSessionDuration } from '@/lib/scoring';
import { telemetryLogDurationMs } from '@/lib/telemetryLog';
import type { SessionResult, TrackPoint } from '@/types/score';

type Props = {
  result: SessionResult;
};

/** GPS 軌跡 + G/角度メーターを同一タイムラインで再生 */
export function SessionReplaySection({ result }: Props) {
  const styles = useStyles();
  const hasTrack = (result.gpsTrack?.length ?? 0) >= 2;
  const hasTelemetry = (result.telemetryLog?.length ?? 0) >= 2;

  const durationMs = Math.max(
    result.sessionDurationMs,
    hasTrack ? result.gpsTrack![result.gpsTrack!.length - 1].tMs : 0,
    hasTelemetry
      ? telemetryLogDurationMs(result.telemetryLog!, result.sessionDurationMs)
      : 0,
  );

  const replay = useSessionReplay(durationMs);

  if (!hasTrack && !hasTelemetry) return null;

  return (
    <View style={styles.section}>
      {hasTelemetry ? (
        <SessionTelemetryReplay
          log={result.telemetryLog!}
          playMs={replay.playMs}
          sessionStartedAt={result.startedAt}
          events={result.events}
        />
      ) : null}

      {hasTrack ? (
        <SessionTrackReplay
          track={result.gpsTrack as TrackPoint[]}
          sessionStartedAt={result.startedAt}
          sessionDurationMs={result.sessionDurationMs}
          events={result.events}
          courseName={result.courseName}
          playMs={replay.playMs}
          playing={replay.playing}
          hideControls
        />
      ) : null}

      <TelemetryFrame style={styles.controlsFrame}>
        <ReplayControls replay={replay} />
      </TelemetryFrame>
    </View>
  );
}

function ReplayControls({
  replay,
}: {
  replay: ReturnType<typeof useSessionReplay>;
}) {
  const styles = useStyles();
  const { playMs, playing, togglePlay, durationMs, progressPct } = replay;

  return (
    <View style={styles.controls}>
      <GamePressable
        onPress={togglePlay}
        style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.playBtnText}>
          {playing ? '⏸ PAUSE' : playMs >= durationMs ? '↺ REPLAY' : '▶ PLAY'}
        </Text>
      </GamePressable>

      <View style={styles.timeBlock}>
        <Text style={styles.timeText}>
          {formatSessionDuration(playMs)} / {formatSessionDuration(durationMs)}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <Text style={styles.speedHint}>×{REPLAY_SPEED} speed</Text>
      </View>
    </View>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  section: {
    gap: spacing.xs,
  },
  controlsFrame: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  playBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.neonGreenDim,
    borderRadius: 4,
    backgroundColor: colors.neonGreen + '12',
  },
  playBtnText: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 9,
  },
  timeBlock: {
    flex: 1,
    gap: 3,
  },
  timeText: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 10,
    textAlign: 'right',
  },
  progressTrack: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.neonGreen,
  },
  speedHint: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
    textAlign: 'right',
    textTransform: 'none',
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
