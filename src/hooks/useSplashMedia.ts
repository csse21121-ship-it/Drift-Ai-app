import { useCallback, useEffect, useRef } from 'react';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import type { AudioPlayer } from 'expo-audio';
import { SPLASH_MEDIA } from '@/constants/splashAssets';
import { getThemeMusicProfile } from '@/constants/themeMusic';
import type { UiThemePresetId } from '@/constants/uiThemes';
import { applyBgmFromSettings } from '@/lib/bgmController';
import { getEffectiveSfxVolume, isBgmActive, isSfxActive } from '@/lib/audioVolume';
import {
  isSoundPlaybackAllowed,
  playThemeOneShot,
  haltBgmImmediately,
} from '@/lib/themeMusicPlayer';
import type { FeedbackSettings } from '@/types/settings';

type SplashMediaOptions = {
  themeId: UiThemePresetId;
  feedback: FeedbackSettings;
};

type SplashMediaRefs = {
  videoPlayer: VideoPlayer;
  stopAll: () => Promise<void>;
};

export function useSplashMedia(
  enabled: boolean,
  options: SplashMediaOptions,
): SplashMediaRefs {
  const { themeId, feedback } = options;
  const oneShotsRef = useRef<AudioPlayer[]>([]);

  const videoPlayer = useVideoPlayer(SPLASH_MEDIA.video, (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  const stopSplashForeground = useCallback(async () => {
    try {
      videoPlayer.pause();
      videoPlayer.currentTime = 0;
    } catch {
      // ignore
    }

    await Promise.all(
      oneShotsRef.current.map(async (player) => {
        try {
          player.pause();
          player.remove();
        } catch {
          // ignore
        }
      }),
    );
    oneShotsRef.current = [];
  }, [videoPlayer]);

  useEffect(() => {
    if (!isBgmActive(feedback) || !isSoundPlaybackAllowed()) {
      haltBgmImmediately();
    }
    if (!isSfxActive(feedback) || !isSoundPlaybackAllowed()) {
      void stopSplashForeground();
    }
  }, [feedback.soundEnabled, feedback.bgmEnabled, stopSplashForeground]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const profile = getThemeMusicProfile(themeId);

    const setup = async () => {
      if (isBgmActive(feedback) && isSoundPlaybackAllowed()) {
        applyBgmFromSettings(feedback, themeId, 'splash');
        if (cancelled) return;
      }

      if (!isSfxActive(feedback) || !isSoundPlaybackAllowed()) return;

      const skid1Vol = getEffectiveSfxVolume(profile.skidVolume, feedback);
      const skid1 = await playThemeOneShot(profile.skid, skid1Vol);
      if (skid1 && !cancelled) oneShotsRef.current.push(skid1);

      setTimeout(async () => {
        if (cancelled || !isSfxActive(feedback) || !isSoundPlaybackAllowed()) return;
        const skid2Vol = getEffectiveSfxVolume(profile.accentSkidVolume, feedback);
        const skid2 = await playThemeOneShot(profile.skidAccent, skid2Vol);
        if (skid2 && !cancelled) oneShotsRef.current.push(skid2);
      }, 1300);
    };

    void setup();

    return () => {
      cancelled = true;
      void stopSplashForeground();
    };
  }, [
    enabled,
    themeId,
    feedback,
    stopSplashForeground,
  ]);

  return { videoPlayer, stopAll: stopSplashForeground };
}
