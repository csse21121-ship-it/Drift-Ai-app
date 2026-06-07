import type { FeedbackSettings } from '@/types/settings';

export const SOUND_VOLUME_MIN = 0;
export const SOUND_VOLUME_MAX = 1;
export const SOUND_VOLUME_STEP = 0.05;

/** 0–1 にクランプ */
export function clampSoundVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(SOUND_VOLUME_MAX, Math.max(SOUND_VOLUME_MIN, value));
}

/** BGM が鳴る条件（SOUND ON かつ BGM ON） */
export function isBgmActive(feedback: FeedbackSettings): boolean {
  return feedback.soundEnabled && feedback.bgmEnabled;
}

/** UI SE / ドリフト SE が鳴る条件 */
export function isSfxActive(feedback: FeedbackSettings): boolean {
  return feedback.soundEnabled;
}

/** BGM — 無効時は 0 */
export function getEffectiveBgmVolume(
  baseVolume: number,
  feedback: FeedbackSettings,
): number {
  if (!isBgmActive(feedback)) return 0;
  return baseVolume * clampSoundVolume(feedback.bgmVolume);
}

/** UI SE / ドリフト SE / スプラッシュ SE — 無効時は 0 */
export function getEffectiveSfxVolume(
  baseVolume: number,
  feedback: FeedbackSettings,
): number {
  if (!isSfxActive(feedback)) return 0;
  return baseVolume * clampSoundVolume(feedback.sfxVolume);
}

/** スライダー表示用パーセント (0–100) */
export function soundVolumeToPercent(volume: number): number {
  return Math.round(clampSoundVolume(volume) * 100);
}

/** 旧 soundVolume から bgm / sfx へ移行 */
export function normalizeFeedbackVolumes(
  raw: Partial<FeedbackSettings> & { soundVolume?: number },
): Pick<FeedbackSettings, 'bgmVolume' | 'sfxVolume'> {
  const legacy = raw.soundVolume;
  return {
    bgmVolume: clampSoundVolume(raw.bgmVolume ?? legacy ?? 1),
    sfxVolume: clampSoundVolume(raw.sfxVolume ?? legacy ?? 1),
  };
}
