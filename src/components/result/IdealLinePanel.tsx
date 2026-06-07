import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { LINE_EVAL_GOOD_THRESHOLD } from '@/types/score';
import type { LineEvalSummary } from '@/types/score';

type Props = {
  lineEval: LineEvalSummary;
  courseName?: string;
};

function scoreColor(score: number, colors: import('@/constants/uiThemes').ThemeColors): string {
  if (score >= LINE_EVAL_GOOD_THRESHOLD) return colors.neonGreen;
  if (score >= 50) return colors.amber;
  return colors.recRed;
}

function gpsSourceLabel(source?: LineEvalSummary['gpsSource']): string {
  if (source === 'logger') return 'ロガー GPS';
  if (source === 'mixed') return 'ロガー+スマホ';
  if (source === 'phone') return 'スマホ GPS';
  return '';
}

/** 結果画面 — 理想ラインズレスコアと改善ヒント */
export function IdealLinePanel({ lineEval, courseName }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (lineEval.zonesEvaluated === 0) return null;

  const barColor = scoreColor(lineEval.overallScore, colors);
  const evaluableDetails = lineEval.details.filter((d) => d.evaluable);
  const sourceLabel = gpsSourceLabel(lineEval.gpsSource);

  return (
    <TelemetryFrame style={styles.frame}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>IDEAL LINE SCORE</Text>
          <Text style={styles.sub}>
            {courseName ? `${courseName}  ·  ` : ''}
            {lineEval.zonesEvaluated}/{lineEval.totalZones} コーナー評価
          </Text>
        </View>
        <View style={styles.scoreBlock}>
          <Text style={[styles.scoreValue, { color: barColor }]}>
            {lineEval.overallScore}
          </Text>
          <Text style={styles.scoreUnit}>pt</Text>
        </View>
      </View>

      <View style={styles.overallTrack}>
        <View
          style={[
            styles.overallFill,
            { width: `${lineEval.overallScore}%`, backgroundColor: barColor },
          ]}
        />
      </View>

      <View style={styles.list}>
        {evaluableDetails.map((d) => {
          const col = scoreColor(d.lineScore, colors);
          return (
            <View key={d.zoneId} style={styles.row}>
              <Text style={styles.rowName} numberOfLines={1}>{d.zoneName}</Text>
              <View style={styles.rowBarTrack}>
                <View
                  style={[
                    styles.rowBarFill,
                    { width: `${d.lineScore}%`, backgroundColor: col },
                  ]}
                />
              </View>
              <Text style={[styles.rowScore, { color: col }]}>{d.lineScore}</Text>
              <Text style={styles.rowDev}>±{d.avgDevM}m</Text>
            </View>
          );
        })}
      </View>

      {lineEval.hints.length > 0 && (
        <View style={styles.hintsBlock}>
          <Text style={styles.hintsTitle}>IMPROVE</Text>
          {lineEval.hints.map((h, i) => (
            <View key={`${h.zoneId}-${h.segment}-${i}`} style={styles.hintRow}>
              <Text
                style={[
                  styles.hintDot,
                  { color: h.severity === 'warn' ? colors.recRed : colors.amber },
                ]}
              >
                ●
              </Text>
              <View style={styles.hintBody}>
                <Text style={styles.hintZone}>{h.zoneName}</Text>
                <Text style={styles.hintText}>{h.hint}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.footer}>
        {sourceLabel ? `${sourceLabel}  ·  ` : ''}
        {lineEval.trackPointsUsed != null && lineEval.trackPointsRejected != null
          ? `${lineEval.trackPointsUsed}点使用 / ${lineEval.trackPointsRejected}点除外  ·  `
          : ''}
        {lineEval.zonesLearned != null && lineEval.zonesLearned > 0
          ? `${lineEval.zonesLearned}ゾーン理想ライン更新  ·  `
          : ''}
        {LINE_EVAL_GOOD_THRESHOLD} pt 以上が良好。
      </Text>
    </TelemetryFrame>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  frame: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  title: {
    ...typography.label,
    color: colors.amber,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  sub: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    marginTop: 3,
  },
  scoreBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  scoreValue: {
    fontFamily: 'monospace',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 34,
  },
  scoreUnit: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 10,
    marginBottom: 4,
  },
  overallTrack: {
    height: 4,
    marginHorizontal: spacing.md,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  overallFill: {
    height: '100%',
    borderRadius: 2,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowName: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 8,
    width: 64,
    textTransform: 'none',
  },
  rowBarTrack: {
    flex: 1,
    height: 5,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 2,
    overflow: 'hidden',
  },
  rowBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  rowScore: {
    ...typography.mono,
    fontSize: 10,
    fontWeight: '700',
    width: 28,
    textAlign: 'right',
  },
  rowDev: {
    ...typography.mono,
    fontSize: 8,
    color: colors.textMuted,
    width: 36,
    textAlign: 'right',
  },
  hintsBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  hintsTitle: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 8,
    letterSpacing: 1.2,
  },
  hintRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  hintDot: {
    fontSize: 8,
    lineHeight: 14,
    marginTop: 1,
  },
  hintBody: {
    flex: 1,
    gap: 2,
  },
  hintZone: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 7,
    textTransform: 'none',
  },
  hintText: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.1,
    lineHeight: 13,
  },
  footer: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
    textTransform: 'none',
    letterSpacing: 0.2,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
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
