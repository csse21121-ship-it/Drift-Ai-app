import { DEFAULT_SCORING_PROFILE } from '@/types/course';
import type { Course, CourseType, GeoPoint, ScoringProfile, ScoringZone } from '@/types/course';

const EARTH_RADIUS_M = 6_371_000;

/**
 * 2点間の距離を求める (Haversine 公式, 単位: メートル)
 */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * 点 p がポリゴン内にあるか判定 (Ray casting アルゴリズム)
 */
export function isPointInPolygon(p: GeoPoint, polygon: GeoPoint[]): boolean {
  if (polygon.length < 3) return false;
  const { latitude: px, longitude: py } = p;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { latitude: xi, longitude: yi } = polygon[i];
    const { latitude: xj, longitude: yj } = polygon[j];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 点 p が中心 center から radiusM メートル以内にあるか
 */
export function isNearPoint(
  p: GeoPoint,
  center: GeoPoint,
  radiusM: number,
): boolean {
  return distanceMeters(p, center) <= radiusM;
}

/**
 * 点 p がスコアリングゾーン内にあるか判定。
 * zoneShape に応じてポリゴン判定 or 円判定を切り替える。
 */
export function isInScoringZone(p: GeoPoint, zone: ScoringZone): boolean {
  if (zone.zoneShape === 'circle') {
    if (!zone.center || !zone.radius) return false;
    return isNearPoint(p, zone.center, zone.radius);
  }
  return isPointInPolygon(p, zone.polygon);
}

/**
 * ポリゴンの重心を求める (簡易)
 */
export function polygonCentroid(polygon: GeoPoint[]): GeoPoint {
  if (polygon.length === 0) return { latitude: 0, longitude: 0 };
  const sum = polygon.reduce(
    (acc, p) => ({
      latitude: acc.latitude + p.latitude,
      longitude: acc.longitude + p.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: sum.latitude / polygon.length,
    longitude: sum.longitude / polygon.length,
  };
}

/**
 * ポリゴンを囲む矩形領域 (region) を返す — MapView の fitToCoordinates 用
 */
export function boundingRegion(points: GeoPoint[]): {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} {
  if (points.length === 0) {
    return { latitude: 35.6762, longitude: 139.6503, latitudeDelta: 0.01, longitudeDelta: 0.01 };
  }
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const pad = 0.002;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: maxLat - minLat + pad,
    longitudeDelta: maxLon - minLon + pad,
  };
}

// ────────────────────────────────────────────────────────────────
// Chaikin カーブスムージング
// ────────────────────────────────────────────────────────────────

/**
 * Chaikin アルゴリズムで GPS パスをスムーズ化する。
 * 各線分の 1/4・3/4 点を新たに挿入しコーナーを丸める。
 * iterations=2 で十分滑らかになる。
 */
export function chaikinSmooth(points: GeoPoint[], iterations = 2): GeoPoint[] {
  if (points.length < 3) return points;
  let pts = points;
  for (let iter = 0; iter < iterations; iter++) {
    const out: GeoPoint[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push({
        latitude:  0.75 * a.latitude  + 0.25 * b.latitude,
        longitude: 0.75 * a.longitude + 0.25 * b.longitude,
      });
      out.push({
        latitude:  0.25 * a.latitude  + 0.75 * b.latitude,
        longitude: 0.25 * a.longitude + 0.75 * b.longitude,
      });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// ────────────────────────────────────────────────────────────────
// コーナー自動検知 (°/メートル 曲率解析)
// ────────────────────────────────────────────────────────────────

/** クリップライン種別 */
export type ClipType = 'inside' | 'outside';

/** 旋回方向（進行方向から見て） */
export type TurnDirection = 'left' | 'right';

/** コーナー検知結果 */
export type CornerInfo = {
  apexPoint: GeoPoint;
  /** パス配列上の apex のインデックス（コーナー間距離計算に使用） */
  apexIdx: number;
  /** 推奨ゾーン半径 (m) */
  suggestedRadius: number;
  /** 旋回角度の合計 (°) */
  totalTurnAngle: number;
  /** コーナーセグメントの点列 */
  points: GeoPoint[];
  /** 旋回方向 */
  turnDirection: TurnDirection;
  /** AI 推奨クリップライン */
  recommendedClip: ClipType;
  /** 推奨理由（UI 表示用） */
  clipReason: string;
};

/** 2点間の方位角 (0〜360°) */
function computeBearing(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** 方位角の差の絶対値 (0〜180°) */
function bearingDiff(a: number, b: number): number {
  const d = Math.abs(b - a) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * GPS パスからコーナーを AI 検知する。
 *
 * **改良点:**
 * - 曲率を「°/メートル」で計算することで点密度に依存しない検知を実現
 * - 距離重み付きスムージングで安定した曲率推定
 * - 最小コーナー長・直線区間による複数コーナーの正確な分離
 *
 * @param path                    GPS 点列
 * @param cornerThreshDegPerMeter コーナー判定閾値 (°/m)。デフォルト: 1.2（緩やかなコーナーも検知）
 * @param smoothWindowM           曲率平滑化ウィンドウ (m)。デフォルト: 6m
 * @param minCornerLengthM        コーナーと認める最小距離 (m)。デフォルト: 3m
 * @param mergeDistM              隣接コーナーのマージ距離 (m)。デフォルト: 15m
 *
 * 参考: 直線 ≒ 0〜0.5°/m、緩いカーブ ≒ 0.5〜1.2°/m、
 *       通常コーナー ≒ 1.2〜5°/m、タイトコーナー ≒ 5〜20°/m
 */
export function detectCorners(
  path: GeoPoint[],
  cornerThreshDegPerMeter = 1.2,
  smoothWindowM = 6,
  minCornerLengthM = 3,
  mergeDistM = 15,
): CornerInfo[] {
  if (path.length < 4) return [];

  // ── セグメントごとのベアリング・距離 ──
  const bearings: number[] = [];
  const segLen: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    bearings.push(computeBearing(path[i], path[i + 1]));
    segLen.push(distanceMeters(path[i], path[i + 1]));
  }

  // ── 各点の曲率 (°/m) ──
  // 点 i における曲率 = bearing変化量 / 前後セグメント平均長さ
  const curvDegPerM: number[] = [0];
  for (let i = 1; i < path.length - 1; i++) {
    const dBear = bearingDiff(bearings[i - 1], bearings[i]);
    const avgSeg = (segLen[i - 1] + segLen[i]) / 2;
    curvDegPerM.push(avgSeg > 0.05 ? dBear / avgSeg : 0);
  }
  curvDegPerM.push(0);

  // ── 距離重み付きスムージング ──
  const smoothed: number[] = curvDegPerM.map((_, i) => {
    let sumCurv = 0, sumW = 0;
    // 前方向
    let dFwd = 0;
    for (let j = i; j < curvDegPerM.length; j++) {
      const w = Math.max(0, 1 - dFwd / smoothWindowM);
      sumCurv += curvDegPerM[j] * w;
      sumW += w;
      if (j < segLen.length) dFwd += segLen[j];
      if (dFwd >= smoothWindowM) break;
    }
    // 後方向
    let dBwd = 0;
    for (let j = i - 1; j >= 0; j--) {
      dBwd += segLen[j];
      if (dBwd >= smoothWindowM) break;
      const w = Math.max(0, 1 - dBwd / smoothWindowM);
      sumCurv += curvDegPerM[j] * w;
      sumW += w;
    }
    return sumW > 0 ? sumCurv / sumW : 0;
  });

  // ── 累積距離 ──
  const cumDist: number[] = [0];
  for (let i = 0; i < segLen.length; i++) {
    cumDist.push(cumDist[i] + segLen[i]);
  }

  // ── コーナー区間抽出 ──
  const corners: CornerInfo[] = [];
  let inCorner = false;
  let segStart = 0;

  const finalize = (segEnd: number) => {
    const len = cumDist[segEnd] - cumDist[segStart];
    if (len < minCornerLengthM) return;

    const segPts = path.slice(segStart, segEnd + 1);
    const segCurv = smoothed.slice(segStart, segEnd + 1);

    // apex = 曲率最大点
    let maxC = 0, apexRel = 0;
    segCurv.forEach((c, k) => { if (c > maxC) { maxC = c; apexRel = k; } });

    const totalTurnAngle = segCurv.reduce((s, c, k) => {
      const dl = k < segCurv.length - 1 ? segLen[segStart + k] : 0;
      return s + c * dl;
    }, 0);

    // ゾーン半径: コーナーの空間的広がりに基づく
    const extent = distanceMeters(segPts[0], segPts[segPts.length - 1]);
    const arcLen = cumDist[segEnd] - cumDist[segStart];
    const suggestedRadius = Math.round(
      Math.max(12, Math.min(90, Math.max(extent * 0.7, arcLen * 0.4) + 8)),
    );

    corners.push({
      apexPoint: segPts[apexRel],
      apexIdx:   segStart + apexRel,
      suggestedRadius,
      totalTurnAngle: Math.round(totalTurnAngle),
      points: segPts,
      ...analyzeClipLine(segPts, Math.round(totalTurnAngle)),
    });
  };

  for (let i = 0; i < smoothed.length; i++) {
    if (!inCorner && smoothed[i] >= cornerThreshDegPerMeter) {
      inCorner = true; segStart = i;
    } else if (inCorner && smoothed[i] < cornerThreshDegPerMeter) {
      finalize(i - 1); inCorner = false;
    }
  }
  if (inCorner) finalize(smoothed.length - 1);

  // ── 近接コーナーのマージ ──
  const merged: CornerInfo[] = [];
  for (const c of corners) {
    const last = merged[merged.length - 1];
    if (last && distanceMeters(last.apexPoint, c.apexPoint) < mergeDistM) {
      if (c.totalTurnAngle > last.totalTurnAngle) merged[merged.length - 1] = c;
    } else {
      merged.push(c);
    }
  }
  return merged;
}

// ────────────────────────────────────────────────────────────────
// パス最適化 (Douglas-Peucker)
// ────────────────────────────────────────────────────────────────

/**
 * 点 P から線分 AB への垂線距離 (単位: メートル)
 */
function perpendicularDistanceMeters(
  p: GeoPoint,
  a: GeoPoint,
  b: GeoPoint,
): number {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  if (dx === 0 && dy === 0) return distanceMeters(p, a);
  const t =
    ((p.longitude - a.longitude) * dx + (p.latitude - a.latitude) * dy) /
    (dx * dx + dy * dy);
  const tClamped = Math.max(0, Math.min(1, t));
  const closest: GeoPoint = {
    latitude: a.latitude + tClamped * dy,
    longitude: a.longitude + tClamped * dx,
  };
  return distanceMeters(p, closest);
}

/**
 * Douglas-Peucker アルゴリズムによるパス最適化。
 *
 * なぞり描きで記録した密な GPS 点列を簡略化し、
 * 道の輪郭を保ちつつ点数を大幅に削減する。
 *
 * @param points        元の GPS 点列
 * @param epsilonMeters 許容誤差 (m)。大きいほど荒くなる。推奨: 1〜3m
 * @returns 簡略化された点列
 */
export function simplifyPath(
  points: GeoPoint[],
  epsilonMeters: number,
): GeoPoint[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistanceMeters(
      points[i],
      points[0],
      points[points.length - 1],
    );
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilonMeters) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), epsilonMeters);
    const right = simplifyPath(points.slice(maxIdx), epsilonMeters);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[points.length - 1]];
}

// ────────────────────────────────────────────────────────────────
// コーナー・コリドー（廊下型ゾーン）生成
// ────────────────────────────────────────────────────────────────

/**
 * GPS パス上の点を、与えた方位角・距離でオフセットする（測地線計算）。
 */
function offsetPoint(p: GeoPoint, bearingDeg: number, distM: number): GeoPoint {
  const R = 6371000;
  const lat1 = toRad(p.latitude);
  const lon1 = toRad(p.longitude);
  const d = distM / R;
  const brng = toRad(bearingDeg);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { latitude: toDeg(lat2), longitude: toDeg(lon2) };
}

/** 方位角の平均（0/360 折り返しに対応） */
function avgBearing(b1: number, b2: number): number {
  const diff = ((b2 - b1 + 540) % 360) - 180;
  return (b1 + diff / 2 + 360) % 360;
}

/**
 * GPS パス点列に沿った **ナロー・コリドー（廊下型ゾーン）** ポリゴンを生成する。
 *
 * D1GP のコーナーゾーンのようにコース上に幅の細いストリップを作る。
 * パスの各点を左右に `halfWidthM` だけオフセットし閉じたポリゴンを返す。
 *
 * @param points      コーナーの GPS 点列（detectCorners の CornerInfo.points）
 * @param halfWidthM  片側の幅 (m)。デフォルト 1.0 → 総幅 2m
 */
export function createCornerCorridor(points: GeoPoint[], halfWidthM = 1.0): GeoPoint[] {
  if (points.length < 2) return [];

  const leftSide: GeoPoint[]  = [];
  const rightSide: GeoPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    let bearing: number;
    if (i === 0) {
      bearing = computeBearing(points[0], points[1]);
    } else if (i === points.length - 1) {
      bearing = computeBearing(points[i - 1], points[i]);
    } else {
      const b1 = computeBearing(points[i - 1], points[i]);
      const b2 = computeBearing(points[i], points[i + 1]);
      bearing = avgBearing(b1, b2);
    }

    const leftBearing  = (bearing - 90 + 360) % 360;
    const rightBearing = (bearing + 90) % 360;

    leftSide.push(offsetPoint(points[i], leftBearing,  halfWidthM));
    rightSide.push(offsetPoint(points[i], rightBearing, halfWidthM));
  }

  // 左側前進 + 右側後退 → 閉じたポリゴン
  return [...leftSide, ...rightSide.reverse()];
}

/**
 * 進行方向に対する「左」「右」判定。
 * 方位角の変化: 正 = 右旋回、負 = 左旋回。
 */
export function detectTurnDirection(points: GeoPoint[]): TurnDirection {
  if (points.length < 3) return 'right';
  const apex = Math.floor(points.length / 2);
  const bIn  = computeBearing(points[0], points[apex]);
  const bOut = computeBearing(points[apex], points[points.length - 1]);
  const delta = ((bOut - bIn + 540) % 360) - 180;
  return delta > 0 ? 'right' : 'left';
}

/**
 * 旋回角と形状から推奨クリップラインを判定する。
 *
 * - 急〜中速コーナー: インクリップ（短半径・ポジション重視）
 * - 高速〜緩いコーナー: アウトクリップ（角度・速度維持）
 */
export function recommendClipLine(
  turnAngleDeg: number,
): { recommendedClip: ClipType; clipReason: string } {
  if (turnAngleDeg >= 90) {
    return {
      recommendedClip: 'inside',
      clipReason: '急コーナー — インクリップが基準ライン。アウトは距離ロス大',
    };
  }
  if (turnAngleDeg >= 55) {
    return {
      recommendedClip: 'inside',
      clipReason: '中速コーナー — イン側でタイトに攻めるのが得点ライン',
    };
  }
  if (turnAngleDeg >= 30) {
    return {
      recommendedClip: 'outside',
      clipReason: 'セッティング重視 — アウトから角度を作るラインが有利',
    };
  }
  return {
    recommendedClip: 'outside',
    clipReason: '緩いコーナー — アウトクリップで速度を維持',
  };
}

function analyzeClipLine(
  points: GeoPoint[],
  turnAngleDeg: number,
): Pick<CornerInfo, 'turnDirection' | 'recommendedClip' | 'clipReason'> {
  const turnDirection = detectTurnDirection(points);
  const { recommendedClip, clipReason } = recommendClipLine(turnAngleDeg);
  return { turnDirection, recommendedClip, clipReason };
}

/** 旋回方向とクリップ種別から、パス左右のどちら側かを返す */
function clipToPathSide(
  clip: ClipType,
  turn: TurnDirection,
): 'left' | 'right' {
  // 左旋回 → イン=左 / アウト=右、右旋回 → イン=右 / アウト=左
  if (turn === 'left') {
    return clip === 'inside' ? 'left' : 'right';
  }
  return clip === 'inside' ? 'right' : 'left';
}

/**
 * イン / アウトクリップ用のナロー・ゾーンを生成する。
 *
 * 道路中心線から横方向にオフセットしたライン上に細いコリドーを置く。
 * D1GP 的な「どちらのラインを走ったか」を判定可能にする。
 *
 * @param points          コーナー中心線
 * @param clipType        inside | outside
 * @param turnDirection   旋回方向
 * @param zoneHalfWidthM  ゾーン片側幅 (m)
 * @param lateralOffsetM  中心線からの横オフセット (m) — ゾーン中心位置
 */
export function createClipCorridor(
  points: GeoPoint[],
  clipType: ClipType,
  turnDirection: TurnDirection,
  zoneHalfWidthM: number,
  lateralOffsetM: number,
): GeoPoint[] {
  if (points.length < 2) return [];

  const side = clipToPathSide(clipType, turnDirection);
  const offsetPath: GeoPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    let bearing: number;
    if (i === 0) {
      bearing = computeBearing(points[0], points[1]);
    } else if (i === points.length - 1) {
      bearing = computeBearing(points[i - 1], points[i]);
    } else {
      bearing = avgBearing(
        computeBearing(points[i - 1], points[i]),
        computeBearing(points[i], points[i + 1]),
      );
    }
    const perpBearing = side === 'left'
      ? (bearing - 90 + 360) % 360
      : (bearing + 90) % 360;
    offsetPath.push(offsetPoint(points[i], perpBearing, lateralOffsetM));
  }

  return createCornerCorridor(offsetPath, zoneHalfWidthM);
}

