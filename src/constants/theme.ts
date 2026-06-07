/**
 * PIT LANE — design tokens（後方互換 + テーマ基盤）
 *
 * 動的テーマは useTheme() を使用。静的 import はデフォルトプリセットのスナップショット。
 */
import {
  DEFAULT_UI_THEME_ID,
  UI_THEME_PRESETS,
  type AppTypography,
  type ThemeColors,
} from '@/constants/uiThemes';

export type { ThemeColors, AppTypography, UiThemePresetId } from '@/constants/uiThemes';
export {
  DEFAULT_UI_THEME_ID,
  UI_THEME_LIST,
  UI_THEME_PRESETS,
  getUiTheme,
  isUiThemePresetId,
} from '@/constants/uiThemes';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

const _default = UI_THEME_PRESETS[DEFAULT_UI_THEME_ID];

/** @deprecated useTheme().colors を推奨 */
export const colors: ThemeColors = { ..._default.colors };

/** @deprecated useTheme().typography を推奨 */
export const typography: AppTypography = { ..._default.typography };

/** @deprecated useTheme().gradeColor を推奨 */
export const GRADE_COLOR: Record<string, string> = { ..._default.gradeColor };
