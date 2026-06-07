import { useCallback } from 'react';

import { useFocusEffect } from 'expo-router';

import { useSettings } from '@/contexts/SettingsContext';

import type { UiThemePresetId } from '@/constants/uiThemes';

import { applyBgmFromSettings } from '@/lib/bgmController';

import type { FeedbackSettings } from '@/types/settings';



/** 画面フォーカス中にテーマ BGM をループ再生（Pit Lane 等） */

export function useScreenBgm(themeId: UiThemePresetId, feedback: FeedbackSettings) {

  const { loading } = useSettings();



  useFocusEffect(

    useCallback(() => {

      if (loading) return () => undefined;

      applyBgmFromSettings(feedback, themeId);

      return () => undefined;

    }, [themeId, feedback, loading]),

  );

}