// ────────────────────────────────────────────────────────────────
// コースタイプ AI 判定
// ────────────────────────────────────────────────────────────────

/**
 * コースの形状データから「サーキット」か「ストリート（峠）」かを AI 判定する。
 *
 * 判定ロジック:
 * 1. ゴール地点が未設定 → ループ境界を確認してサーキット or unknown
 * 2. スタート〜ゴール間距離が短い (<= 80m) → サーキット
 * 3. 境界ポリゴンのアスペクト比が 3 超 → ストリート（細長い形状）
 * 4. スタート〜ゴール間距離が長い (> 200m) → ストリート
 * 5. それ以外 → サーキット（デフォルト）
 */
export function detectCourseType(course: Course): CourseType {
  const { startPoint, endPoint, boundary } = course;

  // ── ゴール未設定 ──
  if (!endPoint) {
    // 境界がループを形成しているか（終端と始端が近い）
    if (boundary.length >= 4) {
      const totalLen = corridorArcLength(boundary, 0, boundary.length - 1);
      const closureDist = distanceMeters(boundary[0], boundary[boundary.length - 1]);
      if (totalLen > 0 && closureDist / totalLen < 0.15) return 'circuit';
    }
    return 'unknown';
  }

  const startEndDist = distanceMeters(startPoint, endPoint);

  // スタートとゴールが非常に近い → 周回コース
  if (startEndDist <= 80) return 'circuit';

  // 境界ポリゴンの形状解析
  if (boundary.length >= 3) {
    const r    = boundingRegion(boundary);
    const latM = r.latitudeDelta  * 111_000;
    const lonM = r.longitudeDelta * 111_000 * Math.cos(toRad(r.latitude));
    const long = Math.max(latM, lonM);
    const short = Math.min(latM, lonM);
    if (short > 0 && long / short > 3.0) return 'street';  // 細長い → ストリート
  }

  // スタート〜ゴールが遠い → ストリート
  if (startEndDist > 200) return 'street';

  return 'circuit';
}

