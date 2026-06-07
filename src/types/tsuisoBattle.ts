/**
 * 追走セットバトル — 型定義
 * 1セット = 先行1本 + 後攻1本（役割入替）、合計点で勝敗、同点はサドンデス
 */

import type { TsuisoCompareResult, TsuisoRole, TsuisoRunExport } from '@/types/tsuiso';

/** セット内の走行インデックス（0=1本目, 1=2本目） */
export type TsuisoSetRunIndex = 0 | 1;

export type TsuisoBattleMode = 'single' | 'set';

export type TsuisoBattlePhase =
  | 'run1'
  | 'run1_wait'
  | 'run2'
  | 'run2_wait'
  | 'set_result'
  | 'sd_run1'
  | 'sd_run1_wait'
  | 'sd_run2'
  | 'sd_run2_wait'
  | 'battle_final';

/** 1走行分の採点結果 */
export type TsuisoSetRunResult = {
  runIndex: number;
  isSuddenDeath: boolean;
  compare: TsuisoCompareResult;
  /** 後追い側の追走スコア（勝敗集計に使用） */
  chaseScore: number;
};

/** ルーム内ドライバー（端末スロット）の合計 */
export type TsuisoDriverSlotTotal = {
  slot: TsuisoRole;
  displayName: string;
  /** 後追い走行のスコア一覧（通常1本 + SD 時追加） */
  chaseScores: number[];
  total: number;
};

export type TsuisoSetOutcome = {
  mode: 'regular' | 'sudden_death';
  runs: TsuisoSetRunResult[];
  leadSlot: TsuisoDriverSlotTotal;
  chaseSlot: TsuisoDriverSlotTotal;
  winner: TsuisoRole | 'tie';
  margin: number;
};

export type TsuisoBattleStatePayload = {
  version: 1;
  phase: TsuisoBattlePhase;
  runIndex: number;
  isSuddenDeath: boolean;
  /** セット / SD 確定時 */
  outcome?: TsuisoSetOutcome;
  /** run1 完了時の中間スコア（Chase スロットの追走点） */
  run1ChaseScore?: number;
  sentAtUtcMs: number;
  senderClientId?: string;
};

/** Broadcast 走行ペイロード拡張 */
export type TsuisoRunBroadcastMeta = {
  runIndex: number;
  isSuddenDeath: boolean;
  roomRole: TsuisoRole;
};

export type TsuisoRunSlotKey = `${number}-${TsuisoRole}`;

export function tsuisoRunSlotKey(runIndex: number, runRole: TsuisoRole): TsuisoRunSlotKey {
  return `${runIndex}-${runRole}`;
}

/** 走行インデックスに応じた当該端末の走行役割（偶数=通常順, 奇数=入替） */
export function resolveRunRoleForRoom(roomRole: TsuisoRole, runIndex: number): TsuisoRole {
  const swapped = runIndex % 2 === 1;
  if (!swapped) return roomRole;
  return roomRole === 'lead' ? 'chase' : 'lead';
}

export function battlePhaseForRunIndex(runIndex: number, isSuddenDeath: boolean): TsuisoBattlePhase {
  if (isSuddenDeath) {
    return runIndex === 0 ? 'sd_run1' : 'sd_run2';
  }
  return runIndex === 0 ? 'run1' : 'run2';
}

export function waitPhaseForRunIndex(runIndex: number, isSuddenDeath: boolean): TsuisoBattlePhase {
  if (isSuddenDeath) {
    return runIndex === 0 ? 'sd_run1_wait' : 'sd_run2_wait';
  }
  return runIndex === 0 ? 'run1_wait' : 'run2_wait';
}

export function runIndexFromBattlePhase(phase: TsuisoBattlePhase): number | null {
  switch (phase) {
    case 'run1':
    case 'run1_wait':
    case 'sd_run1':
    case 'sd_run1_wait':
      return 0;
    case 'run2':
    case 'run2_wait':
    case 'sd_run2':
    case 'sd_run2_wait':
      return 1;
    default:
      return null;
  }
}

export function isSuddenDeathPhase(phase: TsuisoBattlePhase): boolean {
  return phase.startsWith('sd_');
}

export function isRecordingPhase(phase: TsuisoBattlePhase): boolean {
  return phase === 'run1' || phase === 'run2' || phase === 'sd_run1' || phase === 'sd_run2';
}

export function isWaitPhase(phase: TsuisoBattlePhase): boolean {
  return phase.endsWith('_wait');
}

/** セット内 runIndex（0 or 1）— SD 時は 2,3 として扱う */
export function absoluteRunIndex(setRunIndex: TsuisoSetRunIndex, isSuddenDeath: boolean): number {
  return isSuddenDeath ? setRunIndex + 2 : setRunIndex;
}

export type TsuisoRunCollection = Partial<Record<TsuisoRunSlotKey, TsuisoRunExport>>;

export function storeRunInCollection(
  collection: TsuisoRunCollection,
  run: TsuisoRunExport,
  runIndex: number,
): TsuisoRunCollection {
  const key = tsuisoRunSlotKey(runIndex, run.role);
  return { ...collection, [key]: run };
}

export function getRunPairFromCollection(
  collection: TsuisoRunCollection,
  runIndex: number,
): { lead?: TsuisoRunExport; chase?: TsuisoRunExport } {
  return {
    lead: collection[tsuisoRunSlotKey(runIndex, 'lead')],
    chase: collection[tsuisoRunSlotKey(runIndex, 'chase')],
  };
}
