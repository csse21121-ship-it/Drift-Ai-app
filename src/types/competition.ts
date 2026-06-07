/**
 * DriftScore AI — Competition & Circuit 型定義
 *
 * Phase 2: CompetitionPreset — 採点スタイルプリセット
 * Phase 3: CircuitLayout   — 既知サーキットDB
 */

import type { GeoPoint, ScoringProfile } from './course';

// ────────────────────────────────────────────────────────────────
// Phase 2: 採点スタイルプリセット
// ────────────────────────────────────────────────────────────────

/**
 * 大会スタイルの採点プリセット。
 * ゾーン幅・倍率・ScoringProfile をセットで定義する。
 */
export type CompetitionPreset = {
  id: string;
  /** 表示名（例: "D1GP 風"） */
  name: string;
  /** 説明文 */
  description: string;
  /** アイコン絵文字 */
  icon: string;

  // ── ゾーン設定 ──
  /** コリドーゾーンの片側幅 (m)  例: D1GP=0.8, カジュアル=2.0 */
  zoneHalfWidthM: number;
  /** ゾーン内スコア倍率 */
  zoneMultiplier: number;
  /** コーナーゾーンの色 (hex) */
  zoneColor: string;

  // ── ScoringProfile パラメータ ──
  speedReferenceKmh:    number;
  angleScaleDeg:        number;
  comboWindowMs:        number;
  gradientCompensation: number;
  gradeDifficulty:      ScoringProfile['gradeDifficulty'];
};

// ────────────────────────────────────────────────────────────────
// Phase 3: 既知サーキット DB
// ────────────────────────────────────────────────────────────────

/**
 * サーキットの1レイアウト。
 * 手作り座標ベース — 官公式データではなくオリジナル近似座標。
 */
export type CircuitLayout = {
  id: string;
  /** サーキット名（略称） */
  name: string;
  /** 所在地（都道府県） */
  location: string;
  /** レイアウト種別 */
  type: 'circuit' | 'street';
  /** スタート/フィニッシュライン */
  startLine: GeoPoint;
  /** レイアウトの代表点列（近似座標） */
  path: GeoPoint[];
  /** 推奨採点プリセット ID */
  recommendedPresetId: string;
  /** 全長 (m) 近似値 */
  lengthM: number;
  /** コーナー数（近似） */
  cornerCount: number;
};

/**
 * circuitMatcher で findNearbyLayouts が返す候補。
 * 距離情報を付加。
 */
export type CircuitCandidate = CircuitLayout & {
  /** スタートピンからの距離 (m) */
  distanceM: number;
};
