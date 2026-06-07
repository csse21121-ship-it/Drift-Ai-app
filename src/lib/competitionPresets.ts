/**
 * competitionPresets — 採点スタイルプリセット管理
 *
 * JSON ファイルを静的 require で読み込み、型安全に提供する。
 * applyPresetToZones / applyPresetToProfile はコース生成・編集時に使用。
 */

import type { CompetitionPreset } from '@/types/competition';
import type { ScoringProfile, ScoringZone } from '@/types/course';
import { createCornerCorridor } from './geofence';
import type { CornerInfo } from './geofence';

// ── 静的読み込み（Expo バンドラーは動的 require を苦手とするため） ──
const RAW_D1GP    = require('@/data/competitionPresets/d1gp.json')    as CompetitionPreset;
const RAW_FDJ     = require('@/data/competitionPresets/fdj.json')     as CompetitionPreset;
const RAW_CASUAL  = require('@/data/competitionPresets/casual.json')  as CompetitionPreset;

// ────────────────────────────────────────────────────────────────
// プリセット一覧
// ────────────────────────────────────────────────────────────────

export const ALL_PRESETS: CompetitionPreset[] = [RAW_D1GP, RAW_FDJ, RAW_CASUAL];

export function getPresetById(id: string): CompetitionPreset | null {
  return ALL_PRESETS.find((p) => p.id === id) ?? null;
}

// ────────────────────────────────────────────────────────────────
// 適用関数
// ────────────────────────────────────────────────────────────────

/**
 * 既存コーナー情報にプリセットを適用して ScoringZone[] を再生成する。
 * course-editor の「採点スタイル変更」ボタンから呼ばれる。
 */
export function applyPresetToZones(
  corners:  CornerInfo[],
  preset:   CompetitionPreset,
): ScoringZone[] {
  return corners.map((c, i): ScoringZone => {
    const polygon = createCornerCorridor(c.points, preset.zoneHalfWidthM);
    return {
      id:                `auto_z${i}`,
      name:              `コーナー${i + 1}`,
      zoneShape:         'polygon',
      polygon,
      multiplier:        preset.zoneMultiplier,
      color:             preset.zoneColor,
      corridorPath:      c.points,
      corridorHalfWidth: preset.zoneHalfWidthM,
    };
  });
}

/**
 * プリセットから ScoringProfile を生成する。
 */
export function applyPresetToProfile(preset: CompetitionPreset): ScoringProfile {
  return {
    speedReferenceKmh:    preset.speedReferenceKmh,
    angleScaleDeg:        preset.angleScaleDeg,
    comboWindowMs:        preset.comboWindowMs,
    gradientCompensation: preset.gradientCompensation,
    gradeDifficulty:      preset.gradeDifficulty,
  };
}
