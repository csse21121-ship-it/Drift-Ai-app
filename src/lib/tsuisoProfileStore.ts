/**
 * 追走（Tsuiso）匿名プロフィール — 端末ローカルのみ
 * ログイン・アカウント連携なし。表示名だけを AsyncStorage に保存。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = '@driftscore/tsuiso_anonymous_profile';

export type TsuisoAnonymousProfile = {
  displayName: string;
  createdAt: number;
  updatedAt: number;
};

const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 16;

const NAME_PREFIXES = [
  'Neo',
  'Turbo',
  'Silent',
  'Ghost',
  'Midnight',
  'Redline',
  'Drift',
  'Tsuiso',
];

const NAME_SUFFIXES = [
  'Runner',
  'Chaser',
  'Pilot',
  'Drifter',
  'Rider',
  'Ace',
];

function secureRandomInt(max: number): number {
  if (max <= 0) return 0;
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

/** ログイン不要のランダム匿名名（例: NeoDrifter482） */
export function generateAnonymousDisplayName(): string {
  const prefix = NAME_PREFIXES[secureRandomInt(NAME_PREFIXES.length)]!;
  const suffix = NAME_SUFFIXES[secureRandomInt(NAME_SUFFIXES.length)]!;
  const num = 100 + secureRandomInt(900);
  return `${prefix}${suffix}${num}`.slice(0, DISPLAY_NAME_MAX);
}

/**
 * 表示名を正規化。無効なら null。
 * メール風（@）や制御文字は拒否。
 */
export function normalizeDisplayName(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < DISPLAY_NAME_MIN || trimmed.length > DISPLAY_NAME_MAX) {
    return null;
  }
  if (trimmed.includes('@')) return null;
  if (!/^[\p{L}\p{N} _#\-]+$/u.test(trimmed)) return null;
  return trimmed;
}

export function getDisplayNameLimits(): { min: number; max: number } {
  return { min: DISPLAY_NAME_MIN, max: DISPLAY_NAME_MAX };
}

let memoryProfile: TsuisoAnonymousProfile | null = null;

export async function loadTsuisoProfile(): Promise<TsuisoAnonymousProfile> {
  if (memoryProfile) return memoryProfile;

  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TsuisoAnonymousProfile;
      const normalized = normalizeDisplayName(parsed.displayName ?? '');
      if (normalized) {
        memoryProfile = {
          ...parsed,
          displayName: normalized,
        };
        return memoryProfile;
      }
    }
  } catch {
    // fall through to new profile
  }

  const now = Date.now();
  memoryProfile = {
    displayName: generateAnonymousDisplayName(),
    createdAt: now,
    updatedAt: now,
  };
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(memoryProfile));
  return memoryProfile;
}

export async function saveTsuisoDisplayName(
  raw: string,
): Promise<{ ok: true; profile: TsuisoAnonymousProfile } | { ok: false; reason: string }> {
  const normalized = normalizeDisplayName(raw);
  if (!normalized) {
    return {
      ok: false,
      reason: `表示名は ${DISPLAY_NAME_MIN}〜${DISPLAY_NAME_MAX} 文字（記号は _ - # のみ）`,
    };
  }

  const existing = await loadTsuisoProfile();
  const now = Date.now();
  memoryProfile = {
    displayName: normalized,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(memoryProfile));
  return { ok: true, profile: memoryProfile };
}

export async function regenerateAnonymousDisplayName(): Promise<TsuisoAnonymousProfile> {
  const result = await saveTsuisoDisplayName(generateAnonymousDisplayName());
  if (result.ok) return result.profile;
  return loadTsuisoProfile();
}
