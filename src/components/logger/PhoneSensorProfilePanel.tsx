/**
 * 設定画面 — 端末センサープロファイル
 */

import { useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { ACCURACY_GRADE_LABELS } from '@/data/loggerPresets';
import {
  describePhoneTierRationale,
  formatPhoneProfileSummary,
  phonePerformanceTierLabelJa,
} from '@/lib/phoneProbeGrade';
import { usePhoneCapabilities } from '@/contexts/PhoneCapabilitiesContext';

export function PhoneSensorProfilePanel() {
  const styles = useStyles();
  const { colors } = useTheme();
  const {
    phoneCapabilities,
    probeResult,
    probeStatus,
    probeError,
    probeProgress,
    descriptionLines,
    tuningLines,
    refreshProbe,
  } = usePhoneCapabilities();

  const isProbing = probeStatus === 'probing';
  const tierRationale = describePhoneTierRationale(probeResult);

  return (
    <TelemetryFrame style={styles.frame}>
      <Text style={styles.hint}>
        起動時にモーションを 50→33→25→16 ms と段階テストし、安定した最大 Hz を計測します。
        GPS は 500 ms ベースライン + 200 ms アグレッシブテストを行います。
      </Text>

      {probeResult.gpsOutdoorTestRecommended && !isProbing ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>
            ⚠ GPS の高精度テストは屋外での実行を推奨します（屋内では更新率が低下しやすいです）
          </Text>
        </View>
      ) : null}

      <View style={styles.profileBox}>
        <Text style={styles.profileTitle}>端末プロファイル</Text>
        <Text style={styles.profileHeadline}>
          現在の端末プロファイル: {formatPhoneProfileSummary(probeResult)}
        </Text>
        <Text style={styles.profileGrade}>
          {phonePerformanceTierLabelJa(probeResult.phonePerformanceTier)}
          {' · '}
          精度 {ACCURACY_GRADE_LABELS[phoneCapabilities.accuracyGrade]}
          {' · '}
          G {phoneCapabilities.gSampleRateHz} Hz
          {' · '}
          GPS {phoneCapabilities.gpsSampleRateHz} Hz
        </Text>

        {!isProbing && tierRationale.length > 0 ? (
          <View style={styles.rationaleBox}>
            <Text style={styles.rationaleTitle}>判定根拠</Text>
            {tierRationale.map((line) => (
              <Text key={line} style={styles.rationaleLine}>
                · {line}
              </Text>
            ))}
          </View>
        ) : null}

        {isProbing ? (
          <View style={styles.probingRow}>
            <ActivityIndicator size="small" color={colors.neonGreen} />
            <Text style={styles.probingText}>
              {probeProgress?.detail ?? 'センサー段階テスト中…'}
            </Text>
          </View>
        ) : (
          <View style={styles.lines}>
            {descriptionLines.map((line) => (
              <Text key={line} style={styles.line}>
                · {line}
              </Text>
            ))}
          </View>
        )}

        {!isProbing && tuningLines.length > 0 ? (
          <View style={styles.tuningBox}>
            <Text style={styles.tuningTitle}>セッション計測チューニング</Text>
            {tuningLines.map((line) => (
              <Text key={line} style={styles.tuningLine}>
                · {line}
              </Text>
            ))}
          </View>
        ) : null}

        {probeError ? (
          <Text style={styles.errorText}>{probeError}</Text>
        ) : null}
      </View>

      <GamePressable
        onPress={refreshProbe}
        disabled={isProbing}
        style={({ pressed }) => [
          styles.btn,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={styles.btnLabel}>
          {isProbing ? '計測中…' : 'センサーを再計測'}
        </Text>
      </GamePressable>
    </TelemetryFrame>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  frame: { gap: spacing.sm },
  hint: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 14,
    textTransform: 'none',
    letterSpacing: 0.3,
  },
  warnBox: {
    borderWidth: 1,
    borderColor: colors.amber + '88',
    borderRadius: 4,
    padding: spacing.sm,
    backgroundColor: colors.amber + '12',
  },
  warnText: {
    ...typography.label,
    color: colors.amber,
    fontSize: 9,
    textTransform: 'none',
    letterSpacing: 0.3,
    lineHeight: 14,
  },
  profileBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: '#111111',
  },
  profileTitle: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 9,
  },
  profileHeadline: {
    ...typography.mono,
    color: colors.neonGreen,
    fontSize: 10,
    textTransform: 'none',
    lineHeight: 15,
  },
  profileGrade: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 9,
    textTransform: 'none',
  },
  rationaleBox: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 3,
  },
  rationaleTitle: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
  },
  rationaleLine: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    lineHeight: 12,
  },
  probingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  probingText: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
  },
  lines: { gap: 3, marginTop: spacing.xs },
  line: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    lineHeight: 12,
  },
  tuningBox: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 3,
  },
  tuningTitle: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 8,
  },
  tuningLine: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 8,
    textTransform: 'none',
    lineHeight: 12,
  },
  errorText: {
    ...typography.mono,
    color: '#FF6688',
    fontSize: 8,
    textTransform: 'none',
    marginTop: spacing.xs,
  },
  btn: {
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    alignItems: 'center',
  },
  btnLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
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
