import { useCallback, useEffect, useRef, useState } from 'react';
import { isSupabaseConfigured, uploadSessionLog } from '@/lib/supabase';
import { DeviceMotion, Gyroscope, Barometer } from 'expo-sensors';
import type { DeviceMotionMeasurement } from 'expo-sensors';
import * as Location from 'expo-location';
import { clampG, magnitudeG } from '@/lib/motion';
import { msToKmh } from '@/lib/gps';
import {
  ZERO_CALIBRATION,
  applyGCalibration,
  applyGyroCalibration,
  calibrationNoiseRMultiplier,
  loadCalibration,
} from '@/lib/calibration';
import type { CalibrationData } from '@/lib/calibration';
import {
  buildMountVibrationFilterConfig,
  buildPeakKalmanParams,
  KalmanFilter1D,
  LowPassFilter1D,
  MotionGFilterChannel,
  type MountVibrationFilterConfig,
} from '@/lib/kalmanFilter';
import {
  OrientationTracker,
  estimateRoadPitchDeg,
  remapMotion,
  smoothGravity,
  toG,
} from '@/lib/orientation';
import type { MountOrientation } from '@/lib/orientation';
import type { MountOrientationOverride, SmoothingPreset } from '@/types/settings';
import { SMOOTHING_PRESET_PARAMS } from '@/types/settings';
import { applySurfaceToSmoothingParams } from '@/lib/surfaceCondition';
import type { SurfaceCondition } from '@/lib/surfaceCondition';
import { SlipAngleEstimator } from '@/lib/slipAngle';
import {
  DEFAULT_SENSOR_TUNING,
  type SensorTuningProfile,
} from '@/lib/sensorTuning';
import { RuntimeAdaptiveController } from '@/lib/runtimeAdaptiveTuning';
import {
  computeTelemetryQuality,
  TelemetryQualityTracker,
} from '@/lib/telemetryQuality';
import { GpsIntegrityMonitor } from '@/lib/gpsIntegrityMonitor';
import { GradeDetector } from '@/lib/gradeDetector';
import { BarometricAltitudeFusion } from '@/lib/barometricAltitude';
import type {
  RuntimeEffectiveProfile,
  SessionQualitySummary,
  SlipFusionConsistencySummary,
  TelemetryQualitySnapshot,
  GpsIntegritySnapshot,
  GradeSnapshot,
} from '@/types/telemetry';
import type { SessionGpsIntegritySummary, SessionResult, TelemetryLogPoint } from '@/types/score';
import type { GpsSample, MotionSample, TelemetryState } from '@/types/telemetry';

/** React 再レンダリング用 setState の最小間隔 (ms) */
const UI_FLUSH_INTERVAL_MS = 100;
/** 気圧計更新間隔 (ms) — 5 Hz */
const BAROMETER_INTERVAL_MS = 200;

const INITIAL_STATE: TelemetryState = {
  isActive: false,
  motion: null,
  gps: null,
  error: null,
  gpsIntegrity: null,
  mountOrientation: 'unknown',
  mountOrientationUnstable: false,
  slipAngleDeg: 0,
  telemetryQuality: null,
  grade: null,
};

type LiveTelemetry = {
  motion: MotionSample | null;
  gps: GpsSample | null;
  slipAngleDeg: number;
  mountOrientation: MountOrientation;
  mountOrientationUnstable: boolean;
  telemetryQuality: TelemetryQualitySnapshot | null;
  gpsIntegrity: GpsIntegritySnapshot | null;
  grade: GradeSnapshot | null;
};

type UseTelemetrySessionOptions = {
  mountOverride?: MountOrientationOverride;
  sensorTuning?: SensorTuningProfile;
  /** G スムージングプリセット（ホルダー振動対策） */
  smoothingPreset?: SmoothingPreset;
  /** 路面コンディション — WET 時はフィルタをマイルド化 */
  surfaceCondition?: SurfaceCondition;
};

