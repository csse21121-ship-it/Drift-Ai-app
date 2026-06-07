/**
 * UI テーマプリセット — ゲーム HUD 風配色・タイポグラフィ
 */

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  borderGlow: string;
  neonGreen: string;
  neonGreenDim: string;
  neonGreenMuted: string;
  recRed: string;
  recRedMuted: string;
  amber: string;
  gold: string;
  pitBoard: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
};

export type AppTypography = {
  label: {
    fontSize: number;
    letterSpacing: number;
    fontWeight: '400' | '500' | '600' | '700' | '800' | '900';
    textTransform: 'uppercase' | 'none';
    fontFamily?: string;
  };
  title: {
    fontSize: number;
    letterSpacing: number;
    fontWeight: '400' | '500' | '600' | '700' | '800' | '900';
    textTransform: 'uppercase' | 'none';
    fontFamily?: string;
  };
  mono: {
    fontSize: number;
    letterSpacing: number;
    fontFamily: string;
    fontWeight?: '400' | '500' | '600' | '700' | '800' | '900';
  };
};

export type UiThemePresetId =
  | 'pit-lane'
  | 'circuit-red'
  | 'midnight-cyan'
  | 'amber-garage'
  | 'paper-light';

export type UiThemePreset = {
  id: UiThemePresetId;
  name: string;
  description: string;
  statusBarStyle: 'light' | 'dark';
  colors: ThemeColors;
  typography: AppTypography;
  gradeColor: Record<string, string>;
};

export const DEFAULT_UI_THEME_ID: UiThemePresetId = 'pit-lane';

