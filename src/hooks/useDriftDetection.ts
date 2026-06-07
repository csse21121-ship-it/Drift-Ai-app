import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createReplayState,
  INITIAL_DRIFT_STATUS,
  processReplayFrame,
  type DriftReplayState,
} from '@/lib/driftReplay';
import type { SurfaceCondition } from '@/lib/surfaceCondition';
import { DEFAULT_THRESHOLDS } from '@/types/settings';
import type { DriftThresholds } from '@/types/settings';
import type { DriftStatus } from '@/types/drift';
import type { GpsSample, MotionSample } from '@/types/telemetry';

type UseDriftDetectionInput = {
  motion: MotionSample | null;
  gps: GpsSample | null;
  isActive: boolean;
  /** センサーフュージョンによるリアルタイムスリップアングル (°) */
  slipAngleDeg: number;
  /** ユーザー設定の閾値（省略時はデフォルト値） */
  thresholds?: DriftThresholds;
  /** 路面コンディション — WET 時は進入判定を緩和 */
  surfaceCondition?: SurfaceCondition;
};

export function useDriftDetection({
  motion,
  gps,
  isActive,
  slipAngleDeg,
  thresholds = DEFAULT_THRESHOLDS,
  surfaceCondition = 'dry',
}: UseDriftDetectionInput) {
  const [status, setStatus] = useState<DriftStatus>(INITIAL_DRIFT_STATUS);
  const replayRef = useRef<DriftReplayState>(createReplayState());

  const reset = useCallback(() => {
    replayRef.current = createReplayState();
    setStatus(INITIAL_DRIFT_STATUS);
  }, []);

  useEffect(() => {
    if (!isActive) {
      reset();
      return;
    }

    if (!motion) return;

    const result = processReplayFrame(
      replayRef.current,
      {
        nowMs: Date.now(),
        lateralG: motion.lateralG,
        yawRateRad: motion.yawRateRad,
        speedKmh: gps?.speedKmh ?? 0,
        slipAngleDeg,
      },
      thresholds,
      surfaceCondition,
    );

    replayRef.current = result.state;
    setStatus(result.status);
  }, [motion, gps, isActive, slipAngleDeg, thresholds, surfaceCondition, reset]);

  return { status, reset };
}