function buildFilterConfig(
  tuning: SensorTuningProfile,
  calibration: CalibrationData,
  preset: SmoothingPreset,
  surfaceCondition: SurfaceCondition = 'dry',
): MountVibrationFilterConfig {
  const presetParams = applySurfaceToSmoothingParams(
    SMOOTHING_PRESET_PARAMS[preset],
    surfaceCondition,
  );
  return buildMountVibrationFilterConfig({
    lpfAlpha: presetParams.lpfAlpha,
    kalmanQMultiplier: presetParams.kalmanQMultiplier,
    kalmanRMultiplier: presetParams.kalmanRMultiplier,
    calibrationRMultiplier: calibrationNoiseRMultiplier(calibration),
    baseKalmanQ: tuning.kalmanQ,
    baseKalmanR: tuning.kalmanR,
  });
}

function initMotionFilters(
  filterCfg: MountVibrationFilterConfig,
): {
  smoothLateral: MotionGFilterChannel;
  smoothLong: MotionGFilterChannel;
  peakLpfLateral: LowPassFilter1D;
  peakLpfLong: LowPassFilter1D;
  peakKalmanLateral: KalmanFilter1D;
  peakKalmanLong: KalmanFilter1D;
} {
  return {
    smoothLateral: new MotionGFilterChannel(
      filterCfg.lpfAlpha,
      filterCfg.kalmanQ,
      filterCfg.kalmanR,
    ),
    smoothLong: new MotionGFilterChannel(
      filterCfg.lpfAlpha,
      filterCfg.kalmanQ,
      filterCfg.kalmanR,
    ),
    peakLpfLateral: new LowPassFilter1D(filterCfg.peakLpfAlpha),
    peakLpfLong: new LowPassFilter1D(filterCfg.peakLpfAlpha),
    peakKalmanLateral: new KalmanFilter1D({
      Q: filterCfg.peakKalmanQ,
      R: filterCfg.peakKalmanR,
    }),
    peakKalmanLong: new KalmanFilter1D({
      Q: filterCfg.peakKalmanQ,
      R: filterCfg.peakKalmanR,
    }),
  };
}

