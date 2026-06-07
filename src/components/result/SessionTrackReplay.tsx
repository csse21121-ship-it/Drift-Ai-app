/**
 * SessionTrackReplay — 結果画面の走行軌跡マップ再生
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_DEFAULT,
} from 'react-native-maps';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { boundingRegion } from '@/lib/geofence';
import {
  driftEventCoord,
  interpolateTrackPoint,
  trackProgressCoords,
} from '@/lib/gpsTrack';
import { formatSessionDuration } from '@/lib/scoring';
import type { DriftEvent } from '@/types/drift';
import type { GeoPoint } from '@/types/course';
import type { TrackPoint } from '@/types/score';

type Props = {
  track: TrackPoint[];
  sessionStartedAt: number;
  sessionDurationMs: number;
  events?: DriftEvent[];
  courseName?: string;
  /** 外部タイムライン制御（SessionReplaySection から渡す） */
  playMs?: number;
  playing?: boolean;
  hideControls?: boolean;
};

const MAP_HEIGHT = 240;
const TICK_MS = 50;
const PLAYBACK_SPEED = 8;

export function SessionTrackReplay({
  track,
  sessionStartedAt,
  sessionDurationMs,
  events = [],
  courseName,
  playMs: playMsProp,
  playing: playingProp,
  hideControls = false,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);
  const [internalPlayMs, setInternalPlayMs] = useState(0);
  const [internalPlaying, setInternalPlaying] = useState(false);

  const controlled = playMsProp !== undefined;
  const playMs = controlled ? playMsProp : internalPlayMs;
  const playing = controlled ? (playingProp ?? false) : internalPlaying;

  const durationMs = Math.max(
    sessionDurationMs,
    track.length > 0 ? track[track.length - 1].tMs : 0,
  );

  const fullCoords = useMemo(
    () => track.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
    [track],
  );

  const progressCoords = useMemo(
    () => trackProgressCoords(track, playMs),
    [track, playMs],
  );

  const headCoord = useMemo(
    () => interpolateTrackPoint(track, playMs),
    [track, playMs],
  );

  const initialRegion = useMemo(() => {
    const region = boundingRegion(fullCoords);
    return {
      ...region,
      latitudeDelta: region.latitudeDelta * 1.35,
      longitudeDelta: region.longitudeDelta * 1.35,
    };
  }, [fullCoords]);

  const driftMarkers = useMemo(() => {
    return events
      .map((ev, i) => {
        const coord = driftEventCoord(track, ev.startedAt, sessionStartedAt);
        if (!coord) return null;
        return { id: ev.id, index: i + 1, coord };
      })
      .filter((m): m is { id: string; index: number; coord: GeoPoint } => m != null);
  }, [events, track, sessionStartedAt]);

  useEffect(() => {
    if (fullCoords.length < 2) return;
    mapRef.current?.fitToCoordinates(fullCoords, {
      edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
      animated: false,
    });
  }, [fullCoords]);

  useEffect(() => {
    if (controlled || !playing) return;
    const id = setInterval(() => {
      setInternalPlayMs((prev) => {
        const next = prev + TICK_MS * PLAYBACK_SPEED;
        if (next >= durationMs) {
          setInternalPlaying(false);
          return durationMs;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [controlled, playing, durationMs]);

  const togglePlay = () => {
    if (internalPlayMs >= durationMs) {
      setInternalPlayMs(0);
      setInternalPlaying(true);
      return;
    }
    setInternalPlaying((p) => !p);
  };

  const progressPct = durationMs > 0 ? (playMs / durationMs) * 100 : 0;

  return (
    <TelemetryFrame style={styles.frame}>
      <View style={styles.labelBar}>
        <Text style={styles.label}>GPS TRACK</Text>
        <Text style={styles.subLabel}>
          {track.length} pts
          {courseName ? `  ·  ${courseName}` : ''}
        </Text>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          mapType="hybrid"
          initialRegion={initialRegion}
          showsCompass={false}
          scrollEnabled={!playing}
          zoomEnabled={!playing}
          rotateEnabled={false}
          pitchEnabled={false}
        >
          {fullCoords.length >= 2 ? (
            <Polyline
              coordinates={fullCoords}
              strokeColor={colors.textMuted + '99'}
              strokeWidth={3}
            />
          ) : null}

          {progressCoords.length >= 2 ? (
            <Polyline
              coordinates={progressCoords}
              strokeColor={colors.neonGreen}
              strokeWidth={4}
            />
          ) : null}

          {driftMarkers.map((m) => (
            <Marker
              key={m.id}
              coordinate={m.coord}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.driftPin}>
                <Text style={styles.driftPinText}>{m.index}</Text>
              </View>
            </Marker>
          ))}

          {headCoord ? (
            <Marker coordinate={headCoord} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.headDot} />
            </Marker>
          ) : null}
        </MapView>
      </View>

      {!hideControls ? (
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
          </View>
        </View>
      ) : null}
    </TelemetryFrame>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  frame: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
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
    fontSize: 9,
  },
  subLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
  },
  mapWrap: {
    height: MAP_HEIGHT,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  headDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.neonGreen,
    borderWidth: 2,
    borderColor: colors.background,
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  driftPin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.amber,
    borderWidth: 1,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driftPinText: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '700',
    color: colors.background,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    gap: 4,
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
});
}

function useStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createStyles(colors, typography, spacing),
    [colors, typography, spacing],
  );
}
