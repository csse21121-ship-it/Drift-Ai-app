/**
 * スコアリング — 型定義
 */

import type { ZoneBestRecord } from '@/types/course';
import type { DriftEvent } from '@/types/drift';
import type { TelemetrySourceMetadata } from '@/types/logger';
import type { RuntimeEffectiveProfile, PracticeModeReason, SessionQualitySummary, SlipFusionConsistencySummary } from '@/types/telemetry';
import type { TsuisoPenaltyItem } from '@/types/tsuisoPenalty';
export type { PracticeModeReason } from '@/types/telemetry';
export type { DriftEvent };

/** グレード: S → A → B → C → D */
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

/** 1回のドリフトに付与されたスコアの詳細 */
export type DriftScore = {
  eventId: string;
  /** コンボ倍率適用前のベーススコア（speedBonus 込み） */
  basePoints: number;
  /** このドリフト時点のコンボ数 (1〜5) */
  combo: number;
  /**
   * スリップアングルボーナス倍率 (1.00〜1.50)。
   * GPS 未取得またはスリップ角 5° 未満のときは 1.00（ボーナスなし）。
   * undefined は旧セーブデータの互換値として 1.00 と同義。
   */
  angleBonus?: number;
  /**
   * スコアリングゾーン倍率 (1.0〜)。
   * ドリフト発生時にゾーン内にいた場合に適用される。
   * undefined / 1.0 はゾーン外または旧データ互換値。
   */
  zoneMultiplier?: number;
  /** 最終ポイント = basePoints × angleBonus × comboMultiplier × zoneMultiplier */
  finalPoints: number;
};

/**
 * AsyncStorage に永続化する履歴エントリ
 * SessionResult を拡張してユニーク ID と保存時刻を付与する
 */
export type SessionHistoryEntry = SessionResult & {
  /** `session_${Date.now()}` 形式のユニーク ID */
  id: string;
  /** 保存時刻 (Date.now()) */
  savedAt: number;
};

/** 1周回 / 1本走行のサマリー */
export type LapSummary = {
  lapNumber:   number;
  /** ストリートコースの走行方向 */
  direction:   'forward' | 'reverse';
  startedAtMs: number;   // セッション開始からの経過 ms
  durationMs:  number;
  points:      number;
  driftCount:  number;
  bestDriftMs: number;
};

/** ゾーン通過イベント（セッション中に記録） */
export type ZoneCrossing = {
  zoneId:        string;
  zoneName:      string;
  multiplier:    number;
  /** セッション開始からの経過 ms */
  enteredAtMs:   number;
  /** ゾーン内滞在時間 ms（退出した場合のみ） */
  durationMs?:   number;
  /** scoreSession 後 — この滞在中に獲得したドリフト pt 合計 */
  pointsEarned?: number;
  /** scoreSession 後 — この滞在中に採点されたドリフト本数 */
  driftHits?:    number;
};

/** ゾーンなぞり達成率（コーナー別） */
export type ZoneTraceDetail = {
  zoneId: string;
  zoneName: string;
  /** 0〜100 */
  tracePct: number;
};

/** セッション全体のゾーンなぞりサマリー */
export type ZoneTraceSummary = {
  overallPct: number;
  zonesCleared: number;
  totalZones: number;
  details: ZoneTraceDetail[];
};

/** この % 以上でゾーン「クリア」 */
export const ZONE_TRACE_CLEAR_THRESHOLD = 80;

/** 理想ライン一致スコアの「良好」閾値 */
export const LINE_EVAL_GOOD_THRESHOLD = 75;

/** コーナー内位置（改善ヒント用） */
export type LineEvalSegment = 'entry' | 'apex' | 'exit';

/** 理想ラインからの改善ヒント */
export type LineImprovementHint = {
  zoneId: string;
  zoneName: string;
  segment: LineEvalSegment;
  /** 理想ラインからの平均横ズレ (m)。正=アウト側、負=イン側 */
  lateralOffsetM: number;
  hint: string;
  severity: 'info' | 'warn';
};