export function useTelemetrySession(options: UseTelemetrySessionOptions = {}) {
  const {
    mountOverride = 'auto',
    sensorTuning = DEFAULT_SENSOR_TUNING,
    smoothingPreset = 'standard',
    surfaceCondition = 'dry',
  } = options;
  const [state, setState] = useState<TelemetryState>(INITIAL_STATE);

  const sensorTuningRef = useRef(sensorTuning);
  sensorTuningRef.current = sensorTuning;
  const smoothingPresetRef = useRef(smoothingPreset);
  smoothingPresetRef.current = smoothingPreset;
  const surfaceConditionRef = useRef(surfaceCondition);
  surfaceConditionRef.current = surfaceCondition;

  const motionRef = useRef({ lateral: 0, longitudinal: 0, peak: 0 });
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const motionSubRef = useRef<ReturnType<typeof DeviceMotion.addListener> | null>(null);
  const gyroSubRef = useRef<ReturnType<typeof Gyroscope.addListener> | null>(null);
  const gyroRef = useRef({ x: 0, y: 0, z: 0 });
  const isActiveRef = useRef(false);

  const gFilterLateralRef = useRef<MotionGFilterChannel>(
    new MotionGFilterChannel(0.16, 0.01, 0.09),
  );
  const gFilterLongRef = useRef<MotionGFilterChannel>(
    new MotionGFilterChannel(0.16, 0.01, 0.09),
  );
  const peakLpfLateralRef = useRef(new LowPassFilter1D(0.22));
  const peakLpfLongRef = useRef(new LowPassFilter1D(0.22));
  const peakKalmanLateralRef = useRef(new KalmanFilter1D({ Q: 0.01, R: 0.09 }));
  const peakKalmanLongRef = useRef(new KalmanFilter1D({ Q: 0.01, R: 0.09 }));

  const calibrationRef = useRef<CalibrationData>(ZERO_CALIBRATION);
  const gravityRef = useRef({ x: 0, y: 0, z: 0 });
  const orientationRef = useRef<MountOrientation>('unknown');
  const orientationUnstableRef = useRef(false);
  const orientationTrackerRef = useRef(new OrientationTracker());
  const mountOverrideRef = useRef(mountOverride);
  mountOverrideRef.current = mountOverride;
  const yawRateRef = useRef(0);

  const slipEstimatorRef = useRef(new SlipAngleEstimator());
  const gpsHeadingRef = useRef(0);
  const gpsSpeedRef = useRef(0);

  const adaptiveRef = useRef<RuntimeAdaptiveController | null>(null);
  const motionIntervalRef = useRef(DEFAULT_SENSOR_TUNING.motionIntervalMs);
  const sessionHadAdaptiveRef = useRef(false);
  const qualityTrackerRef = useRef(new TelemetryQualityTracker());
  const gpsIntegrityRef = useRef(new GpsIntegrityMonitor());
  const gradeDetectorRef = useRef(new GradeDetector());
  const baroFusionRef = useRef(new BarometricAltitudeFusion());
  const baroSubRef = useRef<ReturnType<typeof Barometer.addListener> | null>(null);
  const lastGpsGradeInputRef = useRef<{
    latitude: number;
    longitude: number;
    speedKmh: number;
    accuracy: number;
  } | null>(null);
  const sessionStartAtRef = useRef(0);

  const liveTelemetryRef = useRef<LiveTelemetry>({
    motion: null,
    gps: null,
    slipAngleDeg: 0,
    mountOrientation: 'unknown',
    mountOrientationUnstable: false,
    telemetryQuality: null,
    gpsIntegrity: null,
    grade: null,
  });
  const lastUiFlushAtRef = useRef(0);
  const uiFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyAdaptiveKalman = useCallback((Q: number, R: number): void => {
    gFilterLateralRef.current.setKalmanQ(Q);
    gFilterLateralRef.current.setKalmanR(R);
    gFilterLongRef.current.setKalmanQ(Q);
    gFilterLongRef.current.setKalmanR(R);
    const peak = buildPeakKalmanParams({ Q, R });
    peakKalmanLateralRef.current.setQ(peak.Q);
    peakKalmanLateralRef.current.setR(peak.R);
    peakKalmanLongRef.current.setQ(peak.Q);
    peakKalmanLongRef.current.setR(peak.R);
  }, []);

  const resetMotionFilters = useCallback(() => {
    gFilterLateralRef.current.reset();
    gFilterLongRef.current.reset();
    peakLpfLateralRef.current.reset();
    peakLpfLongRef.current.reset();
    peakKalmanLateralRef.current.reset();
    peakKalmanLongRef.current.reset();
  }, []);

  const clearUiFlushTimer = useCallback(() => {
    if (uiFlushTimerRef.current != null) {
      clearTimeout(uiFlushTimerRef.current);
      uiFlushTimerRef.current = null;
    }
  }, []);

  const refreshTelemetryQuality = useCallback((timestampMs: number) => {
    qualityTrackerRef.current.recordMotionTimestamp(timestampMs);
    const snapshot = computeTelemetryQuality({
      gpsAccuracyM: liveTelemetryRef.current.gps?.accuracy ?? 0,
      effectiveMotionHz: qualityTrackerRef.current.getEffectiveMotionHz(),
      targetMotionHz: 1000 / motionIntervalRef.current,
      calibration: calibrationRef.current,
      mountOrientation: orientationRef.current,
      mountOrientationUnstable: orientationUnstableRef.current,
    });
    liveTelemetryRef.current.telemetryQuality = snapshot;
    qualityTrackerRef.current.recordScore(snapshot.score);
  }, []);

  const flushUiState = useCallback(() => {
    const live = liveTelemetryRef.current;
    setState((prev) => {
      if (
        prev.motion === live.motion &&
        prev.gps === live.gps &&
        prev.slipAngleDeg === live.slipAngleDeg &&
        prev.mountOrientation === live.mountOrientation &&
        prev.mountOrientationUnstable === live.mountOrientationUnstable &&
        prev.telemetryQuality === live.telemetryQuality &&
        prev.gpsIntegrity === live.gpsIntegrity &&
        prev.grade === live.grade
      ) {
        return prev;
      }
      return {
        ...prev,
        motion: live.motion,
        gps: live.gps,
        slipAngleDeg: live.slipAngleDeg,
        mountOrientation: live.mountOrientation,
        mountOrientationUnstable: live.mountOrientationUnstable,
        telemetryQuality: live.telemetryQuality,
        gpsIntegrity: live.gpsIntegrity,
        grade: live.grade,
      };
    });
  }, []);

  const scheduleUiFlush = useCallback((now: number) => {
    const elapsed = now - lastUiFlushAtRef.current;
    if (elapsed >= UI_FLUSH_INTERVAL_MS) {
      flushUiState();
      lastUiFlushAtRef.current = now;
      return;
    }
    if (uiFlushTimerRef.current != null) return;
    uiFlushTimerRef.current = setTimeout(() => {
      uiFlushTimerRef.current = null;
      if (!isActiveRef.current) return;
      flushUiState();
      lastUiFlushAtRef.current = Date.now();
    }, UI_FLUSH_INTERVAL_MS - elapsed);
  }, [flushUiState]);

  const handleMotionSample = useCallback((data: DeviceMotionMeasurement) => {
    if (!isActiveRef.current) return;

    const acc = data.acceleration;
    if (!acc) return;

    const rawGravity = data.accelerationIncludingGravity;
    if (rawGravity) {
      gravityRef.current = smoothGravity(rawGravity, gravityRef.current);
    }

    let resolvedOrientation: MountOrientation;
    let orientationUnstable = false;

    if (mountOverrideRef.current !== 'auto') {
      resolvedOrientation = mountOverrideRef.current;
    } else {
      const tracked = orientationTrackerRef.current.update(gravityRef.current);
      resolvedOrientation = tracked.orientation;
      orientationUnstable = tracked.unstable;
    }

    orientationRef.current = resolvedOrientation;
    orientationUnstableRef.current = orientationUnstable;

    const calibratedGyro = applyGyroCalibration(
      gyroRef.current,
      calibrationRef.current,
    );

    // DeviceMotion.acceleration = OS 重力除去済み線形加速度 → 車体軸へリマップ
    const remapped = remapMotion(
      acc,
      calibratedGyro,
      gravityRef.current,
      orientationRef.current,
    );

    const now = Date.now();
    yawRateRef.current = remapped.yawRateRad;

    const rawCalibrated = applyGCalibration(
      toG(remapped.lateralMs2),
      toG(remapped.longitudinalMs2),
      calibrationRef.current,
    );

    slipEstimatorRef.current.updateMotion(
      rawCalibrated.longitudinalG,
      rawCalibrated.lateralG,
      remapped.yawRateRad,
      now,
    );

    const slipAngleDeg = slipEstimatorRef.current.getSlipAngle(
      gpsHeadingRef.current,
      gpsSpeedRef.current,
    );

    const adaptUpdate = adaptiveRef.current?.recordMotionPacket(
      rawCalibrated.lateralG,
      now,
    );
    if (adaptUpdate?.changed) {
      if (adaptUpdate.nextMotionIntervalMs !== motionIntervalRef.current) {
        motionIntervalRef.current = adaptUpdate.nextMotionIntervalMs;
        DeviceMotion.setUpdateInterval(adaptUpdate.nextMotionIntervalMs);
        Gyroscope.setUpdateInterval(adaptUpdate.nextMotionIntervalMs);
      }
      applyAdaptiveKalman(adaptUpdate.nextKalmanQ, adaptUpdate.nextKalmanR);
    }

    const lateral = gFilterLateralRef.current.update(rawCalibrated.lateralG);
    const longitudinal = gFilterLongRef.current.update(rawCalibrated.longitudinalG);

    const peakLateral = peakKalmanLateralRef.current.update(
      peakLpfLateralRef.current.update(rawCalibrated.lateralG),
    );
    const peakLongitudinal = peakKalmanLongRef.current.update(
      peakLpfLongRef.current.update(rawCalibrated.longitudinalG),
    );
    const instantPeak = magnitudeG(peakLateral, peakLongitudinal);
    const peak = Math.max(motionRef.current.peak, instantPeak);

    motionRef.current = { lateral, longitudinal, peak };

    const live = liveTelemetryRef.current;
    live.slipAngleDeg = slipAngleDeg;
    live.mountOrientation = resolvedOrientation;
    live.mountOrientationUnstable = orientationUnstable;
    live.motion = {
      lateralG: clampG(lateral),
      longitudinalG: clampG(longitudinal),
      peakG: peak,
      yawRateRad: remapped.yawRateRad,
      gyroX: gyroRef.current.x,
      gyroY: gyroRef.current.y,
      gyroZ: gyroRef.current.z,
    };

    live.gpsIntegrity = gpsIntegrityRef.current.updateMotion(longitudinal, now);

    const pitchDeg = estimateRoadPitchDeg(gravityRef.current, resolvedOrientation);
    live.grade = gradeDetectorRef.current.updateInertialPitch(pitchDeg, now);

    refreshTelemetryQuality(now);
    scheduleUiFlush(now);
  }, [applyAdaptiveKalman, refreshTelemetryQuality, scheduleUiFlush]);

  const handleGyroSample = useCallback(({ x, y, z }: { x: number; y: number; z: number }) => {
    gyroRef.current = { x, y, z };
  }, []);

  const handleBaroSample = useCallback(({ pressure, relativeAltitude }: {
    pressure: number;
    relativeAltitude?: number;
  }) => {
    if (!isActiveRef.current) return;

    const fused = baroFusionRef.current.updateBarometer(pressure, relativeAltitude);
    if (fused == null) return;

    const lastGps = lastGpsGradeInputRef.current;
    const live = liveTelemetryRef.current;
    if (!lastGps || !live.gps) return;

    const now = Date.now();
    const baroActive = baroFusionRef.current.isActive();
    const altitude = baroActive ? fused : live.gps.altitude;

    live.gps = {
      ...live.gps,
      altitude,
      altitudeSource: baroActive ? 'baro_fusion' : 'gps',
    };

    live.grade = gradeDetectorRef.current.updateGps({
      ...lastGps,
      altitude,
      timestampMs: now,
      baroFused: baroActive,
    });

    scheduleUiFlush(now);
  }, [scheduleUiFlush]);

  const handleGpsSample = useCallback((location: Location.LocationObject) => {
    if (!isActiveRef.current) return;

    const { coords } = location;
    const speedKmh = msToKmh(coords.speed);
    const heading = coords.heading ?? -1;

    gpsSpeedRef.current = speedKmh;

    if (heading >= 0) {
      gpsHeadingRef.current = heading;
      slipEstimatorRef.current.updateGPS(
        heading,
        speedKmh,
        yawRateRef.current,
        coords.accuracy ?? 0,
      );
    }

    const rawAltitude = coords.altitude ?? 0;
    const accuracy = coords.accuracy ?? 0;
    const fusedAltitude = baroFusionRef.current.updateGps(rawAltitude, accuracy);
    const baroActive = baroFusionRef.current.isActive();
    const altitude = baroActive ? fusedAltitude : rawAltitude;

    lastGpsGradeInputRef.current = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      speedKmh,
      accuracy,
    };

    liveTelemetryRef.current.gps = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      speedKmh,
      heading: heading >= 0 ? heading : 0,
      altitude,
      accuracy,
      altitudeSource: baroActive ? 'baro_fusion' : 'gps',
    };

    const now = Date.now();

    liveTelemetryRef.current.gpsIntegrity = gpsIntegrityRef.current.updateGps(
      location,
      now,
    );

    liveTelemetryRef.current.grade = gradeDetectorRef.current.updateGps({
      latitude: coords.latitude,
      longitude: coords.longitude,
      altitude,
      speedKmh,
      accuracy,
      timestampMs: now,
      baroFused: baroActive,
    });

    adaptiveRef.current?.recordGpsAccuracy(coords.accuracy ?? 0);
    refreshTelemetryQuality(now);
    scheduleUiFlush(now);
  }, [refreshTelemetryQuality, scheduleUiFlush]);

  useEffect(() => {
    loadCalibration().then((data) => {
      calibrationRef.current = data;
    });
  }, []);

  const stop = useCallback(async () => {
    isActiveRef.current = false;
    clearUiFlushTimer();
    motionSubRef.current?.remove();
    motionSubRef.current = null;
    gyroSubRef.current?.remove();
    gyroSubRef.current = null;
    baroSubRef.current?.remove();
    baroSubRef.current = null;
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    motionRef.current = { lateral: 0, longitudinal: 0, peak: 0 };
    gyroRef.current = { x: 0, y: 0, z: 0 };
    resetMotionFilters();
    slipEstimatorRef.current.reset();
    yawRateRef.current = 0;
    orientationRef.current = 'unknown';
    orientationUnstableRef.current = false;
    orientationTrackerRef.current.reset();
    gravityRef.current = { x: 0, y: 0, z: 0 };
    adaptiveRef.current = null;
    sessionHadAdaptiveRef.current = false;
    qualityTrackerRef.current.reset();
    gpsIntegrityRef.current.reset(0);
    gradeDetectorRef.current.reset();
    baroFusionRef.current.reset();
    lastGpsGradeInputRef.current = null;
    sessionStartAtRef.current = 0;
    liveTelemetryRef.current = {
      motion: null,
      gps: null,
      slipAngleDeg: 0,
      mountOrientation: 'unknown',
      mountOrientationUnstable: false,
      telemetryQuality: null,
      gpsIntegrity: null,
      grade: null,
    };
    lastUiFlushAtRef.current = 0;

    setState((prev) => ({
      ...prev,
      isActive: false,
      motion: null,
      gps: null,
      error: null,
      slipAngleDeg: 0,
      mountOrientation: 'unknown',
      mountOrientationUnstable: false,
      telemetryQuality: null,
      gpsIntegrity: null,
      grade: null,
    }));
  }, [clearUiFlushTimer, resetMotionFilters]);

  const start = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null }));

    calibrationRef.current = await loadCalibration();

    const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
    if (locationStatus !== 'granted') {
      setState((prev) => ({
        ...prev,
        error: '位置情報の許可が必要です。設定アプリから許可してください。',
      }));
      return;
    }

    const motionAvailable = await DeviceMotion.isAvailableAsync();
    if (!motionAvailable) {
      setState((prev) => ({
        ...prev,
        error: 'この端末ではモーションセンサーを利用できません。',
      }));
      return;
    }

    await Location.enableNetworkProviderAsync().catch(() => undefined);

    const tuning = sensorTuningRef.current;
    const filterCfg = buildFilterConfig(
      tuning,
      calibrationRef.current,
      smoothingPresetRef.current,
      surfaceConditionRef.current,
    );
    const filters = initMotionFilters(filterCfg);
    gFilterLateralRef.current = filters.smoothLateral;
    gFilterLongRef.current = filters.smoothLong;
    peakLpfLateralRef.current = filters.peakLpfLateral;
    peakLpfLongRef.current = filters.peakLpfLong;
    peakKalmanLateralRef.current = filters.peakKalmanLateral;
    peakKalmanLongRef.current = filters.peakKalmanLong;

    motionRef.current = { lateral: 0, longitudinal: 0, peak: 0 };
    slipEstimatorRef.current.reset();
    slipEstimatorRef.current.configure(tuning.angleTuning);
    orientationRef.current = 'unknown';
    orientationUnstableRef.current = false;
    orientationTrackerRef.current.reset();
    gravityRef.current = { x: 0, y: 0, z: 0 };
    clearUiFlushTimer();
    lastUiFlushAtRef.current = 0;
    qualityTrackerRef.current.reset();
    const sessionStartAt = Date.now();
    sessionStartAtRef.current = sessionStartAt;
    gpsIntegrityRef.current.reset(sessionStartAt);
    gradeDetectorRef.current.reset();
    baroFusionRef.current.reset();
    lastGpsGradeInputRef.current = null;
    liveTelemetryRef.current = {
      motion: null,
      gps: null,
      slipAngleDeg: 0,
      mountOrientation: 'unknown',
      mountOrientationUnstable: false,
      telemetryQuality: null,
      gpsIntegrity: null,
      grade: null,
    };
    isActiveRef.current = true;
    sessionHadAdaptiveRef.current = true;
    adaptiveRef.current = new RuntimeAdaptiveController({
      ...tuning,
      kalmanQ: filterCfg.kalmanQ,
      kalmanR: filterCfg.kalmanR,
    });
    motionIntervalRef.current = tuning.motionIntervalMs;

    setState((prev) => ({
      ...prev,
      isActive: true,
      error: null,
      motion: null,
      gps: null,
      mountOrientation: 'unknown',
      mountOrientationUnstable: false,
      slipAngleDeg: 0,
      telemetryQuality: null,
      gpsIntegrity: null,
      grade: null,
    }));

    DeviceMotion.setUpdateInterval(tuning.motionIntervalMs);
    Gyroscope.setUpdateInterval(tuning.motionIntervalMs);

    motionSubRef.current?.remove();
    motionSubRef.current = DeviceMotion.addListener(handleMotionSample);

    gyroSubRef.current?.remove();
    gyroSubRef.current = Gyroscope.addListener(handleGyroSample);

    baroSubRef.current?.remove();
    const baroAvailable = await Barometer.isAvailableAsync().catch(() => false);
    if (baroAvailable) {
      Barometer.setUpdateInterval(BAROMETER_INTERVAL_MS);
      baroSubRef.current = Barometer.addListener(handleBaroSample);
    }

    try {
      locationSubRef.current?.remove();
      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: tuning.gpsTimeIntervalMs,
          distanceInterval: tuning.gpsDistanceIntervalM,
        },
        handleGpsSample,
      );
    } catch {
      await stop();
      setState((prev) => ({
        ...prev,
        error: 'GPS の取得に失敗しました。屋外で再度お試しください。',
      }));
      return;
    }
  }, [clearUiFlushTimer, handleBaroSample, handleGpsSample, handleGyroSample, handleMotionSample, stop]);

  const toggle = useCallback(async () => {
    if (isActiveRef.current) {
      clearUiFlushTimer();
      flushUiState();
      await stop();
    } else {
      await start();
    }
  }, [clearUiFlushTimer, flushUiState, start, stop]);

  const getRuntimeEffectiveProfile = useCallback((): RuntimeEffectiveProfile | null => {
    if (!sessionHadAdaptiveRef.current || !adaptiveRef.current) return null;
    return adaptiveRef.current.getEffectiveProfile();
  }, []);

  const getSlipFusionConsistency = useCallback((): SlipFusionConsistencySummary | null => {
    if (!sessionHadAdaptiveRef.current) return null;
    const summary = slipEstimatorRef.current.getConsistencySummary();
    if (summary.consistencySamples === 0 && summary.speedMismatchRate === 0) {
      return null;
    }
    return summary;
  }, []);

  const getSessionQualitySummary = useCallback((): SessionQualitySummary | null => {
    if (!sessionHadAdaptiveRef.current) return null;
    const summary = qualityTrackerRef.current.getSessionSummary();
    if (summary.sampleCount === 0) return null;
    return summary;
  }, []);

  const getGpsIntegritySummary = useCallback((): SessionGpsIntegritySummary | null => {
    if (!sessionHadAdaptiveRef.current) return null;
    const summary = gpsIntegrityRef.current.getSessionSummary();
    if (summary.totalGpsSamples === 0) return null;
    return summary;
  }, []);

  const getLiveTelemetry = useCallback((): LiveTelemetry => {
    return liveTelemetryRef.current;
  }, []);

  const setSessionStartAt = useCallback((timestampMs: number) => {
    sessionStartAtRef.current = timestampMs;
  }, []);

  const getSessionStartAt = useCallback((): number => {
    return sessionStartAtRef.current;
  }, []);

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      clearUiFlushTimer();
      motionSubRef.current?.remove();
      gyroSubRef.current?.remove();
      baroSubRef.current?.remove();
      locationSubRef.current?.remove();
      resetMotionFilters();
      slipEstimatorRef.current.reset();
    };
  }, [clearUiFlushTimer, resetMotionFilters]);

  return {
    ...state,
    toggle,
    stop,
    setSessionStartAt,
    getSessionStartAt,
    getRuntimeEffectiveProfile,
    getSlipFusionConsistency,
    getSessionQualitySummary,
    getGpsIntegritySummary,
    getLiveTelemetry,
  };
}

