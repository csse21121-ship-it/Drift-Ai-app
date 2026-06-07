/**
 * 端末内蔵センサーの能力プローブ（段階テストモード）
 *
 * モーション: 50 → 33 → 25 → 16 ms と段階的に Hz を上げ、
 *   パケット落ちなく安定した最小インターバル（最大 Hz）を記録する。
 * GPS: 500 ms ベースライン + 200 ms アグレッシブテスト。
 */

import { DeviceMotion } from 'expo-sensors';
import * as Location from 'expo-location';
import {
  classifyPhonePerformanceTier,
  normalizePhoneProbeResult,
} from '@/lib/phoneProbeGrade';
import {
  computeIntervalStats,
  isStableIntervalStats,
} from '@/lib/probeStats';
import type {
  MotionProbeStageResult,
  PhoneProbeProgress,
  PhoneSensorProbeResult,
} from '@/types/phoneSensor';
import { DEFAULT_PHONE_PROBE } from '@/types/phoneSensor';

/** 段階的モーションインターバル（ms）— 低いほど高 Hz */
const MOTION_STAGE_INTERVALS_MS = [50, 33, 25, 16] as const;

const MOTION_STAGE_DURATION_MS = 1400;
const MOTION_STAGE_COOLDOWN_MS = 120;

const GPS_BASELINE_INTERVAL_MS = 500;
const GPS_AGGRESSIVE_INTERVAL_MS = 200;
const GPS_BASELINE_DURATION_MS = 2600;
const GPS_AGGRESSIVE_DURATION_MS = 2200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GpsProbeSample = {
  timestamps: number[];
  accuracies: number[];
};

async function collectMotionStage(
  requestedIntervalMs: number,
): Promise<MotionProbeStageResult> {
  const timestamps: number[] = [];

  DeviceMotion.setUpdateInterval(requestedIntervalMs);
  const sub = DeviceMotion.addListener((data) => {
    if (data.acceleration) timestamps.push(Date.now());
  });

  await sleep(MOTION_STAGE_DURATION_MS);
  sub.remove();

  const stats = computeIntervalStats(
    timestamps,
    requestedIntervalMs,
    MOTION_STAGE_DURATION_MS,
  );
  const stable = isStableIntervalStats(stats, requestedIntervalMs);

  return {
    requestedIntervalMs,
    effectiveIntervalMs: stats.medianIntervalMs,
    effectiveHz: stats.effectiveHz,
    jitterMs: stats.jitterMs,
    sampleCount: stats.sampleCount,
    deliveryRatio: stats.deliveryRatio,
    stable,
  };
}

async function probeMotionStaged(
  onProgress?: (p: PhoneProbeProgress) => void,
): Promise<{
  available: boolean;
  hz: number;
  stableIntervalMs: number;
  jitterMs: number;
  stages: MotionProbeStageResult[];
}> {
  const available = await DeviceMotion.isAvailableAsync();
  if (!available) {
    return {
      available: false,
      hz: 0,
      stableIntervalMs: 50,
      jitterMs: 0,
      stages: [],
    };
  }

  const stages: MotionProbeStageResult[] = [];
  let lastStable: MotionProbeStageResult | null = null;

  for (const intervalMs of MOTION_STAGE_INTERVALS_MS) {
    onProgress?.({
      phase: 'motion',
      detail: `モーション ${intervalMs} ms 段階テスト…`,
    });

    const stage = await collectMotionStage(intervalMs);
    stages.push(stage);

    if (stage.stable) {
      lastStable = stage;
      await sleep(MOTION_STAGE_COOLDOWN_MS);
      continue;
    }
    break;
  }

  if (!lastStable) {
    const fallbackHz = Math.round(1000 / MOTION_STAGE_INTERVALS_MS[0]);
    return {
      available: true,
      hz: fallbackHz,
      stableIntervalMs: MOTION_STAGE_INTERVALS_MS[0],
      jitterMs: stages[0]?.jitterMs ?? 0,
      stages,
    };
  }

  return {
    available: true,
    hz: lastStable.effectiveHz > 0
      ? lastStable.effectiveHz
      : Math.round(1000 / lastStable.requestedIntervalMs),
    stableIntervalMs: lastStable.requestedIntervalMs,
    jitterMs: lastStable.jitterMs,
    stages,
  };
}

async function probeGpsAtInterval(
  timeIntervalMs: number,
  durationMs: number,
): Promise<GpsProbeSample & { stats: ReturnType<typeof computeIntervalStats> }> {
  const timestamps: number[] = [];
  const accuracies: number[] = [];

  let sub: Location.LocationSubscription | null = null;
  try {
    sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: timeIntervalMs,
        distanceInterval: 1,
      },
      (location) => {
        timestamps.push(Date.now());
        const acc = location.coords.accuracy;
        if (acc != null && acc > 0) accuracies.push(acc);
      },
    );
    await sleep(durationMs);
  } finally {
    sub?.remove();
  }

  const stats = computeIntervalStats(timestamps, timeIntervalMs, durationMs);
  return { timestamps, accuracies, stats };
}