/** ゾーン別理想ライン評価 */
export type LineEvalDetail = {
  zoneId: string;
  zoneName: string;
  /** 0〜100（コリドー理想ラインがあるゾーンのみ算出） */
  lineScore: number;
  /** 平均横ズレ (m) */
  avgDevM: number;
  /** 最大横ズレ (m) */
  maxDevM: number;
  /** corridorPath があり評価可能 */
  evaluable: boolean;
};

/** セッション全体の理想ライン評価サマリー */
export type LineEvalSummary = {
  overallScore: number;
  zonesEvaluated: number;
  totalZones: number;
  details: LineEvalDetail[];
  hints: LineImprovementHint[];
  /** 精度フィルタ後に評価に使った軌跡点数 */
  trackPointsUsed?: number;
  /** 精度フィルタで除外した点数 */
  trackPointsRejected?: number;
  /** 評価軌跡の主要 GPS ソース */
  gpsSource?: 'phone' | 'logger' | 'mixed';
  /** セッション後に理想ラインを更新したゾーン数 */
  zonesLearned?: number;
};

/** セッション中に記録した GPS 軌跡の1点 */
export type TrackPoint = {
  /** セッション開始からの経過 ms */
  tMs: number;
  latitude: number;
  longitude: number;
  /** 記録時の速度 (km/h) */
  speedKmh?: number;
  /** GPS 精度 (m) — 理想ライン評価フィルタ用 */
  accuracyM?: number;
  /** 座標ソース（理想ライン評価専用軌跡で使用） */
  gpsSource?: 'phone' | 'logger';
};

/** 公式記録 vs 練習（参考）モード */
export type ScoringMode = 'official' | 'practice';

/** GPS 品質タイムラインの1点 */
export type GpsQualityTimelinePoint = {
  /** セッション開始からの経過 ms */
  tMs: number;
  accuracyM: number;
  /** 0–100（精度から換算） */
  qualityScore: number;
  anomalous: boolean;
  mocked: boolean;
};

/** セッション終了時に保存する GPS 整合性サマリー */
export type SessionGpsIntegritySummary = {
  isGpsAnomalous: boolean;
  isPracticeMode: boolean;
  practiceReason: PracticeModeReason | null;
  mockDetected: boolean;
  anomalySampleCount: number;
  totalGpsSamples: number;
  /** 0–1 */
  indoorSampleRate: number;
  timeline: GpsQualityTimelinePoint[];
};

/** セッション中のテレメトリーログ1点（G・角度・ドリフト状態） */
export type TelemetryLogPoint = {
  tMs: number;
  /** UTC epoch ms — 追走オフライン同期用 */
  timestampUtcMs?: number;
  latitude?: number;
  longitude?: number;
  lateralG: number;
  longitudinalG: number;
  /** その時点までのセッション peak G */
  peakG: number;
  yawRateRad: number;
  slipAngleDeg: number;
  speedKmh?: number;
  driftPhase: 'idle' | 'active';
  activeDurationMs: number;
  activePeakLateralG: number;
  activeSlipAngleDeg: number;
  activeAngleDeg: number;
  driftCount: number;
};

