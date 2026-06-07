import { ReactNode, useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { GAME_UI } from '@/constants/gameUi';
import { GameHudCorners } from '@/components/ui/GameHudCorners';
import { useTheme } from '@/contexts/ThemeContext';

type TelemetryFrameProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** HUD コーナー色（省略時はアクセント） */
  accent?: string;
};

/** ゲーム HUD 風テレメトリー枠 */
export function TelemetryFrame({ children, style, accent }: TelemetryFrameProps) {
  const { colors } = useTheme();
  const accentColor = accent ?? colors.neonGreen;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        outer: {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: GAME_UI.frameRadius,
          shadowColor: accentColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.22,
          shadowRadius: 14,
          elevation: 6,
          overflow: 'hidden',
        },
        accentBar: {
          height: GAME_UI.accentBarH,
          backgroundColor: accentColor,
          opacity: 0.85,
        },
        inner: {
          borderTopWidth: 1,
          borderTopColor: accentColor + '33',
        },
        glowEdge: {
          ...StyleSheet.absoluteFillObject,
          borderWidth: 1,
          borderColor: colors.borderGlow,
          borderRadius: GAME_UI.frameRadius,
        },
      }),
    [colors, accentColor],
  );

  return (
    <View style={[styles.outer, style]}>
      <View style={styles.accentBar} />
      <View style={styles.inner}>
        <View style={styles.glowEdge} pointerEvents="none" />
        <GameHudCorners colors={colors} accent={accentColor} />
        {children}
      </View>
    </View>
  );
}
