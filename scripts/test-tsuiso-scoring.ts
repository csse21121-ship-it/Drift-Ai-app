/**
 * 追走採点ゲートの回帰テスト — 机固定シナリオで高得点にならないこと
 * + 大会減点（スピン・フライング・エンスト）
 */
import { scoreTsuisoTelemetry } from '../src/lib/tsuisoScoring';
import type { TelemetryLogPoint } from '../src/types/score';

function makeStationaryLog(
  baseLat: number,
  baseLng: number,
  startUtc: number,
  durationMs: number,
  slipNoise: number,
): TelemetryLogPoint[] {
  const points: TelemetryLogPoint[] = [];
  for (let t = 0; t <= durationMs; t += 200) {
    const jitter = Math.sin(t / 500) * 0.000003;
    points.push({
      tMs: t,
      timestampUtcMs: startUtc + t,
      latitude: baseLat + jitter,
      longitude: baseLng + jitter * 0.5,
      lateralG: 0.05 + Math.sin(t / 300) * 0.02,
      longitudinalG: 0.01,
      peakG: 0.08,
      yawRateRad: 0.03 + Math.sin(t / 400) * 0.01,
      slipAngleDeg: slipNoise + Math.sin(t / 250) * 2,
      speedKmh: 0.5 + Math.abs(Math.sin(t / 1000)),
      driftPhase: 'idle',
      activeDurationMs: 0,
      activePeakLateralG: 0,
      activeSlipAngleDeg: 0,
      activeAngleDeg: 0,
      driftCount: 0,
    });
  }
  return points;
}

function makeDriftLog(startUtc: number, durationMs: number, latStart: number, lngStart: number): TelemetryLogPoint[] {
  const points: TelemetryLogPoint[] = [];
  for (let t = 0; t <= durationMs; t += 200) {
    const progress = t / durationMs;
    const lat = latStart + progress * 0.0008;
    const lng = lngStart + Math.sin(progress * Math.PI * 2) * 0.0004;
    const inDrift = progress > 0.15 && progress < 0.85;
    const slip = inDrift ? 18 + Math.sin(t / 150) * 8 : 2;
    points.push({
      tMs: t,
      timestampUtcMs: startUtc + t,
      latitude: lat,
      longitude: lng,
      lateralG: inDrift ? 0.55 + Math.sin(t / 200) * 0.15 : 0.08,
      longitudinalG: 0.05,
      peakG: inDrift ? 0.7 : 0.1,
      yawRateRad: inDrift ? 0.35 * Math.sign(Math.sin(t / 400)) : 0.02,
      slipAngleDeg: slip,
      speedKmh: inDrift ? 45 + Math.sin(t / 300) * 5 : 35,
      driftPhase: inDrift ? 'active' : 'idle',
      activeDurationMs: inDrift ? t - 3000 : 0,
      activePeakLateralG: inDrift ? 0.65 : 0,
      activeSlipAngleDeg: inDrift ? slip : 0,
      activeAngleDeg: inDrift ? slip * 0.9 : 0,
      driftCount: inDrift ? 1 : 0,
    });
  }
  return points;
}

function injectChaseSpin(chase: TelemetryLogPoint[]): TelemetryLogPoint[] {
  return chase.map((p) => {
    const t = p.tMs;
    if (t < 8000 || t > 11000) return p;
    return {
      ...p,
      yawRateRad: 3.2,
      slipAngleDeg: 42,
      speedKmh: t > 10000 ? 8 : 38,
      lateralG: 0.4,
    };
  });
}

function injectChaseFalseStart(chase: TelemetryLogPoint[], goUtc: number): TelemetryLogPoint[] {
  return chase.map((p) => {
    if (p.timestampUtcMs == null || p.timestampUtcMs > goUtc - 2000) return p;
    return {
      ...p,
      speedKmh: 18,
      lateralG: 0.25,
    };
  });
}

