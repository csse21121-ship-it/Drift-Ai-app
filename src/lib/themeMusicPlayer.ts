/**

 * テーマ BGM プレイヤー — 単一インスタンス・直列制御

 */



import {

  createAudioPlayer,

  setAudioModeAsync,

  type AudioPlayer,

  type AudioSource,

} from 'expo-audio';

import { resolveBgmPlayback, type BgmProfileKind } from '@/constants/bgmTracks';

import type { UiThemePresetId } from '@/constants/uiThemes';

import { clampSoundVolume, isBgmActive } from '@/lib/audioVolume';

import type { FeedbackSettings } from '@/types/settings';



export type { BgmProfileKind } from '@/constants/bgmTracks';



let audioModeReady = false;

let bgmPlayer: AudioPlayer | null = null;

let activeBgmTrackKey: string | null = null;

let bgmBaseVolume = 1;

/** ユーザー設定 bgmVolume (0–1)。OFF 時も値は保持し、フラグで再生を止める */

let bgmUserVolumeScale = 1;

let soundPlaybackAllowed = true;

let bgmPlaybackAllowed = true;

let bgmPlayToken = 0;

/** create 競合で孤立したプレイヤーを追跡して破棄 */

const orphanBgmPlayers = new Set<AudioPlayer>();

let bgmOperationChain: Promise<void> = Promise.resolve();



function resolvedBgmVolume(): number {

  return bgmBaseVolume * bgmUserVolumeScale;

}



function isBgmPlaybackAllowed(): boolean {

  return (

    soundPlaybackAllowed &&

    bgmPlaybackAllowed &&

    bgmUserVolumeScale > 0

  );

}



function isPlayTokenValid(token: number): boolean {

  return token === bgmPlayToken && isBgmPlaybackAllowed();

}



async function disposeAudioPlayer(player: AudioPlayer): Promise<void> {

  orphanBgmPlayers.delete(player);

  try {

    player.pause();

  } catch {

    // ignore

  }

  try {

    player.remove();

  } catch {

    // ignore

  }

}



function disposeAllOrphanBgmPlayers(): void {

  for (const player of orphanBgmPlayers) {

    void disposeAudioPlayer(player);

  }

  orphanBgmPlayers.clear();

}



/** 参照を外して即 stop（await しない — OFF 反映を速くする） */

function detachActiveBgmPlayer(): void {

  const player = bgmPlayer;

  bgmPlayer = null;

  activeBgmTrackKey = null;

  if (player) {

    player.volume = 0;

    void disposeAudioPlayer(player);

  }

}



/** BGM を即座に止める（トークン進行 + 孤立インスタンスも破棄） */

export function haltBgmImmediately(): void {

  bgmPlayToken++;

  detachActiveBgmPlayer();

  disposeAllOrphanBgmPlayers();

}



function enqueueBgmOperation(task: () => Promise<void>): void {

  bgmOperationChain = bgmOperationChain.then(task).catch(() => undefined);

}



export function setSoundPlaybackAllowed(allowed: boolean): void {

  soundPlaybackAllowed = allowed;

  if (!allowed) {

    haltBgmImmediately();

  }

}



export function isSoundPlaybackAllowed(): boolean {

  return soundPlaybackAllowed;

}



export function setBgmPlaybackAllowed(allowed: boolean): void {

  bgmPlaybackAllowed = allowed;

  if (!allowed) {

    haltBgmImmediately();

  }

}



export function isBgmPlaybackAllowedFlag(): boolean {

  return bgmPlaybackAllowed;

}



/** ユーザー BGM 音量スケールを更新（OFF フラグとは独立） */

export function setBgmUserVolumeScale(scale: number): void {

  bgmUserVolumeScale = Math.min(1, Math.max(0, scale));

}



export function refreshActiveBgmVolume(): void {

  void applyBgmVolume();

}



async function applyBgmVolume(): Promise<void> {

  if (!bgmPlayer || !isBgmPlaybackAllowed()) return;

  try {

    bgmPlayer.volume = resolvedBgmVolume();

  } catch {

    // ignore

  }

}



export async function ensureAudioMode(): Promise<void> {

  if (audioModeReady) return;

  try {

    await setAudioModeAsync({

      allowsRecording: false,

      playsInSilentMode: true,

      shouldPlayInBackground: false,

      interruptionMode: 'duckOthers',

      shouldRouteThroughEarpiece: false,

    });

    audioModeReady = true;

  } catch (error) {

    if (__DEV__) {

      console.warn('[themeMusicPlayer] setAudioModeAsync failed', error);

    }

  }

}



function startPlaybackWhenReady(

  player: AudioPlayer,

  beforePlay?: () => boolean,

): void {

  const begin = () => {

    if (beforePlay && !beforePlay()) return;

    player.play();

  };



  if (player.isLoaded) {

    begin();

    return;

  }



  const subscription = player.addListener('playbackStatusUpdate', (status) => {

    if (!status.isLoaded) return;

    subscription.remove();

    begin();

  });

}



