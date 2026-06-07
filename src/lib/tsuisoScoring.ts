/**
 * 追走（Tsuiso）採点 — D1GP / FDJ 基準 100点満点
 * GPS 絶対タイムスタンプ (UTC) で Lead / Chase を同期比較
 *
 * 机固定など非走行では近接度・角度だけが満点に近くなる問題を防ぐため、
 * ドリフト区間・速度・走行距離のゲートを必須とする。
 */

import { distanceMeters } from '@/lib/geofence';
import {
  applyTsuisoPenalties,
  detectTsuisoPenalties,
  penaltiesForChaseScore,
} from '@/lib/tsuisoPenalties';
import type { TelemetryLogPoint, TsuisoAlignedPair, TsuisoScoreBreakdown } from '@/types/score';
import { TSUISO_SCORE_MAX } from '@/types/score';
import type { TsuisoCompareResult, TsuisoRunExport } from '@/types/tsuiso';

/** 同期リサンプル間隔 (ms) */
const ALIGN_STEP_MS = 100;
/** 近接度: 満点距離 (m) */
const PROXIMITY_FULL_SCORE_M = 2;
/** 近接度: 0点距離 (m) */
const PROXIMITY_ZERO_SCORE_M = 15;
/** 角度一致: 満点差分 (°) */
const ANGLE_FULL_MATCH_DEG = 5;
/** 角度一致: 0点差分 (°) */
const ANGLE_ZERO_MATCH_DEG = 35;
/** 振り返し同調: 満点ラグ上限 (0.1–0.2秒) */
const TRANSITION_FULL_LAG_MS = 200;
/** 振り返し同調: 0点ラグ (ms) */
const TRANSITION_ZERO_LAG_MS = 2000;
/** ヨーレート / 横G の反転検出しきい値（走行中のみ） */
const YAW_TRANSITION_RAD_S = 0.18;
const LATERAL_G_TRANSITION = 0.35;
/** 角度評価: 先行スリップ角の最小しきい値 (°) */
const LEAD_SLIP_MIN_DEG = 8;

/** 採点対象とする最低条件 — エクスポートして UI / テストでも参照 */
export const TSUISO_SCORING_GATES = {
  /** 同期ペア中の最低ドリフトフレーム数 */
  minDriftFrames: 15,
  /** ドリフトフレームの最低カバー率 */
  minDriftCoverage: 0.06,
  /** 先行のピークスリップ角 (°) */
  minLeadPeakSlipDeg: 15,
  /** 後追いのピークスリップ角 (°) */
  minChasePeakSlipDeg: 10,
  /** 採点フレームの最低速度 (km/h) */
  minEvalSpeedKmh: 25,
  /** GPS 軌跡の最低走行距離 (m) — 各車 */
  minPathM: 40,
  /** 先行のピーク横 G */
  minLeadPeakLateralG: 0.45,
} as const;

function syncReadyPoints(log: TelemetryLogPoint[]): TelemetryLogPoint[] {
  return log.filter(
    (p) =>
      p.timestampUtcMs != null
      && Number.isFinite(p.latitude)
      && Number.isFinite(p.longitude),
  );
}

function hasGps(p: TelemetryLogPoint): boolean {
  return Number.isFinite(p.latitude) && Number.isFinite(p.longitude);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function gpsPathLengthM(log: TelemetryLogPoint[]): number {
  const pts = syncReadyPoints(log);
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += distanceMeters(
      { latitude: pts[i - 1].latitude!, longitude: pts[i - 1].longitude! },
      { latitude: pts[i].latitude!, longitude: pts[i].longitude! },
    );
  }
  return total;
}

function peakSlipDuringDrift(log: TelemetryLogPoint[]): number {
  let peak = 0;
  for (const p of log) {
    if (p.driftPhase !== 'active') continue;
    peak = Math.max(peak, Math.abs(p.slipAngleDeg), Math.abs(p.activeSlipAngleDeg));
  }
  return peak;
}