/** セッション全体のスコアサマリー */
export type SessionResult = {
  startedAt: number;             // Date.now() of session start
  /** セッションで使用したコース名（コースなしなら undefined） */
  courseName?: string;
  sessionDurationMs: number;
  totalPoints: number;
  grade: Grade;
  /** スコア詳細（events と同インデックスで対応） */
  driftScores: DriftScore[];
  /** 生のドリフトイベント（ログ表示用） */
  events: DriftEvent[];
  /** セッション中の最大速度 (km/h) */
  maxSpeedKmh: number;
  /** セッション中のピーク横G */
  maxLateralG: number;
  /** ベストドリフト継続時間 (ms) */
  bestDriftDurationMs: number;
  /** ゾーン通過ログ（コース設定がある場合） */
  zoneCrossings?: ZoneCrossing[];
  /** コース上の全スコアリングゾーン数（なぞり率算出用） */
  courseZoneTotal?: number;
  /** ゾーンなぞり達成率（セッション保存時に算出） */
  zoneTrace?: ZoneTraceSummary;
  /** 理想ラインとのズレ評価（コリドーゾーン × GPS 軌跡） */
  lineEval?: LineEvalSummary;
  /** 周回 / 本数ログ（circuit / street コース用） */
  laps?: LapSummary[];
  /** コースタイプ */
  courseType?: 'circuit' | 'street' | 'unknown';
  /** 走行軌跡（セッション中の GPS 時系列） */
  gpsTrack?: TrackPoint[];
  /** G・角度・ドリフト状態の時系列（結果画面プレイバック用） */
  telemetryLog?: TelemetryLogPoint[];
  /** このセッションで更新されたコーナー別ベスト記録 */
  zoneBestUpdates?: ZoneBestUpdate[];
  /** テレメトリソース（スマホ / 外部ロガー / ハイブリッド） */
  telemetrySource?: TelemetrySourceMetadata;
  /** 走行中適応チューニングの実効プロファイル（STOP 時に記録） */
  runtimeEffectiveProfile?: RuntimeEffectiveProfile;
  /** スリップ角フュージョン — ジャイロ vs GPS 整合性スコア（STOP 時に記録） */
  slipFusionConsistency?: SlipFusionConsistencySummary;
  /** 走行全体の平均計測品質（STOP 時に記録） */
  telemetryQuality?: SessionQualitySummary;
  /** 公式記録 or 練習（参考）— GPS 整合性により自動決定 */
  scoringMode?: ScoringMode;
  /** GPS モック検知・物理的不整合・品質タイムライン */
  gpsIntegrity?: SessionGpsIntegritySummary;
};

/** セッション中に更新されたゾーンベスト */
export type ZoneBestUpdate = {
  zoneId: string;
  zoneName: string;
  bestRecord: ZoneBestRecord;
};

/** 追走採点 — 各カテゴリ満点 */
export const TSUISO_SCORE_MAX = {
  proximity: 40,
  angleMatch: 30,
  transitionSync: 30,
  total: 100,
} as const;

/** @deprecated Post-Run Merge では TsuisoLocalSession を使用 */
export type LeadGhostData = {
  savedAt: number;
  startedAtUtcMs: number;
  sessionDurationMs: number;
  telemetryLog: TelemetryLogPoint[];
};

/** UTC 絶対時刻同期済み Lead / Chase ペア */
export type TsuisoAlignedPair = {
  timestampUtcMs: number;
  lead: TelemetryLogPoint;
  chase: TelemetryLogPoint;
  distanceM: number;
  angleDeltaDeg: number;
};

/** 追走スコア内訳 — D1GP / FDJ 基準 100点満点 */
export type TsuisoScoreBreakdown = {
  /** A: 近接度 (0–40) */
  proximity: number;
  /** B: 角度同調 (0–30) */
  angleMatch: number;
  /** C: 振り返し同調 (0–30) */
  transitionSync: number;
  /** 総合 (0–100) — 減点後 */
  total: number;
  /** 減点前の素点 */
  grossTotal: number;
  /** 減点合計 */
  penaltyTotal: number;
  /** 減点内訳 */
  penalties: TsuisoPenaltyItem[];
  /** 反則敗北（0点固定） */
  infractionLoss: boolean;
  /** 有効な走行データに基づく採点か（机固定・非走行は false） */
  isValid: boolean;
  /** isValid=false の理由（UI 表示用） */
  invalidReason?: string;
  alignedSampleCount: number;
  /** ドリフト区間フレーム数（近接度算出に使用） */
  driftFrameCount: number;
  avgDistanceM: number;
  avgAngleDeltaDeg: number;
  avgTransitionLagMs: number;
  transitionPairCount: number;
};
