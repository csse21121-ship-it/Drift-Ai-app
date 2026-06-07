import type { MountOrientation } from '@/lib/orientation';

export type { MountOrientation };
export type { PhonePerformanceTier } from '@/types/phoneSensor';

export type MotionSample = {
  lateralG: number;
  longitudinalG: number;
  peakG: number;
  /** 車体ヨーレート (rad/s) — 重力軸投影済み。ドリフト検知に使用 */
  yawRateRad: number;
  /** 生ジャイロ値 (rad/s) — 表示・デバッグ用 */
  gyroX: number;
  gyroY: number;
  gyroZ: number;
};

export type GpsSample = {
  latitude: number;
  longitude: number;
  speedKmh: number;
  heading: number;
  altitude: number;
  accuracy: number;
  /** 標高ソース — 気圧融合時は baro_fusion */
  altitudeSource?: 'gps' | 'baro_fusion';
};

/** 走行中適応チューニング — セッション終了時に保存する実効プロファイル */
export type RuntimeEffectiveProfile = {
  /** セッション中に適応した平均モーション実効 Hz */
  avgEffectiveMotionHz: number;
  /** セッション中に適応した平均カルマン R */
  avgKalmanR: number;
  /** 最終モーション間隔 (ms) */
  finalMotionIntervalMs: number;
  /** 適応評価回数 */
  adaptationEvaluations: number;
};

/** スリップ角センサーフュージョン — ジャイロ軌跡 vs GPS 整合性（デバッグ用） */
export type SlipFusionConsistencySummary = {
  /** 0–100。高いほどジャイロ推定と GPS 方位が整合 */
  consistencyScore: number;
  meanHeadingErrorDeg: number;
  meanStraightSlipAbsDeg: number;
  speedMismatchRate: number;
  consistencySamples: number;
};

/** 計測品質 — リアルタイムスナップショット */
export type TelemetryQualitySnapshot = {
  score: number;
  tier: 'high' | 'medium' | 'low';
  gpsScore: number;
  motionHzScore: number;
  calibrationScore: number;
  orientationScore: number;
  effectiveMotionHz: number;
};

/** セッション全体の計測品質サマリー */
export type SessionQualitySummary = {
  averageScore: number;
  tier: 'high' | 'medium' | 'low';
  sampleCount: number;
  isReferenceOnly: boolean;
};

/** 練習モードへ切り替えた理由 */
export type PracticeModeReason = 'mock' | 'anomaly' | 'indoor' | 'mixed';

/** 走行中 GPS 整合性 — HUD 用スナップショット */
export type GpsIntegritySnapshot = {
  isGpsAnomalous: boolean;
  isPracticeMode: boolean;
  practiceReason: PracticeModeReason | null;
  accuracyM: number;
};

/** 勾配方向 — 登り / 下り / 平坦 */
export type GradeDirection = 'uphill' | 'downhill' | 'flat' | 'unknown';

/** 走行中勾配推定 — リアルタイムスナップショット */
export type GradeSnapshot = {
  direction: GradeDirection;
  /** 勾配 (%)。登り = 正、下り = 負 */
  gradePercent: number;
  /** 0–100 */
  confidence: number;
  source: 'gps' | 'inertial' | 'fusion' | 'baro_fusion' | 'none';
};

export type TelemetryState = {
  isActive: boolean;
  motion: MotionSample | null;
  gps: GpsSample | null;
  error: string | null;
  /** GPS モック / 物理的不整合 / 練習モード判定 */
  gpsIntegrity: GpsIntegritySnapshot | null;
  /** 現在検知しているマウント姿勢 */
  mountOrientation: MountOrientation;
  /** AUTO 時、姿勢判定が不安定（振動・unknown フォールバック等） */
  mountOrientationUnstable: boolean;
  /**
   * センサーフュージョンによるリアルタイムスリップアングル (°)
   * GPS 方位 − 車体ヘディング。
   * GPS 未受信 or 低速時は 0。
   */
  slipAngleDeg: number;
  /** リアルタイム計測品質（0–100） */
  telemetryQuality: TelemetryQualitySnapshot | null;
  /** 走行中勾配（登り / 下り / 平坦） */
  grade: GradeSnapshot | null;
};