function peakLateralGDuringDrift(log: TelemetryLogPoint[]): number {
  let peak = 0;
  for (const p of log) {
    if (p.driftPhase !== 'active') continue;
    peak = Math.max(peak, Math.abs(p.lateralG), Math.abs(p.activePeakLateralG));
  }
  return peak;
}

function maxDriftCount(log: TelemetryLogPoint[]): number {
  let max = 0;
  for (const p of log) {
    if (p.driftCount > max) max = p.driftCount;
  }
  return max;
}

export type TsuisoValidityResult = {
  valid: boolean;
  reason?: string;
  driftFrameCount: number;
  driftCoverage: number;
};

/** 走行ログ単体の最低品質（Lead / Chase それぞれ） */
export function validateTsuisoRunLog(log: TelemetryLogPoint[], label: string): string | null {
  const pathM = gpsPathLengthM(log);
  if (pathM < TSUISO_SCORING_GATES.minPathM) {
    return `${label}: GPS 走行距離が不足 (${Math.round(pathM)} m / 必要 ${TSUISO_SCORING_GATES.minPathM} m 以上)`;
  }

  const peakSlip = peakSlipDuringDrift(log);
  const minSlip =
    label.toLowerCase().includes('chase') || label.includes('後追')
      ? TSUISO_SCORING_GATES.minChasePeakSlipDeg
      : TSUISO_SCORING_GATES.minLeadPeakSlipDeg;
  if (peakSlip < minSlip) {
    return `${label}: ドリフト角度が不足 (最大 ${peakSlip.toFixed(1)}° / 必要 ${minSlip}° 以上)`;
  }

  if (label.includes('先行') || label.toLowerCase().includes('lead')) {
    const peakG = peakLateralGDuringDrift(log);
    if (peakG < TSUISO_SCORING_GATES.minLeadPeakLateralG) {
      return `${label}: 横 G が不足 — 走行中のドリフトを検知できません`;
    }
  }

  return null;
}

/** 同期ペア全体の採点可否 */
export function validateTsuisoScoringInput(
  leadLog: TelemetryLogPoint[],
  chaseLog: TelemetryLogPoint[],
  pairs: TsuisoAlignedPair[],
  driftPairs: TsuisoAlignedPair[],
): TsuisoValidityResult {
  if (pairs.length < 5) {
    return { valid: false, reason: 'GPS 同期サンプルが不足しています', driftFrameCount: 0, driftCoverage: 0 };
  }

  const leadIssue = validateTsuisoRunLog(leadLog, '先行');
  if (leadIssue) {
    return { valid: false, reason: leadIssue, driftFrameCount: driftPairs.length, driftCoverage: 0 };
  }

  const chaseIssue = validateTsuisoRunLog(chaseLog, '後追い');
  if (chaseIssue) {
    return { valid: false, reason: chaseIssue, driftFrameCount: driftPairs.length, driftCoverage: 0 };
  }

  const driftFrameCount = driftPairs.length;
  const driftCoverage = driftFrameCount / pairs.length;
  if (driftFrameCount < TSUISO_SCORING_GATES.minDriftFrames) {
    return {
      valid: false,
      reason: `ドリフト区間が不足 (${driftFrameCount} fr / 必要 ${TSUISO_SCORING_GATES.minDriftFrames} fr 以上)`,
      driftFrameCount,
      driftCoverage,
    };
  }
  if (driftCoverage < TSUISO_SCORING_GATES.minDriftCoverage) {
    return {
      valid: false,
      reason: '走行の大部分が非ドリフト — 机固定や直進のみの可能性があります',
      driftFrameCount,
      driftCoverage,
    };
  }

  if (maxDriftCount(leadLog) < 1 || maxDriftCount(chaseLog) < 1) {
    return {
      valid: false,
      reason: '両車ともドリフトイベントが検出されていません',
      driftFrameCount,
      driftCoverage,
    };
  }

  return { valid: true, driftFrameCount, driftCoverage };
}

