import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { formatDriftDuration } from '@/lib/driftDetection';
import { formatSessionDuration, getGradeThresholds, normalizeScore } from '@/lib/scoring';
import type { SessionResult } from '@/types/score';

/** SNS 共有用カードの固定幅（captureRef で 3x スケール） */
export const SHARE_CARD_WIDTH = 360;

type Props = {
  result: SessionResult;
};

/** 結果画面スクリーンショット用の固定レイアウトカード */
export function ResultShareCard({ result }: Props) {
  const styles = useStyles();
  const { colors, gradeColor: gradeColors } = useTheme();
  const difficulty =
    (result as SessionResult & { difficulty?: string }).difficulty as
    | 'easy'
    | 'normal'
    | 'hard'
    | 'pro'
    | undefined ?? 'normal';
  const gradeTint = gradeColors[result.grade] ?? colors.textSecondary;
  const evalScore = normalizeScore(result.totalPoints, difficulty);
  const thresholds = getGradeThresholds(difficulty);
  const sMin = thresholds[0].min;
  const bestAngle =
    result.events.length > 0
      ? Math.max(...result.events.map((e) => e.peakSlipAngleDeg))
      : null;
  const maxCombo =
    result.driftScores.length > 0
      ? Math.max(...result.driftScores.map((d) => d.combo))
      : null;
  const dateStr = new Date(result.startedAt).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return (
    <View style={styles.card}>
      <View style={styles.topBar} />
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>DRIFTSCORE</Text>
          <Text style={styles.brandAccent}> AI</Text>
        </View>
        <Text style={styles.headerSub}>SESSION RESULT</Text>
      </View>

      {result.courseName ? (
        <Text style={styles.courseName} numberOfLines={1}>{result.courseName}</Text>
      ) : null}

      <View style={styles.hero}>
        <Text style={styles.scoreLabel}>TOTAL SCORE</Text>
        <Text style={styles.scoreValue}>{result.totalPoints.toLocaleString()}</Text>
        <View style={[styles.gradeBadge, { borderColor: gradeTint }]}>
          <Text style={[styles.gradeText, { color: gradeTint }]}>{result.grade}</Text>
        </View>
      </View>

      <View style={styles.evalWrap}>
        <View style={styles.evalLabelRow}>
          <Text style={styles.evalLabel}>EVALUATION</Text>
          <Text style={[styles.evalScore, { color: gradeTint }]}>
            {evalScore}
            <Text style={styles.evalDenom}> / 100</Text>
          </Text>
        </View>
        <View style={styles.evalTrack}>
          {thresholds.slice(1).map((t) => {
            if (t.min === 0) return null;
            const pct = (t.min / sMin) * 100;
            return (
              <View
                key={t.grade}
                style={[styles.evalTick, { left: `${pct}%` as unknown as number }]}
              />
            );
          })}
          <View
            style={[
              styles.evalFill,
              {
                width: `${Math.min(100, evalScore)}%` as unknown as number,
                backgroundColor: gradeTint,
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.statsGrid}>
        <ShareStat label="DRIFTS" value={`${result.driftScores.length}`} />
        <ShareStat label="PEAK G" value={`${result.maxLateralG.toFixed(2)}G`} highlight />
        <ShareStat label="MAX SPEED" value={`${Math.round(result.maxSpeedKmh)} km/h`} />
        <ShareStat
          label="BEST TIME"
          value={`${formatDriftDuration(result.bestDriftDurationMs)}s`}
        />
        <ShareStat
          label="BEST ANGLE"
          value={bestAngle != null ? `${Math.round(bestAngle)}°` : '—'}
        />
        <ShareStat
          label="MAX COMBO"
          value={maxCombo != null ? `×${maxCombo}` : '—'}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerMeta}>
          {dateStr}
          {'  ·  '}
          {formatSessionDuration(result.sessionDurationMs)}
        </Text>
        <Text style={styles.footerBrand}>driftscore.ai</Text>
      </View>
    </View>
  );
}

function ShareStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, highlight && styles.statValueHi]}>{value}</Text>
    </View>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.neonGreenDim + '55',
    overflow: 'hidden',
  },
  topBar: {
    height: 3,
    backgroundColor: colors.neonGreen,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: 4,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brand: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 16,
  },
  brandAccent: {
    ...typography.title,
    color: colors.neonGreen,
    fontSize: 16,
  },
  headerSub: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    letterSpacing: 3,
  },
  courseName: {
    ...typography.label,
    color: colors.amber,
    fontSize: 9,
    letterSpacing: 1,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    textTransform: 'none',
  },
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  scoreLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 3,
  },
  scoreValue: {
    fontSize: 52,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: 'monospace',
    letterSpacing: -1,
  },
  gradeBadge: {
    borderWidth: 2,
    borderRadius: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  gradeText: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 6,
  },
  evalWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  evalLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  evalLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
  },
  evalScore: {
    ...typography.mono,
    fontSize: 14,
    fontWeight: '700',
  },
  evalDenom: {
    color: colors.textMuted,
    fontSize: 10,
  },
  evalTrack: {
    height: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  evalTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.border,
    zIndex: 1,
  },
  evalFill: {
    height: '100%',
    borderRadius: 3,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginHorizontal: spacing.md,
  },
  statCell: {
    width: '50%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  statLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
  },
  statValue: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  statValueHi: {
    color: colors.neonGreen,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerMeta: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
  },
  footerBrand: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 8,
    letterSpacing: 1,
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
