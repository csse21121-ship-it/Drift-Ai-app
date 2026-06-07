/**
 * GPS 整合性モニター — モック検知・物理的不整合・練習モード判定
 *
 * 加速度積分速度 vs GPS 速度のクロスチェック、Expo Location の mocked フラグ、
 * 屋内レベルの精度劣化を監視し、公式記録 vs 練習モードを決定する。
 */

import type * as Location from 'expo-location';
import { msToKmh } from '@/lib/gps';
import { isGpsSpeedConsistent } from '@/lib/slipAngle';
import { scoreGpsAccuracy } from '@/lib/telemetryQuality';
import type {
  GpsIntegritySnapshot,
  PracticeModeReason,
} from '@/types/telemetry';
import type {
  GpsQualityTimelinePoint,
  SessionGpsIntegritySummary,
} from '@/types/score';

export type { SessionGpsIntegritySummary };

const G_MS2 = 9.80665;

/** 屋内レベルとみなす GPS 精度 (m) */
export const INDOOR_ACCURACY_M = 45;
/** 屋内サンプル比率がこの値以上で練習モード */
const INDOOR_SAMPLE_RATE_THRESHOLD = 0.35;
/** 静止/等速とみなす縦 G 上限 */
const QUIESCENT_LONG_G = 0.1;
/** 積分速度変化がこの値未満なら等速扱い (km/h) */
const QUIESCENT_INTEGRATED_DELTA_KMH = 2.5;
/** GPS 速度の急変閾値 (km/h) */
const GPS_JUMP_KMH = 12;
/** 非現実的な GPS 速度 (km/h) */
const GPS_SPEED_SPIKE_KMH = 150;
/** タイムラインのバケット幅 (ms) */
const TIMELINE_BUCKET_MS = 2000;
const MAX_TIMELINE_POINTS = 150;

function mergePracticeReason(
  current: PracticeModeReason | null,
  next: PracticeModeReason,
): PracticeModeReason {
  if (current == null) return next;
  if (current === next) return current;
  return 'mixed';
}

export function practiceReasonLabel(
  reason: PracticeModeReason | null | undefined,
): string {
  switch (reason) {
    case 'mock':
      return 'GPSモック検知';
    case 'anomaly':
      return '物理的不整合';
    case 'indoor':
      return 'GPS精度不足（屋内レベル）';
    case 'mixed':
      return '複合要因';
    default:
      return '';
  }
}

export class GpsIntegrityMonitor {
  private sessionStartAt = 0;
  private integratedSpeedKmh = 0;
  private lastIntegratedAt = 0;
  private lastLongitudinalG = 0;
  private lastGpsSpeed: number | null = null;
  private lastIntegratedSpeed = 0;

  private isGpsAnomalous = false;
  private isPracticeMode = false;
  private practiceReason: PracticeModeReason | null = null;
  private mockDetected = false;
  private anomalySampleCount = 0;
  private indoorSampleCount = 0;
  private totalGpsSamples = 0;
  private currentAccuracyM = 0;

  private timeline: GpsQualityTimelinePoint[] = [];
  private lastTimelineBucket = -1;

  reset(sessionStartAt: number): void {
    this.sessionStartAt = sessionStartAt;
    this.integratedSpeedKmh = 0;
    this.lastIntegratedAt = 0;
    this.lastLongitudinalG = 0;
    this.lastGpsSpeed = null;
    this.lastIntegratedSpeed = 0;
    this.isGpsAnomalous = false;
    this.isPracticeMode = false;
    this.practiceReason = null;
    this.mockDetected = false;
    this.anomalySampleCount = 0;
    this.indoorSampleCount = 0;
    this.totalGpsSamples = 0;
    this.currentAccuracyM = 0;
    this.timeline = [];
    this.lastTimelineBucket = -1;
  }

  updateMotion(longitudinalG: number, nowMs: number): GpsIntegritySnapshot {
    this.lastLongitudinalG = longitudinalG;
    if (this.lastIntegratedAt > 0) {
      const dt = (nowMs - this.lastIntegratedAt) / 1000;
      if (dt > 0 && dt < 0.5) {
        this.integratedSpeedKmh = Math.max(
          0,
          this.integratedSpeedKmh + longitudinalG * G_MS2 * dt * 3.6,
        );
      }
    }
    this.lastIntegratedAt = nowMs;
    return this.getSnapshot();
  }

