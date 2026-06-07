import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { ZONE_TRACE_CLEAR_THRESHOLD } from '@/types/score';
import type { ZoneTraceSummary } from '@/types/score';

type Props = {
  trace: ZoneTraceSummary;
  courseName?: string;
};

function pctColor(pct: number, colors: import('@/constants/uiThemes').ThemeColors): string {
  if (pct >= ZONE_TRACE_CLEAR_THRESHOLD) return colors.neonGreen;
  if (pct >= 50) return colors.amber;
  return colors.recRed;
}

/** 結果画面 — ゾーンなぞり達成率 */
export function ZoneTracePanel({ trace, courseName }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const barColor = pctColor(trace.overallPct, colors);

  return (
    <TelemetryFrame style={styles.frame}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>ZONE LINE TRACE</Text>
          <Text style={styles.sub}>
            {courseName ? `${courseName}  ·  ` : ''}
            {trace.zonesCleared}/{trace.totalZones} ゾーンクリア
          </Text>
        </View>
        <View style={styles.pctBlock}>
          <Text style={[styles.pctValue, { color: barColor }]}>
            {trace.overallPct}
          </Text>
          <Text style={styles.pctUnit}>%</Text>
        </View>
      </View>

      <View style={styles.overallTrack}>
        <View style={[styles.overallFill, { width: `${trace.overallPct}%`, backgroundColor: barColor }]} />
      </View>

      <View style={styles.list}>
        {trace.details.map((d) => {
          const col = pctColor(d.tracePct, colors);
          return (
            <View key={d.zoneId} style={styles.row}>
              <Text style={styles.rowName} numberOfLines={1}>{d.zoneName}</Text>
              <View style={styles.rowBarTrack}>
                <View style={[styles.rowBarFill, { width: `${d.tracePct}%`, backgroundColor: col }]} />
              </View>
              <Text style={[styles.rowPct, { color: col }]}>{d.tracePct}%</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.hint}>
        GPS 軌跡とゾーン通過から算出。{ZONE_TRACE_CLEAR_THRESHOLD}% 以上でクリア。
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
    color: colors.neonGreen,
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
  pctBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  pctValue: {
    fontFamily: 'monospace',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 34,
  },
  pctUnit: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 12,
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
    gap: spacing.sm,
  },
  rowName: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 8,
    width: 72,
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
  rowPct: {
    ...typography.mono,
    fontSize: 10,
    fontWeight: '700',
    width: 36,
    textAlign: 'right',
  },
  hint: {
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
