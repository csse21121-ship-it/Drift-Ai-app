/**
 * 追走（Tsuiso）減点検知 — D1GP / FDJ 大会基準
 */

import { distanceMeters } from '@/lib/geofence';
import { TSUISO_PENALTY_RULES, TSUISO_MAX_TOTAL_DEDUCTION } from '@/data/tsuisoPenaltyRules';
import type { TelemetryLogPoint, TsuisoAlignedPair } from '@/types/score';
import type { TsuisoPenaltyItem, TsuisoPenaltySummary } from '@/types/tsuisoPenalty';

const FALSE_START_GRACE_MS = 400;
const MOTION_SPEED_KMH = 12;
const MOTION_LATERAL_G = 0.18;
const STALL_SPEED_KMH = 3;
const STALL_MIN_MS = 2500;
const HAD_SPEED_KMH = 22;
const SPIN_WINDOW_MS = 2500;
const SPIN_FULL_DEG = 280;
const SPIN_HALF_DEG = 150;
const OFF_COURSE_DIST_M = 22;
const OFF_COURSE_SUSTAIN_MS = 1800;
const NO_GOOD_AVG_DIST_M = 14;
const INITIATION_SLIP_DEG = 8;
const OVERTAKE_SPEED_GAP_KMH = 8;

function gpsReady(log: TelemetryLogPoint[]): TelemetryLogPoint[] {
  return log.filter(
    (p) =>
      p.timestampUtcMs != null
      && Number.isFinite(p.latitude)
      && Number.isFinite(p.longitude),
  );
}

function firstMotionUtc(log: TelemetryLogPoint[]): number | null {
  for (const p of gpsReady(log)) {
    if ((p.speedKmh ?? 0) >= MOTION_SPEED_KMH || Math.abs(p.lateralG) >= MOTION_LATERAL_G) {
      return p.timestampUtcMs!;
    }
  }
  return null;
}

function firstLeadInitiationUtc(leadLog: TelemetryLogPoint[]): number | null {
  for (const p of gpsReady(leadLog)) {
    const slip = Math.max(Math.abs(p.slipAngleDeg), Math.abs(p.activeSlipAngleDeg));
    if (slip >= INITIATION_SLIP_DEG && (p.speedKmh ?? 0) >= 15) {
      return p.timestampUtcMs!;
    }
    if (p.driftPhase === 'active' && (p.speedKmh ?? 0) >= 15) {
      return p.timestampUtcMs!;
    }
  }
  return null;
}

/** GO 前の出足 — フライングスタート */
export function detectFalseStart(
  log: TelemetryLogPoint[],
  scheduledGoUtcMs: number,
): TsuisoPenaltyItem | null {
  const motionAt = firstMotionUtc(log);
  if (motionAt == null) return null;
  if (motionAt >= scheduledGoUtcMs - FALSE_START_GRACE_MS) return null;

  const rule = TSUISO_PENALTY_RULES.false_start;
  return {
    code: 'false_start',
    labelJa: rule.labelJa,
    deduction: rule.deduction,
    role: 'pair',
    atUtcMs: motionAt,
    detail: `GO より ${Math.round((scheduledGoUtcMs - motionAt) / 100) / 10}s 早い出足`,
    infractionLoss: rule.infractionLoss,
  };
}