function interpolateLogAtUtc(
  log: TelemetryLogPoint[],
  utcMs: number,
): TelemetryLogPoint | null {
  if (log.length === 0) return null;
  const ready = syncReadyPoints(log);
  if (ready.length === 0) return null;
  if (utcMs <= ready[0].timestampUtcMs!) return ready[0];
  const last = ready[ready.length - 1];
  if (utcMs >= last.timestampUtcMs!) return last;

  for (let i = 0; i < ready.length - 1; i++) {
    const a = ready[i];
    const b = ready[i + 1];
    const ta = a.timestampUtcMs!;
    const tb = b.timestampUtcMs!;
    if (utcMs >= ta && utcMs <= tb) {
      const span = tb - ta;
      const u = span > 0 ? (utcMs - ta) / span : 0;
      const lerp = (x: number, y: number) => x + (y - x) * u;
      return {
        ...a,
        timestampUtcMs: utcMs,
        tMs: lerp(a.tMs, b.tMs),
        latitude: a.latitude != null && b.latitude != null ? lerp(a.latitude, b.latitude) : a.latitude,
        longitude: a.longitude != null && b.longitude != null ? lerp(a.longitude, b.longitude) : a.longitude,
        lateralG: lerp(a.lateralG, b.lateralG),
        longitudinalG: lerp(a.longitudinalG, b.longitudinalG),
        peakG: lerp(a.peakG, b.peakG),
        yawRateRad: lerp(a.yawRateRad, b.yawRateRad),
        slipAngleDeg: lerp(a.slipAngleDeg, b.slipAngleDeg),
        activeSlipAngleDeg: lerp(a.activeSlipAngleDeg, b.activeSlipAngleDeg),
        activeAngleDeg: lerp(a.activeAngleDeg, b.activeAngleDeg),
        activePeakLateralG: lerp(a.activePeakLateralG, b.activePeakLateralG),
        activeDurationMs: lerp(a.activeDurationMs, b.activeDurationMs),
        driftPhase: u > 0.5 ? b.driftPhase : a.driftPhase,
        driftCount: u > 0.5 ? b.driftCount : a.driftCount,
        speedKmh: u > 0.5 ? b.speedKmh : a.speedKmh,
      };
    }
  }

  return last;
}

function isScoringPair(p: TsuisoAlignedPair): boolean {
  const leadSpeed = p.lead.speedKmh ?? 0;
  const chaseSpeed = p.chase.speedKmh ?? 0;
  if (leadSpeed < TSUISO_SCORING_GATES.minEvalSpeedKmh) return false;
  if (chaseSpeed < TSUISO_SCORING_GATES.minEvalSpeedKmh * 0.85) return false;
  if (p.lead.driftPhase !== 'active') return false;
  const leadSlip = Math.max(Math.abs(p.lead.slipAngleDeg), Math.abs(p.lead.activeSlipAngleDeg));
  return leadSlip >= LEAD_SLIP_MIN_DEG;
}

/** 距離 → 0–1 近接度係数 (2m 以内満点) */
export function proximityFrameFactor(distanceM: number): number {
  if (distanceM <= PROXIMITY_FULL_SCORE_M) return 1;
  if (distanceM >= PROXIMITY_ZERO_SCORE_M) return 0;
  const range = PROXIMITY_ZERO_SCORE_M - PROXIMITY_FULL_SCORE_M;
  const t = (distanceM - PROXIMITY_FULL_SCORE_M) / range;
  return clamp(1 - t * t, 0, 1);
}

/** スリップ角差分 → 0–1 角度同調係数 */
export function angleMatchFrameFactor(deltaDeg: number): number {
  const abs = Math.abs(deltaDeg);
  if (abs <= ANGLE_FULL_MATCH_DEG) return 1;
  if (abs >= ANGLE_ZERO_MATCH_DEG) return 0;
  const range = ANGLE_ZERO_MATCH_DEG - ANGLE_FULL_MATCH_DEG;
  const t = (abs - ANGLE_FULL_MATCH_DEG) / range;
  return clamp(1 - t, 0, 1);
}

