import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';
import type { GamificationOverview } from '@/types/gamification';

type Props = {
  overview: GamificationOverview | null;
};

/** Pit Lane ホーム — 本日のデイリーチャレンジ */
export function DailyChallengePanel({ overview }: Props) {
  const styles = useStyles();
  const challenges = overview?.dailyChallenges ?? [];
  const completed = overview?.dailyChallenges.filter((c) => c.completed).length ?? 0;
  const total = challenges.length;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>☀</Text>
          <Text style={styles.headerLabel}>DAILY MISSION</Text>
          {total > 0 ? (
            <Text style={styles.headerCount}>{completed}/{total}</Text>
          ) : null}
        </View>
        <GamePressable
          uiSound="nav"
          onPress={() => router.push('/achievements')}
          style={({ pressed }) => [styles.headerLink, pressed && styles.pressed]}
          hitSlop={6}
        >
          <Text style={styles.headerLinkText}>称号  →</Text>
        </GamePressable>
      </View>

      {overview?.activeTitleLabel ? (
        <View style={styles.titleRow}>
          <Text style={styles.titlePrefix}>称号</Text>
          <Text style={styles.titleBadge}>{overview.activeTitleLabel}</Text>
        </View>
      ) : null}

      {challenges.length === 0 ? (
        <Text style={styles.empty}>本日のミッションを読み込み中…</Text>
      ) : (
        challenges.map((ch) => (
          <View key={ch.id} style={[styles.row, ch.completed && styles.rowDone]}>
            <Text style={styles.rowIcon}>{ch.completed ? '✓' : ch.icon}</Text>
            <View style={styles.rowMain}>
              <Text style={[styles.rowName, ch.completed && styles.rowNameDone]}>
                {ch.name}
              </Text>
              <Text style={styles.rowDesc}>{ch.description}</Text>
            </View>
            <Text style={styles.rowBonus}>+{ch.bonusPts}</Text>
          </View>
        ))
      )}

      {overview ? (
        <Text style={styles.footerMeta}>
          {overview.driverRank.rankLabel} · {overview.driverRank.rating.toLocaleString()} DR
          {'  ·  '}
          実績 {overview.unlockedCount}/{overview.totalAchievements}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerIcon: {
    fontSize: 12,
    color: colors.amber,
  },
  headerLabel: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 9,
    letterSpacing: 2,
  },
  headerCount: {
    ...typography.mono,
    color: colors.amber,
    fontSize: 10,
    fontWeight: '700',
    marginLeft: spacing.xs,
  },
  headerLink: {
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  headerLinkText: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 9,
    letterSpacing: 1,
  },
  pressed: {
    opacity: 0.65,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  titlePrefix: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    letterSpacing: 1,
  },
  titleBadge: {
    ...typography.mono,
    color: colors.neonGreen,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.neonGreenDim + '66',
    borderRadius: 2,
    backgroundColor: colors.neonGreen + '10',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowDone: {
    backgroundColor: colors.neonGreen + '08',
  },
  rowIcon: {
    width: 22,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textSecondary,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'none',
  },
  rowNameDone: {
    color: colors.neonGreenDim,
    textDecorationLine: 'line-through',
  },
  rowDesc: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.2,
  },
  rowBonus: {
    ...typography.mono,
    color: colors.amber,
    fontSize: 9,
    fontWeight: '700',
  },
  empty: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    padding: spacing.md,
    textTransform: 'none',
  },
  footerMeta: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    textTransform: 'none',
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
