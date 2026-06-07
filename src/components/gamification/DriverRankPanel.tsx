import { useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { useTheme } from '@/contexts/ThemeContext';
import {
  DRIVER_RANKS,
  nextRankAfter,
  type DriverRankDefinition,
  type DriverRankId,
} from '@/data/ranks';
import type { DriverRankSnapshot } from '@/types/gamification';
import { RankIcon } from '@/components/gamification/RankIcon';

type Props = {
  rank: DriverRankSnapshot | null;
  /** コンパクト表示（ホーム用） */
  compact?: boolean;
};

type RankTab = 'overview' | 'breakdown' | 'ladder';

const RANK_DESCRIPTIONS: Record<DriverRankId, string> = {
  rookie: 'DR 0 〜。走行を重ねてデータを蓄積する段階です。',
  club: 'DR 600 〜。デイリーミッションと継続走行が重要です。',
  semi_pro: 'DR 1,800 〜。スコアとグレードの安定が求められます。',
  pro: 'DR 3,200 〜。高得点走行と実績解除がランクアップの鍵です。',
  expert: 'DR 4,800 〜。デイリー達成率とベストグレードが効いてきます。',
  master: 'DR 6,400 〜。長期の走行習慣と高い実績率が必要です。',
  legend: 'DR 8,200 〜。最高ランク。全項目を極めたドライバー向けです。',
};

function BreakdownBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const styles = useStyles();
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <View style={styles.breakdownTrack}>
        <View style={[styles.breakdownFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.breakdownValue}>{value}</Text>
    </View>
  );
}

function tierStatus(
  tier: DriverRankDefinition,
  rank: DriverRankSnapshot,
): 'current' | 'reached' | 'locked' {
  if (tier.id === rank.rankId) return 'current';
  if (rank.rating >= tier.minRating) return 'reached';
  return 'locked';
}

