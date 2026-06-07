/**
 * courseGenerator — ルートパスから Course を自動生成する
 *
 * 道路中心線の忠実度を最優先し、各コーナーに
 * インクリップ / アウトクリップ の2ゾーンを生成する。
 */

import {
  corridorArcLength,
  createClipCorridor,
  createCornerCorridor,
  detectCorners,
  detectCourseType,
  detectScoringProfile,
  distanceMeters,
  simplifyPath,
} from './geofence';
import type { ClipType } from './geofence';
import type { CompetitionPreset } from '@/types/competition';
import type { Course, GeoPoint, ScoringZone } from '@/types/course';

// ────────────────────────────────────────────────────────────────
// 定数
// ────────────────────────────────────────────────────────────────

/** 一般道の片側幅 (m) — 境界ポリゴン生成用（総幅 ≈ 8m） */
const ROAD_HALF_WIDTH_M = 4;

/** クリップゾーン中心の横オフセット（中心線から車線方向へ） */
const CLIP_LATERAL_OFFSET_M = ROAD_HALF_WIDTH_M * 0.45;

/** 非推奨ラインの倍率係数 */
const ALT_CLIP_MULT_FACTOR = 0.72;

/** 近接点を統合する距離 (m) */
const DEDUPE_MIN_M = 0.3;

const SIMPLIFY_THRESHOLD = 600;
const SIMPLIFY_EPSILON_M = 0.8;

/** インクリップ = 赤系 / アウトクリップ = 青系 */
const CLIP_COLORS: Record<ClipType, string> = {
  inside:  '#FF3344',
  outside: '#00BFFF',
};

// ────────────────────────────────────────────────────────────────
// 中心線前処理
// ────────────────────────────────────────────────────────────────

function prepareCenterline(routePath: GeoPoint[]): GeoPoint[] {
  if (routePath.length < 2) return routePath;

  let pts = dedupePoints(routePath, DEDUPE_MIN_M);

  if (pts.length > SIMPLIFY_THRESHOLD) {
    pts = simplifyPath(pts, SIMPLIFY_EPSILON_M);
    pts = dedupePoints(pts, DEDUPE_MIN_M);
  }

  return pts.length >= 2 ? pts : routePath;
}

function dedupePoints(points: GeoPoint[], minDistM: number): GeoPoint[] {
  if (points.length < 2) return points;
  const out: GeoPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (distanceMeters(out[out.length - 1], points[i]) >= minDistM) {
      out.push(points[i]);
    }
  }
  const last = points[points.length - 1];
  if (distanceMeters(out[out.length - 1], last) >= 0.01) {
    out.push(last);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────
// メイン生成
// ────────────────────────────────────────────────────────────────

export function generateCourse(
  startPoint: GeoPoint,
  endPoint:   GeoPoint,
  routePath:  GeoPoint[],
  name:       string,
  preset:     CompetitionPreset | null = null,
): Course {
  const centerline   = prepareCenterline(routePath);
  const snappedStart = centerline[0];
  const snappedEnd   = centerline[centerline.length - 1];
  const boundary     = createCornerCorridor(centerline, ROAD_HALF_WIDTH_M);
  const corners      = detectCorners(centerline);
  const scoringZones = buildScoringZones(corners, preset);
  const routeLengthM = corridorArcLength(centerline, 0, centerline.length - 1);

  const draftId = `course_auto_${Date.now()}`;
  const draft: Course = {
    id:           draftId,
    name,
    boundary,
    startPoint:   snappedStart,
    startRadius:  Math.max(20, Math.min(50, routeLengthM * 0.03)),
    endPoint:     snappedEnd,
    endRadius:    30,
    scoringZones,
    savedAt:      new Date().toISOString(),
  };

  const courseType     = detectCourseType(draft);
  const scoringProfile = preset
    ? presetToScoringProfile(preset)
    : detectScoringProfile({ ...draft, courseType });

  return {
    ...draft,
    courseType,
    scoringProfile,
    competitionPresetId: preset?.id,
  } as Course & { competitionPresetId?: string };
}

// ────────────────────────────────────────────────────────────────
// イン / アウト ゾーン生成
// ────────────────────────────────────────────────────────────────

function buildScoringZones(
  corners: ReturnType<typeof detectCorners>,
  preset:  CompetitionPreset | null,
): ScoringZone[] {
  const zoneHalfWidth = preset?.zoneHalfWidthM ?? 0.85;
  const baseMult      = preset?.zoneMultiplier ?? 1.8;
  const zones: ScoringZone[] = [];

  corners.forEach((c, i) => {
    const cornerPts = dedupePoints(c.points, DEDUPE_MIN_M);
    const cornerNum = i + 1;
    const turnLabel = c.turnDirection === 'left' ? '左' : '右';

    for (const clip of ['inside', 'outside'] as const) {
      const isRecommended = clip === c.recommendedClip;
      const clipLabel     = clip === 'inside' ? 'イン' : 'アウト';
      const polygon = createClipCorridor(
        cornerPts,
        clip,
        c.turnDirection,
        zoneHalfWidth,
        CLIP_LATERAL_OFFSET_M,
      );

      if (polygon.length < 3) continue;

      zones.push({
        id:               `auto_c${i}_${clip}`,
        name:             `C${cornerNum} ${clipLabel}${isRecommended ? ' ★' : ''}`,
        zoneShape:        'polygon',
        polygon,
        multiplier:       isRecommended
          ? baseMult
          : Math.round(baseMult * ALT_CLIP_MULT_FACTOR * 10) / 10,
        color:            isRecommended
          ? CLIP_COLORS[clip]
          : CLIP_COLORS[clip] + '99',
        corridorPath:     cornerPts,
        corridorHalfWidth: zoneHalfWidth,
        clipType:         clip,
        recommendedClip:  isRecommended,
        turnDirection:    c.turnDirection,
        clipReason:       isRecommended
          ? c.clipReason
          : `${turnLabel}旋回 — ${clip === 'inside' ? 'イン' : 'アウト'}ライン（${isRecommended ? '' : '非'}推奨）`,
      });
    }
  });

  return zones;
}

function presetToScoringProfile(p: CompetitionPreset) {
  return {
    speedReferenceKmh:    p.speedReferenceKmh,
    angleScaleDeg:        p.angleScaleDeg,
    comboWindowMs:        p.comboWindowMs,
    gradientCompensation: p.gradientCompensation,
    gradeDifficulty:      p.gradeDifficulty,
  };
}

export function layoutToBoundary(path: GeoPoint[], roadWidthM = 8): GeoPoint[] {
  const centerline = prepareCenterline(path);
  return createCornerCorridor(centerline, roadWidthM / 2);
}

export function extractCenterline(routePath: GeoPoint[]): GeoPoint[] {
  return prepareCenterline(routePath);
}