/** 初動スイング前に後追いが先行側へ — D1 フライング / 先行超え */
export function detectEarlyOvertake(
  leadLog: TelemetryLogPoint[],
  chaseLog: TelemetryLogPoint[],
): TsuisoPenaltyItem | null {
  const initiationUtc = firstLeadInitiationUtc(leadLog);
  if (initiationUtc == null) return null;

  const leadReady = gpsReady(leadLog);
  const chaseReady = gpsReady(chaseLog);
  if (leadReady.length < 2 || chaseReady.length < 0) return null;

  const windowEnd = initiationUtc;
  const windowStart = initiationUtc - 6000;

  for (const cp of chaseReady) {
    const t = cp.timestampUtcMs!;
    if (t < windowStart || t > windowEnd) continue;
    if ((cp.speedKmh ?? 0) < MOTION_SPEED_KMH) continue;

    const leadAt = leadReady.find(
      (lp) => Math.abs(lp.timestampUtcMs! - t) < 250,
    );
    if (!leadAt) continue;

    const leadSlip = Math.max(Math.abs(leadAt.slipAngleDeg), Math.abs(leadAt.activeSlipAngleDeg));
    if (leadSlip >= INITIATION_SLIP_DEG) continue;

    const chaseSpeed = cp.speedKmh ?? 0;
    const leadSpeed = leadAt.speedKmh ?? 0;
    if (chaseSpeed < leadSpeed + OVERTAKE_SPEED_GAP_KMH) continue;

    const dist = distanceMeters(
      { latitude: leadAt.latitude!, longitude: leadAt.longitude! },
      { latitude: cp.latitude!, longitude: cp.longitude! },
    );
    if (dist > 8) continue;

    const rule = TSUISO_PENALTY_RULES.early_overtake;
    return {
      code: 'early_overtake',
      labelJa: rule.labelJa,
      deduction: rule.deduction,
      role: 'chase',
      atUtcMs: t,
      detail: '先行の初動前に後追いが前側へ — 大会反則',
      infractionLoss: rule.infractionLoss,
    };
  }

  return null;
}

function integratedYawDeg(samples: TelemetryLogPoint[]): number {
  if (samples.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].timestampUtcMs! - samples[i - 1].timestampUtcMs!) / 1000;
    if (dt <= 0 || dt > 0.5) continue;
    total += Math.abs(samples[i].yawRateRad) * dt * (180 / Math.PI);
  }
  return total;
}

/** スピン / ハーフスピン検知 */
export function detectSpinPenalties(log: TelemetryLogPoint[], role: 'lead' | 'chase'): TsuisoPenaltyItem[] {
  const ready = gpsReady(log);
  const items: TsuisoPenaltyItem[] = [];
  let halfCount = 0;

  for (let i = 0; i < ready.length; i++) {
    const start = ready[i].timestampUtcMs!;
    const window = ready.filter(
      (p) => p.timestampUtcMs! >= start && p.timestampUtcMs! <= start + SPIN_WINDOW_MS,
    );
    if (window.length < 4) continue;

    const rotationDeg = integratedYawDeg(window);
    const peakSlip = Math.max(...window.map((p) => Math.abs(p.slipAngleDeg)));
    const speeds = window.map((p) => p.speedKmh ?? 0);
    const maxSpeed = Math.max(...speeds);
    const endSpeed = speeds[speeds.length - 1];
    const speedCollapse = maxSpeed > 25 && endSpeed < 12;

    if (rotationDeg >= SPIN_FULL_DEG || (peakSlip > 35 && speedCollapse)) {
      const rule = TSUISO_PENALTY_RULES.spin;
      items.push({
        code: 'spin',
        labelJa: rule.labelJa,
        deduction: rule.deduction,
        role,
        atUtcMs: start,
        detail: `旋回 ${Math.round(rotationDeg)}°`,
        infractionLoss: rule.infractionLoss,
      });
      break;
    }

    if (
      rotationDeg >= SPIN_HALF_DEG
      || (peakSlip > 22 && speedCollapse && rotationDeg >= 100)
    ) {
      if (halfCount >= TSUISO_PENALTY_RULES.half_spin.maxCount) continue;
      halfCount++;
      const rule = TSUISO_PENALTY_RULES.half_spin;
      items.push({
        code: 'half_spin',
        labelJa: rule.labelJa,
        deduction: rule.deduction,
        role,
        atUtcMs: start,
        detail: `旋回 ${Math.round(rotationDeg)}°`,
        infractionLoss: rule.infractionLoss,
      });
    }
  }

  return items;
}

