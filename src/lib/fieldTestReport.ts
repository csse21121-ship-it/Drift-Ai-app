import { ACCURACY_GRADE_LABELS, LOGGER_TIER_LABELS } from '@/data/loggerPresets';
import { gpsQualityLabel, type GpsMonitorState } from '@/lib/gpsAccuracyMonitor';
import { countCompleted, FIELD_TEST_CHECKS, type FieldTestCheckState } from '@/lib/fieldTestChecklist';
import type { LoggerCapabilities } from '@/types/logger';
import type { DriftThresholds } from '@/types/settings';
import type { GpsSample, MotionSample } from '@/types/telemetry';

export type FieldTestReportInput = {
  loggerConnected: boolean;
  loggerName: string | null;
  loggerStatus: string;
  capabilities: LoggerCapabilities;
  phoneDescription: string[];
  gps: GpsSample | null;
  motion: MotionSample | null;
  gpsMonitor: GpsMonitorState;
  userThresholds: DriftThresholds;
  capabilityThresholds: DriftThresholds;
  effectiveThresholds: DriftThresholds;
  checklist: FieldTestCheckState;
  slipAngleDeg: number;
};

function fmtThreshold(label: string, base: number, effective: number, unit: string): string {
  const changed = Math.abs(base - effective) > 0.001;
  return `${label}: ${effective.toFixed(2)}${unit}${changed ? ` (base ${base.toFixed(2)})` : ''}`;
}

export function buildFieldTestReport(input: FieldTestReportInput): string {
  const lines: string[] = [
    'DriftScore AI — Field Test Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    '=== LOGGER ===',
    `Status: ${input.loggerStatus}`,
    `Connected: ${input.loggerConnected ? 'yes' : 'no'}`,
  ];

  if (input.loggerName) lines.push(`Device: ${input.loggerName}`);
  lines.push(
    `Tier: ${LOGGER_TIER_LABELS[input.capabilities.tier]}`,
    `Accuracy: ${ACCURACY_GRADE_LABELS[input.capabilities.accuracyGrade]}`,
    `G ${input.capabilities.gSampleRateHz}Hz · GPS ${input.capabilities.gpsSampleRateHz}Hz`,
    '',
    '=== PHONE SENSOR ===',
  );
  if (input.phoneDescription.length > 0) {
    lines.push(...input.phoneDescription.map((l) => `- ${l}`));
  } else {
    lines.push('- (probe not ready)');
  }

  lines.push('', '=== GPS (live snapshot) ===');
  if (input.gps) {
    lines.push(
      `Lat/Lon: ${input.gps.latitude.toFixed(6)}, ${input.gps.longitude.toFixed(6)}`,
      `Speed: ${Math.round(input.gps.speedKmh ?? 0)} km/h`,
      `Accuracy: ±${Math.round(input.gpsMonitor.smoothedAccuracyM ?? input.gps.accuracy)}m`,
      `Quality: ${gpsQualityLabel(input.gpsMonitor.quality)}`,
      `Relaxed: ${input.gpsMonitor.isRelaxed ? 'yes' : 'no'}`,
    );
  } else {
    lines.push('No GPS fix');
  }

  if (input.motion) {
    lines.push(
      '',
      '=== MOTION ===',
      `Lateral G: ${input.motion.lateralG.toFixed(3)}`,
      `Longitudinal G: ${input.motion.longitudinalG.toFixed(3)}`,
      `Peak G: ${input.motion.peakG.toFixed(3)}`,
      `Slip angle: ${input.slipAngleDeg.toFixed(1)}°`,
    );
  }

  lines.push(
    '',
    '=== THRESHOLDS ===',
    fmtThreshold('Enter lateral G', input.capabilityThresholds.enterLateralG, input.effectiveThresholds.enterLateralG, 'G'),
    fmtThreshold('Enter yaw', input.capabilityThresholds.enterYawRate, input.effectiveThresholds.enterYawRate, ' rad/s'),
    fmtThreshold('Min speed', input.capabilityThresholds.minSpeedKmh, input.effectiveThresholds.minSpeedKmh, ' km/h'),
    '',
    '=== CHECKLIST ===',
    `${countCompleted(input.checklist)} / ${FIELD_TEST_CHECKS.length} completed`,
  );

  for (const item of FIELD_TEST_CHECKS) {
    lines.push(`${input.checklist[item.id] ? '[x]' : '[ ]'} ${item.label}`);
  }

  return lines.join('\n');
}
