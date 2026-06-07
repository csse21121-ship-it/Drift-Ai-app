/**
 * 走行中の適応チューニング（Runtime Adaptive）
 *
 * 2.5 秒ごとに実効 Hz / G 分散 / GPS 精度を評価し、
 * モーション取得間隔とカルマン R を動的に調整する。
 */

import type { SensorTuningProfile } from '@/lib/sensorTuning';
import type { RuntimeEffectiveProfile } from '@/types/telemetry';

export type { RuntimeEffectiveProfile };

/** 適応評価の実行間隔 */
export const ADAPTATION_INTERVAL_MS = 2500;
const METRICS_WINDOW_MS = 3000;

/** 横 G 生値の分散しきい値 */
const G_VARIANCE_STABLE = 0.003;
const G_VARIANCE_HARSH = 0.012;

/** GPS accuracy (m) — 値が小さいほど高精度 */
const GPS_ACCURACY_GOOD = 12;
const GPS_ACCURACY_POOR = 28;

const MOTION_INTERVAL_STEP_MS = 4;
const MIN_MOTION_INTERVAL_MS = 16;
const MAX_MOTION_INTERVAL_MS = 100;

const R_FACTOR_STABLE = 0.92;
const R_FACTOR_HARSH = 1.10;
const MIN_R_FACTOR = 0.55;
const MAX_R_FACTOR = 1.8;

export type AdaptiveMetrics = {
  effectiveHz: number;
  gVariance: number;
  gpsAccuracyM: number | null;
  stability: 'stable' | 'neutral' | 'harsh';
};

export type AdaptiveTuningUpdate = {
  nextMotionIntervalMs: number;
  nextKalmanR: number;
  nextKalmanQ: number;
  metrics: AdaptiveMetrics;
  changed: boolean;
};

function classifyStability(
  gVariance: number,
  gpsAccuracyM: number | null,
): AdaptiveMetrics['stability'] {
  const gStable = gVariance <= G_VARIANCE_STABLE;
  const gHarsh = gVariance >= G_VARIANCE_HARSH;
  const gpsGood = gpsAccuracyM !== null && gpsAccuracyM <= GPS_ACCURACY_GOOD;
  const gpsPoor = gpsAccuracyM !== null && gpsAccuracyM >= GPS_ACCURACY_POOR;

  if (gStable && (gpsGood || gpsAccuracyM === null)) return 'stable';
  if (gHarsh || gpsPoor) return 'harsh';
  return 'neutral';
}

export class RuntimeAdaptiveController {
  private baseTuning: SensorTuningProfile;
  private baseMotionMs: number;
  private baseKalmanQ: number;
  private baseKalmanR: number;

  private motionIntervalMs: number;
  private kalmanR: number;
  private kalmanQ: number;
  /** 安定/悪化に応じた R の適応倍率（dt スケールとは独立） */
  private rAdaptiveScale: number;

  private motionTimestamps: number[] = [];
  private rawGSamples: number[] = [];
  private gpsAccuracies: number[] = [];
  private lastEvalAt = 0;

  private sumHz = 0;
  private sumR = 0;
  private evalCount = 0;

  constructor(baseTuning: SensorTuningProfile) {
    this.baseTuning = baseTuning;
    this.baseMotionMs = baseTuning.motionIntervalMs;
    this.baseKalmanQ = baseTuning.kalmanQ;
    this.baseKalmanR = baseTuning.kalmanR;
    this.motionIntervalMs = baseTuning.motionIntervalMs;
    this.kalmanR = baseTuning.kalmanR;
    this.kalmanQ = baseTuning.kalmanQ;
    this.rAdaptiveScale = 1;
  }

  reset(baseTuning: SensorTuningProfile): void {
    this.baseTuning = baseTuning;
    this.baseMotionMs = baseTuning.motionIntervalMs;
    this.baseKalmanQ = baseTuning.kalmanQ;
    this.baseKalmanR = baseTuning.kalmanR;
    this.motionIntervalMs = baseTuning.motionIntervalMs;
    this.kalmanR = baseTuning.kalmanR;
    this.kalmanQ = baseTuning.kalmanQ;
    this.rAdaptiveScale = 1;
    this.motionTimestamps = [];
    this.rawGSamples = [];
    this.gpsAccuracies = [];
    this.lastEvalAt = 0;
    this.sumHz = 0;
    this.sumR = 0;
    this.evalCount = 0;
  }