/** エンスト — 走行中に長時間停止 */
export function detectEngineStall(
  log: TelemetryLogPoint[],
  role: 'lead' | 'chase',
): TsuisoPenaltyItem | null {
  const ready = gpsReady(log);
  let hadSpeed = false;
  let slowStart: number | null = null;

  for (const p of ready) {
    const speed = p.speedKmh ?? 0;
    if (speed >= HAD_SPEED_KMH) hadSpeed = true;
    if (!hadSpeed) continue;

    if (speed <= STALL_SPEED_KMH) {
      if (slowStart == null) slowStart = p.timestampUtcMs!;
      else if (p.timestampUtcMs! - slowStart >= STALL_MIN_MS) {
        const rule = TSUISO_PENALTY_RULES.engine_stall;
        return {
          code: 'engine_stall',
          labelJa: rule.labelJa,
          deduction: rule.deduction,
          role,
          atUtcMs: slowStart,
          detail: `${Math.round(STALL_MIN_MS / 100) / 10}s 以上 ${STALL_SPEED_KMH} km/h 未満`,
          infractionLoss: rule.infractionLoss,
        };
      }
    } else {
      slowStart = null;
    }
  }

  return null;
}

/** コース外 — 後追いが先行から大きく離れた状態が継続 */
export function detectOffCoursePenalties(
  driftPairs: TsuisoAlignedPair[],
): TsuisoPenaltyItem[] {
  const items: TsuisoPenaltyItem[] = [];
  let offStart: number | null = null;
  let offCount = 0;

  for (const p of driftPairs) {
    if (p.distanceM >= OFF_COURSE_DIST_M) {
      if (offStart == null) offStart = p.timestampUtcMs;
      else if (
        p.timestampUtcMs - offStart >= OFF_COURSE_SUSTAIN_MS
        && offCount < TSUISO_PENALTY_RULES.off_course.maxCount
      ) {
        offCount++;
        const rule = TSUISO_PENALTY_RULES.off_course;
        items.push({
          code: 'off_course',
          labelJa: rule.labelJa,
          deduction: rule.deduction,
          role: 'chase',
          atUtcMs: offStart,
          detail: `平均距離 ${p.distanceM.toFixed(0)} m 超 — コース外`,
          infractionLoss: rule.infractionLoss,
        });
        offStart = null;
      }
    } else {
      offStart = null;
    }
  }

  return items;
}

/** ノーグッド — 接近点が取れないほど離れた走行 (D1: -2 → 100点換算 -10) */
export function detectNoGoodPenalty(avgDistanceM: number): TsuisoPenaltyItem | null {
  if (avgDistanceM < NO_GOOD_AVG_DIST_M) return null;
  const rule = TSUISO_PENALTY_RULES.no_good;
  return {
    code: 'no_good',
    labelJa: rule.labelJa,
    deduction: rule.deduction,
    role: 'chase',
    detail: `平均距離 ${avgDistanceM.toFixed(1)} m — 先行者に接近できず`,
    infractionLoss: rule.infractionLoss,
  };
}

/** アンダー / バランス喪失 — 後追いのスリップ角が急落 */
export function detectUndersteerPenalties(chaseLog: TelemetryLogPoint[]): TsuisoPenaltyItem[] {
  const ready = gpsReady(chaseLog);
  const items: TsuisoPenaltyItem[] = [];
  let count = 0;

  for (let i = 2; i < ready.length; i++) {
    const prev = ready[i - 2];
    const cur = ready[i];
    const dt = cur.timestampUtcMs! - prev.timestampUtcMs!;
    if (dt > 1200 || dt < 400) continue;

    const prevSlip = Math.abs(prev.slipAngleDeg);
    const curSlip = Math.abs(cur.slipAngleDeg);
    const leadLike = prevSlip >= 12 && curSlip <= 4;
    const stillMoving = (cur.speedKmh ?? 0) >= 20 && Math.abs(cur.lateralG) >= 0.25;

    if (leadLike && stillMoving && count < TSUISO_PENALTY_RULES.understeer.maxCount) {
      count++;
      const rule = TSUISO_PENALTY_RULES.understeer;
      items.push({
        code: 'understeer',
        labelJa: rule.labelJa,
        deduction: rule.deduction,
        role: 'chase',
        atUtcMs: cur.timestampUtcMs,
        detail: `スリップ ${prevSlip.toFixed(0)}° → ${curSlip.toFixed(0)}°`,
        infractionLoss: rule.infractionLoss,
      });
    }
  }

  return items;
}

