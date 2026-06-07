/**
 * ユーザーが選べる BGM トラック一覧
 */

import type { AudioSource } from 'expo-audio';
import { BGM } from '@/constants/audioAssets';
import { getThemeMusicProfile } from '@/constants/themeMusic';
import type { UiThemePresetId } from '@/constants/uiThemes';
import type { FeedbackSettings } from '@/types/settings';

export type BgmProfileKind = 'ambient' | 'splash';

export type BgmTrackId =
  | 'theme'
  | 'neon-sign-circuit'
  | 'neon-sign-climax'
  | 'pure-raceway'
  | 'pure-raceway-climax';

export const DEFAULT_BGM_TRACK_ID: BgmTrackId = 'theme';

const BGM_TRACK_IDS: BgmTrackId[] = [
  'theme',
  'neon-sign-circuit',
  'neon-sign-climax',
  'pure-raceway',
  'pure-raceway-climax',
];

export type BgmTrackDefinition = {
  id: BgmTrackId;
  title: string;
  subtitle: string;
  uri?: string;
  ambientVolume: number;
  splashVolume: number;
};

/** 設定 UI 用リスト */
export const BGM_TRACK_LIST: BgmTrackDefinition[] = [
  {
    id: 'theme',
    title: 'UI テーマ連動',
    subtitle: '見た目テーマに合わせて自動選択',
    ambientVolume: 0,
    splashVolume: 0,
  },
  {
    id: 'neon-sign-circuit',
    title: 'Neon Sign Circuit',
    subtitle: 'シンセウェイブ · 145 BPM · Pit 向け',
    uri: BGM.pitLane,
    ambientVolume: 0.38,
    splashVolume: 0.55,
  },
  {
    id: 'neon-sign-climax',
    title: 'Neon Sign Climax',
    subtitle: 'ファイナルラップ寄り · 160 BPM',
    uri: BGM.midnightCyan,
    ambientVolume: 0.36,
    splashVolume: 0.52,
  },
  {
    id: 'pure-raceway',
    title: 'Pure Raceway',
    subtitle: 'レースゲーム風 · 160 BPM',
    uri: BGM.circuitRed,
    ambientVolume: 0.4,
    splashVolume: 0.58,
  },
  {
    id: 'pure-raceway-climax',
    title: 'Pure Raceway Climax',
    subtitle: '最高速帯 · 175 BPM',
    uri: BGM.amberGarage,
    ambientVolume: 0.37,
    splashVolume: 0.54,
  },
];

const TRACK_BY_ID = Object.fromEntries(
  BGM_TRACK_LIST.map((track) => [track.id, track]),
) as Record<BgmTrackId, BgmTrackDefinition>;

export function isBgmTrackId(value: unknown): value is BgmTrackId {
  return typeof value === 'string' && BGM_TRACK_IDS.includes(value as BgmTrackId);
}

export function normalizeBgmTrackId(value: unknown): BgmTrackId {
  return isBgmTrackId(value) ? value : DEFAULT_BGM_TRACK_ID;
}

export type ResolvedBgmPlayback = {
  trackKey: string;
  source: AudioSource;
  baseVolume: number;
};

/** 設定 + UI テーマ → 実際に再生する BGM */
export function resolveBgmPlayback(
  feedback: Pick<FeedbackSettings, 'bgmTrackId'>,
  themeId: UiThemePresetId,
  kind: BgmProfileKind = 'ambient',
): ResolvedBgmPlayback {
  const trackId = normalizeBgmTrackId(feedback.bgmTrackId);

  if (trackId === 'theme') {
    const profile = getThemeMusicProfile(themeId);
    return {
      trackKey: `theme:${themeId}`,
      source: profile.bgm,
      baseVolume: kind === 'splash' ? profile.bgmVolume : profile.ambientVolume,
    };
  }

  const def = TRACK_BY_ID[trackId];
  return {
    trackKey: trackId,
    source: { uri: def.uri! },
    baseVolume: kind === 'splash' ? def.splashVolume : def.ambientVolume,
  };
}
