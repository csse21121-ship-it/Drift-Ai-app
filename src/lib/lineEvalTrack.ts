/**
 * 理想ライン評価専用 GPS 軌跡 — ロガー優先・精度フィルタ
 */

import { distanceMeters } from '@/lib/geofence';
import type { LoggerCapabilities } from '@/types/logger';
import type { LoggerSample } from '@/types/logger';
import type { TrackPoint } from '@/types/score';
import type { GpsSample } from '@/types/telemetry';

/** スマホ GPS — これより精度が悪い点は理想ライン評価から除外 */
export const LINE_EVAL_MAX_ACCURACY_PHONE_M = 18;
/** ロガー GPS — 推定精度上限 */
export const LINE_EVAL_MAX_ACCURACY_LOGGER_M = 8;

const LOGGER_MIN_DIST_M = 1.5;
const LOGGER_MIN_DT_MS = 200;
const PHONE_MIN_DIST_M = 3;
const PHONE_MIN_DT_MS = 500;

export type LineEvalTrackInput = {
  latitude: number;
  longitude: number;
  speedKmh?: number;
  accuracyM: number;
  gpsSource: 'phone' | 'logger';
};

export type LineEvalTrackStats = {
  rejected: number;
  gpsSource: 'phone' | 'logger' | 'mixed';
};

/** ロガーティアから推定 GPS 精度 (m) */
export function assumedLoggerAccuracyM(caps: LoggerCapabilities): number {
  switch (caps.accuracyGrade) {
    case 'race': return 1.5;
    case 'high': return 2.5;
    case 'medium': return 4;
    default: return 6;
  }
}

/** ロガー座標が理想ライン評価に使えるか */
export function loggerHasLineEvalCoords(
  sample: LoggerSample | null,
  caps: LoggerCapabilities,
): sample is LoggerSample & { latitude: number; longitude: number } {
  if (!sample || !caps.hasHighRateGps) return false;
  return (
    Number.isFinite(sample.latitude) &&
    Number.isFinite(sample.longitude)
  );
}

/** 理想ライン評価用の1点を組み立て（ロガー GPS 優先） */
export function buildLineEvalTrackInput(
  phoneGps: GpsSample | null,
  loggerSample: LoggerSample | null,
  caps: LoggerCapabilities,
): LineEvalTrackInput | null {
  if (loggerHasLineEvalCoords(loggerSample, caps)) {
    return {
      latitude: loggerSample.latitude,
      longitude: loggerSample.longitude,
      speedKmh: loggerSample.speedKmh ?? phoneGps?.speedKmh,
      accuracyM: assumedLoggerAccuracyM(caps),
      gpsSource: 'logger',
    };
  }

  if (!phoneGps) return null;

  return {
    latitude: phoneGps.latitude,
    longitude: phoneGps.longitude,
    speedKmh: phoneGps.speedKmh,
    accuracyM: phoneGps.accuracy > 0 ? phoneGps.accuracy : 25,
    gpsSource: 'phone',
  };
}

/**
 * 理想ライン評価専用軌跡へ追記。
 * ロガーは高レート・短間隔、スマホは通常間隔。
 */
export function appendLineEvalTrackPoint(
  track: TrackPoint[],
  input: LineEvalTrackInput,
  sessionStartedAt: number,
): boolean {
  const tMs = Date.now() - sessionStartedAt;
  if (tMs < 0) return false;

  const minDist = input.gpsSource === 'logger' ? LOGGER_MIN_DIST_M : PHONE_MIN_DIST_M;
  const minDt = input.gpsSource === 'logger' ? LOGGER_MIN_DT_MS : PHONE_MIN_DT_MS;

  const point: TrackPoint = {
    tMs,
    latitude: input.latitude,
    longitude: input.longitude,
    speedKmh: input.speedKmh,
    accuracyM: input.accuracyM,
    gpsSource: input.gpsSource,
  };

  const last = track[track.length - 1];
  if (last) {
    const dt = point.tMs - last.tMs;
    const dist = distanceMeters(last, point);
    if (dist < minDist && dt < minDt) return false;
  }

  track.push(point);
  return true;
}

function isAccuracyAcceptable(pt: TrackPoint): boolean {
  const acc = pt.accuracyM;
  if (acc == null || !Number.isFinite(acc)) return false;

  if (pt.gpsSource === 'logger') {
    return acc <= LINE_EVAL_MAX_ACCURACY_LOGGER_M;
  }
  return acc <= LINE_EVAL_MAX_ACCURACY_PHONE_M;
}

/** 精度フィルタ — 悪い GPS 点を理想ライン評価から除外 */
export function filterTrackForLineEval(track: TrackPoint[]): {
  filtered: TrackPoint[];
  stats: LineEvalTrackStats;
} {
  const filtered: TrackPoint[] = [];
  let rejected = 0;
  let loggerCount = 0;
  let phoneCount = 0;

  for (const pt of track) {
    if (!isAccuracyAcceptable(pt)) {
      rejected++;
      continue;
    }
    filtered.push(pt);
    if (pt.gpsSource === 'logger') loggerCount++;
    else phoneCount++;
  }

  let gpsSource: LineEvalTrackStats['gpsSource'] = 'phone';
  if (loggerCount > 0 && phoneCount > 0) gpsSource = 'mixed';
  else if (loggerCount > 0) gpsSource = 'logger';

  return { filtered, stats: { rejected, gpsSource } };
}
