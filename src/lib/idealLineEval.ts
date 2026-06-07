/**
 * 理想ライン評価 — コリドー脊椎パスと GPS 軌跡の横ズレをスコア化し改善ヒントを生成
 */

import { distanceMeters, isInScoringZone } from '@/lib/geofence';
import { filterTrackForLineEval, type LineEvalTrackStats } from '@/lib/lineEvalTrack';
import type { GeoPoint, ScoringZone } from '@/types/course';
import type {
  LineEvalDetail,
  LineEvalSegment,
  LineEvalSummary,
  LineImprovementHint,
  TrackPoint,
} from '@/types/score';

export type { LineEvalSummary };
export { LINE_EVAL_GOOD_THRESHOLD } from '@/types/score';

export type LineEvalComputeOptions = {
  /** すでに filterTrackForLineEval 済みの軌跡を渡す場合 */
  preFiltered?: boolean;
  stats?: LineEvalTrackStats;
};

const MIN_ZONE_POINTS = 3;
const HINT_OFFSET_RATIO = 0.22;
const MAX_HINTS = 6;

type LocalPoint = { x: number; y: number };

type Projection = {
  distM: number;
  signedOffsetM: number;
  progress: number;
};

function toGeo(p: TrackPoint): GeoPoint {
  return { latitude: p.latitude, longitude: p.longitude };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toLocal(p: GeoPoint, origin: GeoPoint): LocalPoint {
  const latScale = 111_320;
  const lonScale = 111_320 * Math.cos(toRad(origin.latitude));
  return {
    x: (p.longitude - origin.longitude) * lonScale,
    y: (p.latitude - origin.latitude) * latScale,
  };
}

function resolveIdealPath(zone: ScoringZone): GeoPoint[] {
  const path = zone.corridorPath;
  if (!path || path.length < 2) return [];

  const start = zone.corridorStartIdx ?? 0;
  const end = zone.corridorEndIdx ?? path.length - 1;
  const lo = Math.max(0, Math.min(start, path.length - 1));
  const hi = Math.max(lo, Math.min(end, path.length - 1));
  return path.slice(lo, hi + 1);
}

function pathArcLength(path: GeoPoint[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    total += distanceMeters(path[i], path[i + 1]);
  }
  return total;
}

/** 点 p から折れ線 path 上の最近点と符号付き横ズレを求める */
function projectOntoPath(p: GeoPoint, path: GeoPoint[]): Projection | null {
  if (path.length < 2) return null;

  const origin = path[0];
  const lp = toLocal(p, origin);
  const totalLen = pathArcLength(path);
  if (totalLen <= 0) return null;

  let bestDist = Infinity;
  let bestSigned = 0;
  let bestProgress = 0;
  let traversed = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const la = toLocal(a, origin);
    const lb = toLocal(b, origin);
    const dx = lb.x - la.x;
    const dy = lb.y - la.y;
    const lenSq = dx * dx + dy * dy;
    const segLen = lenSq > 0 ? Math.sqrt(lenSq) : 0;

    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, ((lp.x - la.x) * dx + (lp.y - la.y) * dy) / lenSq));
    }

    const proj = { x: la.x + t * dx, y: la.y + t * dy };
    const vx = lp.x - proj.x;
    const vy = lp.y - proj.y;
    const dist = Math.sqrt(vx * vx + vy * vy);
    const cross = dx * vy - dy * vx;

    if (dist < bestDist) {
      bestDist = dist;
      bestSigned = cross >= 0 ? dist : -dist;
      bestProgress = (traversed + segLen * t) / totalLen;
    }

    traversed += segLen;
  }

  return {
    distM: bestDist,
    signedOffsetM: bestSigned,
    progress: Math.max(0, Math.min(1, bestProgress)),
  };
}

function segmentAt(progress: number): LineEvalSegment {
  if (progress < 0.34) return 'entry';
  if (progress < 0.67) return 'apex';
  return 'exit';
}

function isOutsideOffset(signedM: number, turn: ScoringZone['turnDirection']): boolean {
  if (turn === 'left') return signedM > 0;
  if (turn === 'right') return signedM < 0;
  return signedM > 0;
}

function segmentLabel(seg: LineEvalSegment): string {
  if (seg === 'entry') return '入り口';
  if (seg === 'apex') return 'apex';
  return '出口';
}

function buildHint(
  zone: ScoringZone,
  seg: LineEvalSegment,
  avgSignedM: number,
  halfW: number,
): LineImprovementHint | null {
  const threshold = Math.max(1.2, halfW * HINT_OFFSET_RATIO);
  if (Math.abs(avgSignedM) < threshold) return null;

  const outside = isOutsideOffset(avgSignedM, zone.turnDirection);
  const absM = Math.abs(avgSignedM).toFixed(1);
  const segJa = segmentLabel(seg);
  const severity: 'info' | 'warn' = Math.abs(avgSignedM) >= halfW * 0.4 ? 'warn' : 'info';

  let hint: string;
  if (seg === 'entry') {
    hint = outside
      ? `${segJa}がアウト寄り（+${absM}m）— もう少しインから攻めて`
      : `${segJa}がイン寄りすぎ（-${absM}m）— もう少しアウトから入って`;
  } else if (seg === 'apex') {
    hint = outside
      ? `${segJa}でアウト側に膨らんでいる — ターンインを早めて`
      : `${segJa}でイン寄りすぎ — もう少し奥まで伸ばして`;
  } else {
    hint = outside
      ? `${segJa}がアウト側 — 早切りに注意、ラインを保って`
      : `${segJa}でイン側に倒れている — アウトへ抜けて加速`;
  }

  if (!zone.turnDirection && zone.clipType === 'inside') {
    hint = outside
      ? `${segJa}：理想インラインよりアウト（+${absM}m）`
      : `${segJa}：インライン付近（-${absM}m）— 維持を意識`;
  }

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    segment: seg,
    lateralOffsetM: Math.round(avgSignedM * 10) / 10,
    hint,
    severity,
  };
}

