/**
 * 角度（スリップ角）計測 — 端末 / ロガー能力に応じたチューニング
 */

import type { LoggerCapabilities } from '@/types/logger';

export type AngleTuningProfile = {
  /** GPS 方位・スリップ算出の最低速度 (km/h) */
  minSpeedKmh: number;
  /** 直進判定ヨーレート上限 (rad/s) — 以下で GPS ヘディング補正 */
  straightYawThresholdRad: number;
  /** GPS → bodyHeading 補正係数 (0–1) */
  gpsCorrectionAlpha: number;
  /** GPS 方位を信頼する最大精度 (m) */
  maxGpsHeadingAccuracyM: number;
  /** スリップ角カルマン Q（推定器出力） */
  slipKalmanQ: number;
  /** スリップ角カルマン R — スマホ融合 */
  slipKalmanRPhone: number;
  /** スリップ角カルマン R — ロガー直接出力 */
  slipKalmanRLogger: number;
  /** ロガー heading 由来スリップのブレンド比（0=スマホのみ） */
  loggerHeadingBlend: number;
};

export const DEFAULT_ANGLE_TUNING: AngleTuningProfile = {
  minSpeedKmh: 15,
  straightYawThresholdRad: 0.15,
  gpsCorrectionAlpha: 0.06,
  maxGpsHeadingAccuracyM: 18,
  slipKalmanQ: 3.5,
  slipKalmanRPhone: 2.25,
  slipKalmanRLogger: 0.2,
  loggerHeadingBlend: 0,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** LoggerCapabilities から角度計測チューニングを生成 */
export function buildAngleTuningFromCapabilities(
  caps: LoggerCapabilities,
): AngleTuningProfile {
  const base = { ...DEFAULT_ANGLE_TUNING };

  const phoneTierActive =
    caps.tier === 'phone' && caps.phonePerformanceTier != null;

  if (phoneTierActive && caps.phonePerformanceTier) {
    switch (caps.phonePerformanceTier) {
      case 'phone-high':
        base.gpsCorrectionAlpha = 0.03;
        base.slipKalmanRPhone = 1.4;
        base.slipKalmanQ = 4.2;
        base.straightYawThresholdRad = 0.18;
        base.minSpeedKmh = 14;
        break;
      case 'phone-standard':
        base.gpsCorrectionAlpha = 0.06;
        base.slipKalmanRPhone = 2.0;
        base.slipKalmanQ = 3.5;
        base.minSpeedKmh = 15;
        break;
      case 'phone-low':
        base.gpsCorrectionAlpha = 0.085;
        base.slipKalmanRPhone = 3.0;
        base.slipKalmanQ = 2.8;
        base.maxGpsHeadingAccuracyM = 12;
        base.minSpeedKmh = 18;
        break;
    }
  }

  if (caps.hasWheelSpeed || caps.hasHighRateGps) {
    base.minSpeedKmh = caps.accuracyGrade === 'race' ? 5 : 8;
    base.maxGpsHeadingAccuracyM = 30;
    base.gpsCorrectionAlpha = 0.1;
    base.loggerHeadingBlend = caps.hasHighRateGps ? 0.55 : 0.35;
  }

  if (caps.hasHighFidelityG) {
    base.straightYawThresholdRad = 0.2;
    base.gpsCorrectionAlpha = clamp(base.gpsCorrectionAlpha + 0.04, 0.04, 0.14);
  }

  if (caps.hasDirectSlipAngle) {
    base.loggerHeadingBlend = 0;
    base.slipKalmanRLogger =
      caps.accuracyGrade === 'race' ? 0.08
        : caps.accuracyGrade === 'high' ? 0.12
          : 0.18;
  }

  if (!phoneTierActive) {
    switch (caps.accuracyGrade) {
      case 'race':
        base.slipKalmanRPhone = 0.6;
        base.slipKalmanQ = 5;
        break;
      case 'high':
        base.slipKalmanRPhone = 1.0;
        base.slipKalmanQ = 4;
        break;
      case 'medium':
        base.slipKalmanRPhone = 1.6;
        base.maxGpsHeadingAccuracyM = 15;
        break;
      case 'low':
        base.slipKalmanRPhone = 2.8;
        base.maxGpsHeadingAccuracyM = 12;
        base.gpsCorrectionAlpha = 0.04;
        base.minSpeedKmh = 18;
        break;
    }

    if (caps.gSampleRateHz >= 25) {
      base.slipKalmanQ *= 1.15;
      base.slipKalmanRPhone *= 0.85;
    } else if (caps.gSampleRateHz < 12) {
      base.slipKalmanRPhone *= 1.2;
    }
  }

  return base;
}

/** UI 表示用 */
export function describeAngleTuning(tuning: AngleTuningProfile): string[] {
  const gpsDep =
    tuning.gpsCorrectionAlpha <= 0.035
      ? 'ジャイロ優先（GPS補正弱）'
      : tuning.gpsCorrectionAlpha >= 0.08
        ? 'GPS補正強（低Hz端末）'
        : 'GPS補正標準';

  return [
    `スリップ最低速度 ${tuning.minSpeedKmh} km/h`,
    `GPS方位信頼 ±${tuning.maxGpsHeadingAccuracyM} m 以内`,
    `GPS補正 α=${tuning.gpsCorrectionAlpha.toFixed(3)}（${gpsDep}）`,
    `カルマン R=${tuning.slipKalmanRPhone.toFixed(2)}（スマホ）`,
  ];
}