async function probeGpsStaged(
  onProgress?: (p: PhoneProbeProgress) => void,
): Promise<{
  granted: boolean;
  hz: number;
  baselineIntervalMs: number;
  aggressiveIntervalMs: number | null;
  aggressiveHz: number | null;
  jitterMs: number | null;
  avgAccuracyM: number | null;
  outdoorTestRecommended: boolean;
}> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') {
    return {
      granted: false,
      hz: 0,
      baselineIntervalMs: GPS_BASELINE_INTERVAL_MS,
      aggressiveIntervalMs: null,
      aggressiveHz: null,
      jitterMs: null,
      avgAccuracyM: null,
      outdoorTestRecommended: true,
    };
  }

  await Location.enableNetworkProviderAsync().catch(() => undefined);

  onProgress?.({
    phase: 'gps_baseline',
    detail: `GPS ベースライン ${GPS_BASELINE_INTERVAL_MS} ms…`,
  });

  const baseline = await probeGpsAtInterval(
    GPS_BASELINE_INTERVAL_MS,
    GPS_BASELINE_DURATION_MS,
  );

  onProgress?.({
    phase: 'gps_aggressive',
    detail: `GPS アグレッシブ ${GPS_AGGRESSIVE_INTERVAL_MS} ms…`,
  });

  const aggressive = await probeGpsAtInterval(
    GPS_AGGRESSIVE_INTERVAL_MS,
    GPS_AGGRESSIVE_DURATION_MS,
  );

  const baselineStable = isStableIntervalStats(
    baseline.stats,
    GPS_BASELINE_INTERVAL_MS,
    { minDeliveryRatio: 0.55, minSamples: 3 },
  );
  const aggressiveStable = isStableIntervalStats(
    aggressive.stats,
    GPS_AGGRESSIVE_INTERVAL_MS,
    { minDeliveryRatio: 0.5, minSamples: 3, maxMedianSlack: 2.2 },
  );

  const allAccuracies = [...baseline.accuracies, ...aggressive.accuracies];
  const avgAccuracyM =
    allAccuracies.length > 0
      ? allAccuracies.reduce((sum, v) => sum + v, 0) / allAccuracies.length
      : null;

  const indoorLikely =
    avgAccuracyM != null && avgAccuracyM > 25 ||
    baseline.stats.sampleCount < 2;

  const outdoorTestRecommended =
    indoorLikely ||
    !aggressiveStable ||
    (aggressiveStable &&
      baselineStable &&
      aggressive.stats.effectiveHz <= baseline.stats.effectiveHz);

  let adoptedHz = baseline.stats.effectiveHz;
  let adoptedJitter = baseline.stats.jitterMs;
  let aggressiveHz: number | null = null;

  if (
    aggressiveStable &&
    aggressive.stats.effectiveHz >= baseline.stats.effectiveHz
  ) {
    adoptedHz = aggressive.stats.effectiveHz;
    adoptedJitter = aggressive.stats.jitterMs;
    aggressiveHz = aggressive.stats.effectiveHz;
  } else if (aggressiveStable) {
    aggressiveHz = aggressive.stats.effectiveHz;
  }

  if (adoptedHz <= 0 && baselineStable) {
    adoptedHz = Math.round(1000 / GPS_BASELINE_INTERVAL_MS);
  }

  return {
    granted: true,
    hz: adoptedHz,
    baselineIntervalMs: GPS_BASELINE_INTERVAL_MS,
    aggressiveIntervalMs: GPS_AGGRESSIVE_INTERVAL_MS,
    aggressiveHz,
    jitterMs: adoptedJitter,
    avgAccuracyM,
    outdoorTestRecommended: outdoorTestRecommended,
  };
}

/** 端末センサーを段階プローブして結果を返す（計測セッションとは独立） */
export async function probePhoneSensors(options?: {
  /** true のとき GPS 権限をリクエストして計測する */
  requestLocation?: boolean;
  onProgress?: (progress: PhoneProbeProgress) => void;
}): Promise<PhoneSensorProbeResult> {
  const onProgress = options?.onProgress;

  const motion = await probeMotionStaged(onProgress);

  let gps = await probeGpsStaged(onProgress);
  if (!gps.granted && options?.requestLocation) {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      gps = await probeGpsStaged(onProgress);
    }
  }

  const draft: PhoneSensorProbeResult = {
    motionAvailable: motion.available,
    motionSampleRateHz: motion.hz,
    motionStableIntervalMs: motion.stableIntervalMs,
    motionJitterMs: motion.jitterMs,
    motionStageResults: motion.stages,
    locationGranted: gps.granted,
    gpsSampleRateHz: gps.hz,
    gpsBaselineIntervalMs: gps.baselineIntervalMs,
    gpsAggressiveIntervalMs: gps.granted ? gps.aggressiveIntervalMs : null,
    gpsAggressiveHz: gps.aggressiveHz,
    gpsJitterMs: gps.jitterMs,
    avgGpsAccuracyM: gps.avgAccuracyM,
    gpsOutdoorTestRecommended: gps.outdoorTestRecommended,
    phonePerformanceTier: 'phone-standard',
    probedAt: Date.now(),
  };

  draft.phonePerformanceTier = classifyPhonePerformanceTier(draft);
  return normalizePhoneProbeResult(draft);
}

/** プローブ失敗時の安全なデフォルト */
export function fallbackPhoneProbe(): PhoneSensorProbeResult {
  return normalizePhoneProbeResult({
    ...DEFAULT_PHONE_PROBE,
    probedAt: Date.now(),
  });
}