export type SessionLogSaveStatus = 'idle' | 'loading' | 'success' | 'error';

export type SessionLogSaveInput = {
  result: SessionResult;
  telemetryLog: TelemetryLogPoint[];
  vehicleLabel?: string | null;
  locationLabel?: string | null;
};

/**
 * 走行終了時のクラウド保存 — loading / success 状態管理
 * STOP 押下後に saveSessionLog() を呼び出す。
 */
export function useSessionLogCloudSync() {
  const [saveStatus, setSaveStatus] = useState<SessionLogSaveStatus>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const resetSaveStatus = useCallback(() => {
    clearDismissTimer();
    setSaveStatus('idle');
    setSaveMessage(null);
  }, [clearDismissTimer]);

  const saveSessionLog = useCallback(
    (input: SessionLogSaveInput) => {
      if (input.telemetryLog.length < 2) {
        return;
      }

      clearDismissTimer();
      setSaveStatus('loading');
      setSaveMessage('アップロード中...');

      void (async () => {
        if (!isSupabaseConfigured()) {
          resetSaveStatus();
          return;
        }

        const outcome = await uploadSessionLog(input);

        if (outcome.ok) {
          setSaveStatus('success');
          setSaveMessage('保存完了');
          dismissTimerRef.current = setTimeout(() => {
            setSaveStatus('idle');
            setSaveMessage(null);
            dismissTimerRef.current = null;
          }, 2800);
          return;
        }

        if (outcome.reason.includes('未設定')) {
          resetSaveStatus();
          return;
        }

        console.warn('[saveSessionLog] cloud upload failed:', outcome.reason);
        setSaveStatus('error');
        setSaveMessage(`保存に失敗しました\n${outcome.reason}`);
        dismissTimerRef.current = setTimeout(() => {
          setSaveStatus('idle');
          setSaveMessage(null);
          dismissTimerRef.current = null;
        }, 8000);
      })();
    },
    [clearDismissTimer, resetSaveStatus],
  );

  useEffect(() => {
    return () => clearDismissTimer();
  }, [clearDismissTimer]);

  return {
    saveStatus,
    saveMessage,
    isSaving: saveStatus === 'loading',
    isSaveSuccess: saveStatus === 'success',
    saveSessionLog,
    resetSaveStatus,
  };
}