// ────────────────────────────────────────────────────────────────
// スコアリングプロファイル AI 自動生成
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
// 道幅・コーナー間距離 分析ユーティリティ
// ────────────────────────────────────────────────────────────────

/**
 * ポリゴン面積を Shoelace 公式で推定 (単位: m²)
 * 経度を局所メートルに変換してから計算する。
 */
export function polygonAreaM2(polygon: GeoPoint[]): number {
  const n = polygon.length;
  if (n < 3) return 0;
  // 重心緯度でスケールを揃える
  const latMid = polygon.reduce((s, p) => s + p.latitude, 0) / n;
  const cosLat = Math.cos(toRad(latMid));
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j   = (i + 1) % n;
    const xi  = polygon[i].longitude * 111_000 * cosLat;
    const yi  = polygon[i].latitude  * 111_000;
    const xj  = polygon[j].longitude * 111_000 * cosLat;
    const yj  = polygon[j].latitude  * 111_000;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area) / 2;
}

/**
 * ポリゴンの周長を計算 (m)
 * 最後の点から最初の点への辺も含む。
 */
export function polygonPerimeterM(polygon: GeoPoint[]): number {
  if (polygon.length < 2) return 0;
  let peri = 0;
  for (let i = 0; i < polygon.length - 1; i++) {
    peri += distanceMeters(polygon[i], polygon[i + 1]);
  }
  peri += distanceMeters(polygon[polygon.length - 1], polygon[0]);
  return peri;
}

