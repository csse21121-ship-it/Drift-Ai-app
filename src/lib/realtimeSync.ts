/**
 * 追走リアルタイムルーム — Supabase Broadcast + Presence
 * PIN 方式マッチング / 走行終了時ペイロード交換
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  ensureRealtimeReady,
  getSupabaseClient,
  isSupabaseConfigured,
  tsuisoRoomChannelName,
} from '@/lib/supabase';
import type { TsuisoRole, TsuisoRunExport } from '@/types/tsuiso';
import type { TsuisoBattleStatePayload, TsuisoRunBroadcastMeta } from '@/types/tsuisoBattle';

export type { TsuisoBattleStatePayload, TsuisoRunBroadcastMeta } from '@/types/tsuisoBattle';

export type TsuisoRoomStatus =
  | 'idle'
  | 'connecting'
  | 'waiting_peer'
  | 'connected'
  | 'disconnected'
  | 'expired'
  | 'error';

export type TsuisoPeerInfo = {
  displayName: string | null;
  role: TsuisoRole | null;
};

export type TsuisoRoomCallbacks = {
  onStatus?: (status: TsuisoRoomStatus) => void;
  onRunReceived?: (
    run: TsuisoRunExport,
    fromRoomRole: TsuisoRole,
    meta: TsuisoRunBroadcastMeta,
  ) => void;
  onBattleStateReceived?: (state: TsuisoBattleStatePayload) => void;
  onPeerUpdate?: (peer: TsuisoPeerInfo) => void;
};

const BROADCAST_RUN_EVENT = 'tsuiso_run_payload';
const BROADCAST_BATTLE_STATE_EVENT = 'tsuiso_battle_state';
const PRESENCE_MIN_PEERS = 2;
/** Broadcast ペイロード上限の目安 (bytes) */
const MAX_BROADCAST_BYTES = 240_000;

/** ルーム PIN 桁数（4桁固定） */
export const ROOM_PIN_LENGTH = 4;
/** ルーム PIN の有効期限（Lead がルーム作成してから） */
export const ROOM_PIN_TTL_MS = 30 * 60 * 1000;

export type TsuisoConnectResult = 'ok' | 'expired' | 'invalid_pin' | 'error';

type PresenceMeta = {
  role?: TsuisoRole;
  clientId?: string;
  joinedAt?: number;
  expiresAtUtcMs?: number;
  pinCreatedAtUtcMs?: number;
  displayName?: string;
};

