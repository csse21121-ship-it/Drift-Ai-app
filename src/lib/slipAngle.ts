/**
 * センサーフュージョン — スリップアングル推定
 *
 * GPS 進行方向 − 車体ヘディング（ジャイロ積分）= スリップアングル
 *
 * 強化ポイント:
 *   - GPS 速度 vs 加速度積分速度のクロスチェック（トンネル等で GPS 補正抑制）
 *   - ドリフト中は GPS ヘディング補正を弱めジャイロ優先
 *   - 直進中は GPS でジャイロ誤差を緩やかにゼロへ補正
 *   - セッション整合性スコア（ジャイロ軌跡 vs GPS）の蓄積
 */

import {
  DEFAULT_ANGLE_TUNING,
  type AngleTuningProfile,
} from '@/lib/angleTuning';
import { KalmanFilter1D } from '@/lib/kalmanFilter';
import type { SlipFusionConsistencySummary } from '@/types/telemetry';

export type { SlipFusionConsistencySummary };

const RAD_TO_DEG = 180 / Math.PI;
const G_MS2 = 9.80665;

/** ドリフト判定 — 横 G */
const DRIFT_LATERAL_G = 0.28;
/** ドリフト判定 — ヨーレート (rad/s) */
const DRIFT_YAW_RAD = 0.18;
/** 直進判定 — 横 G 上限 */
const STRAIGHT_LATERAL_G = 0.12;

/** GPS vs 積分速度 — 相対乖離上限 */
const SPEED_MISMATCH_REL = 0.38;
/** GPS vs 積分速度 — 絶対乖離上限 (km/h) */
const SPEED_MISMATCH_ABS_KMH = 30;
/** クロスチェックを有効にする最低 GPS 速度 (km/h) */
const MIN_SPEED_FOR_CROSSCHECK_KMH = 12;

