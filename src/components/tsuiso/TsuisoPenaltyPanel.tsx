import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { penaltiesForChaseScore } from '@/lib/tsuisoPenalties';
import type { TsuisoScoreBreakdown } from '@/types/score';
import type { TsuisoPenaltyItem } from '@/types/tsuisoPenalty';

type Props = {
  score: TsuisoScoreBreakdown;
  /** セット勝敗用 — 後追い側の減点のみ強調 */
  chaseOnly?: boolean;
};

const ROLE_LABEL: Record<TsuisoPenaltyItem['role'], string> = {
  lead: 'Lead',
  chase: 'Chase',
  pair: '共通',
};

export function TsuisoPenaltyPanel({ score, chaseOnly = false }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();

  const items = chaseOnly
    ? penaltiesForChaseScore({ items: score.penalties, totalDeduction: score.penaltyTotal, infractionLoss: score.infractionLoss }).items
    : score.penalties;

  if (items.length === 0 && score.penaltyTotal <= 0) return null;

  const showGross = score.isValid && score.grossTotal > 0 && score.penaltyTotal > 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>大会減点 / PENALTIES</Text>

      {showGross ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>素点</Text>
          <Text style={styles.summaryGross}>{score.grossTotal.toFixed(1)}</Text>
          <Text style={styles.summaryMinus}>−</Text>
          <Text style={[styles.summaryDeduction, { color: colors.recRed }]}>
            {score.penaltyTotal.toFixed(1)}
          </Text>
          <Text style={styles.summaryEq}>=</Text>
          <Text style={[styles.summaryNet, { color: colors.neonGreen }]}>
            {score.total.toFixed(1)}
          </Text>
        </View>
      ) : null}

      {score.infractionLoss ? (
        <Text style={[styles.infractionBanner, { color: colors.recRed }]}>
          反則敗北 — 総合点 0 pt（D1GP / FDJ 基準）
        </Text>
      ) : null}

      {items.map((item, index) => (
        <PenaltyRow key={`${item.code}-${item.role}-${item.atUtcMs ?? index}`} item={item} />
      ))}

      {items.length === 0 && score.penaltyTotal > 0 ? (
        <Text style={styles.note}>減点合計 −{score.penaltyTotal.toFixed(1)} pt</Text>
      ) : null}
    </View>
  );
}

function PenaltyRow({ item }: { item: TsuisoPenaltyItem }) {
  const styles = useRowStyles();
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text style={styles.label}>{item.labelJa}</Text>
          <Text style={styles.role}>{ROLE_LABEL[item.role]}</Text>
          {item.infractionLoss ? (
            <Text style={[styles.badge, { color: colors.recRed }]}>反則</Text>
          ) : null}
        </View>
        {item.detail ? <Text style={styles.detail}>{item.detail}</Text> : null}
      </View>
      <Text style={[styles.deduction, { color: colors.recRed }]}>−{item.deduction}</Text>
    </View>
  );
}

function useStyles() {
  const { colors, spacing, typography } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.recRed + '44',
          backgroundColor: colors.recRed + '08',
        },
        title: {
          ...typography.label,
          color: colors.recRed,
          fontSize: 10,
          letterSpacing: 2,
        },
        summaryRow: {
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
        },
        summaryLabel: { ...typography.label, color: colors.textMuted, fontSize: 10 },
        summaryGross: { ...typography.mono, color: colors.textPrimary, fontSize: 14 },
        summaryMinus: { ...typography.mono, color: colors.textMuted, fontSize: 14 },
        summaryDeduction: { ...typography.mono, fontSize: 14 },
        summaryEq: { ...typography.mono, color: colors.textMuted, fontSize: 14 },
        summaryNet: { ...typography.mono, fontSize: 16, fontWeight: '700' },
        infractionBanner: {
          ...typography.label,
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: 'none',
        },
        note: { ...typography.label, color: colors.textMuted, fontSize: 10, textTransform: 'none' },
      }),
    [colors, spacing, typography],
  );
}

function useRowStyles() {
  const { colors, spacing, typography } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.sm,
          paddingVertical: 4,
          borderTopWidth: 1,
          borderTopColor: colors.border + '66',
        },
        main: { flex: 1, gap: 2 },
        titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
        label: {
          ...typography.label,
          color: colors.textPrimary,
          fontSize: 11,
          textTransform: 'none',
          letterSpacing: 0.3,
        },
        role: {
          ...typography.label,
          color: colors.textMuted,
          fontSize: 9,
        },
        badge: {
          ...typography.label,
          fontSize: 8,
          letterSpacing: 1,
        },
        detail: {
          ...typography.label,
          color: colors.textSecondary,
          fontSize: 9,
          lineHeight: 14,
          textTransform: 'none',
          letterSpacing: 0.2,
        },
        deduction: { ...typography.mono, fontSize: 14, minWidth: 36, textAlign: 'right' },
      }),
    [colors, spacing, typography],
  );
}
