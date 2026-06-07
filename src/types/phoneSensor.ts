/**
 * 端末内蔵センサーのプローブ結果
 */

/** 端末性能ティア（プローブ専用） */
export type PhonePerformanceTier =
  | 'phone-high'
  | 'phone-standard'
  | 'phone-low';

/** モーション段階テスト 1 ステージの結果 */
export type MotionProbeStageResult = {
  requestedIntervalMs: number;
  effectiveIntervalMs: number | null;
  effectiveHz: number;
  jitterMs: number;
  sampleCount: number;
  deliveryRatio: number;
  stable: boolean;
};

/** センサープローブの生結果 */
export type PhoneSensorProbeResult = {
  /** DeviceMotion が利用可能か */
  motionAvailable: boolean;
  /** 安定した実測モーション更新レート (Hz) */
  motionSampleRateHz: number;
  /** 安定した最小リクエスト間隔 (ms) */
  motionStableIntervalMs: number;
  /** モーション取得間隔の標準偏差 (ms) */
  motionJitterMs: number;
  /** 段階テスト各ステージの詳細 */
  motionStageResults: MotionProbeStageResult[];
  /** 位置情報権限が付与されているか */
  locationGranted: boolean;
  /** 採用した GPS 更新レート (Hz) */
  gpsSampleRateHz: number;
  /** ベースライン GPS リクエスト間隔 (ms) */
  gpsBaselineIntervalMs: number;
  /** アグレッシブ GPS テスト間隔 (ms)。未実施は null */
  gpsAggressiveIntervalMs: number | null;
  /** アグレッシブ GPS の実効 Hz。未安定は null */
  gpsAggressiveHz: number | null;
  /** GPS 取得間隔の標準偏差 (ms) */
  gpsJitterMs: number | null;
  /** プローブ中の GPS 精度平均 (m)。サンプルなしは null */
  avgGpsAccuracyM: number | null;
  /** 高精度 GPS テストは屋外推奨（屋内失敗など） */
  gpsOutdoorTestRecommended: boolean;
  /** 端末性能ティア */
  phonePerformanceTier: PhonePerformanceTier;
  /** プローブ完了時刻 */
  probedAt: number;
};

export const DEFAULT_PHONE_PROBE: PhoneSensorProbeResult = {
  motionAvailable: true,
  motionSampleRateHz: 20,
  motionStableIntervalMs: 50,
  motionJitterMs: 0,
  motionStageResults: [],
  locationGranted: false,
  gpsSampleRateHz: 2,
  gpsBaselineIntervalMs: 500,
  gpsAggressiveIntervalMs: null,
  gpsAggressiveHz: null,
  gpsJitterMs: null,
  avgGpsAccuracyM: null,
  gpsOutdoorTestRecommended: false,
  phonePerformanceTier: 'phone-standard',
  probedAt: 0,
};

export type PhoneProbeProgress = {
  phase: 'motion' | 'gps_baseline' | 'gps_aggressive';
  detail: string;
};