/**
 * 境界ポリゴンから平均道幅を推定 (m)
 *
 * 原理: 細長いポリゴン（道路形状）では
 *   面積 ≈ 長さ × 幅  かつ  周長 ≈ 2 × 長さ
 *   → 幅 ≈ 2 × 面積 / 周長
 *
 * ポリゴンがほぼ正方形（駐車場等）の場合は過大推定になるが、
 * コース境界としては細長い形状が前提なので許容範囲。
 */
export function estimateRoadWidthM(boundary: GeoPoint[]): number {
  if (boundary.length < 3) return 6; // データ不足時のデフォルト
  const area = polygonAreaM2(boundary);
  const peri = polygonPerimeterM(boundary);
  if (peri <= 0) return 6;
  const estimated = (2 * area) / peri;
  // 現実的な道幅の範囲 [2m, 25m] にクランプ
  return Math.max(2, Math.min(25, estimated));
}

/**
 * コースの走行距離（片道長さ）を推定 (m)
 *
 * 境界ポリゴンは道路の両サイドを囲むため：
 *   面積 ≈ 走行距離 × 道幅
 *   → 走行距離 ≈ 面積 / 道幅
 *
 * より直感的な「コースを一周する距離」として使用する。
 */
export function estimateCourseLengthM(boundary: GeoPoint[]): number {
  if (boundary.length < 3) return 0;
  const area  = polygonAreaM2(boundary);
  const width = estimateRoadWidthM(boundary);
  if (width <= 0) return 0;
  // 最低でも 30m / 最大 99999m
  return Math.max(30, Math.min(99999, area / width));
}

