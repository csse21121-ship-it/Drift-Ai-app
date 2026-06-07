/**
 * SettingsContext
 *
 * アプリ全体の設定（ドリフト閾値・マウント向き）を管理する React Context。
 * AsyncStorage に永続化し、アプリ起動時に読み込む。
 *
 * Usage:
 *   // SettingsProvider は app/_layout.tsx で一度だけ配置
 *   const { settings, updateThresholds, setMountOverride, resetSettings } = useSettings();
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { DEFAULT_SETTINGS, normalizeSmoothingPreset, normalizeSurfaceCondition } from '@/types/settings';
import type { AppSettings, DriftThresholds, FeedbackSettings, MountOrientationOverride, SmoothingPreset, SurfaceCondition } from '@/types/settings';
import { isUiThemePresetId } from '@/constants/uiThemes';
import type { UiThemePresetId } from '@/constants/uiThemes';
import { normalizeFeedbackVolumes } from '@/lib/audioVolume';
import { normalizeBgmTrackId } from '@/constants/bgmTracks';

const SETTINGS_KEY = '@driftscore/app_settings';

// ── Context 型 ───────────────────────────────────────────────

type SettingsContextType = {
  /** 現在の設定値 */
  settings: AppSettings;
  /** ドリフト閾値を更新して AsyncStorage に保存 */
  updateThresholds: (next: DriftThresholds) => Promise<void>;
  /** マウント向き設定を更新して AsyncStorage に保存 */
  setMountOverride: (next: MountOrientationOverride) => Promise<void>;
  /** フィードバック設定を更新して AsyncStorage に保存 */
  updateFeedback: (next: FeedbackSettings) => Promise<void>;
  /** UI テーマを更新して AsyncStorage に保存 */
  setAppearanceTheme: (next: UiThemePresetId) => Promise<void>;
  /** G スムージングプリセットを更新して AsyncStorage に保存 */
  setSmoothingPreset: (next: SmoothingPreset) => Promise<void>;
  /** 路面コンディション（DRY / WET）を更新して AsyncStorage に保存 */
  setSurfaceCondition: (next: SurfaceCondition) => Promise<void>;
  /** すべての設定をデフォルト値にリセット */
  resetSettings: () => Promise<void>;
  /** AsyncStorage 読み込み中フラグ */
  loading: boolean;
};

// ── Context インスタンス ──────────────────────────────────────

const SettingsContext = createContext<SettingsContextType>({
  settings:         DEFAULT_SETTINGS,
  updateThresholds: async () => {},
  setMountOverride: async () => {},
  updateFeedback:   async () => {},
  setAppearanceTheme: async () => {},
  setSmoothingPreset: async () => {},
  setSurfaceCondition: async () => {},
  resetSettings:    async () => {},
  loading:          true,
});

// ── Provider ────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading,  setLoading]  = useState(true);

  // 起動時に AsyncStorage から読み込む
  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((json) => {
        if (json) {
          try {
            const parsed = JSON.parse(json) as Partial<AppSettings>;
            setSettings({
              thresholds: {
                ...DEFAULT_SETTINGS.thresholds,
                ...(parsed.thresholds ?? {}),
              },
              mountOverride:
                parsed.mountOverride ?? DEFAULT_SETTINGS.mountOverride,
              feedback: {
                ...DEFAULT_SETTINGS.feedback,
                ...(parsed.feedback ?? {}),
                ...normalizeFeedbackVolumes(parsed.feedback ?? {}),
                bgmTrackId: normalizeBgmTrackId(parsed.feedback?.bgmTrackId),
              },
              appearanceThemeId:
                parsed.appearanceThemeId && isUiThemePresetId(parsed.appearanceThemeId)
                  ? parsed.appearanceThemeId
                  : DEFAULT_SETTINGS.appearanceThemeId,
              smoothingPreset: normalizeSmoothingPreset(parsed.smoothingPreset),
              surfaceCondition: normalizeSurfaceCondition(parsed.surfaceCondition),
            });
          } catch {
            // JSON 破損時はデフォルトのまま
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback(async (next: AppSettings) => {
    setSettings(next);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }, []);

  const updateThresholds = useCallback(
    async (next: DriftThresholds) => {
      await persist({ ...settings, thresholds: next });
    },
    [settings, persist],
  );

  const setMountOverride = useCallback(
    async (next: MountOrientationOverride) => {
      await persist({ ...settings, mountOverride: next });
    },
    [settings, persist],
  );

  const updateFeedback = useCallback(
    async (next: FeedbackSettings) => {
      await persist({ ...settings, feedback: next });
    },
    [settings, persist],
  );

  const setAppearanceTheme = useCallback(
    async (next: UiThemePresetId) => {
      await persist({ ...settings, appearanceThemeId: next });
    },
    [settings, persist],
  );

  const setSmoothingPreset = useCallback(
    async (next: SmoothingPreset) => {
      await persist({ ...settings, smoothingPreset: next });
    },
    [settings, persist],
  );

  const setSurfaceCondition = useCallback(
    async (next: SurfaceCondition) => {
      await persist({ ...settings, surfaceCondition: next });
    },
    [settings, persist],
  );

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    await AsyncStorage.removeItem(SETTINGS_KEY);
  }, []);

  return (
    <SettingsContext.Provider
      value={{ settings, updateThresholds, setMountOverride, updateFeedback, setAppearanceTheme, setSmoothingPreset, setSurfaceCondition, resetSettings, loading }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────

export function useSettings(): SettingsContextType {
  return useContext(SettingsContext);
}
