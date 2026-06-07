/**
 * circuitMatcher — 既知サーキット DB との照合
 *
 * Phase 3 の中核。スタートピン付近の既知レイアウトを検索し、
 * 指紋（centroid + 全長 + コーナー数）でデータを重複排除する。
 */

import { distanceMeters } from './geofence';
import type { CircuitCandidate, CircuitLayout } from '@/types/competition';
import type { GeoPoint } from '@/types/course';

// ── 静的読み込み（5サーキット） ──
const EBISU_EAST  = require('@/data/circuitPresets/ebisu-east.json')      as CircuitLayout;
const EBISU_SOUTH = require('@/data/circuitPresets/ebisu-south.json')     as CircuitLayout;
const TSUKUBA     = require('@/data/circuitPresets/tsukuba1000.json')     as CircuitLayout;
const TC_CHIBA    = require('@/data/circuitPresets/tc-chiba.json')        as CircuitLayout;
const CENTRAL     = require('@/data/circuitPresets/central-circuit.json') as CircuitLayout;

export const ALL_CIRCUITS: CircuitLayout[] = [
  EBISU_EAST, EBISU_SOUTH, TSUKUBA, TC_CHIBA, CENTRAL,
];

// ────────────────────────────────────────────────────────────────
// 検索
// ────────────────────────────────────────────────────────────────

/**
 * スタートピン付近（radiusM 以内）のサーキット候補を返す。
 * 指紋が重複するレイアウトは距離の近い方だけを残す（dedup）。
 *
 * @param point    スタートピンの座標
 * @param radiusM  検索半径 (m)  デフォルト 500m
 */
export function findNearbyLayouts(
  point:   GeoPoint,
  radiusM: number = 500,
): CircuitCandidate[] {
  // 1. 候補抽出
  const candidates: CircuitCandidate[] = ALL_CIRCUITS
    .map((c) => ({
      ...c,
      distanceM: distanceMeters(point, c.startLine),
    }))
    .filter((c) => c.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);

  // 2. 指紋で重複排除（同一レイアウトは距離が近い方を優先）
  return dedupeByFingerprint(candidates);
}

// ────────────────────────────────────────────────────────────────
// 指紋生成・重複排除
// ────────────────────────────────────────────────────────────────

/**
 * レイアウト指紋 = centroid + 全長 + コーナー数 を正規化したハッシュ文字列。
 * 同一コースの別データが入っても重複表示しない。
 */
function fingerprint(c: CircuitLayout): string {
  // centroid（スタートラインを近似代表）を 2桁精度（≈1.1km）で丸め
  const lat = Math.round(c.startLine.latitude  * 100) / 100;
  const lon = Math.round(c.startLine.longitude * 100) / 100;
  // 全長を 100m 単位、コーナー数をそのまま
  const len = Math.round(c.lengthM / 100);
  return `${lat}_${lon}_${len}_${c.cornerCount}`;
}

function dedupeByFingerprint(sorted: CircuitCandidate[]): CircuitCandidate[] {
  const seen = new Set<string>();
  const out:  CircuitCandidate[] = [];
  for (const c of sorted) {
    const fp = fingerprint(c);
    if (!seen.has(fp)) {
      seen.add(fp);
      out.push(c);
    }
  }
  return out;
}