/**
 * コーナー間距離の統計を返す。
 *
 * @param path    コースの GPS 点列（boundary など）
 * @param corners detectCorners の出力
 * @returns { minM, maxM, avgM, medianM } — すべて m 単位
 *          コーナーが 1 個以下の場合はすべて 0
 */
export function analyzeInterCornerDistances(
  path: GeoPoint[],
  corners: CornerInfo[],
): { minM: number; maxM: number; avgM: number; medianM: number } {
  const empty = { minM: 0, maxM: 0, avgM: 0, medianM: 0 };
  if (corners.length < 2) return empty;

  const dists: number[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i].apexIdx;
    const b = corners[i + 1].apexIdx;
    if (a >= 0 && b > a && b < path.length) {
      dists.push(corridorArcLength(path, a, b));
    }
  }
  if (dists.length === 0) return empty;

  dists.sort((a, b) => a - b);
  const sum = dists.reduce((s, d) => s + d, 0);
  const mid = Math.floor(dists.length / 2);
  const medianM = dists.length % 2 === 0
    ? (dists[mid - 1] + dists[mid]) / 2
    : dists[mid];

  return { minM: dists[0], maxM: dists[dists.length - 1], avgM: sum / dists.length, medianM };
}

/**
 * コースの幾何情報からスコアリングプロファイルを AI 自動生成する。
 *
 * 判定ロジック:
 * 1. 境界ポリゴンの面積/周長比 → 平均道幅を推定
 * 2. コーナー間の中央距離    → 速度参照値に反映
 * 3. 平均コーナー旋回角       → angleScaleDeg を調整
 * 4. コーナー間距離の分散     → comboWindowMs を調整
 * 5. コースタイプ・傾斜       → gradientCompensation
 * 6. 道幅 × コーナー数       → gradeDifficulty
 */
