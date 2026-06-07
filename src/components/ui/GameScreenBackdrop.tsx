import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { GAME_UI } from '@/constants/gameUi';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * 全画面ゲームオーバーレイ — グリッド + スキャンライン（タッチ透過）
 * 各画面の上に重ねてアーケード HUD 感を付与
 */
export function GameScreenBackdrop() {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          ...StyleSheet.absoluteFillObject,
          overflow: 'hidden',
        },
        gridH: {
          position: 'absolute',
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: colors.neonGreen,
          opacity: GAME_UI.scanlineOpacity,
        },
        gridV: {
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: 1,
          backgroundColor: colors.neonGreen,
          opacity: GAME_UI.scanlineOpacity * 0.65,
        },
        scan: {
          position: 'absolute',
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: colors.neonGreen,
          opacity: 0.06,
        },
        topStripe: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: colors.neonGreen,
          opacity: 0.25,
        },
      }),
    [colors],
  );

  const hLines = useMemo(
    () => Array.from({ length: 20 }, (_, i) => 40 + i * GAME_UI.gridStep),
    [],
  );
  const vLines = useMemo(
    () => Array.from({ length: 8 }, (_, i) => 20 + i * GAME_UI.gridStep),
    [],
  );

  return (
    <View style={styles.root} pointerEvents="none">
      {hLines.map((top) => (
        <View key={`h-${top}`} style={[styles.gridH, { top }]} />
      ))}
      {vLines.map((left) => (
        <View key={`v-${left}`} style={[styles.gridV, { left }]} />
      ))}
      <View style={[styles.scan, { top: '42%' }]} />
      <View style={styles.topStripe} />
    </View>
  );
}
