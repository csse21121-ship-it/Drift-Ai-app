/**
 * 追走（Tsuiso）減点 — D1GP / FDJ 大会基準
 */

import type { TsuisoRole } from '@/types/tsuiso';

export type TsuisoPenaltyCode =
  | 'spin'
  | 'half_spin'
  | 'engine_stall'
  | 'false_start'
  | 'early_overtake'
  | 'off_course'
  | 'no_good'
  | 'understeer'
  | 'lead_stall';

export type TsuisoPenaltyItem = {
  code: TsuisoPenaltyCode;
  /** 表示名（日本語） */
  labelJa: string;
  /** 減点（正の数 = 引く点数） */
  deduction: number;
  /** 減点対象 */
  role: TsuisoRole | 'pair';
  /** 発生時刻 UTC ms */
  atUtcMs?: number;
  detail?: string;
  /** 反則敗北 — 総合点を 0 に固定 */
  infractionLoss?: boolean;
};

export type TsuisoPenaltySummary = {
  items: TsuisoPenaltyItem[];
  /** 減点合計（正の数） */
  totalDeduction: number;
  /** 反則敗北 */
  infractionLoss: boolean;
};
