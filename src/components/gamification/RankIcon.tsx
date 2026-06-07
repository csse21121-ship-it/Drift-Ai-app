import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import type { DriverRankId } from '@/data/ranks';
import { DRIVER_RANK_BY_ID } from '@/data/ranks';

export type RankIconSize = 'xs' | 'sm' | 'md' | 'lg';

type Props = {
  rankId?: DriverRankId;
  /** rankId 未指定時に直接指定 */
  icon?: string;
  color?: string;
  size?: RankIconSize;
  locked?: boolean;
  /** 背景枠を表示（一覧セルなど） */
  framed?: boolean;
};

const SIZE_MAP: Record<RankIconSize, { box: number; glyph: number; radius: number }> = {
  xs: { box: 24, glyph: 13, radius: 4 },
  sm: { box: 32, glyph: 16, radius: 4 },
  md: { box: 40, glyph: 20, radius: 5 },
  lg: { box: 52, glyph: 26, radius: 6 },
};

/** ランク別アイコン — 全ティア共通のフレーム付き表示 */
export function RankIcon({
  rankId,
  icon,
  color,
  size = 'md',
  locked = false,
  framed = true,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const def = rankId ? DRIVER_RANK_BY_ID[rankId] : null;
  const glyph = icon ?? def?.icon ?? '🔰';
  const tint = color ?? def?.color ?? colors.textMuted;
  const dim = SIZE_MAP[size];

  if (!framed) {
    return (
      <Text
        style={[
          styles.glyph,
          { fontSize: dim.glyph, opacity: locked ? 0.35 : 1 },
        ]}
      >
        {glyph}
      </Text>
    );
  }

  return (
    <View
      style={[
        styles.frame,
        {
          width: dim.box,
          height: dim.box,
          borderRadius: dim.radius,
          borderColor: locked ? colors.border : tint + '88',
          backgroundColor: locked ? colors.surfaceElevated : tint + '18',
          opacity: locked ? 0.55 : 1,
        },
      ]}
    >
      <Text style={[styles.glyph, { fontSize: dim.glyph }]}>{glyph}</Text>
    </View>
  );
}

function createStyles(_colors: import('@/constants/uiThemes').ThemeColors) {
  return StyleSheet.create({
  frame: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    textAlign: 'center',
  },
});
}

function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
}
