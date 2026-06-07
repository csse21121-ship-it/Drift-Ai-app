/**
 * コーナー（スコアリングゾーン）別ベスト記録の更新ロジック
 */

import {
  attributeDriftToCrossingIndex,
  eventOverlapsZoneCrossing,
} from '@/lib/scoring';
export { eventOverlapsZoneCrossing } from '@/lib/scoring';
import type { ScoringZone, ZoneBestRecord } from '@/types/course';
import type { DriftEvent } from '@/types/drift';
import type { SessionResult, ZoneCrossing } from '@/types/score';

/** ドリフトが重なったゾーン ID 一覧 */
export function resolveEventZoneIds(
  event: DriftEvent,
  zoneCrossings: ZoneCrossing[],
  sessionStartedAt: number,
): string[] {
  const ids: string[] = [];
  for (const zc of zoneCrossings) {
    if (eventOverlapsZoneCrossing(event, zc, sessionStartedAt)) {
      if (!ids.includes(zc.zoneId)) ids.push(zc.zoneId);
    }
  }
  return ids;
}

function mergeRecord(
  prev: ZoneBestRecord | undefined,
  angleDeg: number,
  peakG: number,
  points: number,
): { record: ZoneBestRecord; improved: boolean } {
  const next: ZoneBestRecord = {
    bestAngleDeg: Math.max(prev?.bestAngleDeg ?? 0, angleDeg),
    bestPeakG: Math.max(prev?.bestPeakG ?? 0, peakG),
    bestPoints: Math.max(prev?.bestPoints ?? 0, points),
    updatedAt: prev?.updatedAt,
  };

  const improved =
    angleDeg > (prev?.bestAngleDeg ?? 0) ||
    peakG > (prev?.bestPeakG ?? 0) ||
    points > (prev?.bestPoints ?? 0);

  if (improved) {
    next.updatedAt = new Date().toISOString();
  }

  return { record: next, improved };
}

/**
 * セッション結果から各ゾーンのベスト記録をマージする。
 * @returns 更新後 zones と、記録が更新された zoneId 一覧
 */
export function mergeZoneBestRecords(
  zones: ScoringZone[],
  result: SessionResult,
  zoneCrossings: ZoneCrossing[],
): { zones: ScoringZone[]; updatedZoneIds: string[] } {
  if (zoneCrossings.length === 0 || result.events.length === 0) {
    return { zones, updatedZoneIds: [] };
  }

  const zoneById = new Map(zones.map((z) => [z.id, { ...z }]));
  const updatedZoneIds: string[] = [];

  for (let i = 0; i < result.events.length; i++) {
    const event = result.events[i];
    const ds = result.driftScores[i];
    if (!ds) continue;

    const crossingIndex = attributeDriftToCrossingIndex(event, zoneCrossings, result.startedAt);
    if (crossingIndex == null) continue;

    const zoneId = zoneCrossings[crossingIndex].zoneId;
    const zone = zoneById.get(zoneId);
    if (!zone) continue;

    const { record, improved } = mergeRecord(
      zone.bestRecord,
      event.peakSlipAngleDeg,
      event.peakLateralG,
      ds.finalPoints,
    );

    if (improved || !zone.bestRecord) {
      zone.bestRecord = record;
      zoneById.set(zoneId, zone);
      if (improved && !updatedZoneIds.includes(zoneId)) {
        updatedZoneIds.push(zoneId);
      }
    }
  }

  return {
    zones: zones.map((z) => zoneById.get(z.id) ?? z),
    updatedZoneIds,
  };
}

/** ゾーンにベスト記録があるか */
export function hasZoneBestRecord(zone: Pick<ScoringZone, 'bestRecord'>): boolean {
  const r = zone.bestRecord;
  if (!r) return false;
  return r.bestAngleDeg > 0 || r.bestPeakG > 0 || r.bestPoints > 0;
}