export function detectScoringProfile(course: Course): ScoringProfile {
  const ct = course.courseType ?? detectCourseType(course);
  const { boundary, scoringZones } = course;

  // ── コース総延長 ──
  const totalLengthM = boundary.length >= 2
    ? corridorArcLength(boundary, 0, boundary.length - 1)
    : 0;

  // ── コーナー解析 ──
  const corners = boundary.length >= 6 ? detectCorners(boundary) : [];
  const avgTurnAngle = corners.length > 0
    ? corners.reduce((s, c) => s + Math.abs(c.totalTurnAngle), 0) / corners.length
    : 45;

  // ── コーナー間距離 ──
  const icd = analyzeInterCornerDistances(boundary, corners);
  // medianM が 0（コーナー 1個以下）の場合はコース長から推定
  const typicalGapM = icd.medianM > 0 ? icd.medianM : totalLengthM;

  // ── 道幅推定 ──
  const roadWidthM = estimateRoadWidthM(boundary);

  // ─────────────────────────────────────────────────────────────
  // 速度参照値
  // コーナー間距離が長い = 長い直線 = より速いスピードが出る
  // 道幅が広い = 高速コーナーをより大きな速度で走れる
  // ─────────────────────────────────────────────────────────────
  let speedReferenceKmh: number;
  if (ct === 'street') {
    // 峠: コーナー間距離 + 道幅で調整
    const base = typicalGapM < 80  ? 40
               : typicalGapM < 200 ? 55
               : 65;
    // 道幅補正: 広い(>6m) → +5, 狭い(<4m) → -5
    const widthAdj = roadWidthM > 6 ? 5 : roadWidthM < 4 ? -5 : 0;
    speedReferenceKmh = base + widthAdj;
  } else {
    // サーキット
    const base = typicalGapM < 100  ? 60
               : typicalGapM < 250  ? 80
               : 100;
    const widthAdj = roadWidthM > 8 ? 10 : roadWidthM < 5 ? -10 : 0;
    speedReferenceKmh = base + widthAdj;
  }
  speedReferenceKmh = Math.round(Math.max(30, Math.min(130, speedReferenceKmh)));

  // ─────────────────────────────────────────────────────────────
  // 角度スケール
  // タイトコーナー(大旋回角) + 狭い道 → 小さいscale（精密さ重視）
  // 広い道 + 緩いコーナー  → 大きいscale（大角度を要求）
  // ─────────────────────────────────────────────────────────────
  let angleScaleDeg: number;
  if (avgTurnAngle >= 100) {
    angleScaleDeg = roadWidthM < 4 ? 35 : 45;   // ヘアピン主体
  } else if (avgTurnAngle >= 70) {
    angleScaleDeg = roadWidthM < 4 ? 50 : 60;   // タイトコーナー
  } else if (avgTurnAngle >= 40) {
    angleScaleDeg = roadWidthM < 5 ? 75 : 90;   // 通常コーナー
  } else {
    angleScaleDeg = roadWidthM > 7 ? 130 : 110; // 高速スイーパー
  }

  // ─────────────────────────────────────────────────────────────
  // コンボウィンドウ
  // コーナー間の最長ギャップに合わせる（長い直線でもコンボが切れないように）
  // ─────────────────────────────────────────────────────────────
  let comboWindowMs: number;
  if (icd.maxM > 300) {
    comboWindowMs = 5000; // 300m 超の直線がある → 長め
  } else if (icd.maxM > 150) {
    comboWindowMs = 4000;
  } else if (icd.maxM > 60 || ct === 'street') {
    comboWindowMs = 3000;
  } else {
    comboWindowMs = 2000; // タイトな連続コーナー
  }

  // ── 傾斜補正 ──
  const gradientCompensation = ct === 'street' ? 0.85 : 1.0;

  // ─────────────────────────────────────────────────────────────
  // グレード難易度
  // 道幅が狭い: 同じドリフト角を出すのが難しい → easy 寄りに（達成感優先）
  // 道幅が広い × コーナー多い: 出しやすい → hard 寄りに
  // ─────────────────────────────────────────────────────────────
  let gradeDifficulty: ScoringProfile['gradeDifficulty'];
  const isNarrow  = roadWidthM < 4;
  const isWide    = roadWidthM > 7;
  const manyCorners = corners.length >= 6;
  const longCourse  = totalLengthM > 1500;

  if (isNarrow || corners.length <= 2 || totalLengthM < 300) {
    gradeDifficulty = 'easy';
  } else if (isWide && manyCorners && longCourse) {
    gradeDifficulty = 'hard';
  } else if (manyCorners && longCourse) {
    gradeDifficulty = 'normal';
  } else {
    gradeDifficulty = 'easy';
  }

  return { speedReferenceKmh, angleScaleDeg, comboWindowMs, gradientCompensation, gradeDifficulty };
}

// ────────────────────────────────────────────────────────────────
// コリドー調整ユーティリティ
// ────────────────────────────────────────────────────────────────

/**
 * GPS 点を北/東方向にメートル単位でオフセットする。
 * @param p       元の座標
 * @param northM  北方向への移動量 (m)。負値で南方向
 * @param eastM   東方向への移動量 (m)。負値で西方向
 */
export function nudgeGeoPoint(p: GeoPoint, northM: number, eastM: number): GeoPoint {
  const dLat = northM / 111000;
  const dLon = eastM / (111000 * Math.cos(toRad(p.latitude)));
  return { latitude: p.latitude + dLat, longitude: p.longitude + dLon };
}

/**
 * GPS パスの指定区間の弧長 (m) を計算する。
 */
export function corridorArcLength(path: GeoPoint[], startIdx: number, endIdx: number): number {
  let total = 0;
  for (let i = startIdx; i < Math.min(endIdx, path.length - 1); i++) {
    total += distanceMeters(path[i], path[i + 1]);
  }
  return total;
}

// ────────────────────────────────────────────────────────────────
// 内部ユーティリティ
// ────────────────────────────────────────────────────────────────
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
