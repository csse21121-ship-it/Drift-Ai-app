/**
 * 1次元スカラー・カルマンフィルタ
 *
 * ────────────────────────────────────────────────────────────
 * プロセスモデル（定値追跡）:
 *   x[k] = x[k-1] + w[k],   w ~ N(0, Q)
 *
 * 観測モデル:
 *   z[k] = x[k] + v[k],     v ~ N(0, R)
 *
 * 更新ステップ:
 *   P_pred  = P + Q                  (予測誤差共分散)
 *   K       = P_pred / (P_pred + R)  (カルマン利得)
 *   x̂       = x̂ + K × (z − x̂)       (状態更新)
 *   P       = (1 − K) × P_pred       (誤差共分散更新)
 *
 * ────────────────────────────────────────────────────────────
 * パラメータ選択のガイド:
 *
 *   Q (プロセスノイズ)  ─ 物理量が 1 ステップでどの程度変化しうるか。
 *     横G: 0.01  (50ms で最大 ~0.1G/s 変化)
 *     重力: 0.0001 (ほぼ一定)
 *
 *   R (観測ノイズ)  ─ センサー計測の分散（標準偏差²）。
 *     スマホ加速度計: ±0.03G ノイズ → R ≈ 0.001
 *     道路振動含む実環境: R ≈ 0.09 が実用的
 *
 *   Q/R 比が大きい  → 利得 K ≈ 1 → 生センサーに近い（速い追従）
 *   Q/R 比が小さい  → 利得 K ≈ 0 → 強いスムージング（遅い追従）
 * ────────────────────────────────────────────────────────────
 */

import type { PhonePerformanceTier } from '@/types/phoneSensor';

/** プリセット Q/R が定義されている基準サンプリング間隔 (ms) */
export const BASE_REFERENCE_DT_MS = 50;

type Vec3 = { x: number; y: number; z: number };

/**
 * 重力方向成分を除去し、純粋な線形加速度（運動加速度）を m/s² で返す。
 *
 * DeviceMotion.acceleration は OS が重力除去済みだが、ホルダー共振で
 * 重力軸方向に残留成分が混ざる場合のフォールバック／検証用。
 * 通常パイプラインでは acceleration を優先し、本関数で二重チェック可能。
 */
export function extractLinearAccelerationMs2(
  accelerationIncludingGravity: Vec3,
  gravitySmoothed: Vec3,
): Vec3 {
  const gMag = Math.hypot(gravitySmoothed.x, gravitySmoothed.y, gravitySmoothed.z);
  if (gMag < 0.5) {
    return { ...accelerationIncludingGravity };
  }
  const nx = gravitySmoothed.x / gMag;
  const ny = gravitySmoothed.y / gMag;
  const nz = gravitySmoothed.z / gMag;
  const proj =
    accelerationIncludingGravity.x * nx +
    accelerationIncludingGravity.y * ny +
    accelerationIncludingGravity.z * nz;
  const linear = {
    x: accelerationIncludingGravity.x - proj * nx,
    y: accelerationIncludingGravity.y - proj * ny,
    z: accelerationIncludingGravity.z - proj * nz,
  };
  const gExpected = 9.80665;
  const residual = proj - gExpected;
  return {
    x: linear.x - residual * nx,
    y: linear.y - residual * ny,
    z: linear.z - residual * nz,
  };
}

/**
 * 1次元指数移動平均ローパス（LPF）。
 * y[k] = α·x[k] + (1−α)·y[k−1]
 * α=0.1〜0.2 でホルダー共振・エンジン振動などの高周波を抑制。
 */
export class LowPassFilter1D {
  private y: number;
  private readonly alpha: number;

  constructor(alpha: number, initialValue = 0) {
    this.alpha = Math.min(1, Math.max(0.01, alpha));
    this.y = initialValue;
  }

  update(x: number): number {
    this.y = this.alpha * x + (1 - this.alpha) * this.y;
    return this.y;
  }