function injectChaseStall(chase: TelemetryLogPoint[]): TelemetryLogPoint[] {
  return chase.map((p) => {
    if (p.tMs < 12000 || p.tMs > 16000) return p;
    return {
      ...p,
      speedKmh: 1.5,
      lateralG: 0.05,
      slipAngleDeg: 2,
      driftPhase: 'idle' as const,
    };
  });
}

const start = Date.now();

const stationaryLead = makeStationaryLog(35.6762, 139.6503, start, 20_000, 3);
const stationaryChase = makeStationaryLog(35.6762005, 139.6503005, start + 50, 20_000, 3.2);

const deskScore = scoreTsuisoTelemetry(stationaryLead, stationaryChase);
console.log('--- 机固定シナリオ ---');
console.log('valid:', deskScore.score.isValid);
console.log('total:', deskScore.score.total);
console.log('reason:', deskScore.score.invalidReason);
console.log('proximity:', deskScore.score.proximity, 'angle:', deskScore.score.angleMatch);

if (deskScore.score.isValid || deskScore.score.total > 5) {
  console.error('FAIL: 机固定で採点される / 高得点');
  process.exit(1);
}

const driftLead = makeDriftLog(start, 25_000, 35.6762, 139.6503);
const driftChase = makeDriftLog(start + 80, 25_000, 35.67625, 139.65035);

const driftScore = scoreTsuisoTelemetry(driftLead, driftChase);
console.log('\n--- ドリフト走行シナリオ ---');
console.log('valid:', driftScore.score.isValid);
console.log('total:', driftScore.score.total);
console.log('gross:', driftScore.score.grossTotal);
console.log('penalties:', driftScore.score.penalties.length);
console.log('breakdown:', driftScore.score.proximity, driftScore.score.angleMatch, driftScore.score.transitionSync);
console.log('drift frames:', driftScore.score.driftFrameCount);

if (!driftScore.score.isValid) {
  console.error('FAIL: 実ドリフトログが invalid:', driftScore.score.invalidReason);
  process.exit(1);
}

if (driftScore.score.total <= 10) {
  console.error('FAIL: ドリフト走行の得点が低すぎる');
  process.exit(1);
}

const spinChase = injectChaseSpin(driftChase);
const spinScore = scoreTsuisoTelemetry(driftLead, spinChase, start, start + 80);
console.log('\n--- 後追いスピン ---');
console.log('total:', spinScore.score.total, 'gross:', spinScore.score.grossTotal);
console.log('penalties:', spinScore.score.penalties.map((p) => p.code).join(', '));
console.log('infraction:', spinScore.score.infractionLoss);

if (!spinScore.score.infractionLoss || spinScore.score.total !== 0) {
  console.error('FAIL: スピンで反則 0 点にならない');
  process.exit(1);
}

const goUtc = start + 5000;
const fsChase = injectChaseFalseStart(driftChase, goUtc);
const fsScore = scoreTsuisoTelemetry(driftLead, fsChase, goUtc, goUtc);
console.log('\n--- 後追いフライング ---');
console.log('total:', fsScore.score.total);
console.log('penalties:', fsScore.score.penalties.map((p) => `${p.code}(${p.role})`).join(', '));

if (!fsScore.score.penalties.some((p) => p.code === 'false_start' && p.role === 'chase')) {
  console.error('FAIL: フライング未検知');
  process.exit(1);
}
if (fsScore.score.total !== 0) {
  console.error('FAIL: フライング後追いが 0 点にならない');
  process.exit(1);
}

const stallChase = injectChaseStall(driftChase);
const stallScore = scoreTsuisoTelemetry(driftLead, stallChase, start, start + 80);
console.log('\n--- 後追いエンスト ---');
console.log('total:', stallScore.score.total);
console.log('penalties:', stallScore.score.penalties.map((p) => p.code).join(', '));

if (!stallScore.score.penalties.some((p) => p.code === 'engine_stall')) {
  console.error('FAIL: エンスト未検知');
  process.exit(1);
}
if (stallScore.score.total !== 0) {
  console.error('FAIL: エンストで 0 点にならない');
  process.exit(1);
}

console.log('\nOK: 追走採点ゲート + 大会減点');
