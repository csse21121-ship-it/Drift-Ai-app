import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

type TsuisoFlowGuideProps = {
  variant?: 'compact' | 'full';
};

const STEPS_FULL = [
  { n: '1', title: 'Lead がルーム作成', body: '4桁 PIN が表示されます（30分有効）' },
  { n: '2', title: 'Chase が PIN で入室', body: '両方 Sync Ready になるまで待機' },
  { n: '3', title: 'Run 1 → Run 2（役割入替）', body: '各1本ずつ先行・後追い。同じ GO 時刻で走行' },
  { n: '4', title: 'セット採点 → 勝敗', body: '後追いスコア合計で判定。同点ならサドンデス' },
] as const;

const STEPS_COMPACT = [
  'Lead: ルーム作成 → PIN を Chase に共有',
  'Chase: PIN 入室 → Sync Ready',
  'Run1 + Run2（入替）→ 合計点で勝敗 / 同点は SD',
] as const;

export function TsuisoFlowGuide({ variant = 'full' }: TsuisoFlowGuideProps) {
  const { colors, typography, spacing } = useTheme();
  const styles = createStyles(colors, typography, spacing);

  if (variant === 'compact') {
    return (
      <View style={styles.compactBox}>
        <Text style={styles.compactTitle}>追走（Tsuiso）の流れ</Text>
        {STEPS_COMPACT.map((line) => (
          <Text key={line} style={styles.compactLine}>
            · {line}
          </Text>
        ))}
        <Text style={styles.compactNote}>圏外は .tsuiso ファイルで手動同期も可能</Text>
      </View>
    );
  }

  return (
    <View style={styles.fullBox}>
      <Text style={styles.fullTitle}>リアルタイムルーム（2台）</Text>
      {STEPS_FULL.map((step) => (
        <View key={step.n} style={styles.fullRow}>
          <View style={styles.fullNum}>
            <Text style={styles.fullNumText}>{step.n}</Text>
          </View>
          <View style={styles.fullBody}>
            <Text style={styles.fullStepTitle}>{step.title}</Text>
            <Text style={styles.fullStepBody}>{step.body}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.fullOffline}>
        オフライン: 各端末で Lead / Chase として記録 → .tsuiso を共有して採点
      </Text>
    </View>
  );
}

function createStyles(
  colors: import('@/constants/uiThemes').ThemeColors,
  typography: import('@/constants/uiThemes').AppTypography,
  spacing: typeof import('@/constants/theme').spacing,
) {
  return StyleSheet.create({
    compactBox: {
      gap: 6,
      padding: spacing.sm,
      borderWidth: 1,
      borderColor: colors.neonGreen + '44',
      borderRadius: 4,
      backgroundColor: colors.neonGreen + '06',
    },
    compactTitle: {
      ...typography.label,
      color: colors.neonGreen,
      fontSize: 9,
      letterSpacing: 2,
    },
    compactLine: {
      ...typography.label,
      color: colors.textSecondary,
      fontSize: 10,
      lineHeight: 16,
      textTransform: 'none',
      letterSpacing: 0.2,
    },
    compactNote: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 9,
      marginTop: 2,
      textTransform: 'none',
      letterSpacing: 0.2,
    },
    fullBox: {
      gap: spacing.sm,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      backgroundColor: colors.surfaceElevated,
    },
    fullTitle: {
      ...typography.label,
      color: colors.neonGreen,
      fontSize: 10,
      letterSpacing: 2,
    },
    fullRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
    },
    fullNum: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.neonGreen + '88',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fullNumText: {
      ...typography.label,
      color: colors.neonGreen,
      fontSize: 10,
    },
    fullBody: {
      flex: 1,
      gap: 2,
    },
    fullStepTitle: {
      ...typography.label,
      color: colors.textPrimary,
      fontSize: 11,
      letterSpacing: 0.5,
      textTransform: 'none',
    },
    fullStepBody: {
      ...typography.label,
      color: colors.textSecondary,
      fontSize: 10,
      lineHeight: 15,
      textTransform: 'none',
      letterSpacing: 0.2,
    },
    fullOffline: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 9,
      lineHeight: 14,
      marginTop: spacing.xs,
      textTransform: 'none',
      letterSpacing: 0.2,
    },
  });
}
