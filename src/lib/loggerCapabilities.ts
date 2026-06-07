/**
 * ロガー性能に応じた採点・閾値の自動調整
 *
 * 高精度センサーほどノイズが少ないため閾値を適正化し、
 * 直接計測できる項目に応じてスコアリングプロファイルを補正する。
 */

import type { ScoringProfile } from '@/types/course';
import { DEFAULT_SCORING_PROFILE } from '@/types/course';
import type {
  LoggerCapabilities,
  LoggerDevice,
  TelemetrySourceMetadata,
} from '@/types/logger';
import { PHONE_CAPABILITIES } from '@/types/logger';
import type { DriftThresholds } from '@/types/settings';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** ユーザー閾値 × ロガー/端末能力 → 実効閾値 */
export function applyLoggerToThresholds(
  base: DriftThresholds,
  caps: LoggerCapabilities,
): DriftThresholds {
  if (caps.tier === 'phone') {
    switch (caps.phonePerformanceTier) {
      case 'phone-high':
        return {
          ...base,
          minSpeedKmh: base.minSpeedKmh + 1,
        };
      case 'phone-standard':
        return {
          ...base,
          minSpeedKmh: base.minSpeedKmh + 1,
        };
      case 'phone-low':
        return {
          ...base,
          enterLateralG: clamp(base.enterLateralG * 1.06, 0.15, 0.6),
          enterYawRate: clamp(base.enterYawRate * 1.05, 0.1, 0.5),
          minSpeedKmh: base.minSpeedKmh + 2,
        };
      default:
        break;
    }

    if (caps.accuracyGrade === 'low') {
      return {
        ...base,
        enterLateralG: clamp(base.enterLateralG * 1.05, 0.15, 0.6),
        enterYawRate:  clamp(base.enterYawRate * 1.04, 0.1, 0.5),
        minSpeedKmh:   base.minSpeedKmh + 2,
      };
    }
    if (caps.accuracyGrade === 'medium' && !caps.hasWheelSpeed) {
      return {
        ...base,
        minSpeedKmh: base.minSpeedKmh + 1,
      };
    }
    return base;
  }

  let enterGFactor = 1.0;
  let exitGFactor = 1.0;
  let yawFactor = 1.0;
  let minSpeed = base.minSpeedKmh;

  if (caps.hasHighFidelityG) {
    enterGFactor *= 0.92;
    exitGFactor *= 0.90;
    yawFactor *= 0.93;
  }
  if (caps.hasWheelSpeed) {
    minSpeed = Math.max(15, base.minSpeedKmh - 3);
  }
  if (caps.hasDirectSlipAngle) {
    enterGFactor *= 0.95;
  }

  return {
    enterLateralG: clamp(base.enterLateralG * enterGFactor, 0.15, 0.6),
    exitLateralG:  clamp(base.exitLateralG * exitGFactor, 0.08, 0.35),
    enterYawRate:  clamp(base.enterYawRate * yawFactor, 0.1, 0.5),
    exitYawRate:   clamp(base.exitYawRate * yawFactor, 0.05, 0.25),
    minSpeedKmh:   minSpeed,
  };
}

