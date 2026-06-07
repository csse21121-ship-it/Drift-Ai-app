/**
 * スマホテレメトリと外部ロガーサンプルの融合
 */

import type { LoggerCapabilities, LoggerDevice, LoggerSample } from '@/types/logger';
import type { GpsSample, MotionSample } from '@/types/telemetry';

type PhoneTelemetryInput = {
  motion: MotionSample | null;
  gps: GpsSample | null;
  slipAngleDeg: number;
};

/** スマホ計測からロガー品質相当のサンプルを合成（モック / フォールバック） */
export function synthesizeLoggerSample(
  device: LoggerDevice,
  phone: PhoneTelemetryInput,
): LoggerSample | null {
  const { motion, gps, slipAngleDeg } = phone;
  const caps = device.capabilities;
  const ts = Date.now();

  if (!motion && !gps) return null;

  const sample: LoggerSample = { timestamp: ts };

  if (caps.hasHighFidelityG && motion) {
    sample.lateralG = motion.lateralG;
    sample.longitudinalG = motion.longitudinalG;
    sample.yawRateRad = motion.yawRateRad;
  }

  if (caps.hasWheelSpeed && gps) {
    sample.speedKmh = gps.speedKmh;
    sample.heading = gps.heading;
  }

  if (caps.hasHighRateGps && gps) {
    sample.latitude = gps.latitude;
    sample.longitude = gps.longitude;
    sample.speedKmh = gps.speedKmh;
    sample.heading = gps.heading;
  }

  if (caps.hasDirectSlipAngle) {
    sample.slipAngleDeg = slipAngleDeg;
  }

  return sample;
}

/** ロガーサンプルをスマホ Motion/GPS に反映 */
export function mergeMotionSample(
  phone: MotionSample | null,
  sample: LoggerSample | null,
  caps: LoggerCapabilities,
): MotionSample | null {
  if (!phone) return null;
  if (!sample || !caps.hasHighFidelityG) return phone;

  return {
    ...phone,
    lateralG: sample.lateralG ?? phone.lateralG,
    longitudinalG: sample.longitudinalG ?? phone.longitudinalG,
    yawRateRad: sample.yawRateRad ?? phone.yawRateRad,
  };
}

export function mergeGpsSample(
  phone: GpsSample | null,
  sample: LoggerSample | null,
  caps: LoggerCapabilities,
): GpsSample | null {
  if (!phone) return null;
  if (!sample || (!caps.hasWheelSpeed && !caps.hasHighRateGps)) return phone;

  return {
    ...phone,
    speedKmh: sample.speedKmh ?? phone.speedKmh,
    heading: sample.heading ?? phone.heading,
    latitude: sample.latitude ?? phone.latitude,
    longitude: sample.longitude ?? phone.longitude,
  };
}

export function mergeSlipAngle(
  phoneSlip: number,
  sample: LoggerSample | null,
  caps: LoggerCapabilities,
): number {
  if (caps.hasDirectSlipAngle && sample?.slipAngleDeg != null) {
    return sample.slipAngleDeg;
  }
  return phoneSlip;
}

/** BLE ロガーから直接取得したサンプルを優先するか */
export function shouldUseLoggerSample(
  caps: LoggerCapabilities,
  sample: LoggerSample | null,
): boolean {
  if (!sample) return false;
  return (
    caps.tier !== 'phone'
    && (caps.hasHighFidelityG || caps.hasWheelSpeed || caps.hasDirectSlipAngle)
  );
}
