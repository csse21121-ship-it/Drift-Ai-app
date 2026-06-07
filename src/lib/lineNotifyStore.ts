/**
 * LINE 走行速報 — 端末ローカル設定
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@driftscore/line_notify_settings_v2';

/** LINE Push 先: U=ユーザー, C=グループ, R=トークルーム */
const LINE_TARGET_ID_PATTERN = /^[UCR][a-f0-9]{32}$/i;

export type LineNotifyMode = 'off' | 'team' | 'personal';

export type LineNotifySettings = {
  mode: LineNotifyMode;
  targetId: string | null;
  teamPin: string | null;
  teamName: string | null;
  updatedAt: number;
};

const DEFAULT_SETTINGS: LineNotifySettings = {
  mode: 'off',
  targetId: null,
  teamPin: null,
  teamName: null,
  updatedAt: 0,
};

export function normalizeLineTargetId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!LINE_TARGET_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export function isLineNotifyActive(settings: LineNotifySettings): boolean {
  return settings.mode !== 'off' && settings.targetId != null;
}

function migrateLegacy(parsed: Record<string, unknown>): LineNotifySettings {
  if (parsed.mode === 'off' || parsed.mode === 'team' || parsed.mode === 'personal') {
    const targetId =
      typeof parsed.targetId === 'string' ? normalizeLineTargetId(parsed.targetId) : null;
    return {
      mode: parsed.mode,
      targetId,
      teamPin: typeof parsed.teamPin === 'string' ? parsed.teamPin : null,
      teamName: typeof parsed.teamName === 'string' ? parsed.teamName : null,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  }

  const legacyEnabled = parsed.enabled === true;
  const targetId =
    typeof parsed.targetId === 'string' ? normalizeLineTargetId(parsed.targetId) : null;
  if (legacyEnabled && targetId) {
    return {
      mode: 'personal',
      targetId,
      teamPin: null,
      teamName: null,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  }
  return { ...DEFAULT_SETTINGS };
}

export async function loadLineNotifySettings(): Promise<LineNotifySettings> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (!json) {
      const legacyJson = await AsyncStorage.getItem('@driftscore/line_notify_settings');
      if (legacyJson) {
        return migrateLegacy(JSON.parse(legacyJson) as Record<string, unknown>);
      }
      return { ...DEFAULT_SETTINGS };
    }
    return migrateLegacy(JSON.parse(json) as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveLineNotifySettings(
  settings: LineNotifySettings,
): Promise<void> {
  const normalized: LineNotifySettings = {
    ...settings,
    targetId: settings.targetId ? normalizeLineTargetId(settings.targetId) : null,
    updatedAt: Date.now(),
  };
  if (normalized.mode === 'off') {
    normalized.targetId = null;
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export async function saveTeamNotifySettings(input: {
  teamPin: string;
  teamName: string;
  lineTargetId: string;
}): Promise<LineNotifySettings> {
  const settings: LineNotifySettings = {
    mode: 'team',
    targetId: normalizeLineTargetId(input.lineTargetId),
    teamPin: input.teamPin,
    teamName: input.teamName,
    updatedAt: Date.now(),
  };
  await saveLineNotifySettings(settings);
  return settings;
}

export async function savePersonalNotifySettings(
  lineTargetId: string,
): Promise<LineNotifySettings> {
  const targetId = normalizeLineTargetId(lineTargetId);
  if (!targetId) {
    throw new Error('Invalid LINE target ID');
  }
  const settings: LineNotifySettings = {
    mode: 'personal',
    targetId,
    teamPin: null,
    teamName: null,
    updatedAt: Date.now(),
  };
  await saveLineNotifySettings(settings);
  return settings;
}

export async function disableLineNotify(): Promise<LineNotifySettings> {
  const settings: LineNotifySettings = { ...DEFAULT_SETTINGS, updatedAt: Date.now() };
  await saveLineNotifySettings(settings);
  return settings;
}

/** 走行保存時 */
export async function getLineNotifyTargetForUpload(): Promise<string | null> {
  const settings = await loadLineNotifySettings();
  if (!isLineNotifyActive(settings)) return null;
  return settings.targetId;
}