function devToLineScore(avgDevM: number, halfW: number): number {
  const denom = Math.max(halfW * 0.75, 4);
  const raw = 100 * (1 - avgDevM / denom);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function evaluateZone(zone: ScoringZone, track: TrackPoint[]): {
  detail: LineEvalDetail;
  hints: LineImprovementHint[];
} {
  const idealPath = resolveIdealPath(zone);
  const halfW = zone.corridorHalfWidth ?? 10;

  if (idealPath.length < 2) {
    return {
      detail: {
        zoneId: zone.id,
        zoneName: zone.name,
        lineScore: 0,
        avgDevM: 0,
        maxDevM: 0,
        evaluable: false,
      },
      hints: [],
    };
  }

  const zonePoints = track.filter((pt) => isInScoringZone(toGeo(pt), zone));
  if (zonePoints.length < MIN_ZONE_POINTS) {
    return {
      detail: {
        zoneId: zone.id,
        zoneName: zone.name,
        lineScore: 0,
        avgDevM: 0,
        maxDevM: 0,
        evaluable: false,
      },
      hints: [],
    };
  }

  const projections = zonePoints
    .map((pt) => projectOntoPath(toGeo(pt), idealPath))
    .filter((p): p is Projection => p != null);

  if (projections.length === 0) {
    return {
      detail: {
        zoneId: zone.id,
        zoneName: zone.name,
        lineScore: 0,
        avgDevM: 0,
        maxDevM: 0,
        evaluable: false,
      },
      hints: [],
    };
  }

  const dists = projections.map((p) => p.distM);
  const avgDevM = dists.reduce((s, d) => s + d, 0) / dists.length;
  const maxDevM = Math.max(...dists);
  const lineScore = devToLineScore(avgDevM, halfW);

  const segBuckets: Record<LineEvalSegment, number[]> = {
    entry: [],
    apex: [],
    exit: [],
  };
  for (const p of projections) {
    segBuckets[segmentAt(p.progress)].push(p.signedOffsetM);
  }

  const hints: LineImprovementHint[] = [];
  for (const seg of ['entry', 'apex', 'exit'] as const) {
    const vals = segBuckets[seg];
    if (vals.length === 0) continue;
    const avgSigned = vals.reduce((s, v) => s + v, 0) / vals.length;
    const hint = buildHint(zone, seg, avgSigned, halfW);
    if (hint) hints.push(hint);
  }

  return {
    detail: {
      zoneId: zone.id,
      zoneName: zone.name,
      lineScore,
      avgDevM: Math.round(avgDevM * 10) / 10,
      maxDevM: Math.round(maxDevM * 10) / 10,
      evaluable: true,
    },
    hints,
  };
}

/** コース全ゾーンの理想ライン評価を算出 */
export function computeLineEvalSummary(
  zones: ScoringZone[],
  track: TrackPoint[] = [],
  options?: LineEvalComputeOptions,
): LineEvalSummary | null {
  if (zones.length === 0 || track.length < 2) return null;

  let evalTrack = track;
  let stats = options?.stats;
  if (!options?.preFiltered) {
    const filtered = filterTrackForLineEval(track);
    evalTrack = filtered.filtered;
    stats = filtered.stats;
  }

  if (evalTrack.length < 2) return null;

  const allDetails: LineEvalDetail[] = [];
  const allHints: LineImprovementHint[] = [];

  for (const zone of zones) {
    const { detail, hints } = evaluateZone(zone, evalTrack);
    allDetails.push(detail);
    allHints.push(...hints);
  }

  const evaluable = allDetails.filter((d) => d.evaluable);
  const overallScore = evaluable.length > 0
    ? Math.round(evaluable.reduce((s, d) => s + d.lineScore, 0) / evaluable.length)
    : 0;

  const hints = allHints
    .sort((a, b) => {
      const sev = a.severity === 'warn' ? 1 : 0;
      const sevB = b.severity === 'warn' ? 1 : 0;
      if (sev !== sevB) return sevB - sev;
      return Math.abs(b.lateralOffsetM) - Math.abs(a.lateralOffsetM);
    })
    .slice(0, MAX_HINTS);

  return {
    overallScore,
    zonesEvaluated: evaluable.length,
    totalZones: zones.length,
    details: allDetails,
    hints,
    trackPointsUsed: evalTrack.length,
    trackPointsRejected: stats?.rejected,
    gpsSource: stats?.gpsSource,
  };
}