function transitionSignal(p: TelemetryLogPoint): number {
  if (p.driftPhase !== 'active') return 0;
  if ((p.speedKmh ?? 0) < TSUISO_SCORING_GATES.minEvalSpeedKmh) return 0;
  if (Math.abs(p.yawRateRad) >= YAW_TRANSITION_RAD_S) return p.yawRateRad;
  if (Math.abs(p.lateralG) >= LATERAL_G_TRANSITION) return p.lateralG;
  return 0;
}

/** 横G / ヨーレート符号反転タイミング (UTC ms) — ドリフト走行中のみ */
export function detectTransitionTimesByUtc(log: TelemetryLogPoint[]): number[] {
  const ready = syncReadyPoints(log);
  if (ready.length < 2) return [];
  const times: number[] = [];
  let prevSign = 0;

  for (let i = 1; i < ready.length; i++) {
    const signal = transitionSignal(ready[i]);
    const sign = signal === 0 ? prevSign : Math.sign(signal);
    if (prevSign !== 0 && sign !== 0 && prevSign !== sign) {
      times.push(ready[i].timestampUtcMs!);
    }
    if (sign !== 0) prevSign = sign;
  }

  return times;
}

/** ラグ (ms) → 0–1 振り返し同調係数 (0.1–0.2秒以内満点) */
export function transitionLagFactor(lagMs: number): number {
  if (lagMs <= TRANSITION_FULL_LAG_MS) return 1;
  if (lagMs >= TRANSITION_ZERO_LAG_MS) return 0;
  const range = TRANSITION_ZERO_LAG_MS - TRANSITION_FULL_LAG_MS;
  const t = (lagMs - TRANSITION_FULL_LAG_MS) / range;
  return clamp(1 - t, 0, 1);
}

/** Lead / Chase を GPS UTC 基準で 100ms 刻みに結合 */
export function alignTsuisoRunsByUtc(
  leadLog: TelemetryLogPoint[],
  chaseLog: TelemetryLogPoint[],
): TsuisoAlignedPair[] {
  const lead = syncReadyPoints(leadLog);
  const chase = syncReadyPoints(chaseLog);
  if (lead.length < 2 || chase.length < 2) return [];

  const startUtc = Math.max(lead[0].timestampUtcMs!, chase[0].timestampUtcMs!);
  const endUtc = Math.min(
    lead[lead.length - 1].timestampUtcMs!,
    chase[chase.length - 1].timestampUtcMs!,
  );
  if (endUtc <= startUtc) return [];

  const pairs: TsuisoAlignedPair[] = [];
  for (let t = startUtc; t <= endUtc; t += ALIGN_STEP_MS) {
    const leadSample = interpolateLogAtUtc(lead, t);
    const chaseSample = interpolateLogAtUtc(chase, t);
    if (!leadSample || !chaseSample) continue;
    if (!hasGps(leadSample) || !hasGps(chaseSample)) continue;

    pairs.push({
      timestampUtcMs: t,
      lead: leadSample,
      chase: chaseSample,
      distanceM: distanceMeters(
        { latitude: leadSample.latitude!, longitude: leadSample.longitude! },
        { latitude: chaseSample.latitude!, longitude: chaseSample.longitude! },
      ),
      angleDeltaDeg: chaseSample.slipAngleDeg - leadSample.slipAngleDeg,
    });
  }

  return pairs;
}