  updateGps(location: Location.LocationObject, nowMs: number): GpsIntegritySnapshot {
    const { coords } = location;
    const speedKmh = msToKmh(coords.speed);
    const accuracyM = coords.accuracy ?? 0;
    const mocked = location.mocked === true;
    const tMs = Math.max(0, nowMs - this.sessionStartAt);

    this.currentAccuracyM = accuracyM;
    this.totalGpsSamples += 1;

    let sampleAnomalous = mocked;

    if (mocked) {
      this.mockDetected = true;
      this.isPracticeMode = true;
      this.practiceReason = mergePracticeReason(this.practiceReason, 'mock');
    }

    if (accuracyM > INDOOR_ACCURACY_M) {
      this.indoorSampleCount += 1;
    }

    if (this.lastGpsSpeed != null) {
      const gpsDelta = Math.abs(speedKmh - this.lastGpsSpeed);
      const intDelta = Math.abs(this.integratedSpeedKmh - this.lastIntegratedSpeed);
      const motionQuiescent =
        Math.abs(this.lastLongitudinalG) < QUIESCENT_LONG_G &&
        intDelta < QUIESCENT_INTEGRATED_DELTA_KMH;
      const gpsJump = gpsDelta > GPS_JUMP_KMH;
      const implausibleSpeed = speedKmh > GPS_SPEED_SPIKE_KMH;
      const speedMismatch =
        speedKmh >= 12 &&
        !isGpsSpeedConsistent(speedKmh, this.integratedSpeedKmh);

      if (motionQuiescent && (gpsJump || implausibleSpeed)) {
        sampleAnomalous = true;
      } else if (speedMismatch && motionQuiescent) {
        sampleAnomalous = true;
      }
    }

    if (sampleAnomalous) {
      this.anomalySampleCount += 1;
      this.isGpsAnomalous = true;
      if (!mocked) {
        this.isPracticeMode = true;
        this.practiceReason = mergePracticeReason(this.practiceReason, 'anomaly');
      }
    }

    if (this.totalGpsSamples >= 5) {
      const indoorRate = this.indoorSampleCount / this.totalGpsSamples;
      if (indoorRate >= INDOOR_SAMPLE_RATE_THRESHOLD) {
        this.isPracticeMode = true;
        this.practiceReason = mergePracticeReason(this.practiceReason, 'indoor');
      }
    }

    if (
      speedKmh >= 5 &&
      isGpsSpeedConsistent(speedKmh, this.integratedSpeedKmh)
    ) {
      const alpha = 0.15;
      this.integratedSpeedKmh += alpha * (speedKmh - this.integratedSpeedKmh);
    }

    this.lastGpsSpeed = speedKmh;
    this.lastIntegratedSpeed = this.integratedSpeedKmh;

    this.appendTimelinePoint(tMs, accuracyM, sampleAnomalous, mocked);

    return this.getSnapshot();
  }

  private appendTimelinePoint(
    tMs: number,
    accuracyM: number,
    anomalous: boolean,
    mocked: boolean,
  ): void {
    const bucket = Math.floor(tMs / TIMELINE_BUCKET_MS);
    const point: GpsQualityTimelinePoint = {
      tMs,
      accuracyM,
      qualityScore: scoreGpsAccuracy(accuracyM),
      anomalous,
      mocked,
    };

    if (bucket === this.lastTimelineBucket && this.timeline.length > 0) {
      this.timeline[this.timeline.length - 1] = point;
      return;
    }

    this.lastTimelineBucket = bucket;
    if (this.timeline.length >= MAX_TIMELINE_POINTS) {
      const stride = Math.ceil(this.timeline.length / (MAX_TIMELINE_POINTS * 0.75));
      this.timeline = this.timeline.filter((_, i) => i % stride !== 0);
    }
    this.timeline.push(point);
  }

  getSnapshot(): GpsIntegritySnapshot {
    return {
      isGpsAnomalous: this.isGpsAnomalous,
      isPracticeMode: this.isPracticeMode,
      practiceReason: this.practiceReason,
      accuracyM: this.currentAccuracyM,
    };
  }

  getSessionSummary(): SessionGpsIntegritySummary {
    const indoorSampleRate =
      this.totalGpsSamples > 0
        ? this.indoorSampleCount / this.totalGpsSamples
        : 0;

    return {
      isGpsAnomalous: this.isGpsAnomalous,
      isPracticeMode: this.isPracticeMode,
      practiceReason: this.practiceReason,
      mockDetected: this.mockDetected,
      anomalySampleCount: this.anomalySampleCount,
      totalGpsSamples: this.totalGpsSamples,
      indoorSampleRate,
      timeline: [...this.timeline],
    };
  }
}
