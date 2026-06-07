/**
 * ThemeContext — ユーザー選択 UI テーマをアプリ全体に適用
 */

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import {
  DEFAULT_UI_THEME_ID,
  getUiTheme,
  type AppTypography,
  type ThemeColors,
  type UiThemePreset,
  type UiThemePresetId,
} from '@/constants/uiThemes';
import { spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';

export type ThemeContextValue = UiThemePreset & {
  spacing: typeof spacing;
};

const ThemeContext = createContext<ThemeContextValue>(
  { ...getUiTheme(DEFAULT_UI_THEME_ID), spacing },
);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const themeId = settings.appearanceThemeId ?? DEFAULT_UI_THEME_ID;

  const value = useMemo(
    (): ThemeContextValue => ({
      ...getUiTheme(themeId),
      spacing,
    }),
    [themeId],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export type ThemeTokens = {
  colors: ThemeColors;
  typography: AppTypography;
  gradeColor: Record<string, string>;
  spacing: typeof spacing;
};

/** StyleSheet.create をテーマ変更時に再生成するヘルパー */
export function useThemedStyles<T>(
  factory: (theme: ThemeContextValue) => T,
): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme.id, factory]);
}

export type { UiThemePresetId };