  reset(initialValue = 0): void {
    this.y = initialValue;
  }

  get value(): number {
    return this.y;
  }

  getAlpha(): number {
    return this.alpha;
  }
}

/**
 * サンプリング間隔 dt に比例して Q/R を再スケールする。
 *
 * 連続時間ランダムウォークモデルを離散化する際、Q は dt に比例する。
 * R も同倍率でスケールすることで Q/R 比（≈ 定常カルマン利得）を
 * Hz 変更前後で近似的に維持し、フィルタの「効き具合」を保つ。
 */
export function scaleKalmanParamsForDt(
  dtMs: number,
  baseQ: number = G_FORCE_KALMAN_PARAMS.Q,
  baseR: number = G_FORCE_KALMAN_PARAMS.R,
  refDtMs: number = BASE_REFERENCE_DT_MS,
): { Q: number; R: number } {
  const factor = dtMs / refDtMs;
  return { Q: baseQ * factor, R: baseR * factor };
}

/** ピーク追従チャンネル: スムーズ用より R を小さく（レスポンス重視） */
export const PEAK_KALMAN_R_FACTOR = 0.38;
export const PEAK_KALMAN_Q_FACTOR = 1.25;

/**
 * スムーズ用カルマン係数から、瞬間ピーク検出用の別チャンネル係数を生成。
 */
export function buildPeakKalmanParams(
  smooth: { Q: number; R: number },
): { Q: number; R: number } {
  return {
    Q: smooth.Q * PEAK_KALMAN_Q_FACTOR,
    R: smooth.R * PEAK_KALMAN_R_FACTOR,
  };
}

export class KalmanFilter1D {
  private x: number;  // 状態推定値（フィルタ後の値）
  private P: number;  // 推定誤差共分散
  private Q: number;  // プロセスノイズ分散（走行中適応で変更可）
  private R: number;  // 観測ノイズ分散（走行中適応で変更可）

  constructor({
    Q,
    R,
    initialValue = 0,
    initialCovariance = 1,
  }: {
    Q: number;
    R: number;
    initialValue?: number;
    initialCovariance?: number;
  }) {
    this.Q = Q;
    this.R = R;
    this.x = initialValue;
    this.P = initialCovariance;
  }

  /**
   * 新しい計測値 z を与えてフィルタ後の推定値を返す。
   * 呼び出し頻度が均一（固定サンプリング間隔）であることを前提とする。
   */
  update(z: number): number {
    // ─ 予測ステップ ────────────────────────────────
    // (定値モデルなので x_pred = x は更新不要。P のみ増加)
    this.P += this.Q;

    // ─ 更新ステップ ────────────────────────────────
    const K = this.P / (this.P + this.R);  // カルマン利得
    this.x += K * (z - this.x);            // 状態更新
    this.P *= (1 - K);                      // 誤差共分散更新

    return this.x;
  }

  /** 現在の推定値を参照（update を呼ばない） */
  get value(): number {
    return this.x;
  }

  /** フィルタをリセット（セッション開始時に呼ぶ） */
  reset(initialValue = 0, initialCovariance = 1): void {
    this.x = initialValue;
    this.P = initialCovariance;
  }

  /** 走行中適応チューニング: 測定ノイズ R を更新 */
  setR(R: number): void {
    this.R = R;
  }

  /** 走行中適応チューニング: プロセスノイズ Q を更新（サンプリング間隔変更に連動） */
  setQ(Q: number): void {
    this.Q = Q;
  }

  getR(): number {
    return this.R;
  }

  getQ(): number {
    return this.Q;
  }
}

/** 横G / 前後G 1 チャンネル: LPF → カルマン */
export class MotionGFilterChannel {
  private lpf: LowPassFilter1D;
  private kalman: KalmanFilter1D;

