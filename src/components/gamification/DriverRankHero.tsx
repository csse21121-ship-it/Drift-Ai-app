import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { useTheme } from '@/contexts/ThemeContext';
import { RankIcon } from '@/components/gamification/RankIcon';
import type { DriverRankSnapshot } from '@/types/gamification';

type Props = {
  rank: DriverRankSnapshot | null;
  /** hero = 称号画面 / chip = ヘッダー用 */
  variant?: 'hero' | 'chip';
  interactive?: boolean;
  onPress?: () => void;
};

/** 現在のドライバーランク */
export function DriverRankHero({
  rank,
  variant = 'hero',
  interactive = true,
  onPress,
}: Props) {
  const styles = useStyles();
  const router = useRouter();

  const openDetail = () => {
    if (onPress) {
      onPress();
      return;
    }
    router.push('/achievements');
  };

  if (!rank) {
    if (variant === 'chip') return null;
    return (
      <View style={styles.heroLoading}>
        <Text style={styles.loadingText}>ランクを読み込み中…</Text>
      </View>
    );
  }

  const progressPct = Math.round(rank.progressToNext * 100);

  if (variant === 'chip') {
    if (!interactive) return null;

    return (
      <GamePressable
        uiSound="nav"
        onPress={openDetail}
        style={({ pressed }) => [
          styles.chip,
          { borderColor: rank.rankColor + '66' },
          pressed && styles.pressed,
        ]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`現在のランク ${rank.rankLabelJa}`}
      >
        <View style={[styles.chipAccent, { backgroundColor: rank.rankColor }]} />
        <View style={styles.chipIconSlot}>
          <RankIcon
            rankId={rank.rankId}
            icon={rank.rankIcon}
            color={rank.rankColor}
            size="xs"
            framed={false}
          />
        </View>
        <Text style={[styles.chipLabel, { color: rank.rankColor }]}>
          {rank.rankLabel}
        </Text>
      </GamePressable>
    );
  }

  const body = (
    <View style={[styles.hero, { borderColor: rank.rankColor + '44' }]}>
      <View style={[styles.heroAccent, { backgroundColor: rank.rankColor }]} />

      <View style={styles.heroRow}>
        <RankIcon
          rankId={rank.rankId}
          icon={rank.rankIcon}
          color={rank.rankColor}
          size="md"
        />

        <View style={styles.heroCenter}>
          <Text style={styles.heroKicker}>DRIVER RANK</Text>
          <View style={styles.heroTitleRow}>
            <Text style={[styles.heroRankEn, { color: rank.rankColor }]}>
              {rank.rankLabel}
            </Text>
            <Text style={styles.heroRankJa}>{rank.rankLabelJa}</Text>
          </View>
          {rank.nextRankLabelJa ? (
            <Text style={styles.heroNext}>
              NEXT {rank.nextRankLabelJa} · {progressPct}%
            </Text>
          ) : (
            <Text style={styles.heroNext}>MAX RANK</Text>
          )}
        </View>

        <View style={styles.heroDrBlock}>
          <Text style={[styles.heroDr, { color: rank.rankColor }]}>
            {rank.rating.toLocaleString()}
          </Text>
          <Text style={styles.heroDrUnit}>DR</Text>
        </View>
      </View>

      <View style={styles.heroProgressTrack}>
        <View
          style={[
            styles.heroProgressFill,
            { width: `${progressPct}%`, backgroundColor: rank.rankColor },
          ]}
        />
      </View>
    </View>
  );

  if (!interactive) return body;

  return (
    <GamePressable
      uiSound="nav"
      onPress={openDetail}
      style={({ pressed }) => [pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`現在のランク ${rank.rankLabelJa}、詳細を見る`}
    >
      {body}
    </GamePressable>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  pressed: {
    opacity: 0.82,
  },
  heroLoading: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  loadingText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    textTransform: 'none',
    textAlign: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingRight: spacing.sm,
    paddingVertical: 5,
    paddingLeft: 0,
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  chipAccent: {
    width: 3,
    alignSelf: 'stretch',
  },
  chipIconSlot: {
    marginLeft: 4,
  },
  chipLabel: {
    ...typography.mono,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  hero: {
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  heroAccent: {
    height: 2,
    width: '100%',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  heroCenter: {
    flex: 1,
    gap: 2,
  },
  heroKicker: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
    letterSpacing: 2,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  heroRankEn: {
    ...typography.mono,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  heroRankJa: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
    textTransform: 'none',
  },
  heroNext: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.3,
  },
  heroDrBlock: {
    alignItems: 'flex-end',
  },
  heroDr: {
    ...typography.mono,
    fontSize: 16,
    fontWeight: '800',
  },
  heroDrUnit: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
    letterSpacing: 2,
  },
  heroProgressTrack: {
    height: 3,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  heroProgressFill: {
    height: '100%',
    borderRadius: 2,
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
