/**
 * 多様な JSON / CSV キー名を LoggerSample フィールドに正規化
 */

import type { LoggerSample } from '@/types/logger';

type SampleKey = keyof Pick<
  LoggerSample,
  | 'lateralG'
  | 'longitudinalG'
  | 'yawRateRad'
  | 'slipAngleDeg'
  | 'speedKmh'
  | 'heading'
  | 'latitude'
  | 'longitude'
>;

const FIELD_ALIASES: Record<SampleKey, string[]> = {
  lateralG: [
    'lateralG', 'lateral_g', 'latG', 'ay', 'accY', 'gForceY', 'g_y',
    'accelY', 'accelerationY', 'gLateral',
  ],
  longitudinalG: [
    'longitudinalG', 'longitudinal_g', 'lonG', 'ax', 'accX', 'gForceX', 'g_x',
    'accelX', 'accelerationX', 'gLong',
  ],
  yawRateRad: [
    'yawRateRad', 'yaw_rate', 'yawRate', 'gyroZ', 'rotZ', 'rotationZ',
    'yaw', 'rz',
  ],
  slipAngleDeg: [
    'slipAngleDeg', 'slip_angle', 'slipAngle', 'slip', 'beta', 'sideSlip',
  ],
  speedKmh: [
    'speedKmh', 'speed_kmh', 'speed', 'velocity', 'vel', 'gpsSpeed',
    'groundSpeed', 'spd',
  ],
  heading: [
    'heading', 'course', 'bearing', 'yawDeg', 'headingDeg', 'cog',
  ],
  latitude: ['latitude', 'lat', 'Latitude'],
  longitude: ['longitude', 'lon', 'lng', 'Longitude'],
};

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function pickField(
  record: Record<string, unknown>,
  key: SampleKey,
): number | undefined {
  for (const alias of FIELD_ALIASES[key]) {
    if (alias in record) {
      const n = toNumber(record[alias]);
      if (n != null) return n;
    }
  }
  return undefined;
}

/** 速度単位を km/h に正規化 */
function normalizeSpeedKmh(value: number, record: Record<string, unknown>): number {
  const unit = String(record.speedUnit ?? record.unit ?? record.speed_unit ?? '').toLowerCase();
  if (unit.includes('m/s') || unit === 'ms') return value * 3.6;
  if (unit.includes('kn') || unit.includes('knot')) return value * 1.852;
  if (value > 0 && value < 3.5) return value * 3.6;
  return value;
}

/** ヨーレートを rad/s に正規化（deg/s っぽい値は変換） */
function normalizeYawRateRad(value: number): number {
  if (Math.abs(value) > 6) return value * (Math.PI / 180);
  return value;
}

export function mapRecordToLoggerSample(
  record: Record<string, unknown>,
): LoggerSample | null {
  const sample: LoggerSample = { timestamp: Date.now() };

  const latG = pickField(record, 'lateralG');
  const lonG = pickField(record, 'longitudinalG');
  const yaw = pickField(record, 'yawRateRad');
  let speed = pickField(record, 'speedKmh');
  const slip = pickField(record, 'slipAngleDeg');
  const heading = pickField(record, 'heading');
  const latitude = pickField(record, 'latitude');
  const longitude = pickField(record, 'longitude');

  if (latG != null) sample.lateralG = latG;
  if (lonG != null) sample.longitudinalG = lonG;
  if (yaw != null) sample.yawRateRad = normalizeYawRateRad(yaw);
  if (speed != null) sample.speedKmh = normalizeSpeedKmh(speed, record);
  if (slip != null) sample.slipAngleDeg = slip;
  if (heading != null) sample.heading = heading;
  if (latitude != null) sample.latitude = latitude;
  if (longitude != null) sample.longitude = longitude;

  const hasData =
    sample.lateralG != null
    || sample.longitudinalG != null
    || sample.speedKmh != null
    || sample.slipAngleDeg != null
    || (sample.latitude != null && sample.longitude != null);

  return hasData ? sample : null;
}
