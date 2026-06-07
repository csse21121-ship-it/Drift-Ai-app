/**
 * 端末プローブ結果 → センサー取得間隔・カルマン係数
 *
 * 高 Hz 端末ほどモーション間隔を短く、カルマン R を下げて追従を速く（タイト）にする。
 * 低精度端末は R を上げてスムージングを強める。
 */

import {
  G_FORCE_KALMAN_PARAMS,
  resolvePhoneTierKalmanR,
  scaleKalmanParamsForDt,
} from '@/lib/kalmanFilter';
import {
  buildAngleTuningFromCapabilities,
  DEFAULT_ANGLE_TUNING,
  describeAngleTuning,
  type AngleTuningProfile,
} from '@/lib/angleTuning';
import type { LoggerCapabilities } from '@/types/logger';
import type { PhonePerformanceTier } from '@/types/phoneSensor';

export type { AngleTuningProfile };
export { buildAngleTuningFromCapabilities, describeAngleTuning };

export type SensorTuningProfile = {
  motionIntervalMs: number;
  gpsTimeIntervalMs: number;
  gpsDistanceIntervalM: number;
  kalmanQ: number;
  kalmanR: number;
  angleTuning: AngleTuningProfile;
};

const BASE_MOTION_MS = 50;
const BASE_Q = G_FORCE_KALMAN_PARAMS.Q;
const BASE_R = G_FORCE_KALMAN_PARAMS.R;

export const DEFAULT_SENSOR_TUNING: SensorTuningProfile = {
  motionIntervalMs: BASE_MOTION_MS,
  gpsTimeIntervalMs: 500,
  gpsDistanceIntervalM: 1,
  kalmanQ: BASE_Q,
  kalmanR: BASE_R,
  angleTuning: DEFAULT_ANGLE_TUNING,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 60 Hz 以上が安定した高性能端末 — 16〜20 ms（50〜60 Hz）を許可 */
const HIGH_MOTION_HZ_THRESHOLD = 60;
const INTERVAL_MIN_STANDARD_MS = 25;
const INTERVAL_MIN_HIGH_PERF_MS = 16;
const INTERVAL_MAX_HIGH_PERF_MS = 20;

function resolveMotionIntervalMs(motionHz: number): number {
  if (motionHz <= 0) return BASE_MOTION_MS;
  const ideal = Math.round(1000 / motionHz);
  if (motionHz >= HIGH_MOTION_HZ_THRESHOLD) {
    return clamp(ideal, INTERVAL_MIN_HIGH_PERF_MS, INTERVAL_MAX_HIGH_PERF_MS);
  }
  return clamp(ideal, INTERVAL_MIN_STANDARD_MS, 100);
}

/** LoggerCapabilities（端末プローブ由来）からセンサーチューニングを生成 */
export function buildSensorTuningFromCapabilities(
  caps: LoggerCapabilities,
): SensorTuningProfile {
  const motionHz = caps.gSampleRateHz;
  const gpsHz = caps.gpsSampleRateHz;

  const motionIntervalMs = resolveMotionIntervalMs(motionHz);

  const tierBaseR = resolvePhoneTierKalmanR(
    caps.tier === 'phone' ? caps.phonePerformanceTier : undefined,
    BASE_R,
  );

  let rFactor = tierBaseR / BASE_R;

  if (caps.phonePerformanceTier == null) {
    if (motionHz >= 25) rFactor *= 0.72;
    else if (motionHz >= 18) rFactor *= 0.85;
    else if (motionHz < 12) rFactor *= 1.25;

    if (caps.accuracyGrade === 'medium') rFactor *= 0.88;
    else if (caps.accuracyGrade === 'low') rFactor *= 1.15;
  }

  let qFactor = 1.0;
  if (caps.phonePerformanceTier === 'phone-high') qFactor = 1.08;
  else if (caps.phonePerformanceTier === 'phone-low') qFactor = 0.92;

  const scaled = scaleKalmanParamsForDt(motionIntervalMs, BASE_Q, BASE_R);
  const kalmanQ = scaled.Q * qFactor;
  const kalmanR = scaled.R * rFactor;

  let gpsTimeIntervalMs = 500;
  if (gpsHz >= 5) gpsTimeIntervalMs = 200;
  else if (gpsHz >= 4) gpsTimeIntervalMs = 250;
  else if (gpsHz >= 2) gpsTimeIntervalMs = 500;
  else if (gpsHz >= 1) gpsTimeIntervalMs = 1000;

  const gpsDistanceIntervalM = gpsHz >= 2 ? 1 : 2;

  return {
    motionIntervalMs,
    gpsTimeIntervalMs,
    gpsDistanceIntervalM,
    kalmanQ,
    kalmanR,
    angleTuning: buildAngleTuningFromCapabilities(caps),
  };
}

/** UI 表示用 */
export function describeSensorTuning(
  tuning: SensorTuningProfile,
  phoneTier?: PhonePerformanceTier,
): string[] {
  const kRatio = tuning.kalmanQ / tuning.kalmanR;
  const tightness =
    kRatio >= 0.14 ? 'タイト（高追従）'
      : kRatio >= 0.10 ? '標準'
        : 'ルーズ（強スムージング）';

  const lines: string[] = [];
  if (phoneTier) {
    lines.push(`端末ティア ${phoneTier} に最適化`);
  }
  lines.push(
    `モーション間隔 ${tuning.motionIntervalMs} ms`,
    `GPS 間隔 ${tuning.gpsTimeIntervalMs} ms / ${tuning.gpsDistanceIntervalM} m`,
    `カルマン Q=${tuning.kalmanQ.toFixed(4)} R=${tuning.kalmanR.toFixed(3)}（${tightness}）`,
    ...describeAngleTuning(tuning.angleTuning),
  );
  return lines;
}
