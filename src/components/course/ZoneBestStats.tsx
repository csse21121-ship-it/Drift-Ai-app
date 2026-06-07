import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { hasZoneBestRecord } from '@/lib/zoneBestRecords';
import type { ScoringZone } from '@/types/course';

type Props = {
  zone: Pick<ScoringZone, 'bestRecord'>;
  compact?: boolean;
};

/** ゾーン別ベスト記録の表示 */
export function ZoneBestStats({ zone, compact = false }: Props) {
  const styles = useStyles();
  const r = zone.bestRecord;
  if (!hasZoneBestRecord(zone) || !r) return null;

  if (compact) {
    return (
      <Text style={styles.compact} numberOfLines={1}>
        {r.bestAngleDeg > 0 ? `${Math.round(r.bestAngleDeg)}°` : '—'}
        {' · '}
        {r.bestPeakG > 0 ? `${r.bestPeakG.toFixed(2)}G` : '—'}
        {' · '}
        {r.bestPoints > 0 ? `${r.bestPoints}pt` : '—'}
      </Text>
    );
  }

  return (
    <View style={styles.block}>
      <Text style={styles.title}>CORNER BEST</Text>
      <View style={styles.row}>
        <Stat label="ANGLE" value={r.bestAngleDeg > 0 ? `${Math.round(r.bestAngleDeg)}°` : '—'} />
        <Stat label="PEAK G" value={r.bestPeakG > 0 ? `${r.bestPeakG.toFixed(2)}G` : '—'} highlight />
        <Stat label="SCORE" value={r.bestPoints > 0 ? `${r.bestPoints} pt` : '—'} />
      </View>
    </View>
  );
}

function Stat({
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
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statVal, highlight && styles.statValHi]}>{value}</Text>
    </View>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  block: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  title: {
    ...typography.label,
    color: colors.amber,
    fontSize: 8,
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    gap: 2,
  },
  statLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
  },
  statVal: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  statValHi: {
    color: colors.neonGreen,
  },
  compact: {
    ...typography.mono,
    color: colors.amber,
    fontSize: 8,
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
