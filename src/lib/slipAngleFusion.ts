/**
 * スリップ角のロガー融合 — 直接出力 / 高レート heading / ヨーレート補正
 */

import {
  DEFAULT_ANGLE_TUNING,
  type AngleTuningProfile,
} from '@/lib/angleTuning';
import { KalmanFilter1D } from '@/lib/kalmanFilter';
import type { LoggerCapabilities, LoggerSample } from '@/types/logger';
import type { GpsSample } from '@/types/telemetry';

const RAD_TO_DEG = 180 / Math.PI;

function wrapTo360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function angleDiff(target: number, reference: number): number {
  let d = wrapTo360(target) - wrapTo360(reference);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export type SlipFusionInput = {
  phoneSlip: number;
  gps: GpsSample | null;
  loggerSample: LoggerSample | null;
  caps: LoggerCapabilities;
  tuning?: AngleTuningProfile;
};

/** ロガー / スマホスリップ角の融合エンジン（セッション単位で保持） */
export class SlipAngleFusion {
  private tuning: AngleTuningProfile = DEFAULT_ANGLE_TUNING;
  private phoneKalman = new KalmanFilter1D({
    Q: DEFAULT_ANGLE_TUNING.slipKalmanQ,
    R: DEFAULT_ANGLE_TUNING.slipKalmanRPhone,
  });
  private loggerKalman = new KalmanFilter1D({
    Q: DEFAULT_ANGLE_TUNING.slipKalmanQ,
    R: DEFAULT_ANGLE_TUNING.slipKalmanRLogger,
  });
  private loggerBodyHeading = 0;
  private loggerHeadingReady = false;
  private lastLoggerYawAt = 0;

  configure(tuning: AngleTuningProfile): void {
    this.tuning = tuning;
    this.phoneKalman = new KalmanFilter1D({
      Q: tuning.slipKalmanQ,
      R: tuning.slipKalmanRPhone,
    });
    this.loggerKalman = new KalmanFilter1D({
      Q: tuning.slipKalmanQ,
      R: tuning.slipKalmanRLogger,
    });
  }

  reset(): void {
    this.loggerBodyHeading = 0;
    this.loggerHeadingReady = false;
    this.lastLoggerYawAt = 0;
    this.phoneKalman.reset();
    this.loggerKalman.reset();
  }

  private integrateLoggerYaw(yawRateRad: number, timestampMs: number): void {
    if (!this.loggerHeadingReady) return;

    if (this.lastLoggerYawAt > 0) {
      const dt = (timestampMs - this.lastLoggerYawAt) / 1000;
      if (dt > 0 && dt < 0.3) {
        this.loggerBodyHeading = wrapTo360(
          this.loggerBodyHeading + yawRateRad * dt * RAD_TO_DEG,
        );
      }
    }
    this.lastLoggerYawAt = timestampMs;
  }

  private slipFromLoggerHeading(
    heading: number,
    speedKmh: number,
  ): number | null {
    if (speedKmh < this.tuning.minSpeedKmh) return null;

    if (!this.loggerHeadingReady) {
      this.loggerBodyHeading = heading;
      this.loggerHeadingReady = true;
      this.lastLoggerYawAt = 0;
      return 0;
    }

    return angleDiff(heading, this.loggerBodyHeading);
  }

  fuse(input: SlipFusionInput): number {
    const tuning = input.tuning ?? this.tuning;
    const { phoneSlip, gps, loggerSample, caps } = input;
    const sample = loggerSample;

    if (caps.hasDirectSlipAngle && sample?.slipAngleDeg != null) {
      return this.loggerKalman.update(sample.slipAngleDeg);
    }

    // スマホ単体: 推定器内カルマン済み — 二重平滑化を避ける
    let candidate = caps.tier === 'phone'
      ? phoneSlip
      : this.phoneKalman.update(phoneSlip);

    if (!sample || caps.tier === 'phone') {
      return candidate;
    }

    if (caps.hasHighFidelityG && sample.yawRateRad != null) {
      this.integrateLoggerYaw(sample.yawRateRad, sample.timestamp);
    }

    const heading = sample.heading ?? gps?.heading;
    const speedKmh = sample.speedKmh ?? gps?.speedKmh ?? 0;

    if (
      heading != null &&
      Number.isFinite(heading) &&
      (caps.hasHighRateGps || caps.hasWheelSpeed)
    ) {
      const loggerSlip = this.slipFromLoggerHeading(heading, speedKmh);
      if (loggerSlip != null && tuning.loggerHeadingBlend > 0) {
        const refined = this.loggerKalman.update(loggerSlip);
        candidate =
          tuning.loggerHeadingBlend * refined +
          (1 - tuning.loggerHeadingBlend) * candidate;
      }
    }

    return candidate;
  }
}
