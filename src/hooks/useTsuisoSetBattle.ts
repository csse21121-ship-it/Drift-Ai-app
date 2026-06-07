/**
 * 追走セットバトル — 状態管理フック（Realtime 同期）
 */

import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

import {
  mergeSetOutcomes,
  opponentSlotName,
  scoreSetFromRuns,
  slotDisplayName,
  tryScoreRunFromCollection,
} from '@/lib/tsuisoSetBattle';
import type { TsuisoRole, TsuisoRunExport } from '@/types/tsuiso';
import type {
  TsuisoBattlePhase,
  TsuisoBattleStatePayload,
  TsuisoRunCollection,
  TsuisoSetOutcome,
  TsuisoSetRunResult,
} from '@/types/tsuisoBattle';
import {
  absoluteRunIndex,
  battlePhaseForRunIndex,
  isSuddenDeathPhase,
  resolveRunRoleForRoom,
  storeRunInCollection,
} from '@/types/tsuisoBattle';

function absoluteIndexFromPhase(phase: TsuisoBattlePhase): number | null {
  switch (phase) {
    case 'run1':
    case 'run1_wait':
      return 0;
    case 'run2':
    case 'run2_wait':
      return 1;
    case 'sd_run1':
    case 'sd_run1_wait':
      return 2;
    case 'sd_run2':
    case 'sd_run2_wait':
      return 3;
    default:
      return null;
  }
}

function isSuddenDeathAbsolute(absolute: number): boolean {
  return absolute >= 2;
}

