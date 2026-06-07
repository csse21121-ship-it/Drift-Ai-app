/**
 * ドリフト突入時のハプティクス / サウンド
 */

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { SFX } from '@/constants/audioAssets';
import { getEffectiveSfxVolume } from '@/lib/audioVolume';
import type { FeedbackSettings } from '@/types/settings';

let audioModeReady = false;

async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
    });
    audioModeReady = true;
  } catch {
    // サイレントモード設定失敗時も続行
  }
}

const DRIFT_SKID_BASE_VOLUME = 0.62;

async function playDriftSkidSound(feedback: FeedbackSettings): Promise<void> {
  const volume = getEffectiveSfxVolume(DRIFT_SKID_BASE_VOLUME, feedback);
  if (volume <= 0) return;

  try {
    await ensureAudioMode();
    const player = createAudioPlayer({ uri: SFX.skid });
    player.volume = volume;

    const start = () => player.play();
    if (player.isLoaded) {
      start();
    } else {
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (!status.isLoaded) return;
        subscription.remove();
        start();
      });
    }

    player.addListener('playbackStatusUpdate', (status) => {
      if (!status.didJustFinish) return;
      try {
        player.remove();
      } catch {
        // ignore
      }
    });
  } catch {
    // 再生失敗は UI に影響させない
  }
}

async function triggerHaptic(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // 非対応端末・シミュレータ
  }
}

/** ドリフト突入（idle → active）時のフィードバック */
export function triggerDriftEnterFeedback(options: FeedbackSettings): void {
  if (options.hapticsEnabled) {
    void triggerHaptic();
  }
  if (options.soundEnabled) {
    void playDriftSkidSound(options);
  }
}