  /** モーションパケット受信時に呼ぶ（毎フレーム）。適応タイミングなら更新を返す */
  recordMotionPacket(
    rawLateralG: number,
    timestamp = Date.now(),
  ): AdaptiveTuningUpdate | null {
    this.motionTimestamps.push(timestamp);
    this.rawGSamples.push(rawLateralG);
    this.pruneMotion(timestamp);

    if (this.lastEvalAt === 0) {
      this.lastEvalAt = timestamp;
      return null;
    }
    if (timestamp - this.lastEvalAt < ADAPTATION_INTERVAL_MS) {
      return null;
    }
    this.lastEvalAt = timestamp;
    return this.evaluateAndAdapt();
  }

  recordGpsAccuracy(accuracyM: number): void {
    if (!Number.isFinite(accuracyM) || accuracyM <= 0) return;
    this.gpsAccuracies.push(accuracyM);
    if (this.gpsAccuracies.length > 80) {
      this.gpsAccuracies.splice(0, this.gpsAccuracies.length - 80);
    }
  }

  getEffectiveProfile(): RuntimeEffectiveProfile {
    const hz = this.evalCount > 0
      ? this.sumHz / this.evalCount
      : 1000 / this.motionIntervalMs;
    const r = this.evalCount > 0
      ? this.sumR / this.evalCount
      : this.kalmanR;

    return {
      avgEffectiveMotionHz: Math.round(hz * 10) / 10,
      avgKalmanR: Math.round(r * 1000) / 1000,
      finalMotionIntervalMs: this.motionIntervalMs,
      adaptationEvaluations: this.evalCount,
    };
  }

  private pruneMotion(now: number): void {
    const cutoff = now - METRICS_WINDOW_MS;
    while (
      this.motionTimestamps.length > 0 &&
      this.motionTimestamps[0] < cutoff
    ) {
      this.motionTimestamps.shift();
      this.rawGSamples.shift();
    }
  }

  private computeEffectiveHz(): number {
    const ts = this.motionTimestamps;
    if (ts.length < 2) {
      return 1000 / this.motionIntervalMs;
    }
    let sumDelta = 0;
    for (let i = 1; i < ts.length; i++) {
      sumDelta += ts[i] - ts[i - 1];
    }
    const avgDeltaMs = sumDelta / (ts.length - 1);
    return avgDeltaMs > 0 ? 1000 / avgDeltaMs : 1000 / this.motionIntervalMs;
  }

  private computeGVariance(): number {
    const samples = this.rawGSamples;
    if (samples.length < 3) return G_VARIANCE_STABLE;
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    return samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
  }

  private computeGpsAccuracy(): number | null {
    if (this.gpsAccuracies.length === 0) return null;
    return (
      this.gpsAccuracies.reduce((a, b) => a + b, 0) /
      this.gpsAccuracies.length
    );
  }

  private evaluateAndAdapt(): AdaptiveTuningUpdate {
    const effectiveHz = this.computeEffectiveHz();
    const gVariance = this.computeGVariance();
    const gpsAccuracyM = this.computeGpsAccuracy();
    const stability = classifyStability(gVariance, gpsAccuracyM);

    const prevInterval = this.motionIntervalMs;
    const prevQ = this.kalmanQ;
    const prevR = this.kalmanR;

    if (stability === 'stable') {
      this.motionIntervalMs = Math.max(
        MIN_MOTION_INTERVAL_MS,
        this.motionIntervalMs - MOTION_INTERVAL_STEP_MS,
      );
      this.rAdaptiveScale = Math.max(
        MIN_R_FACTOR,
        this.rAdaptiveScale * R_FACTOR_STABLE,
      );
    } else if (stability === 'harsh') {
      this.motionIntervalMs = Math.min(
        MAX_MOTION_INTERVAL_MS,
        this.motionIntervalMs + MOTION_INTERVAL_STEP_MS,
      );
      this.rAdaptiveScale = Math.min(
        MAX_R_FACTOR,
        this.rAdaptiveScale * R_FACTOR_HARSH,
      );
    }

    const dtFactor = this.motionIntervalMs / this.baseMotionMs;
    this.kalmanQ = this.baseKalmanQ * dtFactor;
    this.kalmanR = this.baseKalmanR * dtFactor * this.rAdaptiveScale;

    this.sumHz += effectiveHz;
    this.sumR += this.kalmanR;
    this.evalCount += 1;

    return {
      nextMotionIntervalMs: this.motionIntervalMs,
      nextKalmanR: this.kalmanR,
      nextKalmanQ: this.kalmanQ,
      metrics: { effectiveHz, gVariance, gpsAccuracyM, stability },
      changed:
        prevInterval !== this.motionIntervalMs ||
        prevQ !== this.kalmanQ ||
        prevR !== this.kalmanR,
    };
  }
}
