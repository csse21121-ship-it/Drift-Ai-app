/**
 * 走行ログからコリドー理想ラインを再学習（コース定義の GPS 誤差を低減）
 */

import { distanceMeters, isInScoringZone, simplifyPath } from '@/lib/geofence';
import type { GeoPoint, ScoringZone } from '@/types/course';
import type { TrackPoint } from '@/types/score';

const MIN_LEARN_POINTS = 5;
const MIN_LEARN_PATH_LEN = 4;

export type IdealLineLearnOptions = {
  /** ロガー GPS 主体の走行か */
  loggerPreferred: boolean;
  /** セッション全体のラインスコア（高いほど学習を強める） */
  overallLineScore?: number;
};

export type IdealLineLearnResult = {
  zones: ScoringZone[];
  updatedZoneIds: string[];
};

function toGeo(p: TrackPoint): GeoPoint {
  return { latitude: p.latitude, longitude: p.longitude };
}

function pathArcLength(path: GeoPoint[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    total += distanceMeters(path[i], path[i + 1]);
  }
  return total;
}

/** 折れ線を弧長等間隔でリサンプル */
function resamplePathByArcLength(path: GeoPoint[], count: number): GeoPoint[] {
  if (path.length === 0) return [];
  if (path.length === 1 || count <= 1) return [path[0]];

  const total = pathArcLength(path);
  if (total <= 0) return [path[0]];

  const samples: GeoPoint[] = [path[0]];
  let segIdx = 0;
  let segStart = 0;

  for (let k = 1; k < count - 1; k++) {
    const target = (total * k) / (count - 1);

    while (
      segIdx < path.length - 1 &&
      segStart + distanceMeters(path[segIdx], path[segIdx + 1]) < target
    ) {
      segStart += distanceMeters(path[segIdx], path[segIdx + 1]);
      segIdx++;
    }

    if (segIdx >= path.length - 1) {
      samples.push(path[path.length - 1]);
      continue;
    }

    const segLen = distanceMeters(path[segIdx], path[segIdx + 1]);
    const t = segLen > 0 ? (target - segStart) / segLen : 0;
    const a = path[segIdx];
    const b = path[segIdx + 1];
    samples.push({
      latitude: a.latitude + (b.latitude - a.latitude) * t,
      longitude: a.longitude + (b.longitude - a.longitude) * t,
    });
  }

  samples.push(path[path.length - 1]);
  return samples;
}

function blendCorridorPaths(
  existing: GeoPoint[],
  learned: GeoPoint[],
  alpha: number,
): GeoPoint[] {
  if (learned.length < 2) return existing;
  if (existing.length < 2) return learned;

  const n = Math.max(Math.min(existing.length, 24), 8);
  const a = resamplePathByArcLength(existing, n);
  const b = resamplePathByArcLength(learned, n);

  return a.map((p, i) => ({
    latitude: p.latitude * (1 - alpha) + b[i].latitude * alpha,
    longitude: p.longitude * (1 - alpha) + b[i].longitude * alpha,
  }));
}

function resolveLearnAlpha(options: IdealLineLearnOptions): number {
  let alpha = options.loggerPreferred ? 0.4 : 0.25;
  const score = options.overallLineScore ?? 0;
  if (score >= 80) alpha += 0.15;
  else if (score >= 65) alpha += 0.08;
  return Math.min(0.65, alpha);
}

/** ゾーン内の走行軌跡から脊椎パスを抽出 */
export function extractZonePathFromTrack(
  zone: ScoringZone,
  track: TrackPoint[],
  loggerPreferred: boolean,
): GeoPoint[] {
  const inZone = track
    .filter((pt) => isInScoringZone(toGeo(pt), zone))
    .sort((a, b) => a.tMs - b.tMs);

  if (inZone.length < MIN_LEARN_POINTS) return [];

  const raw = inZone.map(toGeo);
  const epsilon = loggerPreferred ? 1.8 : 3;
  const simplified = simplifyPath(raw, epsilon);

  return simplified.length >= MIN_LEARN_PATH_LEN ? simplified : [];
}

/**
 * 走行ログから各ゾーンの corridorPath を再学習（既存パスとブレンド）
 * 評価はセッション前の理想ラインで行い、学習結果は次走行以降に反映。
 */
export function learnIdealLinesFromTrack(
  zones: ScoringZone[],
  track: TrackPoint[],
  options: IdealLineLearnOptions,
): IdealLineLearnResult {
  if (track.length < MIN_LEARN_POINTS) {
    return { zones, updatedZoneIds: [] };
  }

  const alpha = resolveLearnAlpha(options);
  const updatedZoneIds: string[] = [];

  const nextZones = zones.map((zone) => {
    const existing = zone.corridorPath;
    if (!existing || existing.length < 2) return zone;

    const learned = extractZonePathFromTrack(zone, track, options.loggerPreferred);
    if (learned.length < MIN_LEARN_PATH_LEN) return zone;

    const blended = blendCorridorPaths(existing, learned, alpha);
    updatedZoneIds.push(zone.id);

    return {
      ...zone,
      corridorPath: blended,
    };
  });

  return { zones: nextZones, updatedZoneIds };
}
