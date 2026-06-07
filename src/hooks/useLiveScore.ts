import { useEffect, useMemo, useState } from 'react';
import { calcLiveScore } from '@/lib/scoring';
import type { ScoringProfile } from '@/types/course';
import type { DriftEvent, DriftStatus } from '@/types/drift';
import type { ZoneCrossing } from '@/types/score';

type UseLiveScoreInput = {
  isActive: boolean;
  driftStatus: DriftStatus;
  activeSpeedKmh: number;
  activeZoneMultiplier?: number;
  zoneCrossings?: ZoneCrossing[];
  sessionStartedAt?: number;
  profile?: ScoringProfile;
  /** セッション中の更新間隔 (ms)。0 で無効 */
  refreshMs?: number;
};

/**
 * セッション中のリアルタイムスコアを計算する。
 * 100ms ごとに tick し、ドリフト継続時間・プレビューポイントを滑らかに更新する。
 */
export function useLiveScore({
  isActive,
  driftStatus,
  activeSpeedKmh,
  activeZoneMultiplier,
  zoneCrossings,
  sessionStartedAt,
  profile,
  refreshMs = 100,
}: UseLiveScoreInput) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isActive || refreshMs <= 0) return;
    const id = setInterval(() => setTick((t) => t + 1), refreshMs);
    return () => clearInterval(id);
  }, [isActive, refreshMs]);

  return useMemo(
    () =>
      calcLiveScore(
        driftStatus.events,
        driftStatus.phase === 'active',
        driftStatus.activeDurationMs,
        driftStatus.activePeakLateralG,
        activeSpeedKmh,
        driftStatus.activeSlipAngleDeg,
        activeZoneMultiplier,
        zoneCrossings,
        sessionStartedAt,
        profile,
        driftStatus.activeStartedAt,
        Date.now(),
      ),
    [
      driftStatus.events,
      driftStatus.phase,
      driftStatus.activeDurationMs,
      driftStatus.activePeakLateralG,
      driftStatus.activeSlipAngleDeg,
      driftStatus.activeStartedAt,
      activeSpeedKmh,
      activeZoneMultiplier,
      zoneCrossings,
      sessionStartedAt,
      profile,
      tick,
    ],
  );
}
