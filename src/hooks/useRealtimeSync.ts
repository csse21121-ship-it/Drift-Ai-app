/**
 * 追走リアルタイム同期 — Supabase Broadcast + Presence
 *
 * ルーム PIN で Lead / Chase をマッチングし、
 * STOP 時に走行データを Broadcast で自動交換する。
 * セットバトル状態も Broadcast で同期。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  destroyTsuisoRealtimeRoom,
  formatPinRemainingMs,
  generateRoomPin,
  getTsuisoRealtimeRoom,
  isRealtimeSyncAvailable,
  isValidRoomPin,
  type TsuisoConnectResult,
  type TsuisoPeerInfo,
  type TsuisoRoomStatus,
} from '@/lib/realtimeSync';
import type { TsuisoRole, TsuisoRunExport } from '@/types/tsuiso';
import type { TsuisoBattleStatePayload, TsuisoRunBroadcastMeta } from '@/types/tsuisoBattle';

export type RealtimeSyncStatus = TsuisoRoomStatus;

export type TsuisoRunReceivedPayload = {
  run: TsuisoRunExport;
  fromRoomRole: TsuisoRole;
  meta: TsuisoRunBroadcastMeta;
};

export function useRealtimeSync() {
  const room = useRef(getTsuisoRealtimeRoom()).current;

  const [status, setStatus] = useState<RealtimeSyncStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [role, setRole] = useState<TsuisoRole | null>(null);
  const [pinExpiresAtUtcMs, setPinExpiresAtUtcMs] = useState<number | null>(null);
  const [pinRemainingLabel, setPinRemainingLabel] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [waitingPeerRun, setWaitingPeerRun] = useState(false);
  const [peerInfo, setPeerInfo] = useState<TsuisoPeerInfo>({ displayName: null, role: null });

  const pendingRunsRef = useRef<TsuisoRunReceivedPayload[]>([]);
  const pendingBattleStatesRef = useRef<TsuisoBattleStatePayload[]>([]);
  const onRunReceivedRef = useRef<((payload: TsuisoRunReceivedPayload) => void) | null>(null);
  const onBattleStateRef = useRef<((state: TsuisoBattleStatePayload) => void) | null>(null);

  useEffect(() => {
    room.configure({
      onStatus: (next) => {
        setStatus(next);
        if (next === 'error') {
          setErrorMessage('リアルタイム接続に失敗しました。オフラインモードをご利用ください。');
        } else if (next !== 'idle') {
          setErrorMessage(null);
        }
        if (next === 'expired' || next === 'disconnected' || next === 'idle') {
          setPinExpiresAtUtcMs(null);
          setPinRemainingLabel(null);
        } else {
          setPinExpiresAtUtcMs(room.getPinExpiresAtUtcMs());
        }
      },
      onRunReceived: (run, fromRoomRole, meta) => {
        setWaitingPeerRun(false);
        const payload: TsuisoRunReceivedPayload = { run, fromRoomRole, meta };
        if (onRunReceivedRef.current) {
          onRunReceivedRef.current(payload);
        } else {
          pendingRunsRef.current.push(payload);
        }
      },
      onBattleStateReceived: (state) => {
        if (onBattleStateRef.current) {
          onBattleStateRef.current(state);
        } else {
          pendingBattleStatesRef.current.push(state);
        }
      },
      onPeerUpdate: setPeerInfo,
    });

    return () => {
      void destroyTsuisoRealtimeRoom();
    };
  }, [room]);

  useEffect(() => {
    if (!pinExpiresAtUtcMs || status === 'expired' || status === 'idle' || status === 'disconnected') {
      setPinRemainingLabel(null);
      return;
    }

    const tick = () => {
      setPinRemainingLabel(formatPinRemainingMs(pinExpiresAtUtcMs - Date.now()));
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [pinExpiresAtUtcMs, status]);

  const createRoom = useCallback(async (displayName?: string): Promise<string | null> => {
    if (!isRealtimeSyncAvailable()) {
      setStatus('error');
      setErrorMessage('Supabase が未設定です');
      return null;
    }

    const newPin = generateRoomPin();
    setSyncFailed(false);
    setWaitingPeerRun(false);
    setErrorMessage(null);
    pendingRunsRef.current = [];
    pendingBattleStatesRef.current = [];
    setPeerInfo({ displayName: null, role: null });

    const result = await room.connect(newPin, 'lead', displayName);
    if (result !== 'ok') {
      setStatus('error');
      setErrorMessage(
        room.getLastConnectError() ??
          (result === 'invalid_pin' ? 'PIN が無効です' : 'ルーム作成に失敗しました'),
      );
      return null;
    }

    setPin(newPin);
    setRole('lead');
    setPinExpiresAtUtcMs(room.getPinExpiresAtUtcMs());
    return newPin;
  }, [room]);

  const joinRoom = useCallback(
    async (joinPin: string, displayName?: string): Promise<TsuisoConnectResult> => {
      if (!isRealtimeSyncAvailable()) {
        setStatus('error');
        setErrorMessage('Supabase が未設定です');
        return 'error';
      }

      const normalized = joinPin.trim();
      if (!isValidRoomPin(normalized)) {
        setStatus('error');
        setErrorMessage('4桁の PIN を入力してください');
        return 'invalid_pin';
      }

      setSyncFailed(false);
      setWaitingPeerRun(false);
      setErrorMessage(null);
      pendingRunsRef.current = [];
      pendingBattleStatesRef.current = [];
      setPeerInfo({ displayName: null, role: null });

      const result = await room.connect(normalized, 'chase', displayName);
      if (result === 'error') {
        setErrorMessage(
          room.getLastConnectError() ?? 'ルーム入室に失敗しました',
        );
      } else if (result === 'expired') {
        setErrorMessage('PIN の有効期限が切れています');
      }

      if (result !== 'ok') return result;

      setPin(normalized);
      setRole('chase');
      setPinExpiresAtUtcMs(room.getPinExpiresAtUtcMs());
      return 'ok';
    },
    [room],
  );

  const broadcastRun = useCallback(
    async (
      run: TsuisoRunExport,
      meta?: Pick<TsuisoRunBroadcastMeta, 'runIndex' | 'isSuddenDeath'>,
    ): Promise<'sent' | 'failed' | 'skipped'> => {
      if (status !== 'connected') return 'skipped';

      const result = await room.broadcastRun(run, meta);
      if (result === 'failed') {
        setSyncFailed(true);
        setErrorMessage('走行データの送信に失敗しました。AirDrop 等で共有してください。');
      }
      return result;
    },
    [room, status],
  );

  const broadcastBattleState = useCallback(
    async (
      state: Omit<TsuisoBattleStatePayload, 'version' | 'sentAtUtcMs' | 'senderClientId'>,
    ): Promise<'sent' | 'failed' | 'skipped'> => {
      if (status !== 'connected') return 'skipped';
      const result = await room.broadcastBattleState(state);
      if (result === 'failed') {
        setSyncFailed(true);
        setErrorMessage('バトル状態の送信に失敗しました。');
      }
      return result;
    },
    [room, status],
  );

  const registerRunHandler = useCallback((handler: (payload: TsuisoRunReceivedPayload) => void) => {
    onRunReceivedRef.current = handler;
    if (pendingRunsRef.current.length > 0) {
      const pending = [...pendingRunsRef.current];
      pendingRunsRef.current = [];
      for (const payload of pending) {
        handler(payload);
      }
    }
  }, []);

  const registerBattleStateHandler = useCallback(
    (handler: (state: TsuisoBattleStatePayload) => void) => {
      onBattleStateRef.current = handler;
      if (pendingBattleStatesRef.current.length > 0) {
        const pending = [...pendingBattleStatesRef.current];
        pendingBattleStatesRef.current = [];
        for (const state of pending) {
          handler(state);
        }
      }
    },
    [],
  );

  /** @deprecated registerRunHandler を使用 */
  const registerLeadHandler = useCallback(
    (handler: (lead: TsuisoRunExport) => void) => {
      registerRunHandler(({ run, meta }) => {
        if (meta.roomRole === 'lead' && run.role === 'lead') {
          handler(run);
        }
      });
    },
    [registerRunHandler],
  );

  const leaveRoom = useCallback(async () => {
    await room.leave();
    setPin(null);
    setRole(null);
    setPinExpiresAtUtcMs(null);
    setPinRemainingLabel(null);
    setSyncFailed(false);
    setWaitingPeerRun(false);
    setErrorMessage(null);
    pendingRunsRef.current = [];
    pendingBattleStatesRef.current = [];
    setPeerInfo({ displayName: null, role: null });
    onRunReceivedRef.current = null;
    onBattleStateRef.current = null;
  }, [room]);

  const markWaitingPeerRun = useCallback(() => {
    setWaitingPeerRun(true);
  }, []);

  /** @deprecated markWaitingPeerRun を使用 */
  const markWaitingLead = markWaitingPeerRun;

  const isSyncReady = status === 'connected';
  const hasError = status === 'error' || syncFailed;

  return {
    status,
    errorMessage,
    hasError,
    pin,
    role,
    pinExpiresAtUtcMs,
    pinRemainingLabel,
    syncFailed,
    waitingPeerRun,
    waitingLead: waitingPeerRun,
    peerInfo,
    isAvailable: isRealtimeSyncAvailable(),
    isConnected: isSyncReady,
    isSyncReady,
    isExpired: status === 'expired',
    createRoom,
    joinRoom,
    broadcastRun,
    broadcastBattleState,
    registerRunHandler,
    registerBattleStateHandler,
    registerLeadHandler,
    leaveRoom,
    markWaitingPeerRun,
    markWaitingLead,
  };
}

/** @deprecated useRealtimeSync を使用 */
export const useTsuisoRealtimeRoom = useRealtimeSync;
