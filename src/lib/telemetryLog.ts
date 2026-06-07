/**
 * テレメトリーログ — 記録・再生ユーティリティ
 */

import { INITIAL_DRIFT_STATUS } from '@/lib/driftReplay';
import type { DriftEvent, DriftStatus } from '@/types/drift';
import type { TelemetryLogPoint } from '@/types/score';
import type { GpsSample, MotionSample } from '@/types/telemetry';

const MIN_DT_MS = 100;
const MIN_G_DELTA = 0.025;

export function appendTelemetryPoint(
  log: TelemetryLogPoint[],
  motion: MotionSample,
  gps: GpsSample | null,
  sessionStartedAt: number,
  driftStatus: DriftStatus,
): boolean {
  const tMs = Date.now() - sessionStartedAt;
  if (tMs < 0) return false;

  const timestampUtcMs = Date.now();
  const point: TelemetryLogPoint = {
    tMs,
    timestampUtcMs,
    latitude: gps?.latitude,
    longitude: gps?.longitude,
    lateralG: motion.lateralG,
    longitudinalG: motion.longitudinalG,
    peakG: motion.peakG,
    yawRateRad: motion.yawRateRad,
    slipAngleDeg: driftStatus.activeSlipAngleDeg,
    speedKmh: gps?.speedKmh,
    driftPhase: driftStatus.phase,
    activeDurationMs: driftStatus.activeDurationMs,
    activePeakLateralG: driftStatus.activePeakLateralG,
    activeSlipAngleDeg: driftStatus.activeSlipAngleDeg,
    activeAngleDeg: driftStatus.activeAngleDeg,
    driftCount: driftStatus.driftCount,
  };

  const last = log[log.length - 1];
  if (last) {
    const dt = point.tMs - last.tMs;
    const gDelta =
      Math.abs(point.lateralG - last.lateralG)
      + Math.abs(point.longitudinalG - last.longitudinalG);
    const phaseChanged = point.driftPhase !== last.driftPhase;
    if (dt < MIN_DT_MS && !phaseChanged && gDelta < MIN_G_DELTA) return false;
  }

  log.push(point);
  return true;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

/** 指定時刻のテレメトリーを線形補間で取得 */
export function sampleTelemetryLog(
  log: TelemetryLogPoint[],
  tMs: number,
): TelemetryLogPoint | null {
  if (log.length === 0) return null;
  if (tMs <= log[0].tMs) return log[0];
  const last = log[log.length - 1];
  if (tMs >= last.tMs) return last;

  for (let i = 0; i < log.length - 1; i++) {
    const a = log[i];
    const b = log[i + 1];
    if (tMs >= a.tMs && tMs <= b.tMs) {
      const span = b.tMs - a.tMs;
      const u = span > 0 ? (tMs - a.tMs) / span : 0;
      const useB = u > 0.5;
      return {
        tMs,
        timestampUtcMs: lerp(a.timestampUtcMs ?? a.tMs, b.timestampUtcMs ?? b.tMs, u),
        latitude: a.latitude != null && b.latitude != null ? lerp(a.latitude, b.latitude, u) : useB ? b.latitude : a.latitude,
        longitude: a.longitude != null && b.longitude != null ? lerp(a.longitude, b.longitude, u) : useB ? b.longitude : a.longitude,
        lateralG: lerp(a.lateralG, b.lateralG, u),
        longitudinalG: lerp(a.longitudinalG, b.longitudinalG, u),
        peakG: lerp(a.peakG, b.peakG, u),
        yawRateRad: lerp(a.yawRateRad, b.yawRateRad, u),
        slipAngleDeg: lerp(a.slipAngleDeg, b.slipAngleDeg, u),
        speedKmh: useB ? b.speedKmh : a.speedKmh,
        driftPhase: useB ? b.driftPhase : a.driftPhase,
        activeDurationMs: lerp(a.activeDurationMs, b.activeDurationMs, u),
        activePeakLateralG: lerp(a.activePeakLateralG, b.activePeakLateralG, u),
        activeSlipAngleDeg: lerp(a.activeSlipAngleDeg, b.activeSlipAngleDeg, u),
        activeAngleDeg: lerp(a.activeAngleDeg, b.activeAngleDeg, u),
        driftCount: useB ? b.driftCount : a.driftCount,
      };
    }
  }

  return last;
}

export function telemetryToMotion(sample: TelemetryLogPoint): MotionSample {
  return {
    lateralG: sample.lateralG,
    longitudinalG: sample.longitudinalG,
    peakG: sample.peakG,
    yawRateRad: sample.yawRateRad,
    gyroX: 0,
    gyroY: 0,
    gyroZ: 0,
  };
}

/** ログサンプル + イベント一覧から DriftStatus を復元 */
export function telemetryToDriftStatus(
  sample: TelemetryLogPoint,
  events: DriftEvent[],
  sessionStartedAt: number,
): DriftStatus {
  const tAbs = sessionStartedAt + sample.tMs;
  const endedEvents = events.filter((e) => e.startedAt + e.durationMs <= tAbs);

  if (sample.driftPhase === 'active') {
    return {
      phase: 'active',
      activeStartedAt: tAbs - sample.activeDurationMs,
      activeDurationMs: sample.activeDurationMs,
      activePeakLateralG: sample.activePeakLateralG,
      activeAngleDeg: sample.activeAngleDeg,
      activeSlipAngleDeg: sample.activeSlipAngleDeg,
      events: endedEvents,
      driftCount: sample.driftCount,
    };
  }

  return {
    ...INITIAL_DRIFT_STATUS,
    events: endedEvents,
    driftCount: endedEvents.length,
  };
}

export function telemetryLogDurationMs(
  log: TelemetryLogPoint[],
  sessionDurationMs: number,
): number {
  if (log.length === 0) return sessionDurationMs;
  return Math.max(sessionDurationMs, log[log.length - 1].tMs);
}
