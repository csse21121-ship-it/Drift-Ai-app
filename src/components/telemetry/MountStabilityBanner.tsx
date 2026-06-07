import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

type Props = {
  visible: boolean;
};

/** AUTO マウント時の姿勢不安定警告 */
export function MountStabilityBanner({ visible }: Props) {
  const styles = useStyles();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  if (!visible) return null;

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.dot, { opacity: pulse }]} />
      <View style={styles.textBlock}>
        <Text style={styles.title}>UNSTABLE MOUNT</Text>
        <Text style={styles.sub}>
          姿勢不安定 — 端末固定を確認するか、マウント向きを手動固定してください
        </Text>
      </View>
    </View>
  );
}

function createStyles(
  colors: import('@/constants/uiThemes').ThemeColors,
  typography: import('@/constants/uiThemes').AppTypography,
  spacing: typeof import('@/constants/theme').spacing,
) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.amber + '88',
      borderRadius: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      backgroundColor: colors.amber + '14',
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.amber,
      shadowColor: colors.amber,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 6,
    },
    textBlock: {
      flex: 1,
      gap: 2,
    },
    title: {
      ...typography.label,
      color: colors.amber,
      fontSize: 9,
      letterSpacing: 2,
    },
    sub: {
      ...typography.label,
      color: colors.textSecondary,
      fontSize: 8,
      textTransform: 'none',
      letterSpacing: 0.3,
      lineHeight: 12,
    },
  });
}

function useStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createStyles(colors, typography, spacing),
    [colors, typography, spacing],
  );
}
