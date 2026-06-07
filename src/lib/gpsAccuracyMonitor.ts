/**
 * セッション中 GPS 精度のリアルタイム監視と閾値緩和
 */

import type { DriftThresholds } from '@/types/settings';

export type GpsQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

export type GpsMonitorState = {
  quality: GpsQuality;
  /** EMA 平滑化済み精度 (m) */
  smoothedAccuracyM: number | null;
  /** 閾値緩和が適用されているか */
  isRelaxed: boolean;
};

const EMA_ALPHA = 0.22;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 生の GPS 精度 (m) を品質ティアに分類 */
export function classifyGpsAccuracy(accuracyM: number): GpsQuality {
  if (accuracyM <= 0 || !Number.isFinite(accuracyM)) return 'unknown';
  if (accuracyM <= 8) return 'excellent';
  if (accuracyM <= 15) return 'good';
  if (accuracyM <= 25) return 'fair';
  return 'poor';
}

/** EMA で GPS 精度を平滑化（急激なスパイクを抑える） */
export function smoothGpsAccuracy(
  prev: number | null,
  nextM: number,
): number | null {
  if (nextM <= 0 || !Number.isFinite(nextM)) return prev;
  if (prev == null) return nextM;
  return prev * (1 - EMA_ALPHA) + nextM * EMA_ALPHA;
}

/** 品質ティア → 閾値緩和係数（1.0 = 緩和なし） */
export function gpsRelaxationFactor(quality: GpsQuality): number {
  switch (quality) {
    case 'excellent': return 1.0;
    case 'good':      return 1.03;
    case 'fair':      return 1.07;
    case 'poor':      return 1.12;
    case 'unknown':   return 1.08;
  }
}

const QUALITY_LABELS: Record<GpsQuality, string> = {
  excellent: '良好',
  good:      '標準',
  fair:      'やや低下',
  poor:      '低下',
  unknown:   '不明',
};

export function gpsQualityLabel(quality: GpsQuality): string {
  return QUALITY_LABELS[quality];
}

/** GPS 精度悪化に応じてドリフト閾値を動的緩和 */
export function applyGpsAccuracyRelaxation(
  thresholds: DriftThresholds,
  quality: GpsQuality,
  options?: { loggerProvidesSpeed?: boolean },
): DriftThresholds {
  const factor = gpsRelaxationFactor(quality);
  if (factor === 1.0) return thresholds;

  const delta = factor - 1.0;
  const softenMinSpeed = options?.loggerProvidesSpeed ?? false;

  const minSpeedBonus = softenMinSpeed
    ? 0
    : quality === 'poor'
      ? 5
      : quality === 'fair'
        ? 3
        : quality === 'unknown'
          ? 4
          : 0;

  return {
    enterLateralG: clamp(thresholds.enterLateralG * factor, 0.15, 0.65),
    exitLateralG:  clamp(thresholds.exitLateralG * (1 + delta * 0.7), 0.08, 0.4),
    enterYawRate:  clamp(thresholds.enterYawRate * (1 + delta * 0.85), 0.1, 0.55),
    exitYawRate:   clamp(thresholds.exitYawRate * (1 + delta * 0.7), 0.05, 0.28),
    minSpeedKmh:   thresholds.minSpeedKmh + minSpeedBonus,
  };
}

export const INITIAL_GPS_MONITOR: GpsMonitorState = {
  quality: 'unknown',
  smoothedAccuracyM: null,
  isRelaxed: false,
};

/** 平滑化精度からモニター状態を構築 */
export function buildGpsMonitorState(smoothedAccuracyM: number | null): GpsMonitorState {
  const quality = smoothedAccuracyM != null
    ? classifyGpsAccuracy(smoothedAccuracyM)
    : 'unknown';
  return {
    quality,
    smoothedAccuracyM,
    isRelaxed: quality === 'fair' || quality === 'poor' || quality === 'unknown',
  };
}
