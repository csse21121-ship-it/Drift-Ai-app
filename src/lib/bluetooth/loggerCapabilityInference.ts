/**
 * 受信サンプルストリームからロガー能力を動的推定
 */

import type { LoggerCapabilities, LoggerSample, LoggerTier } from '@/types/logger';

export const UNIVERSAL_INITIAL_CAPABILITIES: LoggerCapabilities = {
  tier: 'basic',
  hasHighFidelityG: false,
  hasDirectSlipAngle: false,
  hasWheelSpeed: false,
  hasHighRateGps: false,
  gSampleRateHz: 0,
  gpsSampleRateHz: 0,
  accuracyGrade: 'medium',
};

const INFERENCE_WINDOW_MS = 4000;
const MIN_SAMPLES = 4;

function estimateHz(samples: LoggerSample[]): number {
  if (samples.length < 2) return 0;
  const span = samples[samples.length - 1].timestamp - samples[0].timestamp;
  if (span <= 0) return 0;
  return Math.round(((samples.length - 1) / span) * 1000);
}

/** 直近サンプルから能力を推定（製品非依存） */
export function inferLoggerCapabilities(
  samples: LoggerSample[],
  nowMs = Date.now(),
): LoggerCapabilities {
  const recent = samples.filter((s) => nowMs - s.timestamp <= INFERENCE_WINDOW_MS);
  if (recent.length < MIN_SAMPLES) return UNIVERSAL_INITIAL_CAPABILITIES;

  const hasG = recent.some(
    (s) => s.lateralG != null || s.longitudinalG != null,
  );
  const hasSpeed = recent.some((s) => (s.speedKmh ?? 0) > 0);
  const hasGps = recent.some(
    (s) => s.latitude != null && s.longitude != null,
  );
  const hasSlip = recent.some((s) => s.slipAngleDeg != null);
  const hasYaw = recent.some((s) => s.yawRateRad != null);
  const hz = estimateHz(recent);

  let tier: LoggerTier = 'basic';
  if (hasG && hasSpeed && hz >= 12) tier = 'advanced';
  if (hasG && (hasSlip || hasYaw) && hz >= 18) tier = 'pro';
  if (!hasG && hasSpeed && hasGps) tier = 'basic';

  return {
    tier,
    hasHighFidelityG: hasG && hz >= 8,
    hasDirectSlipAngle: hasSlip,
    hasWheelSpeed: hasSpeed,
    hasHighRateGps: hasGps && hz >= 4,
    gSampleRateHz: hasG ? Math.max(hz, 1) : 0,
    gpsSampleRateHz: hasGps ? Math.max(hz, 1) : 0,
    accuracyGrade:
      tier === 'pro'
        ? 'race'
        : tier === 'advanced'
          ? 'high'
          : hasGps
            ? 'medium'
            : 'medium',
  };
}
