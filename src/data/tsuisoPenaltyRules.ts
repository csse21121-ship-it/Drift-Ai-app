/**
 * D1GP / FDJ 追走減点ルール — 100点満点スケールへの換算
 *
 * 参考: D1GP 付則 採点基準（スピン・コース外・ノーグッド・フライング等）
 * 公式の「ランク降格」は 100 点制の減点にスケール換算している。
 */

import type { TsuisoPenaltyCode } from '@/types/tsuisoPenalty';

export type TsuisoPenaltyRule = {
  code: TsuisoPenaltyCode;
  labelJa: string;
  /** 1回あたりの減点 */
  deduction: number;
  /** 反則敗北（0点固定） */
  infractionLoss: boolean;
  /** 同一コードの最大適用回数 */
  maxCount: number;
};

/** 大会共通の減点テーブル */
export const TSUISO_PENALTY_RULES: Record<TsuisoPenaltyCode, TsuisoPenaltyRule> = {
  spin: {
    code: 'spin',
    labelJa: 'スピン',
    deduction: 40,
    infractionLoss: true,
    maxCount: 1,
  },
  half_spin: {
    code: 'half_spin',
    labelJa: 'ハーフスピン',
    deduction: 20,
    infractionLoss: false,
    maxCount: 2,
  },
  engine_stall: {
    code: 'engine_stall',
    labelJa: 'エンスト',
    deduction: 35,
    infractionLoss: true,
    maxCount: 1,
  },
  false_start: {
    code: 'false_start',
    labelJa: 'フライングスタート',
    deduction: 30,
    infractionLoss: true,
    maxCount: 1,
  },
  early_overtake: {
    code: 'early_overtake',
    labelJa: '初動前の先行超え',
    deduction: 30,
    infractionLoss: true,
    maxCount: 1,
  },
  off_course: {
    code: 'off_course',
    labelJa: 'コース外走行',
    deduction: 12,
    infractionLoss: false,
    maxCount: 2,
  },
  no_good: {
    code: 'no_good',
    labelJa: 'ノーグッド（離れすぎ）',
    deduction: 10,
    infractionLoss: false,
    maxCount: 1,
  },
  understeer: {
    code: 'understeer',
    labelJa: 'アンダー / バランス喪失',
    deduction: 8,
    infractionLoss: false,
    maxCount: 2,
  },
  lead_stall: {
    code: 'lead_stall',
    labelJa: '先行車エンスト（妨害）',
    deduction: 15,
    infractionLoss: false,
    maxCount: 1,
  },
};

export const TSUISO_MAX_TOTAL_DEDUCTION = 100;
