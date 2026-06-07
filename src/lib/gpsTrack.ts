/**
 * GPS 走行軌跡 — 記録・再生ユーティリティ
 */

import { distanceMeters } from '@/lib/geofence';
import type { GeoPoint } from '@/types/course';
import type { TrackPoint } from '@/types/score';
import type { GpsSample } from '@/types/telemetry';

/** 冗長点を間引く最小距離 (m) */
const MIN_DIST_M = 3;
/** 冗長点を間引く最小時間 (ms) */
const MIN_DT_MS = 500;

/**
 * 新しい GPS サンプルを軌跡に追加するか判定し、追加する。
 * @returns 追加した場合 true
 */
export function appendTrackPoint(
  track: TrackPoint[],
  gps: GpsSample,
  sessionStartedAt: number,
): boolean {
  const tMs = Date.now() - sessionStartedAt;
  if (tMs < 0) return false;

  const point: TrackPoint = {
    tMs,
    latitude: gps.latitude,
    longitude: gps.longitude,
    speedKmh: gps.speedKmh,
  };

  const last = track[track.length - 1];
  if (last) {
    const dt = point.tMs - last.tMs;
    const dist = distanceMeters(last, point);
    if (dist < MIN_DIST_M && dt < MIN_DT_MS) return false;
  }

  track.push(point);
  return true;
}

/** 指定時刻の補間位置を返す */
export function interpolateTrackPoint(
  track: TrackPoint[],
  tMs: number,
): GeoPoint | null {
  if (track.length === 0) return null;
  if (tMs <= track[0].tMs) {
    return { latitude: track[0].latitude, longitude: track[0].longitude };
  }
  const last = track[track.length - 1];
  if (tMs >= last.tMs) {
    return { latitude: last.latitude, longitude: last.longitude };
  }

  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (tMs >= a.tMs && tMs <= b.tMs) {
      const span = b.tMs - a.tMs;
      const u = span > 0 ? (tMs - a.tMs) / span : 0;
      return {
        latitude: a.latitude + (b.latitude - a.latitude) * u,
        longitude: a.longitude + (b.longitude - a.longitude) * u,
      };
    }
  }
  return { latitude: last.latitude, longitude: last.longitude };
}

/** 再生ヘッドまでのポリライン座標 */
export function trackProgressCoords(track: TrackPoint[], tMs: number): GeoPoint[] {
  if (track.length === 0) return [];

  const coords: GeoPoint[] = [];
  for (const p of track) {
    if (p.tMs > tMs) break;
    coords.push({ latitude: p.latitude, longitude: p.longitude });
  }

  const head = interpolateTrackPoint(track, tMs);
  if (!head) return coords;

  if (coords.length === 0) {
    coords.push(head);
    return coords;
  }

  const tail = coords[coords.length - 1];
  if (distanceMeters(tail, head) >= 1) {
    coords.push(head);
  }
  return coords;
}

/** ドリフトイベント開始時刻 → 軌跡上の座標 */
export function driftEventCoord(
  track: TrackPoint[],
  eventStartedAt: number,
  sessionStartedAt: number,
): GeoPoint | null {
  return interpolateTrackPoint(track, eventStartedAt - sessionStartedAt);
}
