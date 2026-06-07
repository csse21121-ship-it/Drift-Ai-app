/**
 * ドリフト検知 — 型定義
 */

export type DriftPhase = 'idle' | 'active';

export type DriftEvent = {
  id: string;
  startedAt: number;
  durationMs: number;
  peakLateralG: number;
  peakYawRate: number;
  peakSpeedKmh: number;
  /** ヨーレート積分の累積回転角度 (°) */
  peakAngleDeg: number;
  /**
   * センサーフュージョンによるピークスリップアングル (°)
   * GPS 方位と車体ヘディングの差の最大値。
   * GPS 未受信の場合は 0。
   */
  peakSlipAngleDeg: number;
};

export type DriftStatus = {
  phase: DriftPhase;
  /** 現在のドリフト開始時刻 (Date.now)。idle 時は undefined */
  activeStartedAt?: number;
  /** 現在のドリフト継続時間 (ms) */
  activeDurationMs: number;
  /** 今のドリフトのピーク横G */
  activePeakLateralG: number;
  /** ヨーレート積分による累積回転角度 (°) */
  activeAngleDeg: number;
  /**
   * リアルタイムのスリップアングル (°)
   * センサーフュージョン値。GPS 未受信時は 0。
   */
  activeSlipAngleDeg: number;
  events: DriftEvent[];
  driftCount: number;
};
