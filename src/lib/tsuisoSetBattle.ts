/**
 * 追走セットバトル — 採点・勝敗判定
 */

import { compareTsuisoRuns } from '@/lib/tsuisoScoring';
import type { TsuisoRole, TsuisoRunExport } from '@/types/tsuiso';
import type {
  TsuisoRunCollection,
  TsuisoSetOutcome,
  TsuisoSetRunResult,
} from '@/types/tsuisoBattle';
import { getRunPairFromCollection } from '@/types/tsuisoBattle';

const TIE_EPSILON = 0.05;

export function scoreRunPair(
  leadRun: TsuisoRunExport,
  chaseRun: TsuisoRunExport,
  runIndex: number,
  isSuddenDeath: boolean,
): TsuisoSetRunResult | null {
  const compared = compareTsuisoRuns(leadRun, chaseRun);
  if (compared.score.alignedSampleCount < 5) return null;
  if (!compared.score.isValid) return null;
  return {
    runIndex,
    isSuddenDeath,
    compare: compared,
    chaseScore: compared.score.total,
  };
}

/** 1セット（2走行）の勝敗 — 各ドライバーの後追いスコア合計で比較 */
export function scoreSetFromRuns(
  run1: TsuisoSetRunResult,
  run2: TsuisoSetRunResult,
  leadSlotName: string,
  chaseSlotName: string,
  mode: 'regular' | 'sudden_death',
): TsuisoSetOutcome {
  // Run1: Chase スロットが後追い → Chase スロットに加点
  // Run2: Lead スロットが後追い → Lead スロットに加点
  const chaseSlotScores = [run1.chaseScore];
  const leadSlotScores = [run2.chaseScore];

  const chaseSlotTotal = chaseSlotScores.reduce((a, b) => a + b, 0);
  const leadSlotTotal = leadSlotScores.reduce((a, b) => a + b, 0);

  let winner: TsuisoRole | 'tie';
  let margin: number;

  if (Math.abs(leadSlotTotal - chaseSlotTotal) <= TIE_EPSILON) {
    winner = 'tie';
    margin = 0;
  } else if (leadSlotTotal > chaseSlotTotal) {
    winner = 'lead';
    margin = leadSlotTotal - chaseSlotTotal;
  } else {
    winner = 'chase';
    margin = chaseSlotTotal - leadSlotTotal;
  }

  return {
    mode,
    runs: [run1, run2],
    leadSlot: {
      slot: 'lead',
      displayName: leadSlotName,
      chaseScores: leadSlotScores,
      total: leadSlotTotal,
    },
    chaseSlot: {
      slot: 'chase',
      displayName: chaseSlotName,
      chaseScores: chaseSlotScores,
      total: chaseSlotTotal,
    },
    winner,
    margin,
  };
}

/** SD セットを通常セットの合計に加算 */
export function mergeSetOutcomes(regular: TsuisoSetOutcome, suddenDeath: TsuisoSetOutcome): TsuisoSetOutcome {
  const leadScores = [...regular.leadSlot.chaseScores, ...suddenDeath.leadSlot.chaseScores];
  const chaseScores = [...regular.chaseSlot.chaseScores, ...suddenDeath.chaseSlot.chaseScores];
  const leadTotal = leadScores.reduce((a, b) => a + b, 0);
  const chaseTotal = chaseScores.reduce((a, b) => a + b, 0);

  let winner: TsuisoRole | 'tie';
  let margin: number;

  if (Math.abs(leadTotal - chaseTotal) <= TIE_EPSILON) {
    winner = 'tie';
    margin = 0;
  } else if (leadTotal > chaseTotal) {
    winner = 'lead';
    margin = leadTotal - chaseTotal;
  } else {
    winner = 'chase';
    margin = chaseTotal - leadTotal;
  }

  return {
    mode: 'sudden_death',
    runs: [...regular.runs, ...suddenDeath.runs],
    leadSlot: {
      slot: 'lead',
      displayName: regular.leadSlot.displayName,
      chaseScores: leadScores,
      total: leadTotal,
    },
    chaseSlot: {
      slot: 'chase',
      displayName: regular.chaseSlot.displayName,
      chaseScores: chaseScores,
      total: chaseTotal,
    },
    winner,
    margin,
  };
}

export function tryScoreRunFromCollection(
  collection: TsuisoRunCollection,
  runIndex: number,
  isSuddenDeath: boolean,
): TsuisoSetRunResult | null {
  const pair = getRunPairFromCollection(collection, runIndex);
  if (!pair.lead || !pair.chase) return null;
  return scoreRunPair(pair.lead, pair.chase, runIndex, isSuddenDeath);
}

export function slotDisplayName(
  roomRole: TsuisoRole,
  selfName: string,
  peerName: string | null,
): string {
  if (roomRole === 'lead') {
    return selfName.trim() || 'Lead ドライバー';
  }
  return selfName.trim() || peerName?.trim() || 'Chase ドライバー';
}

export function opponentSlotName(
  roomRole: TsuisoRole,
  selfName: string,
  peerName: string | null,
): string {
  if (roomRole === 'lead') {
    return peerName?.trim() || 'Chase ドライバー';
  }
  return peerName?.trim() || 'Lead ドライバー';
}

export function formatWinnerLabel(
  outcome: TsuisoSetOutcome,
  selfRoomRole: TsuisoRole,
): string {
  if (outcome.winner === 'tie') return '同点 — サドンデス';
  const winnerName =
    outcome.winner === 'lead'
      ? outcome.leadSlot.displayName
      : outcome.chaseSlot.displayName;
  const youWon = outcome.winner === selfRoomRole;
  return youWon ? `${winnerName} の勝利！` : `${winnerName} の勝利`;
}
