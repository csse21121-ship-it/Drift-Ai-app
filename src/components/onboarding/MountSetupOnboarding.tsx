import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { GameHudCorners } from '@/components/ui/GameHudCorners';
import { NeonButton } from '@/components/ui/NeonButton';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { MOUNT_OPTIONS } from '@/constants/mountOptions';
import { useSettings } from '@/contexts/SettingsContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCalibration } from '@/hooks/useCalibration';
import { markMountSetupComplete } from '@/lib/onboardingStore';
import { orientationLabel, type MountOrientation } from '@/lib/orientation';
import type { MountOrientationOverride } from '@/types/settings';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const STEPS = [
  {
    title: '① フォルダー固定',
    kicker: 'STEP 1 / 3',
  },
  {
    title: '② 向きを選択',
    kicker: 'STEP 2 / 3',
  },
  {
    title: '③ CALIBRATE',
    kicker: 'STEP 3 / 3',
  },
] as const;

export function MountSetupOnboarding({ visible, onClose }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { settings, setMountOverride } = useSettings();
  const [step, setStep] = useState(0);

  const handleMountLocked = useCallback(
    async (orientation: MountOrientation) => {
      if (orientation === 'unknown') return;
      await setMountOverride(orientation);
    },
    [setMountOverride],
  );

  const {
    phase: calPhase,
    progress: calProgress,
    calibration,
    capture,
  } = useCalibration({
    mountOverride: settings.mountOverride,
    onMountLocked: handleMountLocked,
  });

  const finish = useCallback(async () => {
    await markMountSetupComplete();
    setStep(0);
    onClose();
  }, [onClose]);

  const handleSkip = useCallback(async () => {
    await finish();
  }, [finish]);

  const handleNext = useCallback(async () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    await finish();
  }, [step, finish]);

  const handleMountSelect = useCallback(
    async (value: MountOrientationOverride) => {
      await setMountOverride(value);
    },
    [setMountOverride],
  );

  const isCapturing = calPhase === 'capturing';
  const calDone = calPhase === 'done';
  const canFinishStep3 = Boolean(calibration) || calDone;

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <GameHudCorners colors={colors} accent={colors.neonGreen} />

        <View style={styles.header}>
          <Text style={styles.kicker}>{current.kicker}</Text>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.subtitle}>MOUNT SETUP · NEO STREET TELEMETRY</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {step === 0 ? (
            <TelemetryFrame style={styles.frame}>
              <Text style={styles.bodyText}>
                スマホを車載ホルダー / フォルダー類にしっかり固定してください。
              </Text>
              <Text style={styles.bodySub}>
                走行中のずれや振動が G センサーのノイズになり、ドリフト検知の精度が落ちます。
                計測前に必ず固定し、走行中は触らないでください。
              </Text>
              <View style={styles.tipBox}>
                <Text style={styles.tipLabel}>CHECKLIST</Text>
                <Text style={styles.tipItem}>· クリップ / ホルダーで締め付け</Text>
                <Text style={styles.tipItem}>· 画面は運転中見えにくい位置でも OK</Text>
                <Text style={styles.tipItem}>· ケーブルが引っ張られないよう配線</Text>
              </View>
            </TelemetryFrame>
          ) : null}

          {step === 1 ? (
            <TelemetryFrame style={styles.frame}>
              <Text style={styles.bodyText}>
                端末の固定向きを選びます。設定画面と同期され、計測中はこの向きで G を解釈します。
              </Text>
              <Text style={styles.bodySub}>
                AUTO より FLAT / PORT / LAND の手動固定を推奨します。
              </Text>
              <View style={styles.mountRow}>
                {MOUNT_OPTIONS.map((opt) => {
                  const active = settings.mountOverride === opt.value;
                  return (
                    <GamePressable
                      key={opt.value}
                      onPress={() => handleMountSelect(opt.value)}
                      style={({ pressed }) => [
                        styles.mountBtn,
                        active && styles.mountBtnActive,
                        pressed && styles.mountBtnPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.mountBtnLabel,
                          active && styles.mountBtnLabelActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text
                        style={[
                          styles.mountBtnDesc,
                          active && styles.mountBtnDescActive,
                        ]}
                      >
                        {opt.desc}
                      </Text>
                    </GamePressable>
                  );
                })}
              </View>
              {settings.mountOverride === 'auto' ? (
                <Text style={styles.warnText}>
                  AUTO のままだとプリフライトで警告が出ます。向きが分かっている場合は手動固定してください。
                </Text>
              ) : (
                <Text style={styles.okText}>
                  選択中: {orientationLabel(settings.mountOverride)} — キャリブ完了時にこの向きで固定されます
                </Text>
              )}
            </TelemetryFrame>
          ) : null}

          {step === 2 ? (
            <TelemetryFrame style={styles.frame}>
              <Text style={styles.bodyText}>
                車を停止させ、端末を固定したまま CALIBRATE を実行してください（約 5 秒）。
              </Text>
              <Text style={styles.bodySub}>
                センサーのゼロ点を補正し、同時に現在のマウント向きを設定へ固定します。
              </Text>

              {isCapturing ? (
                <View style={styles.progressWrap}>
                  <View style={styles.progressBg}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.round(calProgress * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressLabel}>
                    CAPTURING… {Math.round(calProgress * 100)}%
                  </Text>
                </View>
              ) : null}

              {calDone ? (
                <Text style={styles.okText}>✓ CALIBRATION COMPLETE</Text>
              ) : null}

              {calibration?.mountOrientationAtCapture ? (
                <Text style={styles.okText}>
                  固定向き: {orientationLabel(calibration.mountOrientationAtCapture)}
                </Text>
              ) : null}

              <View style={styles.calBtnRow}>
                <GamePressable
                  onPress={capture}
                  disabled={isCapturing}
                  style={({ pressed }) => [
                    styles.calBtn,
                    styles.calBtnPrimary,
                    isCapturing && styles.calBtnDisabled,
                    pressed && !isCapturing && { opacity: 0.75 },
                  ]}
                >
                  <Text style={[styles.calBtnLabel, styles.calBtnLabelPrimary]}>
                    {isCapturing ? 'CAPTURING…' : 'CALIBRATE'}
                  </Text>
                </GamePressable>
              </View>
            </TelemetryFrame>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            {step > 0 ? (
              <GamePressable
                onPress={() => setStep(step - 1)}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && { opacity: 0.65 },
                ]}
              >
                <Text style={styles.secondaryBtnText}>戻る</Text>
              </GamePressable>
            ) : (
              <GamePressable
                onPress={handleSkip}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && { opacity: 0.65 },
                ]}
              >
                <Text style={styles.secondaryBtnText}>あとで</Text>
              </GamePressable>
            )}

            <View style={styles.primaryBtnWrap}>
              <NeonButton
                label={
                  step < STEPS.length - 1
                    ? '次へ'
                    : canFinishStep3
                      ? 'セットアップ完了'
                      : 'キャリブせず完了'
                }
                onPress={handleNext}
                large={false}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(
  colors: import('@/constants/uiThemes').ThemeColors,
  typography: import('@/constants/uiThemes').AppTypography,
  spacing: typeof import('@/constants/theme').spacing,
) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: '#020402F8',
      paddingTop: 52,
      paddingBottom: 28,
      paddingHorizontal: spacing.md,
    },
    header: {
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.md,
    },
    kicker: {
      ...typography.label,
      color: colors.neonGreenDim,
      fontSize: 9,
      letterSpacing: 4,
    },
    title: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 20,
      letterSpacing: 2,
      textAlign: 'center',
    },
    subtitle: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 8,
      letterSpacing: 2,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: spacing.md,
    },
    frame: {
      gap: spacing.sm,
    },
    bodyText: {
      ...typography.label,
      color: colors.textPrimary,
      fontSize: 11,
      textTransform: 'none',
      letterSpacing: 0.3,
      lineHeight: 18,
    },
    bodySub: {
      ...typography.label,
      color: colors.textSecondary,
      fontSize: 10,
      textTransform: 'none',
      letterSpacing: 0.3,
      lineHeight: 16,
    },
    tipBox: {
      marginTop: spacing.xs,
      borderWidth: 1,
      borderColor: colors.neonGreen + '44',
      borderRadius: 4,
      padding: spacing.sm,
      gap: 4,
      backgroundColor: colors.neonGreen + '08',
    },
    tipLabel: {
      ...typography.label,
      color: colors.neonGreenDim,
      fontSize: 8,
      marginBottom: 2,
    },
    tipItem: {
      ...typography.mono,
      color: colors.textSecondary,
      fontSize: 10,
      lineHeight: 16,
    },
    mountRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    mountBtn: {
      width: '48%',
      minWidth: 140,
      flexGrow: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      padding: spacing.sm,
      gap: 2,
      backgroundColor: colors.surface,
    },
    mountBtnActive: {
      borderColor: colors.neonGreen,
      backgroundColor: colors.neonGreen + '12',
    },
    mountBtnPressed: {
      opacity: 0.75,
    },
    mountBtnLabel: {
      ...typography.label,
      color: colors.textSecondary,
      fontSize: 11,
    },
    mountBtnLabelActive: {
      color: colors.neonGreen,
    },
    mountBtnDesc: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 8,
      textTransform: 'none',
      letterSpacing: 0.2,
    },
    mountBtnDescActive: {
      color: colors.neonGreenDim,
    },
    warnText: {
      ...typography.label,
      color: colors.amber,
      fontSize: 9,
      textTransform: 'none',
      letterSpacing: 0.3,
      lineHeight: 14,
    },
    okText: {
      ...typography.mono,
      color: colors.neonGreen,
      fontSize: 10,
      lineHeight: 16,
    },
    progressWrap: {
      gap: spacing.xs,
    },
    progressBg: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.neonGreen,
    },
    progressLabel: {
      ...typography.mono,
      color: colors.neonGreenDim,
      fontSize: 10,
    },
    calBtnRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    calBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    calBtnPrimary: {
      borderColor: colors.neonGreen,
      backgroundColor: colors.neonGreen + '18',
    },
    calBtnDisabled: {
      opacity: 0.5,
    },
    calBtnLabel: {
      ...typography.label,
      color: colors.textSecondary,
      fontSize: 10,
    },
    calBtnLabelPrimary: {
      color: colors.neonGreen,
    },
    footer: {
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minWidth: 88,
      alignItems: 'center',
    },
    secondaryBtnText: {
      ...typography.label,
      color: colors.textSecondary,
      fontSize: 10,
    },
    primaryBtnWrap: {
      flex: 1,
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
