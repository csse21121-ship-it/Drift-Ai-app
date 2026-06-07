/**
 * HUD / メニュー用 SE — レーシングゲーム風タップ音
 */

import type { AudioSource } from 'expo-audio';
import { UI_SFX } from '@/constants/audioAssets';

export type UiSoundKind = 'nav' | 'launch' | 'confirm' | 'back' | 'danger';

type UiSoundProfile = {
  source: AudioSource;
  volume: number;
};

export const UI_SOUNDS: Record<UiSoundKind, UiSoundProfile> = {
  nav: { source: { uri: UI_SFX.nav }, volume: 0.55 },
  launch: { source: { uri: UI_SFX.launch }, volume: 0.42 },
  confirm: { source: { uri: UI_SFX.confirm }, volume: 0.52 },
  back: { source: { uri: UI_SFX.back }, volume: 0.45 },
  danger: { source: { uri: UI_SFX.danger }, volume: 0.38 },
};

export const UI_SOUND_KINDS: UiSoundKind[] = [
  'nav',
  'launch',
  'confirm',
  'back',
  'danger',
];
