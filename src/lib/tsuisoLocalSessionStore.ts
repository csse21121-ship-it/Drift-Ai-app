/**
 * 追走ローカルセッション — Post-Run Merge 用
 * Lead / Chase を各端末で独立保存し、走行後に結合採点
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TsuisoRole } from '@/types/tsuiso';
import type { TsuisoRunExport } from '@/types/tsuiso';

export type TsuisoLocalSession = {
  savedAt: number;
  role: TsuisoRole;
  run: TsuisoRunExport;
};

const STORAGE_KEYS: Record<TsuisoRole, string> = {
  lead: '@driftscore/tsuiso_local_lead',
  chase: '@driftscore/tsuiso_local_chase',
};

const memoryCache: Partial<Record<TsuisoRole, TsuisoLocalSession>> = {};

export async function saveLocalTsuisoSession(run: TsuisoRunExport): Promise<TsuisoLocalSession> {
  const session: TsuisoLocalSession = {
    savedAt: Date.now(),
    role: run.role,
    run,
  };
  memoryCache[run.role] = session;
  await AsyncStorage.setItem(STORAGE_KEYS[run.role], JSON.stringify(session));
  return session;
}

export async function loadLocalTsuisoSession(
  role: TsuisoRole,
): Promise<TsuisoLocalSession | null> {
  if (memoryCache[role]) return memoryCache[role]!;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS[role]);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TsuisoLocalSession;
    if (parsed.role !== role || !parsed.run?.telemetryLog?.length) return null;
    memoryCache[role] = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export async function hasLocalTsuisoSession(role: TsuisoRole): Promise<boolean> {
  const session = await loadLocalTsuisoSession(role);
  return session != null && session.run.telemetryLog.length >= 2;
}

export async function clearLocalTsuisoSession(role: TsuisoRole): Promise<void> {
  delete memoryCache[role];
  await AsyncStorage.removeItem(STORAGE_KEYS[role]);
}

export function getLocalTsuisoSessionMemory(role: TsuisoRole): TsuisoLocalSession | null {
  return memoryCache[role] ?? null;
}