function scoreTransitionSync(
  leadLog: TelemetryLogPoint[],
  chaseLog: TelemetryLogPoint[],
): { points: number; avgLagMs: number; pairCount: number } {
  const leadTransitions = detectTransitionTimesByUtc(leadLog);
  const chaseTransitions = detectTransitionTimesByUtc(chaseLog);

  if (leadTransitions.length === 0 || chaseTransitions.length === 0) {
    return { points: 0, avgLagMs: TRANSITION_ZERO_LAG_MS, pairCount: 0 };
  }

  const lags: number[] = [];
  const MATCH_WINDOW_MS = 3000;

  for (const leadT of leadTransitions) {
    let bestLag = MATCH_WINDOW_MS;
    for (const chaseT of chaseTransitions) {
      const lag = Math.abs(chaseT - leadT);
      if (lag < bestLag) bestLag = lag;
    }
    if (bestLag <= MATCH_WINDOW_MS) {
      lags.push(bestLag);
    }
  }

  if (lags.length === 0) {
    return { points: 0, avgLagMs: TRANSITION_ZERO_LAG_MS, pairCount: 0 };
  }

  const avgLagMs = lags.reduce((a, b) => a + b, 0) / lags.length;
  const avgFactor = lags.reduce((s, lag) => s + transitionLagFactor(lag), 0) / lags.length;
  return {
    points: round1(avgFactor * TSUISO_SCORE_MAX.transitionSync),
    avgLagMs,
    pairCount: lags.length,
  };
}

function emptyScore(reason?: string): TsuisoScoreBreakdown {
  return {
    proximity: 0,
    angleMatch: 0,
    transitionSync: 0,
    total: 0,
    grossTotal: 0,
    penaltyTotal: 0,
    penalties: [],
    infractionLoss: false,
    isValid: false,
    invalidReason: reason,
    alignedSampleCount: 0,
    driftFrameCount: 0,
    avgDistanceM: 0,
    avgAngleDeltaDeg: 0,
    avgTransitionLagMs: 0,
    transitionPairCount: 0,
  };
}

/**
 * 2つの TelemetryLog を UTC 絶対時刻で同期し D1/FDJ 基準 100点満点を算出
 */
export function scoreTsuisoTelemetry(
  leadLog: TelemetryLogPoint[],
  chaseLog: TelemetryLogPoint[],
  leadScheduledGoUtcMs?: number,
  chaseScheduledGoUtcMs?: number,
): { score: TsuisoScoreBreakdown; alignedPairs: TsuisoAlignedPair[] } {
  const pairs = alignTsuisoRunsByUtc(leadLog, chaseLog);
  if (pairs.length === 0) {
    return { score: emptyScore('GPS 同期に失敗しました'), alignedPairs: [] };
  }

  const driftPairs = pairs.filter(isScoringPair);
  const validity = validateTsuisoScoringInput(leadLog, chaseLog, pairs, driftPairs);
  if (!validity.valid) {
    return {
      score: {
        ...emptyScore(validity.reason),
        alignedSampleCount: pairs.length,
        driftFrameCount: validity.driftFrameCount,
      },
      alignedPairs: pairs,
    };
  }

  const proximityFactor =
    driftPairs.reduce((s, p) => s + proximityFrameFactor(p.distanceM), 0) / driftPairs.length;
  const proximity = round1(proximityFactor * TSUISO_SCORE_MAX.proximity);

  const angleFactor =
    driftPairs.reduce((s, p) => s + angleMatchFrameFactor(p.angleDeltaDeg), 0) / driftPairs.length;
  const angleMatch = round1(angleFactor * TSUISO_SCORE_MAX.angleMatch);

  const transition = scoreTransitionSync(leadLog, chaseLog);
  const grossTotal = round1(proximity + angleMatch + transition.points);
  const avgDistanceM =
    driftPairs.reduce((s, p) => s + p.distanceM, 0) / driftPairs.length;

  const allPenalties = detectTsuisoPenalties({
    leadLog,
    chaseLog,
    driftPairs,
    avgDistanceM,
    leadScheduledGoUtcMs,
    chaseScheduledGoUtcMs,
  });

  const leadFalseStart = allPenalties.items.find(
    (p) => p.code === 'false_start' && p.role === 'lead',
  );
  if (leadFalseStart) {
    return {
      score: {
        ...emptyScore('先行車フライングスタート — 本走行は無効'),
        proximity,
        angleMatch,
        transitionSync: transition.points,
        grossTotal,
        penalties: allPenalties.items,
        penaltyTotal: grossTotal,
        infractionLoss: true,
        alignedSampleCount: pairs.length,
        driftFrameCount: driftPairs.length,
        avgDistanceM,
        avgAngleDeltaDeg:
          driftPairs.reduce((s, p) => s + Math.abs(p.angleDeltaDeg), 0) / driftPairs.length,
        avgTransitionLagMs: transition.avgLagMs,
        transitionPairCount: transition.pairCount,
      },
      alignedPairs: pairs,
    };
  }

  const chasePenalties = penaltiesForChaseScore(allPenalties);
  const { netTotal, totalDeduction } = applyTsuisoPenalties(grossTotal, chasePenalties);

  return {
    score: {
      proximity,
      angleMatch,
      transitionSync: transition.points,
      total: netTotal,
      grossTotal,
      penaltyTotal: totalDeduction,
      penalties: allPenalties.items,
      infractionLoss: chasePenalties.infractionLoss,
      isValid: true,
      alignedSampleCount: pairs.length,
      driftFrameCount: driftPairs.length,
      avgDistanceM,
      avgAngleDeltaDeg:
        driftPairs.reduce((s, p) => s + Math.abs(p.angleDeltaDeg), 0) / driftPairs.length,
      avgTransitionLagMs: transition.avgLagMs,
      transitionPairCount: transition.pairCount,
    },
    alignedPairs: pairs,
  };
}