/** アーケード HUD 向け共通タイポ */
const BASE_TYPO: AppTypography = {
  label: {
    fontSize: 10,
    letterSpacing: 2.8,
    fontWeight: '800',
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  title: {
    fontSize: 18,
    letterSpacing: 5,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  mono: {
    fontSize: 13,
    letterSpacing: 1.2,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
};

export const UI_THEME_PRESETS: Record<UiThemePresetId, UiThemePreset> = {
  'pit-lane': {
    id: 'pit-lane',
    name: 'PIT LANE',
    description: 'ネオン HUD × レーシング（標準）',
    statusBarStyle: 'light',
    colors: {
      background: '#020208',
      surface: '#0A0D14',
      surfaceElevated: '#121722',
      border: '#252B3A',
      borderGlow: '#00FF9955',
      neonGreen: '#00FF99',
      neonGreenDim: '#00DD77',
      neonGreenMuted: '#00FF9944',
      recRed: '#FF3355',
      recRedMuted: '#FF335544',
      amber: '#FFBB00',
      gold: '#FFE033',
      pitBoard: '#0A100E',
      textPrimary: '#F4F8FF',
      textSecondary: '#8A95AA',
      textMuted: '#4A5568',
    },
    typography: BASE_TYPO,
    gradeColor: {
      S: '#FFE033',
      A: '#00FF99',
      B: '#44CCFF',
      C: '#FF9900',
      D: '#667788',
    },
  },
  'circuit-red': {
    id: 'circuit-red',
    name: 'CIRCUIT RED',
    description: 'バトル HUD × レッドアラート',
    statusBarStyle: 'light',
    colors: {
      background: '#060204',
      surface: '#120A0C',
      surfaceElevated: '#1A1014',
      border: '#3A2028',
      borderGlow: '#FF335566',
      neonGreen: '#FF4466',
      neonGreenDim: '#DD2244',
      neonGreenMuted: '#FF446644',
      recRed: '#FF1122',
      recRedMuted: '#FF112244',
      amber: '#FFCC22',
      gold: '#FFDD44',
      pitBoard: '#140808',
      textPrimary: '#FFF0F2',
      textSecondary: '#AA8888',
      textMuted: '#664444',
    },
    typography: {
      ...BASE_TYPO,
      label: { ...BASE_TYPO.label, letterSpacing: 3.2 },
      title: { ...BASE_TYPO.title, letterSpacing: 6 },
    },
    gradeColor: {
      S: '#FFDD44',
      A: '#FF4466',
      B: '#FF8844',
      C: '#CC8844',
      D: '#666666',
    },
  },
  'midnight-cyan': {
    id: 'midnight-cyan',
    name: 'MIDNIGHT CYAN',
    description: 'SF レース × サイバーシアン',
    statusBarStyle: 'light',
    colors: {
      background: '#020610',
      surface: '#081018',
      surfaceElevated: '#0E1A28',
      border: '#1A3048',
      borderGlow: '#00EEFF66',
      neonGreen: '#00EEFF',
      neonGreenDim: '#00BBDD',
      neonGreenMuted: '#00EEFF44',
      recRed: '#FF5577',
      recRedMuted: '#FF557744',
      amber: '#FFCC44',
      gold: '#FFFF66',
      pitBoard: '#081018',
      textPrimary: '#E8F8FF',
      textSecondary: '#6A9AB8',
      textMuted: '#3A5870',
    },
    typography: {
      ...BASE_TYPO,
      mono: { ...BASE_TYPO.mono, letterSpacing: 1.8 },
    },
    gradeColor: {
      S: '#FFFF66',
      A: '#00EEFF',
      B: '#4488FF',
      C: '#FF9944',
      D: '#556677',
    },
  },
  'amber-garage': {
    id: 'amber-garage',
    name: 'AMBER GARAGE',
    description: 'ガレージ × ゴールドアクセント',
    statusBarStyle: 'light',
    colors: {
      background: '#0A0804',
      surface: '#141008',
      surfaceElevated: '#1E1810',
      border: '#3A3020',
      borderGlow: '#FFBB0055',
      neonGreen: '#FFBB22',
      neonGreenDim: '#DD9900',
      neonGreenMuted: '#FFBB0044',
      recRed: '#FF5544',
      recRedMuted: '#FF554444',
      amber: '#FFDD55',
      gold: '#FFEE88',
      pitBoard: '#121008',
      textPrimary: '#FFF8EE',
      textSecondary: '#B8A078',
      textMuted: '#706040',
    },
    typography: {
      label: {
        fontSize: 11,
        letterSpacing: 2.2,
        fontWeight: '800',
        textTransform: 'uppercase',
        fontFamily: 'monospace',
      },
      title: {
        fontSize: 19,
        letterSpacing: 4,
        fontWeight: '900',
        textTransform: 'uppercase',
        fontFamily: 'monospace',
      },
      mono: {
        fontSize: 13,
        letterSpacing: 0.8,
        fontFamily: 'monospace',
        fontWeight: '700',
      },
    },
    gradeColor: {
      S: '#FFEE88',
      A: '#FFBB22',
      B: '#88CC44',
      C: '#DD8844',
      D: '#887766',
    },
  },
  'paper-light': {
    id: 'paper-light',
    name: 'ARCADE LIGHT',
    description: 'ライトモード × アーケードメニュー',
    statusBarStyle: 'dark',
    colors: {
      background: '#ECEEF2',
      surface: '#FFFFFF',
      surfaceElevated: '#E0E4EA',
      border: '#B8C0CC',
      borderGlow: '#00887744',
      neonGreen: '#007766',
      neonGreenDim: '#005544',
      neonGreenMuted: '#00776633',
      recRed: '#DD2233',
      recRedMuted: '#DD223322',
      amber: '#CC6600',
      gold: '#AA8800',
      pitBoard: '#E4EAE8',
      textPrimary: '#121820',
      textSecondary: '#4A5568',
      textMuted: '#8899AA',
    },
    typography: {
      label: {
        fontSize: 10,
        letterSpacing: 2,
        fontWeight: '800',
        textTransform: 'uppercase',
        fontFamily: 'monospace',
      },
      title: {
        fontSize: 17,
        letterSpacing: 3,
        fontWeight: '900',
        textTransform: 'uppercase',
        fontFamily: 'monospace',
      },
      mono: {
        fontSize: 12,
        letterSpacing: 0.5,
        fontFamily: 'monospace',
        fontWeight: '700',
      },
    },
    gradeColor: {
      S: '#AA8800',
      A: '#007766',
      B: '#2277BB',
      C: '#CC6600',
      D: '#888888',
    },
  },
};

export const UI_THEME_LIST = Object.values(UI_THEME_PRESETS);

export function getUiTheme(id?: string | null): UiThemePreset {
  if (id && id in UI_THEME_PRESETS) {
    return UI_THEME_PRESETS[id as UiThemePresetId];
  }
  return UI_THEME_PRESETS[DEFAULT_UI_THEME_ID];
}

export function isUiThemePresetId(id: string): id is UiThemePresetId {
  return id in UI_THEME_PRESETS;
}