  constructor(lpfAlpha: number, kalmanQ: number, kalmanR: number) {
    this.lpf = new LowPassFilter1D(lpfAlpha);
    this.kalman = new KalmanFilter1D({ Q: kalmanQ, R: kalmanR });
  }

  update(rawG: number): number {
    return this.kalman.update(this.lpf.update(rawG));
  }

  reset(): void {
    this.lpf.reset();
    this.kalman.reset();
  }

  setKalmanQ(Q: number): void {
    this.kalman.setQ(Q);
  }

  setKalmanR(R: number): void {
    this.kalman.setR(R);
  }

  getKalmanR(): number {
    return this.kalman.getR();
  }

  getKalmanQ(): number {
    return this.kalman.getQ();
  }
}

export type MountVibrationFilterConfig = {
  lpfAlpha: number;
  peakLpfAlpha: number;
  kalmanQ: number;
  kalmanR: number;
  peakKalmanQ: number;
  peakKalmanR: number;
};

/**
 * スムージングプリセット・キャリブノイズからホルダー振動向けフィルタ係数を生成。
 */
export function buildMountVibrationFilterConfig(options: {
  lpfAlpha: number;
  kalmanQMultiplier: number;
  kalmanRMultiplier: number;
  calibrationRMultiplier?: number;
  baseKalmanQ: number;
  baseKalmanR: number;
}): MountVibrationFilterConfig {
  const calMult = options.calibrationRMultiplier ?? 1;
  const rMult = options.kalmanRMultiplier * calMult;
  const qMult = options.kalmanQMultiplier;

  const kalmanQ = options.baseKalmanQ * qMult;
  const kalmanR = options.baseKalmanR * rMult;
  const smooth = { Q: kalmanQ, R: kalmanR };
  const peak = buildPeakKalmanParams(smooth);

  const peakLpfAlpha = Math.min(0.35, options.lpfAlpha * 1.35);

  return {
    lpfAlpha: options.lpfAlpha,
    peakLpfAlpha,
    kalmanQ,
    kalmanR,
    peakKalmanQ: peak.Q,
    peakKalmanR: peak.R,
  };
}

// ── 推奨パラメータのプリセット ──────────────────────────────

/**
 * 横G / 前後G 用 (50ms サンプリング想定) *
 * Q = 0.01:  50ms で最大 ~0.1G/s の加速度変化を許容
 * R = 0.09:  実車でのスマホ道路振動ノイズの推定分散
 *
 * 定常カルマン利得 K* ≈ Q/(Q+R) ≈ 0.10（固定 α=0.10 の lowPass と等価）
 * ただし急変時は K が一時的に上昇し、追従が速くなる。
 */
export const G_FORCE_KALMAN_PARAMS = { Q: 0.01, R: 0.09 };

/**
 * 端末性能ティア別 — G カルマン R の基準値（50 ms サンプリング想定）
 * HIGH: タイト（低 R）· STANDARD: 標準 · LOW: ルーズ（高 R / 強スムージング）
 */
export const PHONE_TIER_G_KALMAN_R: Record<PhonePerformanceTier, number> = {
  'phone-high': 0.055,
  'phone-standard': 0.09,
  'phone-low': 0.13,
};

/** 端末ティアから G 用カルマン R を取得（未指定時は標準 R） */
export function resolvePhoneTierKalmanR(
  tier: PhonePerformanceTier | undefined,
  fallbackR: number = G_FORCE_KALMAN_PARAMS.R,
): number {
  if (tier == null) return fallbackR;
  return PHONE_TIER_G_KALMAN_R[tier];
}

/**
 * 重力ベクトル各軸用 (50ms サンプリング想定)
 *
 * Q = 0.0001: 重力はほぼ一定（急な向き変化は少ない）
 * R = 0.10:   加速度計の振動ノイズ（重力軸では路面振動が直接混入）
 */
export const GRAVITY_KALMAN_PARAMS = { Q: 0.0001, R: 0.10 };
