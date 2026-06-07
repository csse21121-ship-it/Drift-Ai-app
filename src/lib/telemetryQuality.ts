/**
 * 計測品質スコア（Quality Score）
 *
 * GPS 精度・モーション Hz・キャリブ・姿勢安定性を総合評価（0–100）。
 */

import { isCalibrated } from '@/lib/calibration';
import type { CalibrationData } from '@/lib/calibration';
import type { MountOrientation } from '@/lib/orientation';
import type {
  SessionQualitySummary,
  TelemetryQualitySnapshot,
} from '@/types/telemetry';

export type { SessionQualitySummary, TelemetryQualitySnapshot };

export type QualityTier = TelemetryQualitySnapshot['tier'];

/** この値未満の平均品質は「参考値」扱い */
export const QUALITY_REFERENCE_THRESHOLD = 50;

const METRICS_WINDOW_MS = 3000;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function tierFromQualityScore(score: number): QualityTier {
  if (score >= 75) return 'high';
  if (score >= QUALITY_REFERENCE_THRESHOLD) return 'medium';
  return 'low';
}

export function qualityTierLabel(tier: QualityTier): string {
  switch (tier) {
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MED';
    default:
      return 'LOW';
  }
}

export function scoreGpsAccuracy(accuracyM: number): number {
  if (accuracyM <= 0) return 68;
  if (accuracyM <= 8) return 100;
  if (accuracyM <= 15) return 86;
  if (accuracyM <= 25) return 68;
  if (accuracyM <= 40) return 42;
  return 18;
}

function scoreMotionHz(effectiveHz: number, targetHz: number): number {
  if (effectiveHz <= 0 && targetHz <= 0) return 50;
  const ref = targetHz > 0 ? targetHz : 20;
  const hz = effectiveHz > 0 ? effectiveHz : ref * 0.6;
  const ratio = hz / ref;
  return clamp(Math.round(ratio * 92), 22, 100);
}

function scoreCalibration(cal: CalibrationData): number {
  return isCalibrated(cal) ? 100 : 52;
}

function scoreOrientation(
  orientation: MountOrientation,
  unstable: boolean,
): number {
  if (orientation === 'unknown') return 22;
  if (unstable) return 44;
  return 100;
}

export type TelemetryQualityInput = {
  gpsAccuracyM: number;
  effectiveMotionHz: number;
  targetMotionHz: number;
  calibration: CalibrationData;
  mountOrientation: MountOrientation;
  mountOrientationUnstable: boolean;
};

/** 瞬時の計測品質スナップショットを算出 */
export function computeTelemetryQuality(
  input: TelemetryQualityInput,
): TelemetryQualitySnapshot {
  const gpsScore = scoreGpsAccuracy(input.gpsAccuracyM);
  const motionHzScore = scoreMotionHz(
    input.effectiveMotionHz,
    input.targetMotionHz,
  );
  const calibrationScore = scoreCalibration(input.calibration);
  const orientationScore = scoreOrientation(
    input.mountOrientation,
    input.mountOrientationUnstable,
  );

  const score = Math.round(
    gpsScore * 0.30 +
    motionHzScore * 0.25 +
    calibrationScore * 0.20 +
    orientationScore * 0.25,
  );

  const clamped = clamp(score, 0, 100);

  return {
    score: clamped,
    tier: tierFromQualityScore(clamped),
    gpsScore,
    motionHzScore,
    calibrationScore,
    orientationScore,
    effectiveMotionHz: Math.round(input.effectiveMotionHz * 10) / 10,
  };
}

/** セッション中の品質サンプル蓄積 + 実効 Hz 推定 */
export class TelemetryQualityTracker {
  private motionTimestamps: number[] = [];
  private scoreSum = 0;
  private sampleCount = 0;

  reset(): void {
    this.motionTimestamps = [];
    this.scoreSum = 0;
    this.sampleCount = 0;
  }

  recordMotionTimestamp(timestampMs: number): void {
    this.motionTimestamps.push(timestampMs);
    const cutoff = timestampMs - METRICS_WINDOW_MS;
    while (
      this.motionTimestamps.length > 0 &&
      this.motionTimestamps[0] < cutoff
    ) {
      this.motionTimestamps.shift();
    }
  }

  getEffectiveMotionHz(): number {
    const ts = this.motionTimestamps;
    if (ts.length < 2) return 0;
    let sumDelta = 0;
    for (let i = 1; i < ts.length; i++) {
      sumDelta += ts[i] - ts[i - 1];
    }
    const avgDeltaMs = sumDelta / (ts.length - 1);
    return avgDeltaMs > 0 ? 1000 / avgDeltaMs : 0;
  }

  recordScore(score: number): void {
    this.scoreSum += score;
    this.sampleCount += 1;
  }

  getSessionSummary(): SessionQualitySummary {
    const averageScore =
      this.sampleCount > 0
        ? Math.round((this.scoreSum / this.sampleCount) * 10) / 10
        : 0;
    const tier = tierFromQualityScore(averageScore);
    return {
      averageScore,
      tier,
      sampleCount: this.sampleCount,
      isReferenceOnly:
        this.sampleCount > 0 &&
        averageScore < QUALITY_REFERENCE_THRESHOLD,
    };
  }
}
