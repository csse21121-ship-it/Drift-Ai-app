import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { NeonButton } from '@/components/ui/NeonButton';
import { penaltiesForChaseScore } from '@/lib/tsuisoPenalties';
import { formatWinnerLabel } from '@/lib/tsuisoSetBattle';
import { TSUISO_SCORE_MAX } from '@/types/score';
import type { TsuisoRole } from '@/types/tsuiso';
import type { TsuisoSetOutcome } from '@/types/tsuisoBattle';

type Props = {
  outcome: TsuisoSetOutcome;
  selfRoomRole: TsuisoRole;
  onContinueSuddenDeath?: () => void;
  onFinish: () => void;
};

export function TsuisoBattleResultPanel({
  outcome,
  selfRoomRole,
  onContinueSuddenDeath,
  onFinish,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();

  const isTie = outcome.winner === 'tie';
  const winnerColor =
    outcome.winner === 'tie'
      ? colors.amber
      : outcome.winner === selfRoomRole
        ? colors.neonGreen
        : colors.recRed;

  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>
        {outcome.mode === 'sudden_death' && outcome.runs.length > 2 ? 'FINAL + SD' : 'SET RESULT'}
      </Text>
      <Text style={[styles.winner, { color: winnerColor }]}>
        {formatWinnerLabel(outcome, selfRoomRole)}
      </Text>

      <View style={styles.scoreboard}>
        <DriverTotalRow
          label={outcome.leadSlot.displayName}
          sublabel="Lead スロット"
          scores={outcome.leadSlot.chaseScores}
          total={outcome.leadSlot.total}
          highlight={outcome.winner === 'lead'}
        />
        <View style={styles.vsRow}>
          <Text style={styles.vsText}>VS</Text>
          {outcome.margin > 0 ? (
            <Text style={styles.marginText}>差 {outcome.margin.toFixed(1)} pt</Text>
          ) : null}
        </View>
        <DriverTotalRow
          label={outcome.chaseSlot.displayName}
          sublabel="Chase スロット"
          scores={outcome.chaseSlot.chaseScores}
          total={outcome.chaseSlot.total}
          highlight={outcome.winner === 'chase'}
        />
      </View>

      <Text style={styles.ruleNote}>
        各ドライバーは後追い1本の追走スコアを獲得。合計点（通常+SD）で勝敗を判定します。
      </Text>

      {outcome.runs.map((run) => {
        const chasePenalties = penaltiesForChaseScore({
          items: run.compare.score.penalties,
          totalDeduction: run.compare.score.penaltyTotal,
          infractionLoss: run.compare.score.infractionLoss,
        });
        return (
        <View key={`${run.runIndex}-${run.isSuddenDeath ? 'sd' : 'reg'}`} style={styles.runCard}>
          <Text style={styles.runTitle}>
            {run.isSuddenDeath ? 'SD ' : ''}Run {run.runIndex % 2 === 0 ? '1' : '2'} — 後追い{' '}
            {run.chaseScore.toFixed(1)} / {TSUISO_SCORE_MAX.total} pt
            {run.compare.score.penaltyTotal > 0
              ? ` （素点 ${run.compare.score.grossTotal.toFixed(1)}）`
              : ''}
          </Text>
          <Text style={styles.runSub}>
            {run.compare.lead.driverLabel ?? 'Lead'} → {run.compare.chase.driverLabel ?? 'Chase'}
          </Text>
          {chasePenalties.items.length > 0 ? (
            <Text style={styles.runPenalty}>
              減点: {chasePenalties.items.map((p) => `${p.labelJa} −${p.deduction}`).join(' / ')}
              {run.compare.score.infractionLoss ? ' — 反則 0 pt' : ''}
            </Text>
          ) : null}
        </View>
        );
      })}

      {isTie && onContinueSuddenDeath ? (
        <>
          <Text style={styles.sdTitle}>同点 — サドンデス</Text>
          <Text style={styles.sdDesc}>
            もう一度、先行・後追いを1本ずつ走行します。役割は Run1 と同じ順序で入替走行。
          </Text>
          <NeonButton label="サドンデス開始 →" variant="primary" onPress={onContinueSuddenDeath} />
        </>
      ) : (
        <NeonButton label="新しい追走を開始" variant="secondary" onPress={onFinish} />
      )}
    </View>
  );
}

function DriverTotalRow({
  label,
  sublabel,
  scores,
  total,
  highlight,
}: {
  label: string;
  sublabel: string;
  scores: number[];
  total: number;
  highlight: boolean;
}) {
  const styles = useRowStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.row, highlight && styles.rowHighlight]}>
      <View style={styles.rowMain}>
        <Text style={[styles.name, highlight && { color: colors.neonGreen }]}>{label}</Text>
        <Text style={styles.sub}>{sublabel}</Text>
        {scores.length > 1 ? (
          <Text style={styles.breakdown}>
            {scores.map((s, i) => `${i === 0 ? '本戦' : 'SD'} ${s.toFixed(1)}`).join(' + ')}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.total, highlight && { color: colors.neonGreen }]}>{total.toFixed(1)}</Text>
    </View>
  );
}

function useStyles() {
  const { colors, spacing, typography } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        wrap: { gap: spacing.md },
        kicker: { ...typography.label, color: colors.neonGreen, letterSpacing: 2, fontSize: 11 },
        winner: { ...typography.title, fontSize: 22, textAlign: 'center' },
        scoreboard: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: spacing.md,
          gap: spacing.sm,
          backgroundColor: colors.surface,
        },
        vsRow: { alignItems: 'center', gap: 2 },
        vsText: { ...typography.label, color: colors.textMuted, fontSize: 10 },
        marginText: { ...typography.mono, color: colors.amber, fontSize: 11 },
        ruleNote: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
        runCard: {
          padding: spacing.sm,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
          gap: 2,
        },
        runTitle: { ...typography.label, color: colors.textPrimary, fontSize: 10 },
        runSub: { ...typography.mono, color: colors.textMuted, fontSize: 9 },
        runPenalty: { ...typography.label, color: colors.recRed, fontSize: 9, textTransform: 'none', letterSpacing: 0.2 },
        sdTitle: { ...typography.title, color: colors.amber, fontSize: 16, textAlign: 'center' },
        sdDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
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
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.xs,
        },
        rowHighlight: {
          backgroundColor: colors.neonGreen + '10',
          borderRadius: 4,
          paddingHorizontal: spacing.xs,
        },
        rowMain: { flex: 1, gap: 2 },
        name: { ...typography.label, color: colors.textPrimary, fontSize: 12 },
        sub: { ...typography.label, color: colors.textMuted, fontSize: 8 },
        breakdown: { ...typography.mono, color: colors.textSecondary, fontSize: 9 },
        total: { ...typography.mono, color: colors.textPrimary, fontSize: 22, fontWeight: '800' },
      }),
    [colors, spacing, typography],
  );
}