export type DetectTsuisoPenaltiesInput = {
  leadLog: TelemetryLogPoint[];
  chaseLog: TelemetryLogPoint[];
  driftPairs: TsuisoAlignedPair[];
  avgDistanceM: number;
  leadScheduledGoUtcMs?: number;
  chaseScheduledGoUtcMs?: number;
};

/** 追走ペアから減点一覧を検出 */
export function detectTsuisoPenalties(input: DetectTsuisoPenaltiesInput): TsuisoPenaltySummary {
  const items: TsuisoPenaltyItem[] = [];

  const leadGo = input.leadScheduledGoUtcMs ?? input.leadLog[0]?.timestampUtcMs;
  const chaseGo = input.chaseScheduledGoUtcMs ?? input.chaseLog[0]?.timestampUtcMs;

  if (leadGo != null) {
    const fs = detectFalseStart(input.leadLog, leadGo);
    if (fs) items.push({ ...fs, role: 'lead' });
  }
  if (chaseGo != null) {
    const fs = detectFalseStart(input.chaseLog, chaseGo);
    if (fs) items.push({ ...fs, role: 'chase' });
  }

  const overtake = detectEarlyOvertake(input.leadLog, input.chaseLog);
  if (overtake) items.push(overtake);

  items.push(...detectSpinPenalties(input.leadLog, 'lead'));
  items.push(...detectSpinPenalties(input.chaseLog, 'chase'));

  const leadStall = detectEngineStall(input.leadLog, 'lead');
  if (leadStall) {
    items.push({
      ...leadStall,
      code: 'lead_stall',
      labelJa: TSUISO_PENALTY_RULES.lead_stall.labelJa,
      deduction: TSUISO_PENALTY_RULES.lead_stall.deduction,
      infractionLoss: TSUISO_PENALTY_RULES.lead_stall.infractionLoss,
    });
  }

  const chaseStall = detectEngineStall(input.chaseLog, 'chase');
  if (chaseStall) items.push(chaseStall);

  items.push(...detectOffCoursePenalties(input.driftPairs));

  const noGood = detectNoGoodPenalty(input.avgDistanceM);
  if (noGood) items.push(noGood);

  items.push(...detectUndersteerPenalties(input.chaseLog));

  const infractionLoss = items.some((p) => p.infractionLoss);
  const totalDeduction = Math.min(
    TSUISO_MAX_TOTAL_DEDUCTION,
    items.reduce((s, p) => s + p.deduction, 0),
  );

  return { items, totalDeduction, infractionLoss };
}

/** 減点適用後の総合点（0–100） */
export function applyTsuisoPenalties(
  grossTotal: number,
  penalties: TsuisoPenaltySummary,
): { netTotal: number; totalDeduction: number } {
  if (penalties.infractionLoss) {
    return { netTotal: 0, totalDeduction: grossTotal };
  }
  const totalDeduction = Math.min(grossTotal, penalties.totalDeduction);
  return {
    netTotal: Math.max(0, round1(grossTotal - totalDeduction)),
    totalDeduction,
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** 後追い走行の減点のみ合計（セット勝敗用） */
export function penaltiesForChaseScore(all: TsuisoPenaltySummary): TsuisoPenaltySummary {
  const items = all.items.filter(
    (p) =>
      p.role === 'chase'
      || p.code === 'early_overtake'
      || p.code === 'off_course'
      || p.code === 'no_good'
      || p.code === 'understeer',
  );
  const infractionLoss = items.some((p) => p.infractionLoss);
  const totalDeduction = Math.min(
    TSUISO_MAX_TOTAL_DEDUCTION,
    items.reduce((s, p) => s + p.deduction, 0),
  );
  return { items, totalDeduction, infractionLoss };
}

/** @deprecated penaltiesForChaseScore を使用 */
export function chasePenaltyDeduction(penalties: TsuisoPenaltySummary): number {
  return penaltiesForChaseScore(penalties).totalDeduction;
}