/** ランク別アイコンセル */
function RankIconCell({
  tier,
  status,
  selected,
  compact,
  showLabel,
  onPress,
}: {
  tier: DriverRankDefinition;
  status: 'current' | 'reached' | 'locked';
  selected?: boolean;
  compact?: boolean;
  showLabel?: boolean;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const locked = status === 'locked';
  const isCurrent = status === 'current';

  const cell = (
    <View
      style={[
        styles.rankIconCellOuter,
        isCurrent && styles.rankIconCellCurrent,
        selected && !compact && styles.rankIconCellSelected,
      ]}
    >
      <RankIcon
        rankId={tier.id}
        color={tier.color}
        icon={tier.icon}
        size={compact ? 'sm' : 'md'}
        locked={locked}
      />
      {isCurrent ? (
        <View style={[styles.rankIconCurrentDot, { backgroundColor: tier.color }]} />
      ) : null}
    </View>
  );

  const label = showLabel ? (
    <Text
      style={[
        styles.rankIconLabel,
        selected && { color: tier.color },
        locked && styles.rankIconLabelLocked,
      ]}
      numberOfLines={1}
    >
      {tier.labelJa}
    </Text>
  ) : null;

  if (onPress) {
    return (
      <GamePressable
        onPress={onPress}
        style={({ pressed }) => [
          showLabel ? styles.rankIconWrap : styles.rankIconWrapCompact,
          pressed && styles.rankIconWrapPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${tier.labelJa}、${isCurrent ? '現在のランク' : locked ? '未達成' : '到達済み'}`}
      >
        {cell}
        {label}
      </GamePressable>
    );
  }

  return (
    <View style={showLabel ? styles.rankIconWrap : styles.rankIconWrapCompact}>
      {cell}
      {label}
    </View>
  );
}

function TierDetailCard({
  tier,
  rank,
}: {
  tier: DriverRankDefinition;
  rank: DriverRankSnapshot;
}) {
  const styles = useStyles();
  const status = tierStatus(tier, rank);
  const next = nextRankAfter(tier.id);
  const drGap =
    status === 'locked' ? tier.minRating - rank.rating : null;

  return (
    <View style={[styles.tierDetail, { borderColor: tier.color + '66' }]}>
      <View style={styles.tierDetailHeader}>
        <RankIcon rankId={tier.id} color={tier.color} icon={tier.icon} size="lg" />
        <View style={styles.tierDetailTitles}>
          <Text style={[styles.tierDetailEn, { color: tier.color }]}>
            {tier.label}
          </Text>
          <Text style={styles.tierDetailJa}>{tier.labelJa}</Text>
        </View>
        <View
          style={[
            styles.tierStatusBadge,
            status === 'current' && styles.tierStatusCurrent,
            status === 'reached' && styles.tierStatusReached,
            status === 'locked' && styles.tierStatusLocked,
          ]}
        >
          <Text style={styles.tierStatusText}>
            {status === 'current' ? '現在' : status === 'reached' ? '到達済' : '未達成'}
          </Text>
        </View>
      </View>

      <Text style={styles.tierDetailDesc}>{RANK_DESCRIPTIONS[tier.id]}</Text>

      <View style={styles.tierDetailMeta}>
        <Text style={styles.tierDetailMetaItem}>
          必要 DR: {tier.minRating.toLocaleString()}
          {next ? ` 〜 ${(next.minRating - 1).toLocaleString()}` : '+'}
        </Text>
        {drGap != null && drGap > 0 ? (
          <Text style={[styles.tierDetailMetaItem, styles.tierDetailGap]}>
            あと {drGap.toLocaleString()} DR
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** ドライバーランク表示 */
export function DriverRankPanel({ rank, compact = false }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [tab, setTab] = useState<RankTab>('overview');
  const [selectedTierId, setSelectedTierId] = useState<DriverRankId>('rookie');

  useEffect(() => {
    if (rank) setSelectedTierId(rank.rankId);
  }, [rank?.rankId]);

  if (!rank) {
    return (
      <View style={styles.panel}>
        <Text style={styles.loading}>ランクを読み込み中…</Text>
      </View>
    );
  }

  const progressPct = Math.round(rank.progressToNext * 100);
  const selectedTier =
    DRIVER_RANKS.find((t) => t.id === selectedTierId) ?? DRIVER_RANKS[0];

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>DRIVER RANK</Text>
        <Text style={styles.rating}>{rank.rating.toLocaleString()} DR</Text>
      </View>

      {!compact ? (
        <View style={styles.tabRow}>
          {(
            [
              ['overview', '概要'],
              ['breakdown', '内訳'],
              ['ladder', 'ランク表'],
            ] as const
          ).map(([id, label]) => (
            <GamePressable
              key={id}
              onPress={() => setTab(id)}
              style={({ pressed }) => [
                styles.tabBtn,
                tab === id && styles.tabBtnActive,
                pressed && styles.tabBtnPressed,
              ]}
            >
              <Text style={[styles.tabBtnText, tab === id && styles.tabBtnTextActive]}>
                {label}
              </Text>
            </GamePressable>
          ))}
        </View>
      ) : null}

      {tab === 'overview' || compact ? (
        <>
          <View style={styles.mainRow}>
            <RankIcon
              rankId={rank.rankId}
              icon={rank.rankIcon}
              color={rank.rankColor}
              size="lg"
            />
            <View style={styles.mainStats}>
              <View style={styles.mainTitleRow}>
                <Text style={[styles.rankLabel, { color: rank.rankColor }]}>
                  {rank.rankLabel}
                </Text>
                <Text style={styles.rankJa}>{rank.rankLabelJa}</Text>
              </View>
              {rank.nextRankLabel ? (
                <Text style={styles.nextHint}>
                  次: {rank.nextRankLabelJa} ({progressPct}%)
                </Text>
              ) : (
                <Text style={styles.nextHint}>最高ランク到達</Text>
              )}

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progressPct}%`,
                      backgroundColor: rank.rankColor,
                    },
                  ]}
                />
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaItem}>
                  デイリー {rank.dailyCompletionRate30d}%
                </Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaItem}>
                  7日走行 {rank.activeDays7d}日
                </Text>
              </View>
            </View>
          </View>

          {!compact ? (
            <View style={styles.breakdown}>
              <BreakdownBar
                label="デイリー"
                value={rank.breakdown.dailyPoints}
                max={2500}
                color={colors.amber}
              />
              <BreakdownBar
                label="走行"
                value={rank.breakdown.drivingPoints}
                max={4000}
                color={colors.neonGreen}
              />
              <BreakdownBar
                label="実績"
                value={rank.breakdown.achievementPoints}
                max={2000}
                color={colors.gold}
              />
              <BreakdownBar
                label="本日"
                value={rank.breakdown.todayBonusPoints}
                max={500}
                color="#00BFFF"
              />
            </View>
          ) : null}
        </>
      ) : null}

      {tab === 'breakdown' && !compact ? (
        <View style={styles.tabPanel}>
          <Text style={styles.tabPanelTitle}>DR 内訳（合計 max 9,000）</Text>
          <BreakdownBar
            label="デイリー"
            value={rank.breakdown.dailyPoints}
            max={2500}
            color={colors.amber}
          />
          <BreakdownBar
            label="走行"
            value={rank.breakdown.drivingPoints}
            max={4000}
            color={colors.neonGreen}
          />
          <BreakdownBar
            label="実績"
            value={rank.breakdown.achievementPoints}
            max={2000}
            color={colors.gold}
          />
          <BreakdownBar
            label="本日"
            value={rank.breakdown.todayBonusPoints}
            max={500}
            color="#00BFFF"
          />
          <Text style={styles.tabPanelHint}>
            デイリー達成率・走行実績・称号解除・本日ミッションから DR が算出されます。
          </Text>
        </View>
      ) : null}

      {tab === 'ladder' && !compact ? (
        <View style={styles.tabPanel}>
          <Text style={styles.tierHint}>ランクアイコンをタップすると詳細を表示</Text>
          <View style={styles.tierIconRow}>
            {DRIVER_RANKS.map((tier) => {
              const status = tierStatus(tier, rank);
              return (
                <RankIconCell
                  key={tier.id}
                  tier={tier}
                  status={status}
                  selected={tier.id === selectedTierId}
                  showLabel
                  onPress={() => setSelectedTierId(tier.id)}
                />
              );
            })}
          </View>
          <TierDetailCard tier={selectedTier} rank={rank} />
        </View>
      ) : null}

      {!compact && tab === 'overview' ? (
        <View style={styles.ladderPreview}>
          <Text style={styles.tierHint}>全7段階 — アイコンをタップで詳細</Text>
          <View style={styles.tierIconRowCompact}>
            {DRIVER_RANKS.map((tier) => {
              const status = tierStatus(tier, rank);
              return (
                <RankIconCell
                  key={tier.id}
                  tier={tier}
                  status={status}
                  compact
                  onPress={() => {
                    setSelectedTierId(tier.id);
                    setTab('ladder');
                  }}
                />
              );
            })}
          </View>
        </View>
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
  loading: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    padding: spacing.md,
    textTransform: 'none',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  headerLabel: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 9,
    letterSpacing: 2,
  },
  rating: {
    ...typography.mono,
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  tabBtnActive: {
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: 2,
    borderBottomColor: colors.neonGreen,
  },
  tabBtnPressed: {
    opacity: 0.7,
  },
  tabBtnText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
  },
  tabBtnTextActive: {
    color: colors.neonGreen,
  },
  tabPanel: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  tabPanelTitle: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'none',
    marginBottom: spacing.xs,
  },
  tabPanelHint: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    lineHeight: 13,
    marginTop: spacing.xs,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  mainTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  rankLabel: {
    ...typography.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  mainStats: {
    flex: 1,
    gap: spacing.xs,
  },
  rankJa: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'none',
  },
  nextHint: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  metaItem: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
  },
  metaDot: {
    color: colors.textMuted,
    fontSize: 8,
  },
  breakdown: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  breakdownLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
    width: 44,
    textTransform: 'none',
  },
  breakdownTrack: {
    flex: 1,
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  breakdownFill: {
    height: '100%',
    borderRadius: 2,
  },
  breakdownValue: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 8,
    width: 32,
    textAlign: 'right',
  },
  ladderPreview: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  tierHint: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    textAlign: 'center',
  },
  tierIconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 2,
  },
  tierIconRowCompact: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  rankIconWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    minWidth: 40,
  },
  rankIconWrapCompact: {
    alignItems: 'center',
  },
  rankIconWrapPressed: {
    opacity: 0.7,
  },
  rankIconCellOuter: {
    position: 'relative',
    alignItems: 'center',
  },
  rankIconCellCurrent: {
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 3,
  },
  rankIconCellSelected: {
    transform: [{ scale: 1.08 }],
  },
  rankIconCurrentDot: {
    position: 'absolute',
    bottom: -3,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  rankIconLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 6,
    textTransform: 'none',
    textAlign: 'center',
  },
  rankIconLabelLocked: {
    opacity: 0.45,
  },
  tierDetail: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  tierDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tierDetailTitles: {
    flex: 1,
    gap: 2,
  },
  tierDetailEn: {
    ...typography.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tierDetailJa: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
    textTransform: 'none',
  },
  tierStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    borderWidth: 1,
  },
  tierStatusCurrent: {
    borderColor: colors.neonGreen,
    backgroundColor: colors.neonGreen + '18',
  },
  tierStatusReached: {
    borderColor: colors.textMuted,
    backgroundColor: colors.surface,
  },
  tierStatusLocked: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tierStatusText: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 7,
    letterSpacing: 0.5,
  },
  tierDetailDesc: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    textTransform: 'none',
    lineHeight: 14,
  },
  tierDetailMeta: {
    gap: 4,
  },
  tierDetailMetaItem: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 9,
  },
  tierDetailGap: {
    color: colors.amber,
    fontWeight: '700',
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
