/**
 * ゾーン倍率 × scoreSession × 通過ログ pt 紐付けの検証
 *
 * Usage: npx tsx scripts/test-zone-scoring.ts
 */

import type { DriftEvent } from '../src/types/drift';
import type { ZoneCrossing } from '../src/types/score';
import {
  enrichZoneCrossingsWithScoring,
  finalizeZoneCrossings,
  scoreSession,
} from '../src/lib/scoring';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

const sessionStart = 1_700_000_000_000;
const sessionEnd = sessionStart + 30_000;

const events: DriftEvent[] = [
  {
    id: 'd1',
    startedAt: sessionStart + 2_000,
    durationMs: 1_500,
    peakLateralG: 0.8,
    peakSpeedKmh: 60,
    peakSlipAngleDeg: 25,
    peakAngleDeg: 20,
  },
  {
    id: 'd2',
    startedAt: sessionStart + 8_000,
    durationMs: 2_000,
    peakLateralG: 0.9,
    peakSpeedKmh: 55,
    peakSlipAngleDeg: 30,
    peakAngleDeg: 22,
  },
  {
    id: 'd3',
    startedAt: sessionStart + 20_000,
    durationMs: 1_200,
    peakLateralG: 0.7,
    peakSpeedKmh: 50,
    peakSlipAngleDeg: 18,
    peakAngleDeg: 15,
  },
];

const rawCrossings: ZoneCrossing[] = [
  {
    zoneId: 'z-high',
    zoneName: 'Clip High',
    multiplier: 2.0,
    enteredAtMs: 1_500,
    durationMs: 3_000,
  },
  {
    zoneId: 'z-low',
    zoneName: 'Clip Low',
    multiplier: 1.5,
    enteredAtMs: 7_000,
    durationMs: 4_000,
  },
  {
    zoneId: 'z-high',
    zoneName: 'Clip High',
    multiplier: 2.0,
    enteredAtMs: 19_000,
    // durationMs omitted — STOP 時に確定
  },
];

const finalized = finalizeZoneCrossings(rawCrossings, sessionStart, sessionEnd);
assert(
  finalized[2].durationMs === 11_000,
  'open zone crossing gets duration on finalize',
);

const result = scoreSession(
  events,
  sessionStart,
  sessionEnd - sessionStart,
  65,
  finalized,
);

assert(result.driftScores[0].zoneMultiplier === 2.0, 'drift 1 uses ×2.0 zone');
assert(result.driftScores[1].zoneMultiplier === 1.5, 'drift 2 uses ×1.5 zone');
assert(result.driftScores[2].zoneMultiplier === 2.0, 'drift 3 uses ×2.0 zone');

const enriched = enrichZoneCrossingsWithScoring(result, finalized);
const zonePtSum = enriched.reduce((sum, zc) => sum + (zc.pointsEarned ?? 0), 0);
const zonedDriftPtSum = result.driftScores
  .filter((ds) => (ds.zoneMultiplier ?? 1) > 1)
  .reduce((sum, ds) => sum + ds.finalPoints, 0);

assert(zonePtSum === zonedDriftPtSum, 'zone log pt sum matches zoned drift pt sum');
assert(enriched[0].driftHits === 1 && enriched[0].pointsEarned === result.driftScores[0].finalPoints, 'crossing 0 attributes drift 1');
assert(enriched[1].driftHits === 1 && enriched[1].pointsEarned === result.driftScores[1].finalPoints, 'crossing 1 attributes drift 2');
assert(enriched[2].driftHits === 1 && enriched[2].pointsEarned === result.driftScores[2].finalPoints, 'crossing 2 attributes drift 3');

console.log('\nAll zone scoring checks passed.');
console.log(`Total: ${result.totalPoints} pt · Zone-attributed: ${zonePtSum} pt`);
