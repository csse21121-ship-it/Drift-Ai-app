/**
 * 路面コンディション（DRY / WET）— 閾値・フィルタの切り替え
 *
 * ドライ路面用のベースロジックは維持し、WET 時のみパラメータを上書きする。
 */

import type { DriftThresholds, SmoothingPresetParams } from '@/types/settings';

export type SurfaceCondition = 'dry' | 'wet';

export const DEFAULT_SURFACE_CONDITION: SurfaceCondition = 'dry';

export const SURFACE_CONDITION_LABELS: Record<SurfaceCondition, string> = {
  dry: 'DRY',
  wet: 'WET',
};

export const SURFACE_CONDITION_DESCRIPTIONS: Record<SurfaceCondition, string> = {
  dry: '標準路面 — 通常のドリフト閾値・フィルタ',
  wet: '低μ路面 — 閾値緩和 · ヨーレート重視 · フィルタ軽め',
};

/** WET: LPF α を上げてスムージングを弱める */
const WET_LPF_ALPHA_MULTIPLIER = 1.22;
const WET_LPF_ALPHA_MAX = 0.28;
/** WET: カルマン R を下げてレスポンスを上げる */
const WET_KALMAN_R_MULTIPLIER = 0.82;
const WET_KALMAN_Q_MULTIPLIER = 1.06;

/** WET 進入 — ヨーレート寄与ウェイト */
export const WET_YAW_WEIGHT = 1.55;
export const WET_LATERAL_WEIGHT = 0.75;

/** ユーザー閾値 × ロガー補正後 → WET 用にさらに緩和 */
export function applySurfaceToThresholds(
  base: DriftThresholds,
  surface: SurfaceCondition,
): DriftThresholds {
  if (surface === 'dry') return base;

  return {
    enterLateralG: Math.min(0.15, base.enterLateralG * 0.43),
    exitLateralG: Math.min(base.exitLateralG, base.exitLateralG * 0.88),
    enterYawRate: base.enterYawRate * 0.78,
    exitYawRate: base.exitYawRate * 0.92,
    minSpeedKmh: Math.max(10, base.minSpeedKmh - 10),
  };
}

/** スムージングプリセット × WET → フィルタをマイルド化 */
export function applySurfaceToSmoothingParams(
  preset: SmoothingPresetParams,
  surface: SurfaceCondition,
): SmoothingPresetParams {
  if (surface === 'dry') return preset;

  return {
    lpfAlpha: Math.min(WET_LPF_ALPHA_MAX, preset.lpfAlpha * WET_LPF_ALPHA_MULTIPLIER),
    kalmanRMultiplier: preset.kalmanRMultiplier * WET_KALMAN_R_MULTIPLIER,
    kalmanQMultiplier: preset.kalmanQMultiplier * WET_KALMAN_Q_MULTIPLIER,
  };
}
