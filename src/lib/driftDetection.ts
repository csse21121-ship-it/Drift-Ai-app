/**
 * ドリフト検知ロジック — 純粋関数群
 *
 * 【判定アルゴリズム概要】
 * ドリフトは以下3条件の AND で判定する（DRY）:
 *   1. 横G (lateralG) が閾値を超えている
 *   2. ヨーレート (yawRateRad) が閾値を超えている  ← 車体の回転を確認
 *   3. 速度が最低速度以上              ← 低速の押し付けスリップを除外
 *
 * WET モードでは閾値を緩和し、ヨーレートの立ち上がりを重視した複合判定を行う。
 *
 * ヒステリシス（チャタリング防止）:
 *   入閾値 > 出閾値 とすることで、ドリフト中に一瞬条件を下回っても
 *   継続中と見なす。
 */

import {
  WET_LATERAL_WEIGHT,
  WET_YAW_WEIGHT,
  type SurfaceCondition,
} from '@/lib/surfaceCondition';
import { DEFAULT_THRESHOLDS } from '@/types/settings';
import type { DriftThresholds } from '@/types/settings';

export type { DriftThresholds, SurfaceCondition };

// ── 内部タイミング定数（UI非公開） ──────────────────────────

/** ドリフト開始確認時間 (ms): この時間以上条件を満たし続けた場合のみ active に遷移 */
export const CONFIRM_MS = 300;
/** ドリフト終了確認時間 (ms): 条件を下回ってからこの時間が経過するまで active を維持 */
export const EXIT_CONFIRM_MS = 400;

// ── 判定関数 ─────────────────────────────────────────────────

/** ドリフト開始条件を満たすか */
export function meetsEnterCondition(
  lateralG: number,
  yawRate: number,
  speedKmh: number,
  thresholds: DriftThresholds = DEFAULT_THRESHOLDS,
  surfaceCondition: SurfaceCondition = 'dry',
): boolean {
  if (speedKmh < thresholds.minSpeedKmh) return false;

  const absG = Math.abs(lateralG);
  const absYaw = Math.abs(yawRate);

  if (surfaceCondition === 'dry') {
    return (
      absG >= thresholds.enterLateralG &&
      absYaw >= thresholds.enterYawRate
    );
  }

  const classicEnter =
    absG >= thresholds.enterLateralG &&
    absYaw >= thresholds.enterYawRate * 0.72;

  const yawDominantEnter =
    absYaw >= thresholds.enterYawRate * 0.88 &&
    absG >= thresholds.enterLateralG * 0.55;

  const weightedScore =
    WET_LATERAL_WEIGHT * (absG / Math.max(thresholds.enterLateralG, 0.05)) +
    WET_YAW_WEIGHT * (absYaw / Math.max(thresholds.enterYawRate, 0.05));

  return classicEnter || yawDominantEnter || weightedScore >= 1.0;
}

/** ドリフト終了条件を満たすか（ヒステリシス側の閾値を使用） */
export function meetsExitCondition(
  lateralG: number,
  yawRate: number,
  thresholds: DriftThresholds = DEFAULT_THRESHOLDS,
): boolean {
  return (
    Math.abs(lateralG) < thresholds.exitLateralG ||
    Math.abs(yawRate)  < thresholds.exitYawRate
  );
}

/** ドリフト「強度」を 0.0〜1.0 で返すユーティリティ（UI演出用） */
export function driftIntensity(lateralG: number, yawRate: number): number {
  const gNorm   = Math.min(Math.abs(lateralG) / 1.2, 1.0);
  const yawNorm = Math.min(Math.abs(yawRate)  / 1.5, 1.0);
  return (gNorm + yawNorm) / 2;
}

/** ドリフト時間をフォーマット */
export function formatDriftDuration(ms: number): string {
  return (ms / 1000).toFixed(1);
}
