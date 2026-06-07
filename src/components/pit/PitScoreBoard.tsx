import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { useTheme } from '@/contexts/ThemeContext';
import { RankIcon } from '@/components/gamification/RankIcon';
import type { DriverRankSnapshot } from '@/types/gamification';
import type { Grade } from '@/types/score';

type PitScoreBoardProps = {
  todayBestPoints: number | null;
  todayBestGrade: Grade | null;
  lastPoints: number | null;
  lastGrade: Grade | null;
  totalRuns: number;
  driverRank?: DriverRankSnapshot | null;
  onRankPress?: () => void;
};

function GradeGauge({ grade }: { grade: Grade | null }) {
  const styles = useStyles();
  const { colors, gradeColor } = useTheme();
  const color = grade ? (gradeColor[grade] ?? colors.textMuted) : colors.textMuted;
  const empty = grade == null;

  return (
    <View style={styles.gaugeWrap}>
      <View
        style={[
          styles.gaugeRing,
          { borderColor: empty ? colors.border : color + '99' },
          !empty && grade === 'S' && styles.gaugeRingGold,
        ]}
      >
        <View
          style={[
            styles.gaugeInner,
            { backgroundColor: empty ? colors.surfaceElevated : color + '10' },
          ]}
        >
          <Text style={styles.gaugeLabel}>TODAY</Text>
          <Text style={[styles.gaugeLetter, { color: empty ? colors.textMuted : color }]}>
            {grade ?? '—'}
          </Text>
        </View>
      </View>
      <View style={[styles.gaugeCorner, styles.gaugeCornerTL, { backgroundColor: color + '88' }]} />
      <View style={[styles.gaugeCorner, styles.gaugeCornerBR, { backgroundColor: color + '88' }]} />
    </View>
  );
}

function formatPoints(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString();
}

function RankFooter({
  rank,
  onPress,
}: {
  rank: DriverRankSnapshot;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const progressPct = Math.round(rank.progressToNext * 100);
  const content = (
    <View style={[styles.rankFooter, { borderTopColor: rank.rankColor + '33' }]}>
      <View style={[styles.rankAccent, { backgroundColor: rank.rankColor }]} />
      <View style={styles.rankIconSlot}>
        <RankIcon
          rankId={rank.rankId}
          icon={rank.rankIcon}
          color={rank.rankColor}
          size="sm"
        />
      </View>
      <View style={styles.rankMain}>
        <View style={styles.rankTitleRow}>
          <Text style={[styles.rankLabel, { color: rank.rankColor }]}>
            {rank.rankLabel}
          </Text>
          <Text style={styles.rankJa}>{rank.rankLabelJa}</Text>
        </View>
        <View style={styles.rankProgressRow}>
          <View style={styles.rankProgressTrack}>
            <View
              style={[
                styles.rankProgressFill,
                { width: `${progressPct}%`, backgroundColor: rank.rankColor },
              ]}
            />
          </View>
          <Text style={styles.rankProgressPct}>{progressPct}%</Text>
        </View>
      </View>
      <View style={styles.rankDrBlock}>
        <Text style={[styles.rankDr, { color: rank.rankColor }]}>
          {rank.rating.toLocaleString()}
        </Text>
        <Text style={styles.rankDrUnit}>DR</Text>
      </View>
      {onPress ? <Text style={styles.rankChevron}>›</Text> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <GamePressable
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.rankFooterPressed]}
      accessibilityRole="button"
      accessibilityLabel={`ドライバーランク ${rank.rankLabelJa}、詳細を見る`}
    >
      {content}
    </GamePressable>
  );
}

export function PitScoreBoard({
  todayBestPoints,
  todayBestGrade,
  lastPoints,
  lastGrade,
  totalRuns,
  driverRank,
  onRankPress,
}: PitScoreBoardProps) {
  const styles = useStyles();
  const { colors, gradeColor } = useTheme();
  return (
    <View style={styles.board}>
      <View style={styles.boardHeader}>
        <Text style={styles.boardTitle}>PIT BOARD</Text>
        <Text style={styles.boardRuns}>{totalRuns} RUNS</Text>
      </View>

      <View style={styles.boardBody}>
        <GradeGauge grade={todayBestGrade} />

        <View style={styles.stats}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>今日のベスト</Text>
            <Text style={styles.statValue}>
              {formatPoints(todayBestPoints)}
              {todayBestPoints !== null ? <Text style={styles.statUnit}> pt</Text> : null}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>前回のセッション</Text>
            <View style={styles.lastSessionRow}>
              {lastGrade ? (
                <View style={[styles.lastGradePill, { borderColor: gradeColor[lastGrade] + '66' }]}>
                  <Text style={[styles.lastGradeText, { color: gradeColor[lastGrade] }]}>
                    {lastGrade}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.statValueSub}>
                {lastGrade && lastPoints !== null
                  ? `${formatPoints(lastPoints)} pt`
                  : '記録なし'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {driverRank ? (
        <RankFooter rank={driverRank} onPress={onRankPress} />
      ) : null}

      <View style={styles.checker}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View
            key={i}
            style={[styles.checkerCell, i % 2 === 0 && styles.checkerCellActive]}
          />
        ))}
      </View>
    </View>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  board: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.pitBoard,
    borderRadius: 4,
    overflow: 'hidden',
  },
  boardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  boardTitle: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 10,
  },
  boardRuns: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
  },
  boardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  gaugeWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeRingGold: {
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 4,
  },
  gaugeInner: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  gaugeLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 6,
    letterSpacing: 1.5,
    marginBottom: -2,
  },
  gaugeLetter: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
    lineHeight: 24,
  },
  gaugeCorner: {
    position: 'absolute',
    width: 4,
    height: 4,
  },
  gaugeCornerTL: {
    top: 2,
    left: 2,
  },
  gaugeCornerBR: {
    bottom: 2,
    right: 2,
  },
  stats: {
    flex: 1,
    gap: spacing.sm,
  },
  statRow: {
    gap: 4,
  },
  statLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 1,
  },
  statValue: {
    fontFamily: 'monospace',
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  statUnit: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  statValueSub: {
    fontFamily: 'monospace',
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  lastSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lastGradePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 3,
    backgroundColor: colors.surfaceElevated,
  },
  lastGradeText: {
    ...typography.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  rankFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
    borderTopWidth: 1,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  rankFooterPressed: {
    opacity: 0.78,
  },
  rankAccent: {
    width: 3,
    alignSelf: 'stretch',
  },
  rankIconSlot: {
    marginLeft: spacing.sm,
  },
  rankMain: {
    flex: 1,
    gap: 4,
  },
  rankTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  rankLabel: {
    ...typography.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  rankJa: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    textTransform: 'none',
  },
  rankProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rankProgressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  rankProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  rankProgressPct: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    width: 28,
    textAlign: 'right',
  },
  rankDrBlock: {
    alignItems: 'flex-end',
  },
  rankDr: {
    ...typography.mono,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  rankDrUnit: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 6,
    letterSpacing: 1.5,
  },
  rankChevron: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '300',
    marginLeft: -2,
  },
  checker: {
    flexDirection: 'row',
    height: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  checkerCell: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  checkerCellActive: {
    backgroundColor: colors.neonGreenDim,
  },
});
}

function useStyles() {
  const { colors, typography, spacing, gradeColor } = useTheme();
  return useMemo(
    () => createStyles(colors, typography, spacing),
    [colors, typography, spacing, gradeColor],
  );
}
