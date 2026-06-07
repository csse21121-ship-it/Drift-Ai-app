import { useCallback, useRef, useState, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';
import { NeonButton } from '@/components/ui/NeonButton';
import { DriftIndicator } from '@/components/telemetry/DriftIndicator';
import { GMeter } from '@/components/telemetry/GMeter';
import { GpsPanel } from '@/components/telemetry/GpsPanel';
import { GyroReadout } from '@/components/telemetry/GyroReadout';
import { Header } from '@/components/telemetry/Header';
import { MountStabilityBanner } from '@/components/telemetry/MountStabilityBanner';
import { StartSequenceOverlay } from '@/components/telemetry/StartSequenceOverlay';
import { MountSetupOnboarding } from '@/components/onboarding/MountSetupOnboarding';
import { LiveScoreBanner } from '@/components/telemetry/LiveScoreBanner';
import { LiveScoreStrip } from '@/components/telemetry/LiveScoreStrip';
import { LoggerStatusBanner } from '@/components/logger/LoggerStatusBanner';
import { QualityIndicator } from '@/components/telemetry/QualityIndicator';
import { GpsIntegrityBanner } from '@/components/telemetry/GpsIntegrityBanner';
import { SurfaceConditionToggle } from '@/components/settings/SurfaceConditionToggle';
import { useSettings } from '@/contexts/SettingsContext';
import { useSessionLogUpload } from '@/contexts/SessionLogUploadContext';
import { useLogger } from '@/contexts/LoggerContext';
import { useDriftDetection } from '@/hooks/useDriftDetection';
import { useDriftFeedback } from '@/hooks/useDriftFeedback';
import { useGpsTrackRecord } from '@/hooks/useGpsTrackRecord';
import { useTelemetryLogRecord } from '@/hooks/useTelemetryLogRecord';
import { useLiveScore } from '@/hooks/useLiveScore';
import { useSessionPreflight } from '@/hooks/useSessionPreflight';
import { useCalibration } from '@/hooks/useCalibration';
import { isMountSetupComplete } from '@/lib/onboardingStore';
import { useStopBgmOnFocus } from '@/hooks/useStopBgmOnFocus';
import { useMergedTelemetry } from '@/hooks/useMergedTelemetry';
import { scoreSession } from '@/lib/scoring';
import { saveSession } from '@/lib/sessionStore';
import type { SessionResult } from '@/types/score';

const LS_LEFT_WIDTH = 204;
const LS_METER_SIZE = 160;

export default function SessionScreen() {
  const lsStyles = useLsStyles();
  const styles = useStyles();
  const { spacing } = useTheme();
  useStopBgmOnFocus();
  const { settings, setSurfaceCondition } = useSettings();
  const { uploadSessionLog } = useSessionLogUpload();
  const { device, isConnected } = useLogger();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [showDetails, setShowDetails] = useState(false);
  const [showMountSetup, setShowMountSetup] = useState(false);
  const { calibration } = useCalibration();

  const {
    isActive: _sensorsOn,
    motion,
    gps,
    error,
    toggle,
    mountOrientation,
    mountOrientationUnstable,
    mountOrientationAuto,
    slipAngleDeg,
    effectiveThresholds,
    effectiveScoringProfile,
    telemetrySource,
    gpsMonitor,
    getRuntimeEffectiveProfile,
    getSlipFusionConsistency,
    getSessionQualitySummary,
    getGpsIntegritySummary,
    telemetryQuality,
    gpsIntegrity,
    grade,
  } = useMergedTelemetry({
    mountOverride: settings.mountOverride,
    baseThresholds: settings.thresholds,
  });

  const sessionStartRef = useRef<number>(0);
  const maxSpeedRef = useRef<number>(0);
  const [gpsSessionStart, setGpsSessionStart] = useState(0);
  const resetGpsTrackRef = useRef<() => void>(() => undefined);
  const resetTelemetryLogRef = useRef<() => void>(() => undefined);

  const beginRecording = useCallback(() => {
    const t = Date.now();
    sessionStartRef.current = t;
    maxSpeedRef.current = 0;
    setGpsSessionStart(t);
    resetGpsTrackRef.current();
    resetTelemetryLogRef.current();
  }, []);

  const {
    isPreflight,
    isRecording,
    metersLive,
    sequencePhase,
    systemLines,
    countdown,
    startPreflight,
    cancelPreflight,
    finishToIdle,
  } = useSessionPreflight({
    motion,
    gps,
    hasLogger: false,
    feedback: settings.feedback,
    mountOverride: settings.mountOverride,
    calibration,
    onGo: beginRecording,
  });

  const { status: driftStatus } = useDriftDetection({
    motion,
    gps,
    isActive: isRecording,
    slipAngleDeg,
    thresholds: effectiveThresholds,
    surfaceCondition: settings.surfaceCondition,
  });

  useDriftFeedback(driftStatus, isRecording, settings.feedback);

  const { reset: resetGpsTrack, getTrack: getGpsTrack } = useGpsTrackRecord(
    isRecording,
    gps,
    gpsSessionStart,
  );
  const { reset: resetTelemetryLog, getLog: getTelemetryLog } = useTelemetryLogRecord(
    isRecording,
    motion,
    gps,
    gpsSessionStart,
    driftStatus,
  );
  resetGpsTrackRef.current = resetGpsTrack;
  resetTelemetryLogRef.current = resetTelemetryLog;

  const liveScore = useLiveScore({
    isActive: isRecording,
    driftStatus,
    activeSpeedKmh: gps?.speedKmh ?? 0,
    sessionStartedAt: sessionStartRef.current,
    profile: effectiveScoringProfile,
  });

  const meterMode = isPreflight ? 'preflight' : isRecording ? 'live' : 'standby';
  const headerStatus = isRecording ? 'recording' : isPreflight ? 'arming' : 'idle';

  if (isRecording && gps && gps.speedKmh > maxSpeedRef.current) {
    maxSpeedRef.current = gps.speedKmh;
  }

  const beginSessionStart = useCallback(async () => {
    const setupDone = await isMountSetupComplete();
    if (!setupDone) {
      setShowMountSetup(true);
      return;
    }
    await toggle();
    startPreflight();
  }, [toggle, startPreflight]);

  const handlePress = useCallback(async () => {
    if (isRecording) {
      const sessionDurationMs = Date.now() - sessionStartRef.current;
      const result = scoreSession(
        driftStatus.events,
        sessionStartRef.current,
        sessionDurationMs,
        maxSpeedRef.current,
        undefined,
        effectiveScoringProfile,
      );
      const track = getGpsTrack();
      const telemetryLog = getTelemetryLog();
      const runtimeEffectiveProfile = getRuntimeEffectiveProfile() ?? undefined;
      const slipFusionConsistency = getSlipFusionConsistency() ?? undefined;
      const telemetryQualitySummary = getSessionQualitySummary() ?? undefined;
      const gpsIntegritySummary = getGpsIntegritySummary();
      const sessionPayload: SessionResult = {
        ...result,
        telemetrySource,
        runtimeEffectiveProfile,
        slipFusionConsistency,
        telemetryQuality: telemetryQualitySummary,
        scoringMode: gpsIntegritySummary?.isPracticeMode ? 'practice' : 'official',
        gpsIntegrity: gpsIntegritySummary ?? undefined,
        gpsTrack: track.length >= 2 ? track : undefined,
        telemetryLog: telemetryLog.length >= 2 ? telemetryLog : undefined,
      };
      saveSession(sessionPayload);
      if (telemetryLog.length >= 2) {
        uploadSessionLog({
          result: sessionPayload,
          telemetryLog,
          vehicleLabel: isConnected && device?.name ? device.name : 'スマホ計測',
        });
      }
      await toggle();
      finishToIdle();
      router.push('/result');
    } else if (isPreflight) {
      await toggle();
      cancelPreflight();
    } else {
      await beginSessionStart();
    }
  }, [
    isRecording,
    isPreflight,
    driftStatus.events,
    toggle,
    getGpsTrack,
    getTelemetryLog,
    getRuntimeEffectiveProfile,
    getSlipFusionConsistency,
    getSessionQualitySummary,
    getGpsIntegritySummary,
    effectiveScoringProfile,
    telemetrySource,
    finishToIdle,
    cancelPreflight,
    beginSessionStart,
    uploadSessionLog,
    device,
    isConnected,
  ]);

  const footerButton = (
    <NeonButton
      label={
        isRecording
          ? 'セッション停止'
          : isPreflight
            ? 'チェック中止'
            : 'セッション開始'
      }
      variant={isRecording ? 'danger' : isPreflight ? 'secondary' : 'primary'}
      large={!isLandscape}
      onPress={handlePress}
    />
  );

  const headerProps = {
    status: headerStatus as 'idle' | 'arming' | 'recording',
    mountOrientation,
    mountOrientationAuto,
    mountOrientationUnstable,
    subtitle: 'QUICK MODE',
    onBackPress: isRecording || isPreflight ? undefined : () => router.replace('/home'),
    onSettingsPress: isRecording || isPreflight ? undefined : () => router.push('/settings'),
  };

  const mountStabilityBanner =
    mountOrientationAuto && mountOrientationUnstable && metersLive ? (
      <MountStabilityBanner visible />
    ) : null;

  const surfaceConditionBlock = !isRecording ? (
    <View style={styles.surfaceToggleWrap}>
      <SurfaceConditionToggle
        compact
        value={settings.surfaceCondition}
        onChange={setSurfaceCondition}
      />
    </View>
  ) : settings.surfaceCondition === 'wet' ? (
    <View style={styles.surfaceWetBadge}>
      <Text style={styles.surfaceWetBadgeText}>WET MODE — 低μ路面</Text>
    </View>
  ) : null;

  const startSequenceOverlay = (
    <StartSequenceOverlay
      visible={isPreflight}
      sequencePhase={sequencePhase}
      systemLines={systemLines}
      countdown={countdown}
      onAbort={handlePress}
    />
  );

  if (isLandscape) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <Header {...headerProps} />
        {mountStabilityBanner}
        <LoggerStatusBanner variant="inline" />
        {surfaceConditionBlock}
        <QualityIndicator quality={telemetryQuality} visible={metersLive} compact />
        <GpsIntegrityBanner integrity={gpsIntegrity} visible={metersLive} compact />
        {startSequenceOverlay}

        <View style={lsStyles.body}>
          <View style={lsStyles.leftCol}>
            <GMeter
              motion={motion}
              isActive={metersLive}
              meterMode={meterMode}
              meterSize={LS_METER_SIZE}
            />
          </View>

          <View style={lsStyles.rightCol}>
            {isRecording ? (
              <LiveScoreStrip live={liveScore} driftPhase={driftStatus.phase} />
            ) : null}

            <ScrollView
              style={lsStyles.rightScroll}
              contentContainerStyle={lsStyles.rightScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <DriftIndicator
                status={driftStatus}
                motion={motion}
                slipAngleDeg={slipAngleDeg}
                preflight={isPreflight}
                compact
              />
              <GpsPanel gps={gps} isActive={metersLive} gpsMonitor={gpsMonitor} grade={grade} />

              {error ? (
                <View style={[styles.errorBox, { marginTop: spacing.sm }]}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>

        <View style={lsStyles.footer}>{footerButton}</View>
        <MountSetupOnboarding
          visible={showMountSetup}
          onClose={() => setShowMountSetup(false)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Header {...headerProps} />
      {mountStabilityBanner}
      <LoggerStatusBanner variant="inline" />
      {surfaceConditionBlock}
      <QualityIndicator quality={telemetryQuality} visible={metersLive} />
      <GpsIntegrityBanner integrity={gpsIntegrity} visible={metersLive} />
      {startSequenceOverlay}

      {isRecording ? (
        <LiveScoreBanner live={liveScore} driftPhase={driftStatus.phase} />
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.meterSection}>
          <GMeter motion={motion} isActive={metersLive} meterMode={meterMode} />
        </View>

        <DriftIndicator
          status={driftStatus}
          motion={motion}
          slipAngleDeg={slipAngleDeg}
          preflight={isPreflight}
        />

        {!isRecording && !isPreflight ? (
          <View style={styles.readyCard}>
            <Text style={styles.readyTitle}>計測準備完了</Text>
            <Text style={styles.readyText}>
              コース設定なしのシンプル計測です。{'\n'}
              開始後はマウント設定ガイド → センサーチェック → 5-4-3-2-1 → 計測開始です。
            </Text>
          </View>
        ) : null}

        {(showDetails || isPreflight) ? (
          <View style={styles.detailsSection}>
            <GpsPanel gps={gps} isActive={metersLive} gpsMonitor={gpsMonitor} grade={grade} />
            {showDetails ? <GyroReadout motion={motion} /> : null}
          </View>
        ) : null}

        {!isPreflight ? (
          <GamePressable
            onPress={() => setShowDetails((v) => !v)}
            style={({ pressed }) => [styles.detailsToggle, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.detailsToggleLabel}>
              {showDetails ? '詳細データを隠す' : '詳細データを見る'}
            </Text>
            <Text style={styles.detailsToggleIcon}>{showDetails ? '▲' : '▼'}</Text>
          </GamePressable>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!isRecording && !isPreflight && !error ? (
          <Text style={styles.hint}>
            端末を横向き・画面を上にしてダッシュボードに固定してください。屋外で GPS が安定します。
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>{footerButton}</View>
      <MountSetupOnboarding
        visible={showMountSetup}
        onClose={() => setShowMountSetup(false)}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  meterSection: {
    height: 360,
  },
  readyCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  readyTitle: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 10,
  },
  readyText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 15,
    textTransform: 'none',
    letterSpacing: 0.5,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: colors.surfaceElevated,
  },
  detailsToggleLabel: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 9,
    textTransform: 'none',
    letterSpacing: 1,
  },
  detailsToggleIcon: {
    color: colors.textMuted,
    fontSize: 10,
  },
  detailsSection: {
    marginTop: spacing.sm,
  },
  errorBox: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.recRed,
    borderRadius: 4,
    backgroundColor: '#1A0A0A',
  },
  errorText: {
    ...typography.mono,
    color: '#FF6666',
    fontSize: 12,
    lineHeight: 18,
  },
  hint: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 14,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    textTransform: 'none',
    letterSpacing: 0.5,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  surfaceToggleWrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  surfaceWetBadge: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.amber + '88',
    borderRadius: 4,
    backgroundColor: colors.amber + '12',
    alignItems: 'center',
  },
  surfaceWetBadgeText: {
    ...typography.label,
    color: colors.amber,
    fontSize: 9,
    letterSpacing: 1,
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

function createLsStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  leftCol: {
    width: LS_LEFT_WIDTH,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  rightCol: {
    flex: 1,
    flexDirection: 'column',
  },
  rightScroll: {
    flex: 1,
  },
  rightScrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
}

function useLsStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createLsStyles(colors, typography, spacing),
    [colors, typography, spacing],
  );
}
