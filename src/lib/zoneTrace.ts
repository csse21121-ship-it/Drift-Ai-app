/**
 * コースゾーン「なぞり」達成率 — GPS 軌跡 + 通過ログから算出
 */

import { distanceMeters, isInScoringZone } from '@/lib/geofence';
import type { ScoringZone } from '@/types/course';
import type { TrackPoint, ZoneCrossing, ZoneTraceSummary } from '@/types/score';
import { ZONE_TRACE_CLEAR_THRESHOLD } from '@/types/score';

export type { ZoneTraceSummary };
export { ZONE_TRACE_CLEAR_THRESHOLD } from '@/types/score';

const SAMPLE_SPACING_M = 8;
const MIN_CROSSING_MS = 400;

function toGeo(p: TrackPoint): { latitude: number; longitude: number } {
  return { latitude: p.latitude, longitude: p.longitude };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 点 p から線分 ab への最短距離 (m) */
function pointToSegmentDistM(
  p: { latitude: number; longitude: number },
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const latScale = 111_320;
  const lonScale = 111_320 * Math.cos(toRad((a.latitude + b.latitude) / 2));

  const px = p.longitude * lonScale;
  const py = p.latitude * latScale;
  const ax = a.longitude * lonScale;
  const ay = a.latitude * latScale;
  const bx = b.longitude * lonScale;
  const by = b.latitude * latScale;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distanceMeters(p, a);

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const proj = {
    latitude: (ay + t * dy) / latScale,
    longitude: (ax + t * dx) / lonScale,
  };
  return distanceMeters(p, proj);
}

/** パスを等間隔でサンプリング */
function sampleAlongPath(
  path: { latitude: number; longitude: number }[],
  spacingM: number,
) {
  if (path.length < 2) return path.length > 0 ? [path[0]] : [];

  const samples: { latitude: number; longitude: number }[] = [path[0]];
  let carry = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const segLen = distanceMeters(a, b);
    let dist = spacingM - carry;

    while (dist <= segLen) {
      const t = segLen > 0 ? dist / segLen : 0;
      samples.push({
        latitude: a.latitude + (b.latitude - a.latitude) * t,
        longitude: a.longitude + (b.longitude - a.longitude) * t,
      });
      dist += spacingM;
    }

    carry = Math.max(0, segLen - (dist - spacingM));
  }

  const last = path[path.length - 1];
  const tail = samples[samples.length - 1];
  if (!tail || distanceMeters(tail, last) > 2) {
    samples.push(last);
  }

  return samples;
}

function crossingTracePct(zoneId: string, crossings: ZoneCrossing[]): number {
  const hits = crossings.filter((c) => c.zoneId === zoneId);
  if (hits.length === 0) return 0;

  const bestStay = Math.max(...hits.map((c) => c.durationMs ?? 0));
  if (bestStay >= 2000) return 100;
  if (bestStay >= MIN_CROSSING_MS) return 85;
  return 60;
}

function gpsCorridorTracePct(zone: ScoringZone, track: TrackPoint[]): number {
  const path = zone.corridorPath;
  if (!path || path.length < 2) return gpsPolygonTracePct(zone, track);

  const samples = sampleAlongPath(path, SAMPLE_SPACING_M);
  if (samples.length === 0) return 0;

  const halfW = zone.corridorHalfWidth ?? 10;
  const tol = Math.max(halfW * 1.25, 12);
  const geoTrack = track.map(toGeo);

  let covered = 0;
  for (const s of samples) {
    const hit = geoTrack.some((pt) => {
      if (distanceMeters(pt, s) <= tol) return true;
      return path.slice(0, -1).some((a, i) =>
        pointToSegmentDistM(pt, a, path[i + 1]) <= tol,
      );
    });
    if (hit) covered++;
  }

  return Math.round((covered / samples.length) * 100);
}

function gpsPolygonTracePct(zone: ScoringZone, track: TrackPoint[]): number {
  const inside = track.filter((pt) => isInScoringZone(toGeo(pt), zone));
  if (inside.length === 0) return 0;

  const expected = zone.zoneShape === 'circle' && zone.radius
    ? Math.max(4, Math.round((zone.radius * 2) / SAMPLE_SPACING_M))
    : Math.max(4, Math.round(track.length * 0.06));

  return Math.min(100, Math.round((inside.length / expected) * 100));
}

function zoneTracePct(
  zone: ScoringZone,
  track: TrackPoint[],
  crossings: ZoneCrossing[],
): number {
  const fromCross = crossingTracePct(zone.id, crossings);
  if (track.length < 2) return fromCross;

  const fromGps = zone.corridorPath && zone.corridorPath.length >= 2
    ? gpsCorridorTracePct(zone, track)
    : gpsPolygonTracePct(zone, track);

  return Math.min(100, Math.max(fromGps, fromCross));
}

/** コース全ゾーンのなぞり達成率を算出 */
export function computeZoneTraceSummary(
  zones: ScoringZone[],
  track: TrackPoint[] = [],
  crossings: ZoneCrossing[] = [],
): ZoneTraceSummary | null {
  if (zones.length === 0) return null;

  const details = zones.map((zone) => ({
    zoneId: zone.id,
    zoneName: zone.name,
    tracePct: zoneTracePct(zone, track, crossings),
  }));

  const overallPct = Math.round(
    details.reduce((sum, d) => sum + d.tracePct, 0) / details.length,
  );
  const zonesCleared = details.filter((d) => d.tracePct >= ZONE_TRACE_CLEAR_THRESHOLD).length;

  return {
    overallPct,
    zonesCleared,
    totalZones: zones.length,
    details,
  };
}

/** 通過ログのみから再計算（旧セッション・GPS なし互換） */
export function computeZoneTraceFromCrossings(
  crossings: ZoneCrossing[],
  totalZones: number,
): ZoneTraceSummary | null {
  if (totalZones <= 0) return null;

  const byZone = new Map<string, ZoneCrossing[]>();
  for (const c of crossings) {
    const list = byZone.get(c.zoneId) ?? [];
    list.push(c);
    byZone.set(c.zoneId, list);
  }

  const details = [...byZone.entries()].map(([zoneId, hits]) => ({
    zoneId,
    zoneName: hits[0]?.zoneName ?? zoneId,
    tracePct: crossingTracePct(zoneId, hits),
  }));

  const sumPct = details.reduce((s, d) => s + d.tracePct, 0);
  const overallPct = Math.round(sumPct / totalZones);

  return {
    overallPct,
    zonesCleared: details.filter((d) => d.tracePct >= ZONE_TRACE_CLEAR_THRESHOLD).length,
    totalZones,
    details,
  };
}