function secureRandomInt(max: number): number {
  if (max <= 0) return 0;
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

export function isValidRoomPin(pin: string): boolean {
  const normalized = pin.trim();
  return new RegExp(`^\\d{${ROOM_PIN_LENGTH}}$`).test(normalized);
}

/** 4桁ランダム PIN（1000〜9999） */
export function generateRoomPin(): string {
  return String(1000 + secureRandomInt(9000));
}

export function formatPinRemainingMs(remainingMs: number): string {
  if (remainingMs <= 0) return '期限切れ';
  const totalSec = Math.ceil(remainingMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function roomChannelName(pin: string): string {
  return tsuisoRoomChannelName(pin);
}

function generateClientId(): string {
  return `tsuiso-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function estimatePayloadBytes(run: TsuisoRunExport): number {
  try {
    return new TextEncoder().encode(JSON.stringify(run)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export class TsuisoRealtimeRoom {
  private channel: RealtimeChannel | null = null;
  private readonly clientId = generateClientId();
  private callbacks: TsuisoRoomCallbacks = {};
  private role: TsuisoRole | null = null;
  private pin: string | null = null;
  private pinExpiresAtUtcMs: number | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private selfDisplayName: string | null = null;
  private lastConnectError: string | null = null;

  getLastConnectError(): string | null {
    return this.lastConnectError;
  }

  private setConnectError(message: string | null): void {
    this.lastConnectError = message;
  }

  configure(callbacks: TsuisoRoomCallbacks): void {
    this.callbacks = callbacks;
  }

  getRole(): TsuisoRole | null {
    return this.role;
  }

  getPin(): string | null {
    return this.pin;
  }

  getPinExpiresAtUtcMs(): number | null {
    return this.pinExpiresAtUtcMs;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getSelfDisplayName(): string | null {
    return this.selfDisplayName;
  }

  getPeerInfo(): TsuisoPeerInfo {
    if (!this.channel) {
      return { displayName: null, role: null };
    }
    const state = this.channel.presenceState<PresenceMeta>();
    for (const entries of Object.values(state)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry.clientId === this.clientId) continue;
        return {
          displayName: entry.displayName?.trim() || null,
          role: entry.role === 'lead' || entry.role === 'chase' ? entry.role : null,
        };
      }
    }
    return { displayName: null, role: null };
  }

  private notifyPeerUpdate(): void {
    this.callbacks.onPeerUpdate?.(this.getPeerInfo());
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
  }

  private scheduleExpiry(expiresAtUtcMs: number): void {
    this.clearExpiryTimer();
    const remaining = expiresAtUtcMs - Date.now();
    if (remaining <= 0) {
      void this.handleExpired();
      return;
    }
    this.expiryTimer = setTimeout(() => {
      void this.handleExpired();
    }, remaining);
  }

  private async handleExpired(): Promise<void> {
    this.clearExpiryTimer();
    await this.leave();
    this.setStatus('expired');
  }

  private readLeadExpiryFromPresence(): number | null {
    if (!this.channel) return null;
    const state = this.channel.presenceState<PresenceMeta>();
    let latest: number | null = null;
    for (const entries of Object.values(state)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry.role !== 'lead' || typeof entry.expiresAtUtcMs !== 'number') continue;
        if (latest == null || entry.expiresAtUtcMs > latest) {
          latest = entry.expiresAtUtcMs;
        }
      }
    }
    return latest;
  }

  private isLeadRoomExpired(): boolean {
    const leadExpiry = this.readLeadExpiryFromPresence();
    if (leadExpiry == null) return false;
    return Date.now() > leadExpiry;
  }

  private syncExpiryFromPresence(): void {
    if (this.role !== 'chase') return;
    const leadExpiry = this.readLeadExpiryFromPresence();
    if (leadExpiry == null) return;
    this.pinExpiresAtUtcMs = leadExpiry;
    if (Date.now() > leadExpiry) {
      void this.handleExpired();
      return;
    }
    this.scheduleExpiry(leadExpiry);
  }

  private setStatus(status: TsuisoRoomStatus): void {
    this.callbacks.onStatus?.(status);
  }

  private evaluatePresence(): void {
    if (!this.channel) return;
    const state = this.channel.presenceState();
    const peerCount = Object.values(state).reduce(
      (sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0),
      0,
    );

    if (peerCount >= PRESENCE_MIN_PEERS) {
      this.connected = true;
      this.setStatus('connected');
    } else if (this.role === 'lead') {
      this.setStatus('waiting_peer');
    } else {
      this.setStatus('waiting_peer');
    }
    this.notifyPeerUpdate();
  }

  async connect(
    pin: string,
    role: TsuisoRole,
    displayName?: string,
  ): Promise<TsuisoConnectResult> {
    if (!isValidRoomPin(pin)) {
      this.setStatus('error');
      return 'invalid_pin';
    }

    if (!isSupabaseConfigured()) {
      this.setStatus('error');
      return 'error';
    }

    const ready = await ensureRealtimeReady();
    if (!ready.ok) {
      this.setConnectError(ready.error);
      this.setStatus('error');
      return 'error';
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      this.setStatus('error');
      return 'error';
    }

    await this.leave();

    const normalizedPin = pin.trim();
    const createdAt = Date.now();
    const expiresAt = role === 'lead' ? createdAt + ROOM_PIN_TTL_MS : null;

    this.pin = normalizedPin;
    this.role = role;
    this.selfDisplayName = displayName?.trim() || null;
    this.pinExpiresAtUtcMs = expiresAt;
    this.connected = false;
    this.setConnectError(null);
    this.setStatus('connecting');

    const channel = supabase.channel(roomChannelName(normalizedPin), {
      config: {
        broadcast: { self: false },
        presence: { key: this.clientId },
      },
    });

    channel.on('broadcast', { event: BROADCAST_RUN_EVENT }, ({ payload }) => {
      const data = payload as {
        role?: TsuisoRole;
        clientId?: string;
        run?: TsuisoRunExport;
        runIndex?: number;
        isSuddenDeath?: boolean;
      };
      if (!data?.run || data.clientId === this.clientId) return;
      if (data.role !== 'lead' && data.role !== 'chase') return;
      const meta: TsuisoRunBroadcastMeta = {
        runIndex: typeof data.runIndex === 'number' ? data.runIndex : 0,
        isSuddenDeath: data.isSuddenDeath === true,
        roomRole: data.role,
      };
      this.callbacks.onRunReceived?.(data.run, data.role, meta);
    });

    channel.on('broadcast', { event: BROADCAST_BATTLE_STATE_EVENT }, ({ payload }) => {
      const data = payload as TsuisoBattleStatePayload;
      if (!data || data.version !== 1) return;
      if (data.senderClientId === this.clientId) return;
      this.callbacks.onBattleStateReceived?.(data);
    });

    channel.on('presence', { event: 'sync' }, () => {
      this.syncExpiryFromPresence();
      this.evaluatePresence();
    });

    channel.on('presence', { event: 'join' }, () => {
      this.syncExpiryFromPresence();
      this.evaluatePresence();
    });

    channel.on('presence', { event: 'leave' }, () => {
      this.connected = false;
      this.evaluatePresence();
    });

    const subscribeResult = await new Promise<'ok' | 'error' | 'timeout'>((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), 12_000);
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          try {
            const presenceMeta: PresenceMeta = {
              role,
              clientId: this.clientId,
              joinedAt: createdAt,
              displayName: this.selfDisplayName ?? undefined,
            };
            if (role === 'lead' && expiresAt != null) {
              presenceMeta.pinCreatedAtUtcMs = createdAt;
              presenceMeta.expiresAtUtcMs = expiresAt;
            }
            const trackStatus = await channel.track(presenceMeta);
            if (trackStatus === 'error') {
              resolve('error');
              return;
            }
            resolve('ok');
          } catch {
            resolve('error');
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          resolve('error');
        }
      });
    });

    if (subscribeResult !== 'ok') {
      await supabase.removeChannel(channel);
      const reason =
        subscribeResult === 'timeout'
          ? 'Realtime チャンネル接続がタイムアウトしました（通信環境を確認）'
          : 'Realtime チャンネル接続に失敗しました（Dashboard で Realtime が有効か確認）';
      this.setConnectError(reason);
      this.setStatus('error');
      return 'error';
    }

    if (role === 'chase' && this.isLeadRoomExpired()) {
      await supabase.removeChannel(channel);
      this.channel = null;
      this.pin = null;
      this.role = null;
      this.pinExpiresAtUtcMs = null;
      this.setStatus('expired');
      return 'expired';
    }

    this.channel = channel;
    this.syncExpiryFromPresence();
    if (role === 'lead' && expiresAt != null) {
      this.scheduleExpiry(expiresAt);
    }
    this.evaluatePresence();
    return 'ok';
  }

  async broadcastRun(
    run: TsuisoRunExport,
    meta?: Pick<TsuisoRunBroadcastMeta, 'runIndex' | 'isSuddenDeath'>,
  ): Promise<'sent' | 'failed'> {
    if (!this.channel || !this.role) return 'failed';

    const bytes = estimatePayloadBytes(run);
    if (bytes > MAX_BROADCAST_BYTES) {
      return 'failed';
    }

    try {
      const result = await this.channel.send({
        type: 'broadcast',
        event: BROADCAST_RUN_EVENT,
        payload: {
          role: this.role,
          clientId: this.clientId,
          run,
          runIndex: meta?.runIndex ?? 0,
          isSuddenDeath: meta?.isSuddenDeath === true,
          sentAt: Date.now(),
        },
      });
      if (result === 'ok') return 'sent';
      return 'failed';
    } catch {
      return 'failed';
    }
  }

  async broadcastBattleState(state: Omit<TsuisoBattleStatePayload, 'version' | 'sentAtUtcMs' | 'senderClientId'>): Promise<'sent' | 'failed'> {
    if (!this.channel || !this.role) return 'failed';

    try {
      const payload: TsuisoBattleStatePayload = {
        version: 1,
        ...state,
        sentAtUtcMs: Date.now(),
        senderClientId: this.clientId,
      };
      const result = await this.channel.send({
        type: 'broadcast',
        event: BROADCAST_BATTLE_STATE_EVENT,
        payload,
      });
      if (result === 'ok') return 'sent';
      return 'failed';
    } catch {
      return 'failed';
    }
  }

  async leave(): Promise<void> {
    this.clearExpiryTimer();

    if (!this.channel) {
      this.pinExpiresAtUtcMs = null;
      this.setStatus('idle');
      return;
    }

    const supabase = getSupabaseClient();
    try {
      await this.channel.untrack();
      if (supabase) {
        await supabase.removeChannel(this.channel);
      }
    } catch {
      // ignore cleanup errors
    }

    this.channel = null;
    this.pin = null;
    this.role = null;
    this.selfDisplayName = null;
    this.pinExpiresAtUtcMs = null;
    this.connected = false;
    this.notifyPeerUpdate();
    this.setStatus('disconnected');
  }
}

/** シングルトン — 追走画面で1ルームのみ */
let activeRoom: TsuisoRealtimeRoom | null = null;

export function getTsuisoRealtimeRoom(): TsuisoRealtimeRoom {
  if (!activeRoom) {
    activeRoom = new TsuisoRealtimeRoom();
  }
  return activeRoom;
}

export async function destroyTsuisoRealtimeRoom(): Promise<void> {
  if (activeRoom) {
    await activeRoom.leave();
    activeRoom = null;
  }
}

export function isRealtimeSyncAvailable(): boolean {
  return isSupabaseConfigured();
}
