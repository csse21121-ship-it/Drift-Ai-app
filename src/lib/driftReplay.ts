/**
 * ドリフト検知状態機械 — 純関数（シミュレーション・テスト・本番フック共通）
 */

import {
  CONFIRM_MS,
  EXIT_CONFIRM_MS,
  meetsEnterCondition,
  meetsExitCondition,
} from '@/lib/driftDetection';
import type { SurfaceCondition } from '@/lib/surfaceCondition';
import { DEFAULT_THRESHOLDS } from '@/types/settings';
import type { DriftThresholds } from '@/types/settings';
import type { DriftEvent, DriftStatus } from '@/types/drift';

const RAD_TO_DEG = 180 / Math.PI;

export const INITIAL_DRIFT_STATUS: DriftStatus = {
  phase: 'idle',
  activeDurationMs: 0,
  activePeakLateralG: 0,
  activeAngleDeg: 0,
  activeSlipAngleDeg: 0,
  events: [],
  driftCount: 0,
};

export type DriftReplayState = {
  phase: 'idle' | 'active';
  enterCandidateAt: number | null;
  exitCandidateAt: number | null;
  driftStartAt: number | null;
  peak: { lateralG: number; yawRate: number; speedKmh: number; slipAngleDeg: number };
  events: DriftEvent[];
  driftCount: number;
  lastUpdateAt: number;
  angleAccum: number;
};

export type ReplayInput = {
  nowMs: number;
  lateralG: number;
  yawRateRad: number;
  speedKmh: number;
  slipAngleDeg: number;
};

/** シミュレーション用: セッション開始からの相対時刻 (ms) */
export type ReplayFrame = {
  tMs: number;
  lateralG: number;
  yawRateRad: number;
  speedKmh: number;
  slipAngleDeg: number;
};

export type ReplayStep = {
  tMs: number;
  phase: DriftStatus['phase'];
  lateralG: number;
  yawRateRad: number;
  speedKmh: number;
  slipAngleDeg: number;
  activeDurationMs: number;
  eventEnded?: DriftEvent;
};

export function createReplayState(): DriftReplayState {
  return {
    phase: 'idle',
    enterCandidateAt: null,
    exitCandidateAt: null,
    driftStartAt: null,
    peak: { lateralG: 0, yawRate: 0, speedKmh: 0, slipAngleDeg: 0 },
    events: [],
    driftCount: 0,
    lastUpdateAt: 0,
    angleAccum: 0,
  };
}

export function replayStateToStatus(
  state: DriftReplayState,
  slipAngleDeg = 0,
  activeDurationMs = 0,
): DriftStatus {
  return {
    phase: state.phase,
    activeStartedAt: state.phase === 'active' ? state.driftStartAt ?? undefined : undefined,
    activeDurationMs,
    activePeakLateralG: state.peak.lateralG,
    activeAngleDeg: state.angleAccum,
    activeSlipAngleDeg: slipAngleDeg,
    events: state.events,
    driftCount: state.driftCount,
  };
}

