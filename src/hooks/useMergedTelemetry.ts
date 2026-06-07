/**
 * スマホセンサー + 外部ロガーを統合したテレメトリフック
 */

import { useEffect, useMemo, useRef } from 'react';
import { useLogger } from '@/contexts/LoggerContext';
import { usePhoneCapabilities } from '@/contexts/PhoneCapabilitiesContext';
import { useSettings } from '@/contexts/SettingsContext';
import {
  applyLoggerToScoringProfile,
  applyLoggerToThresholds,
  buildTelemetrySourceMeta,
  resolveCapabilities,
} from '@/lib/loggerCapabilities';
import {
  mergeGpsSample,
  mergeMotionSample,
} from '@/lib/loggerTelemetryMerge';
import { SlipAngleFusion } from '@/lib/slipAngleFusion';
import { applySurfaceToThresholds } from '@/lib/surfaceCondition';
import { applyRealtimeGradientCompensation } from '@/lib/gradeDetector';
import { buildAngleTuningFromCapabilities } from '@/lib/angleTuning';
import { useTelemetrySession } from '@/hooks/useTelemetrySession';
import { useGpsAdaptiveThresholds } from '@/hooks/useGpsAdaptiveThresholds';
import type { ScoringProfile } from '@/types/course';
import { DEFAULT_SCORING_PROFILE } from '@/types/course';
import type { TelemetrySourceMetadata } from '@/types/logger';
import type { MountOrientationOverride } from '@/types/settings';
import type { DriftThresholds } from '@/types/settings';

type UseMergedTelemetryOptions = {
  mountOverride?: MountOrientationOverride;
  /** コース別ベースプロファイル（track 画面用） */
  baseScoringProfile?: ScoringProfile;
  /** ユーザー設定のドリフト閾値 */
  baseThresholds: DriftThresholds;
};

export function useMergedTelemetry({
  mountOverride,
  baseScoringProfile,
  baseThresholds: userThresholds,
}: UseMergedTelemetryOptions) {
  const logger = useLogger();
  const { phoneCapabilities, sensorTuning } = usePhoneCapabilities();
  const { settings } = useSettings();
  const slipFusionRef = useRef(new SlipAngleFusion());
  const wasActiveRef = useRef(false);

  const session = useTelemetrySession({
    mountOverride,
    sensorTuning,
    smoothingPreset: settings.smoothingPreset,
    surfaceCondition: settings.surfaceCondition,
  });

  const activeCapabilities = useMemo(
    () => resolveCapabilities(logger.device, phoneCapabilities),
    [logger.device, phoneCapabilities],
  );

  const angleTuning = useMemo(
    () => buildAngleTuningFromCapabilities(activeCapabilities),
    [activeCapabilities],
  );

  useEffect(() => {
    slipFusionRef.current.configure(angleTuning);
  }, [angleTuning]);

  useEffect(() => {
    if (session.isActive && !wasActiveRef.current) {
      slipFusionRef.current.reset();
    }
    if (!session.isActive && wasActiveRef.current) {
      slipFusionRef.current.reset();
    }
    wasActiveRef.current = session.isActive;
  }, [session.isActive]);

  const motion = useMemo(
    () => mergeMotionSample(session.motion, logger.lastSample, activeCapabilities),
    [session.motion, logger.lastSample, activeCapabilities],
  );

  const gps = useMemo(
    () => mergeGpsSample(session.gps, logger.lastSample, activeCapabilities),
    [session.gps, logger.lastSample, activeCapabilities],
  );

  const slipAngleDeg = useMemo(
    () => slipFusionRef.current.fuse({
      phoneSlip: session.slipAngleDeg,
      gps,
      loggerSample: logger.lastSample,
      caps: activeCapabilities,
      tuning: angleTuning,
    }),
    [
      session.slipAngleDeg,
      gps,
      logger.lastSample,
      activeCapabilities,
      angleTuning,
    ],
  );

  useEffect(() => {
    if (!logger.isConnected) return;
    logger.ingestPhoneTelemetry({
      motion: session.motion,
      gps: session.gps,
      slipAngleDeg,
    });
  }, [
    session.motion,
    session.gps,
    slipAngleDeg,
    logger.isConnected,
    logger.ingestPhoneTelemetry,
  ]);

  const capabilityThresholds = useMemo(
    () => applySurfaceToThresholds(
      applyLoggerToThresholds(userThresholds, activeCapabilities),
      settings.surfaceCondition,
    ),
    [userThresholds, activeCapabilities, settings.surfaceCondition],
  );

  const loggerProvidesSpeed =
    logger.isConnected && activeCapabilities.hasWheelSpeed;

  const { effectiveThresholds, gpsMonitor } = useGpsAdaptiveThresholds({
    isActive: session.isActive,
    gps,
    baseThresholds: capabilityThresholds,
    loggerProvidesSpeed,
  });

  const effectiveScoringProfile = useMemo(() => {
    const base = applyLoggerToScoringProfile(
      baseScoringProfile ?? DEFAULT_SCORING_PROFILE,
      activeCapabilities,
    );
    const grade = session.grade;
    if (!grade || grade.confidence < 35) return base;
    return {
      ...base,
      gradientCompensation: applyRealtimeGradientCompensation(
        base.gradientCompensation,
        grade,
      ),
    };
  }, [baseScoringProfile, activeCapabilities, session.grade]);

  const telemetrySource: TelemetrySourceMetadata = useMemo(
    () => buildTelemetrySourceMeta(logger.device, activeCapabilities),
    [logger.device, activeCapabilities],
  );

  return {
    isActive: session.isActive,
    motion,
    gps,
    error: session.error,
    toggle: session.toggle,
    setSessionStartAt: session.setSessionStartAt,
    getSessionStartAt: session.getSessionStartAt,
    mountOrientation: session.mountOrientation,
    mountOrientationUnstable: session.mountOrientationUnstable,
    mountOrientationAuto: mountOverride === 'auto',
    slipAngleDeg,
    effectiveThresholds,
    effectiveScoringProfile,
    telemetrySource,
    activeCapabilities,
    sensorTuning,
    gpsMonitor,
    getRuntimeEffectiveProfile: session.getRuntimeEffectiveProfile,
    getSlipFusionConsistency: session.getSlipFusionConsistency,
    getSessionQualitySummary: session.getSessionQualitySummary,
    getGpsIntegritySummary: session.getGpsIntegritySummary,
    telemetryQuality: session.telemetryQuality,
    gpsIntegrity: session.gpsIntegrity,
    grade: session.grade,
    logger,
  };
}
