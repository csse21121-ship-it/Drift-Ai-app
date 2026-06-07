import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { GamePressable } from '@/components/ui/GamePressable';
import { openCourseTrack, openQuickSession } from '@/lib/navigation';

/** Pit Lane — ソロ走行（コース / クイック）を並列で選べる統合セクション */
export function SoloRunModes() {
  const styles = useStyles();

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.kicker}>START RUN</Text>
        <Text style={styles.title}>ソロ計測</Text>
        <Text style={styles.sub}>
          コース採点ゾーン付きの本番走行か、すぐ始められるクイック計測を選んでください
        </Text>
      </View>

      <View style={styles.row}>
        <GamePressable
          uiSound="nav"
          onPress={() => openCourseTrack()}
          style={({ pressed }) => [styles.card, styles.cardCourse, pressed && styles.cardPressed]}
        >
          <Text style={styles.cardIcon}>◈</Text>
          <Text style={styles.cardTitle}>コース計測</Text>
          <Text style={styles.cardDesc}>
            保存コース・ゾーン倍率・近接自動スタート
          </Text>
          <Text style={styles.cardCta}>計測へ  →</Text>
        </GamePressable>

        <GamePressable
          uiSound="nav"
          onPress={() => openQuickSession()}
          style={({ pressed }) => [styles.card, styles.cardQuick, pressed && styles.cardPressed]}
        >
          <Text style={[styles.cardIcon, styles.cardIconQuick]}>⚡</Text>
          <Text style={styles.cardTitle}>クイック</Text>
          <Text style={styles.cardDesc}>
            コース設定なし。練習・手軽なスコア確認
          </Text>
          <Text style={[styles.cardCta, styles.cardCtaQuick]}>すぐ計測  →</Text>
        </GamePressable>
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
    section: {
      gap: spacing.sm,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.neonGreen + '66',
      borderRadius: 4,
      backgroundColor: colors.neonGreen + '08',
    },
    header: {
      gap: 4,
      paddingBottom: spacing.xs,
    },
    kicker: {
      ...typography.label,
      color: colors.neonGreen,
      fontSize: 9,
      letterSpacing: 4,
    },
    title: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 18,
      letterSpacing: 2,
    },
    sub: {
      ...typography.label,
      color: colors.textSecondary,
      fontSize: 9,
      textTransform: 'none',
      letterSpacing: 0.3,
      lineHeight: 14,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    card: {
      flex: 1,
      minWidth: 0,
      padding: spacing.sm,
      borderWidth: 1,
      borderRadius: 2,
      backgroundColor: colors.surface,
      gap: 4,
      borderLeftWidth: 3,
    },
    cardCourse: {
      borderColor: colors.neonGreenDim + '99',
      borderLeftColor: colors.neonGreen,
      backgroundColor: colors.neonGreen + '0C',
    },
    cardQuick: {
      borderColor: colors.border,
      borderLeftColor: colors.amber + '99',
    },
    cardPressed: {
      opacity: 0.75,
    },
    cardIcon: {
      color: colors.neonGreen,
      fontSize: 14,
    },
    cardIconQuick: {
      color: colors.amber,
    },
    cardTitle: {
      ...typography.label,
      color: colors.textPrimary,
      fontSize: 11,
      letterSpacing: 1,
    },
    cardDesc: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 8,
      lineHeight: 12,
      textTransform: 'none',
      letterSpacing: 0.2,
      flex: 1,
    },
    cardCta: {
      ...typography.mono,
      color: colors.neonGreen,
      fontSize: 9,
      fontWeight: '800',
      marginTop: 2,
    },
    cardCtaQuick: {
      color: colors.amber,
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
