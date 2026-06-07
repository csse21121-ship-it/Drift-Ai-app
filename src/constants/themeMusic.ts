/**
 * テーマ別 BGM / SE
 */

import type { AudioSource } from 'expo-audio';
import { BGM, SFX } from '@/constants/audioAssets';
import type { UiThemePresetId } from '@/constants/uiThemes';

export type ThemeMusicProfile = {
  bgm: AudioSource;
  bgmVolume: number;
  ambientVolume: number;
  skid: AudioSource;
  skidAccent: AudioSource;
  skidVolume: number;
  accentSkidVolume: number;
};

export const THEME_MUSIC: Record<UiThemePresetId, ThemeMusicProfile> = {
  'pit-lane': {
    bgm: { uri: BGM.pitLane },
    bgmVolume: 0.55,
    ambientVolume: 0.38,
    skid: { uri: SFX.skid },
    skidAccent: { uri: SFX.skidAccent },
    skidVolume: 0.88,
    accentSkidVolume: 0.72,
  },
  'circuit-red': {
    bgm: { uri: BGM.circuitRed },
    bgmVolume: 0.58,
    ambientVolume: 0.4,
    skid: { uri: SFX.engine },
    skidAccent: { uri: SFX.skid },
    skidVolume: 0.85,
    accentSkidVolume: 0.78,
  },
  'midnight-cyan': {
    bgm: { uri: BGM.midnightCyan },
    bgmVolume: 0.52,
    ambientVolume: 0.36,
    skid: { uri: SFX.sciFi },
    skidAccent: { uri: SFX.skidAccent },
    skidVolume: 0.7,
    accentSkidVolume: 0.65,
  },
  'amber-garage': {
    bgm: { uri: BGM.amberGarage },
    bgmVolume: 0.54,
    ambientVolume: 0.37,
    skid: { uri: SFX.skid },
    skidAccent: { uri: SFX.engine },
    skidVolume: 0.75,
    accentSkidVolume: 0.55,
  },
  'paper-light': {
    bgm: { uri: BGM.paperLight },
    bgmVolume: 0.38,
    ambientVolume: 0.24,
    skid: { uri: SFX.arcade },
    skidAccent: { uri: SFX.win },
    skidVolume: 0.65,
    accentSkidVolume: 0.6,
  },
};

export function getThemeMusicProfile(themeId: UiThemePresetId): ThemeMusicProfile {
  return THEME_MUSIC[themeId];
}
