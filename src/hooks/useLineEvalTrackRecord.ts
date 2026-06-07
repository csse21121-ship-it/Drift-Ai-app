import { useCallback, useEffect, useRef } from 'react';
import {
  appendLineEvalTrackPoint,
  buildLineEvalTrackInput,
} from '@/lib/lineEvalTrack';
import type { LoggerCapabilities, LoggerSample } from '@/types/logger';
import type { TrackPoint } from '@/types/score';
import type { GpsSample } from '@/types/telemetry';

/**
 * 理想ライン評価専用 GPS 軌跡 — ロガー lat/lon 優先・精度メタ付き
 */
export function useLineEvalTrackRecord(
  isActive: boolean,
  phoneGps: GpsSample | null,
  loggerSample: LoggerSample | null,
  capabilities: LoggerCapabilities,
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
    if (!isActive || sessionStartedAt <= 0) return;

    const input = buildLineEvalTrackInput(phoneGps, loggerSample, capabilities);
    if (!input) return;

    appendLineEvalTrackPoint(trackRef.current, input, sessionStartedAt);
  }, [isActive, phoneGps, loggerSample, capabilities, sessionStartedAt]);

  return { reset, getTrack };
}