async function playBgmInternal(

  trackKey: string,

  source: AudioSource,

  baseVolume: number,

): Promise<void> {

  if (!isBgmPlaybackAllowed()) {

    detachActiveBgmPlayer();

    return;

  }



  const token = bgmPlayToken;

  await ensureAudioMode();



  if (!isPlayTokenValid(token)) return;



  bgmBaseVolume = baseVolume;

  const volume = resolvedBgmVolume();



  if (bgmPlayer && activeBgmTrackKey === trackKey) {

    try {

      bgmPlayer.volume = volume;

      if (!isPlayTokenValid(token)) {

        detachActiveBgmPlayer();

        return;

      }

      if (bgmPlayer.isLoaded && !bgmPlayer.playing) {

        bgmPlayer.play();

      }

    } catch (error) {

      if (__DEV__) {

        console.warn('[themeMusicPlayer] resume BGM failed', error);

      }

    }

    return;

  }



  if (!isPlayTokenValid(token)) return;



  detachActiveBgmPlayer();



  if (!isPlayTokenValid(token)) return;



  try {

    const player = createAudioPlayer(source);

    player.loop = true;

    player.volume = volume;



    startPlaybackWhenReady(player, () => {

      if (!isPlayTokenValid(token)) {

        orphanBgmPlayers.add(player);

        void disposeAudioPlayer(player);

        return false;

      }

      return true;

    });



    if (!isPlayTokenValid(token)) {

      orphanBgmPlayers.add(player);

      void disposeAudioPlayer(player);

      return;

    }



    bgmPlayer = player;

    activeBgmTrackKey = trackKey;

  } catch (error) {

    if (__DEV__) {

      console.warn('[themeMusicPlayer] playBgm failed', trackKey, error);

    }

  }

}



async function playBgm(

  trackKey: string,

  source: AudioSource,

  baseVolume: number,

): Promise<void> {

  if (!isBgmPlaybackAllowed()) return;



  return new Promise<void>((resolve) => {

    enqueueBgmOperation(async () => {

      await playBgmInternal(trackKey, source, baseVolume);

      resolve();

    });

  });

}



export async function stopThemeBgm(): Promise<void> {

  haltBgmImmediately();

  await bgmOperationChain;

}



export async function playThemeOneShot(

  source: AudioSource,

  volume: number,

): Promise<AudioPlayer | null> {

  if (!soundPlaybackAllowed || volume <= 0) return null;



  await ensureAudioMode();

  try {

    const player = createAudioPlayer(source);

    player.volume = volume;

    startPlaybackWhenReady(player);



    player.addListener('playbackStatusUpdate', (status) => {

      if (!status.didJustFinish) return;

      void disposeAudioPlayer(player);

    });



    return player;

  } catch (error) {

    if (__DEV__) {

      console.warn('[themeMusicPlayer] playThemeOneShot failed', error);

    }

    return null;

  }

}



export function getActiveBgmTrackKey(): string | null {

  return activeBgmTrackKey;

}



/** @deprecated getActiveBgmTrackKey を使用 */

export function getActiveBgmThemeId(): UiThemePresetId | null {

  if (!activeBgmTrackKey?.startsWith('theme:')) return null;

  return activeBgmTrackKey.slice('theme:'.length) as UiThemePresetId;

}



/** 設定フィードバック → BGM 反映（ON/OFF・音量・再生開始） */

export function applyBgmFromSettings(

  feedback: FeedbackSettings,

  themeId: UiThemePresetId,

  kind: BgmProfileKind = 'ambient',

): void {

  if (!feedback.soundEnabled || !soundPlaybackAllowed || !isBgmActive(feedback)) {

    bgmPlaybackAllowed = false;

    haltBgmImmediately();

    return;

  }



  bgmPlaybackAllowed = true;

  setBgmUserVolumeScale(clampSoundVolume(feedback.bgmVolume));

  const resolved = resolveBgmPlayback(feedback, themeId, kind);

  void playBgm(resolved.trackKey, resolved.source, resolved.baseVolume);

}



/** 音量スライダー用 — 再生中は再ロードせず音量のみ更新 */

export function applyBgmVolumeFromSettings(

  feedback: FeedbackSettings,

  themeId: UiThemePresetId,

  kind: BgmProfileKind = 'ambient',

): void {

  if (!isBgmActive(feedback) || !soundPlaybackAllowed) {

    bgmPlaybackAllowed = false;

    haltBgmImmediately();

    return;

  }



  bgmPlaybackAllowed = true;

  setBgmUserVolumeScale(clampSoundVolume(feedback.bgmVolume));



  const resolved = resolveBgmPlayback(feedback, themeId, kind);

  if (bgmPlayer && activeBgmTrackKey === resolved.trackKey && isBgmPlaybackAllowed()) {

    refreshActiveBgmVolume();

    return;

  }



  void playBgm(resolved.trackKey, resolved.source, resolved.baseVolume);

}

