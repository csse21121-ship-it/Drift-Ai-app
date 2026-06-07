import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { TIER_COLOR } from '@/data/achievements';
import type { GamificationUpdate } from '@/types/gamification';

type Props = {
  update: GamificationUpdate | null;
};

/** リザルト画面 — 新規解除・デイリー達成バナー */
export function GamificationResultBanner({ update }: Props) {
  const styles = useStyles();
  if (!update) return null;

  if (update.skippedPracticeMode) {
    return (
      <View style={styles.wrap}>
        <View style={[styles.section, styles.practiceSection]}>
          <Text style={styles.sectionLabel}>PRACTICE MODE</Text>
          <Text style={styles.practiceText}>
            参考記録のためデイリー・ランキングは更新されません
          </Text>
        </View>
      </View>
    );
  }

  const hasUnlocks = update.newlyUnlockedAchievements.length > 0;
  const hasDaily = update.newlyCompletedDaily.length > 0;
  const hasRankUp = update.rankPromoted;
  const dailyProgress =
    update.todayTotalCount > 0
      ? `${update.todayCompletedCount}/${update.todayTotalCount}`
      : null;

  if (!hasUnlocks && !hasDaily && !hasRankUp && !update.activeTitle) return null;

  return (
    <View style={styles.wrap}>
      {hasRankUp ? (
        <View style={[styles.section, styles.rankSection]}>
          <Text style={styles.sectionLabel}>RANK UP</Text>
          <View style={styles.rankRow}>
            <Text style={[styles.rankLabel, { color: update.driverRank.rankColor }]}>
              {update.driverRank.rankIcon} {update.driverRank.rankLabel}
            </Text>
            <Text style={styles.rankJa}>{update.driverRank.rankLabelJa}</Text>
          </View>
          <Text style={styles.rankRating}>
            {update.driverRank.rating.toLocaleString()} DR
          </Text>
        </View>
      ) : null}
      {hasDaily ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DAILY CLEAR</Text>
          {update.newlyCompletedDaily.map((ch) => (
            <View key={ch.id} style={styles.dailyRow}>
              <Text style={styles.dailyIcon}>{ch.icon}</Text>
              <View style={styles.dailyMain}>
                <Text style={styles.dailyName}>{ch.name}</Text>
                <Text style={styles.dailyDesc}>{ch.description}</Text>
              </View>
              <Text style={styles.dailyBonus}>+{ch.bonusPts}</Text>
            </View>
          ))}
          {dailyProgress ? (
            <Text style={styles.dailyMeta}>本日 {dailyProgress} 達成</Text>
          ) : null}
        </View>
      ) : null}

      {hasUnlocks ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>称号解除</Text>
          {update.newlyUnlockedAchievements.map((ach) => (
            <View key={ach.id} style={styles.achRow}>
              <Text style={styles.achIcon}>{ach.icon}</Text>
              <View style={styles.achMain}>
                <View style={styles.achTitleRow}>
                  <Text style={[styles.achTitle, { color: TIER_COLOR[ach.tier] }]}>
                    {ach.title}
                  </Text>
                  <Text style={[styles.achTier, { color: TIER_COLOR[ach.tier] }]}>
                    {ach.tier.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.achName}>{ach.name}</Text>
                <Text style={styles.achDesc}>{ach.description}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {update.activeTitle && hasUnlocks ? (
        <Text style={styles.equipped}>
          装備称号: {update.activeTitle}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  section: {
    borderWidth: 1,
    borderColor: colors.neonGreenDim + '55',
    borderRadius: 4,
    backgroundColor: colors.neonGreen + '08',
    padding: spacing.md,
    gap: spacing.sm,
  },
  practiceSection: {
    borderColor: colors.amber + '66',
    backgroundColor: colors.amber + '10',
  },
  practiceText: {
    ...typography.label,
    color: colors.amber,
    fontSize: 11,
    textTransform: 'none',
    lineHeight: 16,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 9,
    letterSpacing: 3,
  },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dailyIcon: {
    fontSize: 14,
    width: 24,
    textAlign: 'center',
  },
  dailyMain: {
    flex: 1,
    gap: 2,
  },
  dailyName: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 11,
    textTransform: 'none',
  },
  dailyDesc: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
  },
  dailyBonus: {
    ...typography.mono,
    color: colors.amber,
    fontSize: 10,
    fontWeight: '700',
  },
  dailyMeta: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 8,
    textTransform: 'none',
  },
  achRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  achIcon: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
    marginTop: 2,
  },
  achMain: {
    flex: 1,
    gap: 2,
  },
  achTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  achTitle: {
    ...typography.mono,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  achTier: {
    ...typography.label,
    fontSize: 7,
    letterSpacing: 1,
  },
  achName: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 10,
    textTransform: 'none',
  },
  achDesc: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
  },
  equipped: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 9,
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'none',
  },
  rankSection: {
    borderColor: colors.gold + '88',
    backgroundColor: colors.gold + '12',
  },
  rankRow: {
    gap: 4,
  },
  rankLabel: {
    ...typography.mono,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  rankJa: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
    textTransform: 'none',
  },
  rankRating: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 10,
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
