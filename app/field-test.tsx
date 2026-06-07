/**
 * 実機検証 — 屋外テスト用ライブ診断・チェックリスト
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as Device from 'expo-device';
import { GamePressable } from '@/components/ui/GamePressable';
import { NeonButton } from '@/components/ui/NeonButton';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { GpsPanel } from '@/components/telemetry/GpsPanel';
import { LoggerStatusBanner } from '@/components/logger/LoggerStatusBanner';
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { usePhoneCapabilities } from '@/contexts/PhoneCapabilitiesContext';
import { useMergedTelemetry } from '@/hooks/useMergedTelemetry';
import { applyLoggerToThresholds } from '@/lib/loggerCapabilities';
import { applySurfaceToThresholds } from '@/lib/surfaceCondition';
import { buildFieldTestReport } from '@/lib/fieldTestReport';
import {
  countCompleted,
  FIELD_TEST_CHECKS,
  loadFieldTestChecklist,
  resetFieldTestChecklist,
  saveFieldTestChecklist,
  type FieldTestCheckId,
  type FieldTestCheckState,
} from '@/lib/fieldTestChecklist';

const GROUP_LABELS = {
  ble: 'BLE 外部ロガー',
  gps: 'GPS 適応閾値',
  tsuiso: '追走 (Tsuiso)',
} as const;

function ThresholdRow({
  label,
  base,
  effective,
  unit,
}: {
  label: string;
  base: number;
  effective: number;
  unit: string;
}) {
  const styles = useRowStyles();
  const changed = Math.abs(base - effective) > 0.001;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, changed && styles.valueChanged]}>
        {effective.toFixed(2)}
        {unit}
        {changed ? ` ← ${base.toFixed(2)}` : ''}
      </Text>
    </View>
  );
}

export default function FieldTestScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { settings } = useSettings();
  const { descriptionLines } = usePhoneCapabilities();
  const [checklist, setChecklist] = useState<FieldTestCheckState | null>(null);

  const {
    toggle,
    gps,
    motion,
    gpsMonitor,
    effectiveThresholds,
    activeCapabilities,
    slipAngleDeg,
    logger,
  } = useMergedTelemetry({
    mountOverride: settings.mountOrientation,
    baseThresholds: settings.thresholds,
  });

  const capabilityThresholds = useMemo(
    () => applySurfaceToThresholds(
      applyLoggerToThresholds(settings.thresholds, activeCapabilities),
      settings.surfaceCondition,
    ),
    [settings.thresholds, activeCapabilities, settings.surfaceCondition],
  );

  useFocusEffect(
    useCallback(() => {
      void toggle();
      return () => {
        void toggle();
      };
    }, [toggle]),
  );

  useEffect(() => {
    void loadFieldTestChecklist().then(setChecklist);
  }, []);

  const toggleCheck = useCallback(async (id: FieldTestCheckId, value: boolean) => {
    setChecklist((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [id]: value };
      void saveFieldTestChecklist(next);
      return next;
    });
  }, []);

  const handleShare = useCallback(async () => {
    if (!checklist) return;
    const report = buildFieldTestReport({
      loggerConnected: logger.isConnected,
      loggerName: logger.device?.name ?? null,
      loggerStatus: logger.status,
      capabilities: activeCapabilities,
      phoneDescription: descriptionLines,
      gps,
      motion,
      gpsMonitor,
      userThresholds: settings.thresholds,
      capabilityThresholds,
      effectiveThresholds,
      checklist,
      slipAngleDeg,
    });
    try {
      await Share.share({ message: report, title: 'Field Test Report' });
    } catch {
      Alert.alert('共有失敗', 'レポートを共有できませんでした');
    }
  }, [
    checklist,
    logger,
    activeCapabilities,
    descriptionLines,
    gps,
    motion,
    gpsMonitor,
    settings.thresholds,
    capabilityThresholds,
    effectiveThresholds,
    slipAngleDeg,
  ]);

  const handleResetChecklist = useCallback(() => {
    Alert.alert('チェックリストをリセット', 'すべてのチェックを外しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'リセット',
        style: 'destructive',
        onPress: () => {
          void resetFieldTestChecklist().then(setChecklist);
        },
      },
    ]);
  }, []);

  const completed = checklist ? countCompleted(checklist) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <GamePressable uiSound="back" onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backLabel}>← BACK</Text>
        </GamePressable>
        <Text style={styles.headerTitle}>FIELD TEST</Text>
        <GamePressable onPress={handleResetChecklist} style={styles.resetBtn}>
          <Text style={styles.resetLabel}>RESET</Text>
        </GamePressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>屋外実機検証</Text>
        <Text style={styles.desc}>
          BLE ロガー・GPS 適応閾値・追走 Tsuiso の確認用。センサーはこの画面表示中のみ常時 ON です。
        </Text>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            BLE ロガーは Development Build が必要です（Expo Go はモック）。
            {Device.isDevice ? ' 屋外で GPS を取得してください。' : ' 実機でテストしてください。'}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>LIVE DIAGNOSTICS</Text>
        <GpsPanel gps={gps} isActive gpsMonitor={gpsMonitor} />
        <LoggerStatusBanner variant="full" onPress={() => router.push('/settings')} />

        <TelemetryFrame style={styles.frame}>
          <Text style={styles.frameTitle}>モーション</Text>
          <View style={styles.statGrid}>
            <Stat label="横 G" value={motion ? `${motion.lateralG.toFixed(2)}G` : '—'} />
            <Stat label="前後 G" value={motion ? `${motion.longitudinalG.toFixed(2)}G` : '—'} />
            <Stat label="ピーク G" value={motion ? `${motion.peakG.toFixed(2)}G` : '—'} highlight />
            <Stat label="スリップ角" value={`${slipAngleDeg.toFixed(1)}°`} />
          </View>
        </TelemetryFrame>

        <TelemetryFrame style={styles.frame}>
          <Text style={styles.frameTitle}>閾値（能力補正 → GPS 適応）</Text>
          <ThresholdRow
            label="横 G 入"
            base={capabilityThresholds.enterLateralG}
            effective={effectiveThresholds.enterLateralG}
            unit="G"
          />
          <ThresholdRow
            label="ヨー入"
            base={capabilityThresholds.enterYawRate}
            effective={effectiveThresholds.enterYawRate}
            unit=""
          />
          <ThresholdRow
            label="最低速度"
            base={capabilityThresholds.minSpeedKmh}
            effective={effectiveThresholds.minSpeedKmh}
            unit=" km/h"
          />
          {gpsMonitor.isRelaxed ? (
            <Text style={styles.relaxBadge}>GPS 精度低下 — 閾値緩和中</Text>
          ) : null}
        </TelemetryFrame>

        <View style={styles.checklistHeader}>
          <Text style={styles.sectionLabel}>CHECKLIST</Text>
          <Text style={styles.checkCount}>
            {completed}/{FIELD_TEST_CHECKS.length}
          </Text>
        </View>

        {(['ble', 'gps', 'tsuiso'] as const).map((group) => (
          <View key={group} style={styles.checkGroup}>
            <Text style={styles.checkGroupLabel}>{GROUP_LABELS[group]}</Text>
            {FIELD_TEST_CHECKS.filter((item) => item.group === group).map((item) => (
              <View key={item.id} style={styles.checkRow}>
                <View style={styles.checkBody}>
                  <Text style={styles.checkLabel}>{item.label}</Text>
                  <Text style={styles.checkHint}>{item.hint}</Text>
                </View>
                <Switch
                  value={checklist?.[item.id] ?? false}
                  onValueChange={(v) => void toggleCheck(item.id, v)}
                  trackColor={{ false: colors.border, true: colors.neonGreen + '88' }}
                  thumbColor={checklist?.[item.id] ? colors.neonGreen : colors.textMuted}
                />
              </View>
            ))}
          </View>
        ))}

        <NeonButton label="レポートを共有" variant="secondary" onPress={() => void handleShare()} />

        <Text style={styles.sectionLabel}>QUICK LAUNCH</Text>
        <View style={styles.launchRow}>
          <GamePressable onPress={() => router.push('/track')} style={styles.launchBtn}>
            <Text style={styles.launchLabel}>コース計測</Text>
          </GamePressable>
          <GamePressable onPress={() => router.push('/session')} style={styles.launchBtn}>
            <Text style={styles.launchLabel}>クイック</Text>
          </GamePressable>
          <GamePressable onPress={() => router.push('/tsuiso')} style={styles.launchBtn}>
            <Text style={[styles.launchLabel, styles.launchLabelAccent]}>追走</Text>
          </GamePressable>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  const styles = useRowStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, highlight && styles.statValueHi]}>{value}</Text>
    </View>
  );
}

function useStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        backBtn: { minWidth: 60, paddingVertical: spacing.xs },
        backLabel: { ...typography.label, color: colors.neonGreenDim, fontSize: 9 },
        headerTitle: {
          ...typography.title,
          flex: 1,
          textAlign: 'center',
          color: colors.textPrimary,
          fontSize: 13,
        },
        resetBtn: { minWidth: 60, alignItems: 'flex-end', paddingVertical: spacing.xs },
        resetLabel: { ...typography.label, color: colors.textMuted, fontSize: 9 },
        content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
        kicker: { ...typography.label, color: colors.neonGreen, letterSpacing: 2, fontSize: 10 },
        desc: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
        noteBox: {
          padding: spacing.sm,
          borderWidth: 1,
          borderColor: colors.amber + '66',
          borderRadius: 4,
          backgroundColor: colors.amber + '11',
        },
        noteText: { color: colors.amber, fontSize: 12, lineHeight: 18 },
        sectionLabel: {
          ...typography.label,
          color: colors.textMuted,
          fontSize: 9,
          letterSpacing: 3,
        },
        frame: { gap: spacing.sm, padding: spacing.md },
        frameTitle: { ...typography.label, color: colors.textPrimary, fontSize: 11 },
        statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
        relaxBadge: {
          ...typography.label,
          color: colors.amber,
          fontSize: 10,
          marginTop: spacing.xs,
        },
        checklistHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        checkCount: { ...typography.mono, color: colors.neonGreen, fontSize: 12 },
        checkGroup: {
          gap: spacing.sm,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 4,
          backgroundColor: colors.surface,
        },
        checkGroupLabel: {
          ...typography.label,
          color: colors.neonGreenDim,
          fontSize: 10,
          letterSpacing: 1,
        },
        checkRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        },
        checkBody: { flex: 1, gap: 2 },
        checkLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
        checkHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
        launchRow: { flexDirection: 'row', gap: spacing.sm },
        launchBtn: {
          flex: 1,
          paddingVertical: spacing.md,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 4,
          backgroundColor: colors.surfaceElevated,
        },
        launchLabel: { ...typography.label, color: colors.textSecondary, fontSize: 10 },
        launchLabelAccent: { color: colors.neonGreenDim },
      }),
    [colors, typography, spacing],
  );
}

function useRowStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: spacing.sm,
        },
        label: { ...typography.label, color: colors.textMuted, fontSize: 10 },
        value: { ...typography.mono, color: colors.textSecondary, fontSize: 12 },
        valueChanged: { color: colors.amber },
        stat: { minWidth: 72 },
        statLabel: { ...typography.label, color: colors.textMuted, fontSize: 8 },
        statValue: { ...typography.mono, color: colors.textSecondary, fontSize: 14 },
        statValueHi: { color: colors.neonGreen },
      }),
    [colors, typography, spacing],
  );
}
