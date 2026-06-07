import { useCallback, useEffect, useRef } from 'react';
import { appendTrackPoint } from '@/lib/gpsTrack';
import type { TrackPoint } from '@/types/score';
import type { GpsSample } from '@/types/telemetry';

/**
 * セッション中の GPS 軌跡を ref に蓄積する。
 * セッション開始時に reset() を呼び、停止時に getTrack() で取得する。
 */
export function useGpsTrackRecord(
  isActive: boolean,
  gps: GpsSample | null,
  sessionStartedAt: number,
) {
  const trackRef = useRef<TrackPoint[]>([]);

  const reset = useCallback(() => {
    trackRef.current = [];
  }, []);

  const getTrack = useCallback((): TrackPoint[] => {
    return [...trackRef.current];
  }, []);

  useEffect(() => {
    if (!isActive || !gps || sessionStartedAt <= 0) return;
    appendTrackPoint(trackRef.current, gps, sessionStartedAt);
  }, [isActive, gps, sessionStartedAt]);

  return { reset, getTrack };
}