export function useTsuisoSetBattle(roomRole: TsuisoRole | null) {
  const [battlePhase, setBattlePhase] = useState<TsuisoBattlePhase>('run1');
  const [runCollection, setRunCollection] = useState<TsuisoRunCollection>({});
  const [scoredRuns, setScoredRuns] = useState<TsuisoSetRunResult[]>([]);
  const [regularOutcome, setRegularOutcome] = useState<TsuisoSetOutcome | null>(null);
  const [finalOutcome, setFinalOutcome] = useState<TsuisoSetOutcome | null>(null);

  const runCollectionRef = useRef(runCollection);
  const scoredRunsRef = useRef(scoredRuns);
  const regularOutcomeRef = useRef(regularOutcome);
  const battlePhaseRef = useRef(battlePhase);

  runCollectionRef.current = runCollection;
  scoredRunsRef.current = scoredRuns;
  regularOutcomeRef.current = regularOutcome;
  battlePhaseRef.current = battlePhase;

  const resetBattle = useCallback(() => {
    setBattlePhase('run1');
    setRunCollection({});
    setScoredRuns([]);
    setRegularOutcome(null);
    setFinalOutcome(null);
    runCollectionRef.current = {};
    scoredRunsRef.current = [];
    regularOutcomeRef.current = null;
    battlePhaseRef.current = 'run1';
  }, []);

  const applyBattleState = useCallback((state: TsuisoBattleStatePayload) => {
    setBattlePhase(state.phase);
    battlePhaseRef.current = state.phase;
    if (state.outcome) {
      if (state.isSuddenDeath && regularOutcomeRef.current) {
        setFinalOutcome(state.outcome);
      } else if (!state.isSuddenDeath) {
        setRegularOutcome(state.outcome);
        regularOutcomeRef.current = state.outcome;
        if (state.outcome.winner !== 'tie') {
          setFinalOutcome(state.outcome);
        }
      } else {
        setFinalOutcome(state.outcome);
      }
    }
  }, []);

  const currentAbsoluteRunIndex = absoluteIndexFromPhase(battlePhase);
  const currentRunRole =
    roomRole != null && currentAbsoluteRunIndex != null
      ? resolveRunRoleForRoom(roomRole, currentAbsoluteRunIndex)
      : null;
  const isSuddenDeath =
    isSuddenDeathPhase(battlePhase) ||
    (currentAbsoluteRunIndex != null && isSuddenDeathAbsolute(currentAbsoluteRunIndex));

  const ingestRun = useCallback(
    (
      run: TsuisoRunExport,
      runIndex: number,
      selfName: string,
      peerName: string | null,
    ): {
      scored: TsuisoSetRunResult | null;
      nextPhase: TsuisoBattlePhase | null;
      battleState: Omit<TsuisoBattleStatePayload, 'version' | 'sentAtUtcMs' | 'senderClientId'> | null;
    } => {
      const nextCollection = storeRunInCollection(runCollectionRef.current, run, runIndex);
      runCollectionRef.current = nextCollection;
      setRunCollection(nextCollection);

      const scored = tryScoreRunFromCollection(nextCollection, runIndex, isSuddenDeathAbsolute(runIndex));
      if (!scored) {
        return { scored: null, nextPhase: null, battleState: null };
      }

      const already = scoredRunsRef.current.some((r) => r.runIndex === runIndex);
      if (already) {
        return { scored, nextPhase: null, battleState: null };
      }

      const updatedRuns = [...scoredRunsRef.current, scored];
      scoredRunsRef.current = updatedRuns;
      setScoredRuns(updatedRuns);

      if (roomRole == null) {
        return { scored, nextPhase: null, battleState: null };
      }

      const leadSlotName =
        roomRole === 'lead'
          ? slotDisplayName('lead', selfName, peerName)
          : opponentSlotName('chase', selfName, peerName);
      const chaseSlotName =
        roomRole === 'chase'
          ? slotDisplayName('chase', selfName, peerName)
          : opponentSlotName('lead', selfName, peerName);

      // Run1 完了 → Run2 へ
      if (runIndex === 0 || runIndex === 2) {
        const setIdx = 1 as const;
        const sd = isSuddenDeathAbsolute(runIndex);
        const nextRunPhase = battlePhaseForRunIndex(setIdx, sd);
        return {
          scored,
          nextPhase: nextRunPhase,
          battleState: {
            phase: nextRunPhase,
            runIndex: runIndex + 1,
            isSuddenDeath: sd,
            run1ChaseScore: scored.chaseScore,
          },
        };
      }

      // Run2 完了 → セット集計
      const pairIndex = runIndex === 1 ? 0 : 2;
      const run1Result = updatedRuns.find((r) => r.runIndex === pairIndex);
      const run2Result = scored;
      if (!run1Result) {
        return { scored, nextPhase: null, battleState: null };
      }

      const sd = isSuddenDeathAbsolute(runIndex);
      const mode = sd ? 'sudden_death' : 'regular';
      const outcome = scoreSetFromRuns(run1Result, run2Result, leadSlotName, chaseSlotName, mode);

      if (!sd) {
        setRegularOutcome(outcome);
        regularOutcomeRef.current = outcome;

        if (outcome.winner === 'tie') {
          setBattlePhase('set_result');
          return {
            scored,
            nextPhase: 'set_result',
            battleState: {
              phase: 'sd_run1',
              runIndex: 2,
              isSuddenDeath: true,
              outcome,
            },
          };
        }

        setFinalOutcome(outcome);
        setBattlePhase('battle_final');
        return {
          scored,
          nextPhase: 'battle_final',
          battleState: {
            phase: 'battle_final',
            runIndex: 1,
            isSuddenDeath: false,
            outcome,
          },
        };
      }

      // SD セット完了
      const reg = regularOutcomeRef.current;
      if (!reg) {
        setFinalOutcome(outcome);
        setBattlePhase('battle_final');
        return {
          scored,
          nextPhase: 'battle_final',
          battleState: {
            phase: 'battle_final',
            runIndex: 3,
            isSuddenDeath: true,
            outcome,
          },
        };
      }

      const merged = mergeSetOutcomes(reg, outcome);
      if (merged.winner === 'tie') {
        Alert.alert(
          '再び同点',
          'サドンデス後も同点です。もう一度サドンデスを行うか、引き分けとします。',
        );
      }
      setFinalOutcome(merged);
      setBattlePhase('battle_final');
      return {
        scored,
        nextPhase: 'battle_final',
        battleState: {
          phase: 'battle_final',
          runIndex: 3,
          isSuddenDeath: true,
          outcome: merged,
        },
      };
    },
    [roomRole],
  );

  const beginSetBattle = useCallback(() => {
    resetBattle();
    setBattlePhase('run1');
    battlePhaseRef.current = 'run1';
  }, [resetBattle]);

  const continueToNextRun = useCallback(() => {
    const phase = battlePhaseRef.current;
    if (phase === 'run1_wait') {
      setBattlePhase('run2');
    } else if (phase === 'sd_run1_wait') {
      setBattlePhase('sd_run2');
    }
  }, []);

  const continueToSuddenDeath = useCallback(() => {
    setBattlePhase('sd_run1');
    battlePhaseRef.current = 'sd_run1';
    setRunCollection({});
    runCollectionRef.current = {};
  }, []);

  return {
    battlePhase,
    setBattlePhase,
    runCollection,
    scoredRuns,
    regularOutcome,
    finalOutcome,
    currentAbsoluteRunIndex,
    currentRunRole,
    isSuddenDeath,
    resetBattle,
    applyBattleState,
    ingestRun,
    beginSetBattle,
    continueToNextRun,
    continueToSuddenDeath,
    resolveRunRoleForRoom,
    absoluteRunIndex,
  };
}