export function processReplayFrame(
  state: DriftReplayState,
  input: ReplayInput,
  thresholds: DriftThresholds = DEFAULT_THRESHOLDS,
  surfaceCondition: SurfaceCondition = 'dry',
): { state: DriftReplayState; status: DriftStatus; eventEnded?: DriftEvent } {
  const next = { ...state, peak: { ...state.peak }, events: [...state.events] };
  const now = input.nowMs;
  const lateralG = input.lateralG;
  const yawRate = input.yawRateRad;
  const speedKmh = input.speedKmh;
  const absSlip = Math.abs(input.slipAngleDeg);

  const dt = next.lastUpdateAt > 0 ? (now - next.lastUpdateAt) / 1000 : 0;
  next.lastUpdateAt = now;

  if (next.phase === 'idle') {
    if (meetsEnterCondition(lateralG, yawRate, speedKmh, thresholds, surfaceCondition)) {
      if (next.enterCandidateAt === null) {
        next.enterCandidateAt = now;
        next.angleAccum = 0;
      } else {
        next.angleAccum += Math.abs(yawRate) * dt * RAD_TO_DEG;

        if (now - next.enterCandidateAt >= CONFIRM_MS) {
          next.phase = 'active';
          next.driftStartAt = next.enterCandidateAt;
          next.peak = {
            lateralG: Math.abs(lateralG),
            yawRate: Math.abs(yawRate),
            speedKmh,
            slipAngleDeg: absSlip,
          };
          next.enterCandidateAt = null;
          next.exitCandidateAt = null;

          const durationMs = now - next.driftStartAt;
          return {
            state: next,
            status: replayStateToStatus(next, input.slipAngleDeg, durationMs),
          };
        }
      }
    } else {
      next.enterCandidateAt = null;
      next.angleAccum = 0;
    }

    return {
      state: next,
      status: replayStateToStatus(next, input.slipAngleDeg, 0),
    };
  }

  next.angleAccum += Math.abs(yawRate) * dt * RAD_TO_DEG;
  next.peak = {
    lateralG: Math.max(next.peak.lateralG, Math.abs(lateralG)),
    yawRate: Math.max(next.peak.yawRate, Math.abs(yawRate)),
    speedKmh: Math.max(next.peak.speedKmh, speedKmh),
    slipAngleDeg: Math.max(next.peak.slipAngleDeg, absSlip),
  };

  const durationMs = now - (next.driftStartAt ?? now);

  if (meetsExitCondition(lateralG, yawRate, thresholds)) {
    if (next.exitCandidateAt === null) {
      next.exitCandidateAt = now;
    } else if (now - next.exitCandidateAt >= EXIT_CONFIRM_MS) {
      const event: DriftEvent = {
        id: `drift_${next.driftStartAt}`,
        startedAt: next.driftStartAt!,
        durationMs,
        peakLateralG: next.peak.lateralG,
        peakYawRate: next.peak.yawRate,
        peakSpeedKmh: next.peak.speedKmh,
        peakAngleDeg: next.angleAccum,
        peakSlipAngleDeg: next.peak.slipAngleDeg,
      };

      next.events = [...next.events, event];
      next.driftCount += 1;
      next.phase = 'idle';
      next.driftStartAt = null;
      next.peak = { lateralG: 0, yawRate: 0, speedKmh: 0, slipAngleDeg: 0 };
      next.enterCandidateAt = null;
      next.exitCandidateAt = null;
      next.angleAccum = 0;

      return {
        state: next,
        status: replayStateToStatus(next, input.slipAngleDeg, 0),
        eventEnded: event,
      };
    }
  } else {
    next.exitCandidateAt = null;
  }

  return {
    state: next,
    status: replayStateToStatus(next, input.slipAngleDeg, durationMs),
  };
}

export function replayFrames(
  frames: ReplayFrame[],
  thresholds: DriftThresholds = DEFAULT_THRESHOLDS,
  sessionStartMs = 1_700_000_000_000,
): { steps: ReplayStep[]; finalStatus: DriftStatus; events: DriftEvent[] } {
  let state = createReplayState();
  const steps: ReplayStep[] = [];

  for (const frame of frames) {
    const result = processReplayFrame(
      state,
      {
        nowMs: sessionStartMs + frame.tMs,
        lateralG: frame.lateralG,
        yawRateRad: frame.yawRateRad,
        speedKmh: frame.speedKmh,
        slipAngleDeg: frame.slipAngleDeg,
      },
      thresholds,
    );
    state = result.state;

    steps.push({
      tMs: frame.tMs,
      phase: result.status.phase,
      lateralG: frame.lateralG,
      yawRateRad: frame.yawRateRad,
      speedKmh: frame.speedKmh,
      slipAngleDeg: frame.slipAngleDeg,
      activeDurationMs: result.status.activeDurationMs,
      eventEnded: result.eventEnded,
    });
  }

  return {
    steps,
    finalStatus: replayStateToStatus(state),
    events: state.events,
  };
}