export function compareTsuisoRuns(
  lead: TsuisoRunExport,
  chase: TsuisoRunExport,
): TsuisoCompareResult {
  const { score, alignedPairs } = scoreTsuisoTelemetry(
    lead.telemetryLog,
    chase.telemetryLog,
    lead.startedAtUtcMs,
    chase.startedAtUtcMs,
  );
  return { lead, chase, score, alignedPairs };
}

/** ログから地図 Polyline 用座標を抽出 */
export function tsuisoTrackCoords(
  log: TelemetryLogPoint[],
): { latitude: number; longitude: number }[] {
  return syncReadyPoints(log).map((p) => ({
    latitude: p.latitude!,
    longitude: p.longitude!,
  }));
}

/** @deprecated alignTsuisoRunsByUtc を使用 */
export function alignTsuisoRuns(
  leadLog: TelemetryLogPoint[],
  chaseLog: TelemetryLogPoint[],
): TsuisoAlignedPair[] {
  return alignTsuisoRunsByUtc(leadLog, chaseLog);
}

export function proximityPointScore(distanceM: number): number {
  return proximityFrameFactor(distanceM) * 100;
}

export function angleMatchPointScore(deltaDeg: number): number {
  return angleMatchFrameFactor(deltaDeg) * 100;
}

export function transitionLagScore(lagMs: number): number {
  return transitionLagFactor(lagMs) * 100;
}

export function detectTransitionTimes(log: TelemetryLogPoint[]): number[] {
  return detectTransitionTimesByUtc(log);
}

export function detectTransitionTimesByElapsed(log: TelemetryLogPoint[]): number[] {
  return detectTransitionTimesByUtc(log);
}

export function alignTsuisoRunsByElapsed(
  leadLog: TelemetryLogPoint[],
  chaseLog: TelemetryLogPoint[],
): TsuisoAlignedPair[] {
  return alignTsuisoRunsByUtc(leadLog, chaseLog);
}

export function computeTsuisoScoreFromPairs(
  pairs: TsuisoAlignedPair[],
  leadLog: TelemetryLogPoint[],
  chaseLog: TelemetryLogPoint[],
): TsuisoScoreBreakdown {
  void pairs;
  return scoreTsuisoTelemetry(leadLog, chaseLog).score;
}
