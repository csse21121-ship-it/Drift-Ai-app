import { useCallback, useEffect, useRef } from 'react';
import { appendTelemetryPoint } from '@/lib/telemetryLog';
import type { DriftStatus } from '@/types/drift';
import type { TelemetryLogPoint } from '@/types/score';
import type { GpsSample, MotionSample } from '@/types/telemetry';

/** セッション中の G・角度テレメトリーを ref に蓄積する */
export function useTelemetryLogRecord(
  isActive: boolean,
  motion: MotionSample | null,
  gps: GpsSample | null,
  sessionStartedAt: number,
  driftStatus: DriftStatus,
) {
  const logRef = useRef<TelemetryLogPoint[]>([]);

  const reset = useCallback(() => {
    logRef.current = [];
  }, []);

  const getLog = useCallback((): TelemetryLogPoint[] => {
    return [...logRef.current];
  }, []);

  useEffect(() => {
    if (!isActive || !motion || sessionStartedAt <= 0) return;
    appendTelemetryPoint(logRef.current, motion, gps, sessionStartedAt, driftStatus);
  }, [isActive, motion, gps, sessionStartedAt, driftStatus]);

  return { reset, getLog };
}
