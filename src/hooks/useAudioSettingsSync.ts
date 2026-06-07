import { useEffect } from 'react';
import { setIsAudioActiveAsync } from 'expo-audio';
import { useSettings } from '@/contexts/SettingsContext';
import { useTheme } from '@/contexts/ThemeContext';
import { resolveBgmPlayback } from '@/constants/bgmTracks';
import { isBgmActive, clampSoundVolume } from '@/lib/audioVolume';
import {
  applyBgmFromSettings,
  haltBgmImmediately,
  refreshActiveBgmVolume,
  setBgmPlaybackAllowed,
  setBgmUserVolumeScale,
  setSoundPlaybackAllowed,
  getActiveBgmTrackKey,
} from '@/lib/themeMusicPlayer';
import { preloadUiSounds, unloadUiSounds } from '@/lib/uiSound';

/** 設定の SOUND / BGM / 音量をオーディオへ即時反映 */
export function useAudioSettingsSync() {
  const { settings, loading } = useSettings();
  const { id: themeId } = useTheme();
  const { soundEnabled, bgmEnabled, bgmVolume, bgmTrackId } = settings.feedback;

  useEffect(() => {
    if (loading) return;

    if (!soundEnabled) {
      setSoundPlaybackAllowed(false);
      void (async () => {
        await unloadUiSounds();
        try {
          await setIsAudioActiveAsync(false);
        } catch {
          // ignore
        }
      })();
      return;
    }

    setSoundPlaybackAllowed(true);

    void (async () => {
      try {
        await setIsAudioActiveAsync(true);
      } catch {
        // ignore
      }
      void preloadUiSounds();
    })();

    if (!isBgmActive(settings.feedback)) {
      setBgmPlaybackAllowed(false);
      haltBgmImmediately();
      return;
    }

    setBgmPlaybackAllowed(true);
    setBgmUserVolumeScale(clampSoundVolume(bgmVolume));

    const resolved = resolveBgmPlayback(settings.feedback, themeId, 'ambient');
    const activeKey = getActiveBgmTrackKey();

    if (activeKey === resolved.trackKey) {
      refreshActiveBgmVolume();
      return;
    }

    applyBgmFromSettings(settings.feedback, themeId);
  }, [loading, soundEnabled, bgmEnabled, bgmVolume, bgmTrackId, themeId, settings.feedback]);
}