function wrapTo360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function angleDiff(target: number, reference: number): number {
  let d = wrapTo360(target) - wrapTo360(reference);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** GPS 速度と加速度積分速度が一致しているか */
export function isGpsSpeedConsistent(
  gpsSpeedKmh: number,
  integratedSpeedKmh: number,
): boolean {
  if (gpsSpeedKmh < MIN_SPEED_FOR_CROSSCHECK_KMH) return true;
  const diff = Math.abs(gpsSpeedKmh - integratedSpeedKmh);
  const rel = diff / Math.max(gpsSpeedKmh, 12);
  return rel <= SPEED_MISMATCH_REL && diff <= SPEED_MISMATCH_ABS_KMH;
}

export type SlipMotionState = 'drift' | 'straight' | 'transitional';

export function classifySlipMotionState(
  lateralG: number,
  yawRateRad: number,
  speedKmh: number,
  straightYawThresholdRad: number,
  minSpeedKmh: number,
): SlipMotionState {
  if (
    Math.abs(lateralG) >= DRIFT_LATERAL_G &&
    Math.abs(yawRateRad) >= DRIFT_YAW_RAD
  ) {
    return 'drift';
  }
  if (
    Math.abs(lateralG) <= STRAIGHT_LATERAL_G &&
    Math.abs(yawRateRad) <= straightYawThresholdRad &&
    speedKmh >= minSpeedKmh
  ) {
    return 'straight';
  }
  return 'transitional';
}

export class SlipAngleEstimator {
  private tuning: AngleTuningProfile = DEFAULT_ANGLE_TUNING;
  private bodyHeading = 0;
  private initialized = false;
  private lastGyroAt = 0;
  private lastLateralG = 0;
  private lastLongitudinalG = 0;
  private integratedSpeedKmh = 0;
  private lastSpeedConsistent = true;
  private outputKalman = new KalmanFilter1D({
    Q: DEFAULT_ANGLE_TUNING.slipKalmanQ,
    R: DEFAULT_ANGLE_TUNING.slipKalmanRPhone,
  });

  private prevGpsHeading: number | null = null;
  private prevBodyHeading: number | null = null;
  private consistencyHeadingErrors: number[] = [];
  private straightSlipAbs: number[] = [];
  private speedCheckTotal = 0;
  private speedCheckFailed = 0;

  configure(tuning: AngleTuningProfile): void {
    this.tuning = tuning;
    this.outputKalman = new KalmanFilter1D({
      Q: tuning.slipKalmanQ,
      R: tuning.slipKalmanRPhone,
    });
  }

  /**
   * モーション更新 — ジャイロ積分・速度積分・ドリフト状態用 G 保持
   */
  updateMotion(
    longitudinalG: number,
    lateralG: number,
    yawRateRad: number,
    nowMs: number,
  ): void {
    this.lastLateralG = lateralG;
    this.lastLongitudinalG = longitudinalG;

    if (!this.initialized) {
      this.lastGyroAt = nowMs;
      return;
    }

    if (this.lastGyroAt > 0) {
      const dt = (nowMs - this.lastGyroAt) / 1000;
      if (dt > 0 && dt < 0.5) {
        this.bodyHeading = wrapTo360(
          this.bodyHeading + yawRateRad * dt * RAD_TO_DEG,
        );
        const accelMs2 = longitudinalG * G_MS2;
        this.integratedSpeedKmh = Math.max(
          0,
          this.integratedSpeedKmh + accelMs2 * dt * 3.6,
        );
      }
    }
    this.lastGyroAt = nowMs;
  }

  /** @deprecated updateMotion を使用 */
  updateGyro(yawRateRad: number, nowMs: number): void {
    this.updateMotion(this.lastLongitudinalG, this.lastLateralG, yawRateRad, nowMs);
  }

  /**
   * GPS 更新 — 速度クロスチェック + 走行状態に応じたヘディング補正
   *
   * gpsCorrectionAlpha は端末ティア（phone-high/standard/low）に応じて
   * angleTuning 経由で設定される。高 Hz 端末ほど α が小さくジャイロ優先。
   */
  updateGPS(
    gpsHeading: number,
    speedKmh: number,
    yawRateRad: number,
    accuracyM?: number,
  ): void {
    const acc = accuracyM ?? 0;
    const accuracyOk =
      acc <= 0 ||
      acc <= this.tuning.maxGpsHeadingAccuracyM;

    const speedConsistent = isGpsSpeedConsistent(
      speedKmh,
      this.integratedSpeedKmh,
    );
    this.lastSpeedConsistent = speedConsistent;

    if (speedKmh >= MIN_SPEED_FOR_CROSSCHECK_KMH) {
      this.speedCheckTotal += 1;
      if (!speedConsistent) this.speedCheckFailed += 1;
    }

    if (speedConsistent && speedKmh >= MIN_SPEED_FOR_CROSSCHECK_KMH) {
      this.integratedSpeedKmh =
        this.integratedSpeedKmh * 0.5 + speedKmh * 0.5;
    }

    if (speedKmh < this.tuning.minSpeedKmh) return;

    if (!this.initialized) {
      if (!accuracyOk || !speedConsistent) return;
      this.bodyHeading = gpsHeading;
      this.initialized = true;
      this.lastGyroAt = 0;
      this.prevGpsHeading = gpsHeading;
      this.prevBodyHeading = this.bodyHeading;
      return;
    }

    const gpsTrusted = accuracyOk && speedConsistent;
    const motionState = classifySlipMotionState(
      this.lastLateralG,
      yawRateRad,
      speedKmh,
      this.tuning.straightYawThresholdRad,
      this.tuning.minSpeedKmh,
    );

    if (gpsTrusted) {
      let alpha = 0;
      if (motionState === 'drift') {
        alpha = 0;
      } else if (motionState === 'straight') {
        alpha = this.tuning.gpsCorrectionAlpha;
      } else {
        alpha = this.tuning.gpsCorrectionAlpha * 0.25;
      }

      if (alpha > 0) {
        const diff = angleDiff(gpsHeading, this.bodyHeading);
        this.bodyHeading = wrapTo360(this.bodyHeading + alpha * diff);
      }
    }

    this.recordConsistencySample(gpsHeading, speedKmh, gpsTrusted, motionState);

    this.prevGpsHeading = gpsHeading;
    this.prevBodyHeading = this.bodyHeading;
  }

  getSlipAngle(gpsHeading: number, speedKmh: number): number {
    if (!this.initialized || speedKmh < this.tuning.minSpeedKmh) {
      const decayed = this.outputKalman.value * 0.9;
      this.outputKalman.reset(decayed, 1);
      return Math.abs(decayed) < 0.3 ? 0 : decayed;
    }

    const raw = angleDiff(gpsHeading, this.bodyHeading);
    const filtered = this.outputKalman.update(raw);

    const isDrifting =
      Math.abs(this.lastLateralG) >= DRIFT_LATERAL_G;

    if (isDrifting) {
      return raw * 0.62 + filtered * 0.38;
    }

    return filtered;
  }

  getConsistencySummary(): SlipFusionConsistencySummary {
    const meanHeadingErr = mean(this.consistencyHeadingErrors);
    const meanStraightSlip = mean(this.straightSlipAbs);
    const speedMismatchRate =
      this.speedCheckTotal > 0
        ? this.speedCheckFailed / this.speedCheckTotal
        : 0;

    let score =
      100 -
      meanHeadingErr * 2.2 -
      meanStraightSlip * 1.5 -
      speedMismatchRate * 35;
    score = clamp(score, 0, 100);

    return {
      consistencyScore: Math.round(score * 10) / 10,
      meanHeadingErrorDeg: Math.round(meanHeadingErr * 10) / 10,
      meanStraightSlipAbsDeg: Math.round(meanStraightSlip * 10) / 10,
      speedMismatchRate: Math.round(speedMismatchRate * 1000) / 1000,
      consistencySamples: this.consistencyHeadingErrors.length,
    };
  }

  getBodyHeading(): number {
    return this.bodyHeading;
  }

  getIntegratedSpeedKmh(): number {
    return this.integratedSpeedKmh;
  }

  wasLastSpeedConsistent(): boolean {
    return this.lastSpeedConsistent;
  }

  get isReady(): boolean {
    return this.initialized;
  }

  reset(): void {
    this.bodyHeading = 0;
    this.initialized = false;
    this.lastGyroAt = 0;
    this.lastLateralG = 0;
    this.lastLongitudinalG = 0;
    this.integratedSpeedKmh = 0;
    this.lastSpeedConsistent = true;
    this.outputKalman.reset();
    this.prevGpsHeading = null;
    this.prevBodyHeading = null;
    this.consistencyHeadingErrors = [];
    this.straightSlipAbs = [];
    this.speedCheckTotal = 0;
    this.speedCheckFailed = 0;
  }

  private recordConsistencySample(
    gpsHeading: number,
    speedKmh: number,
    gpsTrusted: boolean,
    motionState: SlipMotionState,
  ): void {
    if (!this.initialized || speedKmh < this.tuning.minSpeedKmh) return;

    const slipRaw = angleDiff(gpsHeading, this.bodyHeading);

    if (gpsTrusted && motionState === 'straight') {
      this.straightSlipAbs.push(Math.abs(slipRaw));
      this.consistencyHeadingErrors.push(Math.abs(slipRaw));
    }

    if (
      this.prevGpsHeading != null &&
      this.prevBodyHeading != null &&
      gpsTrusted &&
      motionState !== 'drift'
    ) {
      const gpsDelta = angleDiff(gpsHeading, this.prevGpsHeading);
      const bodyDelta = angleDiff(this.bodyHeading, this.prevBodyHeading);
      this.consistencyHeadingErrors.push(
        Math.abs(angleDiff(gpsDelta, bodyDelta)),
      );
    }
  }
}
