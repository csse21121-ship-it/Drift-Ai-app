/**

 * UI タップ SE — プリロード + 即時再生（設定 SOUND と連動）

 */



import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { UI_SOUNDS, UI_SOUND_KINDS, type UiSoundKind } from '@/constants/uiSounds';

import { getEffectiveSfxVolume, isSfxActive } from '@/lib/audioVolume';

import { ensureAudioMode } from '@/lib/themeMusicPlayer';

import type { FeedbackSettings } from '@/types/settings';



const MIN_INTERVAL_MS = 40;

const lastPlayedAt: Partial<Record<UiSoundKind, number>> = {};

const pool = new Map<UiSoundKind, AudioPlayer>();

let preloadPromise: Promise<void> | null = null;



async function loadIntoPool(kind: UiSoundKind): Promise<AudioPlayer | null> {

  const existing = pool.get(kind);

  if (existing) {

    try {

      if (existing.isLoaded) return existing;

    } catch {

      pool.delete(kind);

    }

  }



  const profile = UI_SOUNDS[kind];

  try {

    const player = createAudioPlayer(profile.source);

    player.volume = profile.volume;

    pool.set(kind, player);

    return player;

  } catch (error) {

    if (__DEV__) {

      console.warn('[uiSound] preload failed', kind, error);

    }

    return null;

  }

}



/** アプリ起動時など — タップの即応性向上 */

export function preloadUiSounds(): Promise<void> {

  if (!preloadPromise) {

    preloadPromise = (async () => {

      await ensureAudioMode();

      await Promise.all(UI_SOUND_KINDS.map((kind) => loadIntoPool(kind)));

    })();

  }

  return preloadPromise;

}



async function playFromPool(kind: UiSoundKind, volume: number): Promise<void> {

  await ensureAudioMode();



  let player = await loadIntoPool(kind);



  if (player) {

    try {

      if (player.isLoaded) {

        if (player.playing) {

          player.pause();

        }

        await player.seekTo(0);

        player.volume = volume;

        player.play();

        return;

      }

    } catch {

      pool.delete(kind);

      player = null;

    }

  }



  const profile = UI_SOUNDS[kind];

  try {

    const created = createAudioPlayer(profile.source);

    created.volume = volume;



    const start = () => created.play();

    if (created.isLoaded) {

      start();

    } else {

      const subscription = created.addListener('playbackStatusUpdate', (status) => {

        if (!status.isLoaded) return;

        subscription.remove();

        start();

      });

    }



    created.addListener('playbackStatusUpdate', (status) => {

      if (!status.didJustFinish) return;

      try {

        created.remove();

      } catch {

        // ignore

      }

    });

  } catch (error) {

    if (__DEV__) {

      console.warn('[uiSound] play failed', kind, error);

    }

  }

}



/** タップ SE（非同期内部・呼び出し側は fire-and-forget） */

export function playUiSound(kind: UiSoundKind, feedback: FeedbackSettings): void {

  if (!isSfxActive(feedback)) return;



  const volume = getEffectiveSfxVolume(UI_SOUNDS[kind].volume, feedback);

  if (volume <= 0) return;



  const now = Date.now();

  const last = lastPlayedAt[kind] ?? 0;

  if (now - last < MIN_INTERVAL_MS) return;

  lastPlayedAt[kind] = now;



  void preloadUiSounds().finally(() => {

    void playFromPool(kind, volume);

  });

}



export async function unloadUiSounds(): Promise<void> {

  await Promise.all(

    [...pool.entries()].map(async ([kind, player]) => {

      try {

        player.remove();

      } catch {

        // ignore

      }

      pool.delete(kind);

    }),

  );

  preloadPromise = null;

}

