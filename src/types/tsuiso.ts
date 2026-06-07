/**
 * 追走（Tsuiso）採点 — 型定義
 * D1GP / Formula Drift Japan 基準のオフライン同期用
 */

import type { TsuisoAlignedPair, TsuisoScoreBreakdown } from '@/types/score';
import type { TelemetryLogPoint } from '@/types/score';

export type { LeadGhostData, TsuisoAlignedPair, TsuisoScoreBreakdown } from '@/types/score';
export { TSUISO_SCORE_MAX } from '@/types/score';

export type TsuisoRole = 'lead' | 'chase';

/** AirDrop 等で共有する走行データ JSON のスキーマ */
export type TsuisoRunExport = {
  formatVersion: 1;
  role: TsuisoRole;
  exportedAtUtcMs: number;
  startedAtUtcMs: number;
  sessionDurationMs: number;
  driverLabel?: string;
  /** UTC + GPS 座標付きテレメトリーログ */
  telemetryLog: TelemetryLogPoint[];
};

export type TsuisoCompareResult = {
  lead: TsuisoRunExport;
  chase: TsuisoRunExport;
  score: TsuisoScoreBreakdown;
  alignedPairs: TsuisoAlignedPair[];
};
