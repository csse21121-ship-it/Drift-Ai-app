/**
 * アプリ設定の型定義
 *
 * ユーザーが調整できる2カテゴリ:
 *   1. DriftThresholds  — ドリフト検知の判定閾値 (5項目)
 *   2. MountOrientationOverride — スマホマウント向きの手動指定
 */

import type { MountOrientation } from '@/lib/orientation';
import type { UiThemePresetId } from '@/constants/uiThemes';
import { DEFAULT_UI_THEME_ID } from '@/constants/uiThemes';
import type { BgmTrackId } from '@/constants/bgmTracks';
import { DEFAULT_BGM_TRACK_ID } from '@/constants/bgmTracks';

// ── マウント向き設定 ─────────────────────────────────────────

/**
 * 'auto' = センサーから自動検知（デフォルト）
 * それ以外 = 指定した向きに固定する
 */
export type MountOrientationOverride = 'auto' | MountOrientation;

// ── ドリフト検知閾値 ─────────────────────────────────────────

/**
 * ユーザーが設定画面で調整できる5つの閾値。
 * confirmMs / exitConfirmMs は技術的すぎるため非公開のまま。
 */
export type DriftThresholds = {
  /** ドリフト開始判定の横G (G) */
  enterLateralG: number;
  /** ドリフト終了判定の横G (G) — enterLateralG より小さく保つ */
  exitLateralG: number;
  /** ドリフト開始判定のヨーレート (rad/s) */
  enterYawRate: number;
  /** ドリフト終了判定のヨーレート (rad/s) — enterYawRate より小さく保つ */
  exitYawRate: number;
  /** ドリフト判定に必要な最低速度 (km/h) */
  minSpeedKmh: number;
};

// ── アプリ全体設定 ───────────────────────────────────────────

export type AppSettings = {
  thresholds: DriftThresholds;
  mountOverride: MountOrientationOverride;
  /** フィードバック設定 */
  feedback: FeedbackSettings;
  /** UI テーマプリセット ID */
  appearanceThemeId: UiThemePresetId;
  /** G センサー・ホルダー振動向けスムージングプリセット */
  smoothingPreset: SmoothingPreset;
  /** 路面コンディション — DRY 標準 / WET 低μ路 */
  surfaceCondition: SurfaceCondition;
};

/** 路面コンディション */
export type SurfaceCondition = 'dry' | 'wet';

export type FeedbackSettings = {
  hapticsEnabled: boolean;
  /** UI SE・ドリフト SE のマスター ON/OFF */
  soundEnabled: boolean;
  /** BGM 単体 ON/OFF（SOUND ON 時のみ有効） */
  bgmEnabled: boolean;
  /** BGM 音量 0–1 */
  bgmVolume: number;
  /** ループ BGM トラック（theme = UI テーマ連動） */
  bgmTrackId: BgmTrackId;
  /** UI SE・ドリフト SE・スプラッシュ SE 音量 0–1 */
  sfxVolume: number;
};

export const DEFAULT_FEEDBACK: FeedbackSettings = {
  hapticsEnabled: true,
  soundEnabled: true,
  bgmEnabled: true,
  bgmVolume: 1,
  bgmTrackId: DEFAULT_BGM_TRACK_ID,
  sfxVolume: 1,
};

// ── デフォルト値 ─────────────────────────────────────────────

export const DEFAULT_THRESHOLDS: DriftThresholds = {
  enterLateralG: 0.35,
  exitLateralG:  0.18,
  enterYawRate:  0.25,
  exitYawRate:   0.12,
  minSpeedKmh:   25,
};

export const DEFAULT_SETTINGS: AppSettings = {
  thresholds:    DEFAULT_THRESHOLDS,
  mountOverride: 'auto',
  feedback:      DEFAULT_FEEDBACK,
  appearanceThemeId: DEFAULT_UI_THEME_ID,
  smoothingPreset: 'standard',
  surfaceCondition: 'dry',
};

// ── G スムージングプリセット（ホルダー振動・エンジン共振対策） ──

/** スムージング強度プリセット */
export type SmoothingPreset = 'strong' | 'standard' | 'peak';

export type SmoothingPresetParams = {
  /** 横G 前段 LPF の α（0–1、小さいほど強スムージング） */
  lpfAlpha: number;
  /** カルマン R の倍率（大きいほどノイズ除去強） */
  kalmanRMultiplier: number;
  /** カルマン Q の倍率 */
  kalmanQMultiplier: number;
};

export const SMOOTHING_PRESET_PARAMS: Record<SmoothingPreset, SmoothingPresetParams> = {
  /** ノイズが多い車・緩いマウント向け */
  strong: {
    lpfAlpha: 0.12,
    kalmanRMultiplier: 1.45,
    kalmanQMultiplier: 0.85,
  },
  /** バランス型（推奨） */
  standard: {
    lpfAlpha: 0.16,
    kalmanRMultiplier: 1.0,
    kalmanQMultiplier: 1.0,
  },
  /** ガッチリ固定・ピーク重視 */
  peak: {
    lpfAlpha: 0.20,
    kalmanRMultiplier: 0.72,
    kalmanQMultiplier: 1.15,
  },
};

export const SMOOTHING_PRESET_LABELS: Record<SmoothingPreset, string> = {
  strong: '強',
  standard: '標準',
  peak: 'ピーク',
};

export const SMOOTHING_PRESET_DESCRIPTIONS: Record<SmoothingPreset, string> = {
  strong: 'ノイズが多い車・緩いマウント',
  standard: 'バランス（推奨）',
  peak: 'ガッチリ固定・ピーク重視',
};

export function normalizeSmoothingPreset(value: unknown): SmoothingPreset {
  if (value === 'strong' || value === 'standard' || value === 'peak') return value;
  return 'standard';
}

export function normalizeSurfaceCondition(value: unknown): SurfaceCondition {
  return value === 'wet' ? 'wet' : 'dry';
}

// ── ドリフト閾値プリセット ───────────────────────────────────

export type PresetName = 'easy' | 'standard' | 'pro';

export const THRESHOLD_PRESETS: Record<PresetName, DriftThresholds> = {
  /** 低閾値 — 街乗り・初心者・テスト用 */
  easy: {
    enterLateralG: 0.25,
    exitLateralG:  0.12,
    enterYawRate:  0.18,
    exitYawRate:   0.08,
    minSpeedKmh:   20,
  },
  /** 標準値 — 推奨設定 */
  standard: DEFAULT_THRESHOLDS,
  /** 高閾値 — サーキット・上級者向け */
  pro: {
    enterLateralG: 0.45,
    exitLateralG:  0.25,
    enterYawRate:  0.35,
    exitYawRate:   0.18,
    minSpeedKmh:   30,
  },
};