/** コースプロファイル × ロガー能力 → 実効採点プロファイル */
export function applyLoggerToScoringProfile(
  base: ScoringProfile | undefined,
  caps: LoggerCapabilities,
): ScoringProfile {
  const p = base ?? DEFAULT_SCORING_PROFILE;

  if (caps.tier === 'phone') {
    let angleScaleDeg = p.angleScaleDeg;
    let gradientCompensation = p.gradientCompensation;
    let comboWindowMs = p.comboWindowMs;

    switch (caps.phonePerformanceTier) {
      case 'phone-high':
        angleScaleDeg = Math.round(angleScaleDeg * 1.02);
        break;
      case 'phone-standard':
        angleScaleDeg = Math.round(angleScaleDeg * 1.04);
        break;
      case 'phone-low':
        angleScaleDeg = Math.round(angleScaleDeg * 1.12);
        gradientCompensation = clamp(gradientCompensation - 0.05, 0.5, 1.0);
        comboWindowMs = Math.round(comboWindowMs * 0.92);
        break;
      default:
        if (caps.accuracyGrade === 'low') {
          angleScaleDeg = Math.round(angleScaleDeg * 1.10);
          gradientCompensation = clamp(gradientCompensation - 0.04, 0.5, 1.0);
        } else if (caps.accuracyGrade === 'medium') {
          angleScaleDeg = Math.round(angleScaleDeg * 1.04);
        }
        break;
    }

    if (!caps.hasHighRateGps && caps.gpsSampleRateHz < 2) {
      comboWindowMs = Math.round(comboWindowMs * 0.90);
    }

    return { ...p, angleScaleDeg, gradientCompensation, comboWindowMs };
  }

  let angleScaleDeg = p.angleScaleDeg;
  let gradientCompensation = p.gradientCompensation;
  let comboWindowMs = p.comboWindowMs;
  let speedReferenceKmh = p.speedReferenceKmh;

  if (caps.hasDirectSlipAngle) {
    angleScaleDeg = Math.round(angleScaleDeg * 0.88);
  } else if (caps.hasHighFidelityG) {
    angleScaleDeg = Math.round(angleScaleDeg * 0.94);
  }

  if (caps.hasHighFidelityG) {
    gradientCompensation = clamp(gradientCompensation + 0.06, 0.5, 1.0);
  }

  if (caps.hasHighRateGps || caps.hasWheelSpeed) {
    comboWindowMs = Math.round(comboWindowMs * 1.12);
  }

  if (caps.hasWheelSpeed && caps.tier === 'pro') {
    speedReferenceKmh = Math.round(speedReferenceKmh * 1.05);
  }

  return {
    ...p,
    angleScaleDeg,
    gradientCompensation,
    comboWindowMs,
    speedReferenceKmh,
  };
}

/** 採点調整の説明文（UI 用） */
export function describeScoringAdjustments(caps: LoggerCapabilities): string[] {
  if (caps.tier === 'phone') {
    const tier = caps.phonePerformanceTier;
    const notes = [
      `スマホ内蔵センサー (${caps.gSampleRateHz}Hz G / ${caps.gpsSampleRateHz}Hz GPS)`,
    ];

    if (tier === 'phone-high') {
      notes.push('phone-high → 厳密採点 · タイトカルマン · ジャイロ優先');
    } else if (tier === 'phone-standard') {
      notes.push('phone-standard → 標準採点 · 推定スリップ角補正');
    } else if (tier === 'phone-low') {
      notes.push('phone-low → 採点緩和 · 強スムージング · ノイズ誤減点防止');
    } else if (caps.accuracyGrade === 'low') {
      notes.push('低精度端末 → 検知閾値・採点を緩和');
    } else if (caps.accuracyGrade === 'medium') {
      notes.push('中精度端末 → 推定スリップ角向け採点補正');
    }

    if (caps.hasWheelSpeed) {
      notes.push('GPS 速度信頼性良好');
    }
    if (!caps.hasHighRateGps && caps.gpsSampleRateHz < 2) {
      notes.push('GPS 低レート → コンボ窓を短縮');
    }
    return notes;
  }

  const notes: string[] = [];

  if (caps.hasHighFidelityG) {
    notes.push('高精度 G → 傾斜補正緩和・検知閾値最適化');
  }
  if (caps.hasDirectSlipAngle) {
    notes.push('直接スリップ角 → アングルボーナス基準を適正化');
  }
  if (caps.hasWheelSpeed) {
    notes.push('高精度速度 → 速度ボーナス・最低速度判定を改善');
  }
  if (caps.hasHighRateGps) {
    notes.push('高レート GPS → コンボ判定窓を拡大');
  }

  return notes.length > 0 ? notes : ['ロガー計測を優先'];
}

/** セッション保存用メタデータ */
export function buildTelemetrySourceMeta(
  device: LoggerDevice | null,
  caps: LoggerCapabilities,
): TelemetrySourceMetadata {
  const primary =
    caps.tier === 'phone'
      ? 'phone'
      : caps.hasHighFidelityG || caps.hasDirectSlipAngle
        ? 'hybrid'
        : 'logger';

  return {
    primary,
    loggerName: device?.name,
    loggerModel: device?.model,
    tier: caps.tier,
    accuracyGrade: caps.accuracyGrade,
    phonePerformanceTier: caps.phonePerformanceTier,
    scoringAdjustments: describeScoringAdjustments(caps),
  };
}

export function resolveCapabilities(
  device: LoggerDevice | null,
  phoneCaps?: LoggerCapabilities,
): LoggerCapabilities {
  if (device != null) return device.capabilities;
  return phoneCaps ?? PHONE_CAPABILITIES;
}
