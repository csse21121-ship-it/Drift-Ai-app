/**
 * 走行中の勾配（登り / 下り / 平坦）リアルタイム推定
 *
 * GPS 標高の変化率と、重力ベクトルからの道路ピッチを融合する。
 * 低速・GPS 標高ノイズ時は重力推定を優先、走行中は GPS 勾配を重視。
 */

import { distanceMeters } from '@/lib/geofence';
import type { GradeDirection, GradeSnapshot } from '@/types/telemetry';

const GRADE_FLAT_THRESHOLD_PERCENT = 2.0;
const MIN_HORIZ_DIST_M = 4;
const MIN_SPEED_KMH_FOR_GPS = 10;
const ALT_SMOOTH_ALPHA = 0.35;
const GRADE_SMOOTH_ALPHA = 0.28;
const INERTIAL_SMOOTH_ALPHA = 0.12;

const INITIAL_SNAPSHOT: GradeSnapshot = {
  direction: 'unknown',
  gradePercent: 0,
  confidence: 0,
  source: 'none',
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function pitchDegToGradePercent(pitchDeg: number): number {
  const rad = (pitchDeg * Math.PI) / 180;
  return Math.tan(rad) * 100;
}

function resolveDirection(gradePercent: number): GradeDirection {
  if (gradePercent > GRADE_FLAT_THRESHOLD_PERCENT) return 'uphill';
  if (gradePercent < -GRADE_FLAT_THRESHOLD_PERCENT) return 'downhill';
  return 'flat';
}

type GpsSampleInput = {
  latitude: number;
  longitude: number;
  altitude: number;
  speedKmh: number;
  accuracy: number;
  timestampMs: number;
  /** 気圧計融合済み標高 */
  baroFused?: boolean;
};

/** リアルタイム勾配の勾配補正 — 急勾配ほど採点係数を下げる */
export function applyRealtimeGradientCompensation(
  baseGradientComp: number,
  snapshot: GradeSnapshot,
): number {
  if (snapshot.direction === 'unknown' || snapshot.confidence < 35) {
    return baseGradientComp;
  }
  const absGrade = Math.abs(snapshot.gradePercent);
  const factor = Math.max(0.72, 1.0 - absGrade * 0.022);
  return clamp(baseGradientComp * factor, 0.5, 1.0);
}

/** UI 表示用ラベル */
export function gradeDirectionLabel(direction: GradeDirection): string {
  switch (direction) {
    case 'uphill':   return '登り';
    case 'downhill': return '下り';
    case 'flat':     return '平坦';
    default:         return '---';
  }
}

/** UI 表示用 — 勾配 % と方向 */
export function formatGradeDisplay(snapshot: GradeSnapshot): string {
  if (snapshot.direction === 'unknown' || snapshot.confidence < 20) {
    return '---';
  }
  const sign = snapshot.gradePercent >= 0 ? '+' : '';
  const arrow =
    snapshot.direction === 'uphill' ? '↑'
      : snapshot.direction === 'downhill' ? '↓'
        : '─';
  return `${arrow} ${sign}${snapshot.gradePercent.toFixed(1)}%`;
}

export class GradeDetector {
  private lastGps: GpsSampleInput | null = null;
  private smoothedAltM: number | null = null;
  private gpsGradePercent: number | null = null;
  private inertialGradePercent: number | null = null;
  private fusedGradePercent = 0;
  private snapshot: GradeSnapshot = { ...INITIAL_SNAPSHOT };

  reset(): void {
    this.lastGps = null;
    this.smoothedAltM = null;
    this.gpsGradePercent = null;
    this.inertialGradePercent = null;
    this.fusedGradePercent = 0;
    this.snapshot = { ...INITIAL_SNAPSHOT };
  }

  getSnapshot(): GradeSnapshot {
    return this.snapshot;
  }

  /** 重力ベクトルから推定した道路ピッチ (°) */
  updateInertialPitch(pitchDeg: number | null, timestampMs: number): GradeSnapshot {
    if (pitchDeg == null || !Number.isFinite(pitchDeg)) {
      return this.recompute(timestampMs);
    }

    const instant = pitchDegToGradePercent(pitchDeg);
    this.inertialGradePercent =
      this.inertialGradePercent == null
        ? instant
        : INERTIAL_SMOOTH_ALPHA * instant
          + (1 - INERTIAL_SMOOTH_ALPHA) * this.inertialGradePercent;

    return this.recompute(timestampMs);
  }

  updateGps(input: GpsSampleInput): GradeSnapshot {
    const { altitude, accuracy } = input;

    if (
      !Number.isFinite(altitude) ||
      altitude === 0 ||
      (accuracy > 0 && accuracy > 35)
    ) {
      return this.recompute(input.timestampMs);
    }

    this.smoothedAltM =
      this.smoothedAltM == null
        ? altitude
        : (input.baroFused ? 0.55 : ALT_SMOOTH_ALPHA) * altitude
          + (1 - (input.baroFused ? 0.55 : ALT_SMOOTH_ALPHA)) * this.smoothedAltM;

    if (this.lastGps && this.smoothedAltM != null) {
      const horizM = distanceMeters(
        { latitude: this.lastGps.latitude, longitude: this.lastGps.longitude },
        { latitude: input.latitude, longitude: input.longitude },
      );
      const prevSmoothedAlt = this.lastGps.altitude;
      const altDelta = this.smoothedAltM - prevSmoothedAlt;

      if (
        horizM >= MIN_HORIZ_DIST_M &&
        input.speedKmh >= MIN_SPEED_KMH_FOR_GPS
      ) {
        const instantGpsGrade = (altDelta / horizM) * 100;
        if (Math.abs(instantGpsGrade) <= 35) {
          this.gpsGradePercent =
            this.gpsGradePercent == null
              ? instantGpsGrade
              : GRADE_SMOOTH_ALPHA * instantGpsGrade
                + (1 - GRADE_SMOOTH_ALPHA) * this.gpsGradePercent;
        }
      }
    }

    this.lastGps = {
      ...input,
      altitude: this.smoothedAltM ?? input.altitude,
      baroFused: input.baroFused,
    };
    return this.recompute(input.timestampMs);
  }

  private recompute(timestampMs: number): GradeSnapshot {
    void timestampMs;

    const gps = this.gpsGradePercent;
    const inertial = this.inertialGradePercent;
    const speedKmh = this.lastGps?.speedKmh ?? 0;
    const accuracy = this.lastGps?.accuracy ?? 99;

    let fused: number | null = null;
    let source: GradeSnapshot['source'] = 'none';
    let confidence = 0;

    const gpsWeightBase = speedKmh >= 25 ? 0.72 : speedKmh >= 15 ? 0.58 : 0.35;
    const gpsAccFactor = accuracy > 0 ? clamp(1.15 - accuracy / 30, 0.2, 1) : 0.5;
    const baroBoost = this.lastGps?.baroFused ? 0.22 : 0;
    const gpsWeight = Math.min(0.92, gpsWeightBase * gpsAccFactor + baroBoost);

    if (gps != null && inertial != null) {
      fused = gpsWeight * gps + (1 - gpsWeight) * inertial;
      source = this.lastGps?.baroFused ? 'baro_fusion' : 'fusion';
      confidence = clamp(
        40 + speedKmh * 0.8 + (100 - Math.min(accuracy, 100)) * 0.35,
        0,
        100,
      );
    } else if (gps != null && speedKmh >= MIN_SPEED_KMH_FOR_GPS) {
      fused = gps;
      source = this.lastGps?.baroFused ? 'baro_fusion' : 'gps';
      confidence = clamp(25 + speedKmh * 0.6 + (100 - Math.min(accuracy, 100)) * 0.3, 0, 85);
    } else if (inertial != null) {
      fused = inertial;
      source = 'inertial';
      confidence = clamp(30 + speedKmh * 0.25, 0, 65);
    }

    if (fused == null) {
      this.snapshot = { ...INITIAL_SNAPSHOT };
      return this.snapshot;
    }

    this.fusedGradePercent =
      GRADE_SMOOTH_ALPHA * fused + (1 - GRADE_SMOOTH_ALPHA) * this.fusedGradePercent;

    this.snapshot = {
      direction: resolveDirection(this.fusedGradePercent),
      gradePercent: Math.round(this.fusedGradePercent * 10) / 10,
      confidence: Math.round(confidence),
      source,
    };
    return this.snapshot;
  }
}
