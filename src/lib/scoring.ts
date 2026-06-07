/**
 * DriftScore AI — スコアリングロジック
 *
 * 【スコア計算式】
 *
 *   base       = floor(durationSec × peakLateralG × gradientComp × 100 × speedBonus)
 *
 *   speedBonus = 1.0 + clamp(peakSpeedKmh / speedReferenceKmh, 0, 1.0)
 *     → speedReferenceKmh 以上で最大 2.0×（コース別に設定）
 *
 *   angleBonus = 1.0 + clamp((peakSlipAngleDeg − 5) / angleScaleDeg, 0, 0.5)
 *     → angleScaleDeg でボーナスが飽和（コース別に設定）
 *
 *   zoneMultiplier = ゾーン設定値 (1.0〜)
 *
 *   finalPoints = floor(base × angleBonus × comboMultiplier × zoneMultiplier)
 *
 * 【コンボシステム】
 *   直前のドリフト終了から comboWindowMs 以内に次のドリフトが始まると
 *   combo が +1 (最大 COMBO_MAX)
 *   comboMultiplier = 1.0 + (combo - 1) × 0.5
 *     → ×1=1.0, ×2=1.5, ×3=2.0, ×4=2.5, ×5=3.0
 *
 * 【グレード】（gradeDifficulty により異なる）
 *   easy   : S≥4000 / A≥2500 / B≥1200 / C≥400
 *   normal : S≥8000 / A≥5000 / B≥2500 / C≥800  (デフォルト)
 *   hard   : S≥12000 / A≥8000 / B≥4000 / C≥1500
 *   pro    : S≥20000 / A≥13000 / B≥7000 / C≥3000
 */

import { DEFAULT_SCORING_PROFILE } from '@/types/course';
import type { ScoringProfile } from '@/types/course';
import type { DriftEvent } from '@/types/drift';
import type { DriftScore, Grade, SessionResult, ZoneCrossing } from '@/types/score';

const COMBO_MAX = 5;

/** スリップアングルボーナスのノイズフロア (°) */
const ANGLE_NOISE_FLOOR = 5;
/** ボーナスの最大加算値 → angleBonus 最大 1.50 */
const ANGLE_MAX_BONUS   = 0.5;

// ── グレードしきい値テーブル ──────────────────────────────────

const GRADE_TABLE: Record<ScoringProfile['gradeDifficulty'],
  { min: number; grade: Grade }[]> = {
  easy: [
    { min: 4000, grade: 'S' },
    { min: 2500, grade: 'A' },
    { min: 1200, grade: 'B' },
    { min: 400,  grade: 'C' },
    { min: 0,    grade: 'D' },
  ],
  normal: [
    { min: 8000, grade: 'S' },
    { min: 5000, grade: 'A' },
    { min: 2500, grade: 'B' },
    { min: 800,  grade: 'C' },
    { min: 0,    grade: 'D' },
  ],
  hard: [
    { min: 12000, grade: 'S' },
    { min: 8000,  grade: 'A' },
    { min: 4000,  grade: 'B' },
    { min: 1500,  grade: 'C' },
    { min: 0,     grade: 'D' },
  ],
  pro: [
    { min: 20000, grade: 'S' },
    { min: 13000, grade: 'A' },
    { min: 7000,  grade: 'B' },
    { min: 3000,  grade: 'C' },
    { min: 0,     grade: 'D' },
  ],
};

// ── 計算関数 ────────────────────────────────────────────────

/**
 * スリップアングルボーナス倍率。
 * @param slipDeg ピークスリップアングル (°)
 * @param scaleDeg 飽和角度 (°) — コース別: デフォルト 90
 */
export function calcAngleBonus(slipDeg: number, scaleDeg = 90): number {
  const eff = Math.max(0, slipDeg - ANGLE_NOISE_FLOOR);
  return 1.0 + Math.min(eff / scaleDeg, ANGLE_MAX_BONUS);
}

/**
 * 1イベントのベーススコア。
 * speedBonus・傾斜補正を含む。angleBonus と comboMultiplier は外で乗算する。
 */
export function calcBasePoints(
  event: DriftEvent,
  speedReferenceKmh = 80,
  gradientCompensation = 1.0,
): number {
  const durationSec = event.durationMs / 1000;
  const speedBonus  = 1 + Math.min(event.peakSpeedKmh / speedReferenceKmh, 1.0);
  return Math.floor(
    durationSec * event.peakLateralG * gradientCompensation * 100 * speedBonus,
  );
}

/**
 * イベント列からコンボ数の配列を生成する。
 * @param comboWindowMs コンボ有効時間 (ms)
 */
export function buildCombos(events: DriftEvent[], comboWindowMs = 3000): number[] {
  if (events.length === 0) return [];
  const combos: number[] = [1];
  let current = 1;
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const gap  = events[i].startedAt - (prev.startedAt + prev.durationMs);
    current    = gap <= comboWindowMs ? Math.min(current + 1, COMBO_MAX) : 1;
    combos.push(current);
  }
  return combos;
}

/** コンボ数 → 倍率 */
export function comboMultiplier(combo: number): number {
  return 1.0 + (combo - 1) * 0.5;
}

function crossingEndMs(
  crossing: ZoneCrossing,
  sessionStartedAt: number,
  fallbackEventEndMs: number,
): number {
  const zcStart = sessionStartedAt + crossing.enteredAtMs;
  return crossing.durationMs != null
    ? zcStart + crossing.durationMs
    : fallbackEventEndMs + 1;
}

/** ドリフトイベントがゾーン通過ログと時間的に重なるか */
export function eventOverlapsZoneCrossing(
  event: DriftEvent,
  crossing: ZoneCrossing,
  sessionStartedAt: number,
): boolean {
  const evtStart = event.startedAt;
  const evtEnd = event.startedAt + event.durationMs;
  const zcStart = sessionStartedAt + crossing.enteredAtMs;
  const zcEnd = crossingEndMs(crossing, sessionStartedAt, evtEnd);
  return evtStart < zcEnd && evtEnd > zcStart;
}

/**
 * STOP 時 — 退出未記録のゾーン滞在に滞在時間を付与する。
 */
export function finalizeZoneCrossings(
  crossings: ZoneCrossing[],
  sessionStartedAt: number,
  sessionEndedAt: number,
): ZoneCrossing[] {
  const sessionDurationMs = sessionEndedAt - sessionStartedAt;
  return crossings.map((crossing) => {
    if (crossing.durationMs != null) return crossing;
    return {
      ...crossing,
      durationMs: Math.max(0, sessionDurationMs - crossing.enteredAtMs),
    };
  });
}

/**
 * scoreSession 後 — 各ゾーン滞在に獲得 pt / ドリフト本数を紐付ける。
 * resolveZoneMultiplier と同じ最大倍率ルールで1イベント1滞在に帰属。
 */
export function enrichZoneCrossingsWithScoring(
  result: Pick<SessionResult, 'events' | 'driftScores' | 'startedAt'>,
  crossings: ZoneCrossing[],
): ZoneCrossing[] {
  const points = crossings.map(() => 0);
  const hits = crossings.map(() => 0);

  for (let i = 0; i < result.events.length; i++) {
    const ds = result.driftScores[i];
    if (!ds) continue;
    const idx = attributeDriftToCrossingIndex(result.events[i], crossings, result.startedAt);
    if (idx == null) continue;
    points[idx] += ds.finalPoints;
    hits[idx] += 1;
  }

  return crossings.map((crossing, i) => ({
    ...crossing,
    pointsEarned: points[i] > 0 ? points[i] : undefined,
    driftHits: hits[i] > 0 ? hits[i] : undefined,
  }));
}

/** ドリフト1本を scoreSession と同じルールでゾーン滞在インデックスに帰属 */
export function attributeDriftToCrossingIndex(
  event: DriftEvent,
  crossings: ZoneCrossing[],
  sessionStartedAt: number,
): number | null {
  const zoneMult = resolveZoneMultiplier(event, crossings, sessionStartedAt);
  if (zoneMult <= 1.0) return null;

  let bestIndex: number | null = null;
  let bestEnteredAt = -1;
  for (let i = 0; i < crossings.length; i++) {
    const crossing = crossings[i];
    if (crossing.multiplier !== zoneMult) continue;
    if (!eventOverlapsZoneCrossing(event, crossing, sessionStartedAt)) continue;
    if (crossing.enteredAtMs >= bestEnteredAt) {
      bestEnteredAt = crossing.enteredAtMs;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/** ポイントとグレード難易度からグレードを返す */
export function resolveGrade(
  points: number,
  difficulty: ScoringProfile['gradeDifficulty'] = 'normal',
): Grade {
  return GRADE_TABLE[difficulty].find((t) => points >= t.min)?.grade ?? 'D';
}

/**
 * ドリフトイベントの発生時間帯と重複するゾーンの倍率を返す。
 *
 * - ZoneCrossing.enteredAtMs はセッション開始からの相対 ms
 * - DriftEvent.startedAt    は Date.now() の絶対時刻
 * - 複数ゾーン重複時は最大値を採用
 */
export function resolveZoneMultiplier(
  event: DriftEvent,
  zoneCrossings: ZoneCrossing[],
  sessionStartedAt: number,
): number {
  let best = 1.0;
  for (const zc of zoneCrossings) {
    if (eventOverlapsZoneCrossing(event, zc, sessionStartedAt)) {
      best = Math.max(best, zc.multiplier);
    }
  }
  return best;
}

/**
 * セッション全体を採点し SessionResult を生成する。
 *
 * @param events            ドリフトイベント一覧
 * @param startedAt         セッション開始時刻 (Date.now())
 * @param sessionDurationMs セッション時間
 * @param maxSpeedKmh       最高速度 (km/h)
 * @param zoneCrossings     ゾーン通過ログ（省略時はゾーン倍率なし）
 * @param profile           コース別スコアリングプロファイル（省略時はデフォルト）
 */
export function scoreSession(
  events: DriftEvent[],
  startedAt: number,
  sessionDurationMs: number,
  maxSpeedKmh: number,
  zoneCrossings?: ZoneCrossing[],
  profile?: ScoringProfile,
): SessionResult {
  const p      = profile ?? DEFAULT_SCORING_PROFILE;
  const combos = buildCombos(events, p.comboWindowMs);

  const driftScores: DriftScore[] = events.map((event, i) => {
    const base  = calcBasePoints(event, p.speedReferenceKmh, p.gradientCompensation);
    const angle = calcAngleBonus(event.peakSlipAngleDeg, p.angleScaleDeg);
    const c     = combos[i];
    const zone  = (zoneCrossings && zoneCrossings.length > 0)
      ? resolveZoneMultiplier(event, zoneCrossings, startedAt)
      : 1.0;
    return {
      eventId:       event.id,
      basePoints:    base,
      combo:         c,
      angleBonus:    angle,
      zoneMultiplier: zone > 1.0 ? zone : undefined,
      finalPoints:   Math.floor(base * angle * comboMultiplier(c) * zone),
    };
  });

  const totalPoints         = driftScores.reduce((sum, d) => sum + d.finalPoints, 0);
  const maxLateralG         = events.reduce((m, e) => Math.max(m, e.peakLateralG), 0);
  const bestDriftDurationMs = events.reduce((m, e) => Math.max(m, e.durationMs), 0);

  return {
    startedAt,
    sessionDurationMs,
    totalPoints,
    grade: resolveGrade(totalPoints, p.gradeDifficulty),
    driftScores,
    events,
    maxSpeedKmh,
    maxLateralG,
    bestDriftDurationMs,
  };
}

// ── リアルタイムスコア計算 ────────────────────────────────────

/** セッション中にリアルタイムで表示するスコア情報 */
export type LiveScore = {
  /** 完了済みドリフトイベントの合計ポイント（ゾーン倍率込み） */
  totalPoints: number;
  /** 現在のコンボ数（最後のイベント時点。1 = コンボなし） */
  currentCombo: number;
  /** アクティブドリフト完了時に適用される見込みコンボ */
  previewCombo: number;
  /** UI 表示用コンボ（ドリフト中は previewCombo、それ以外は currentCombo） */
  displayCombo: number;
  /** アクティブドリフト中の推定加算ポイント（idle 時は 0） */
  previewPoints: number;
  /** totalPoints + previewPoints */
  liveTotal: number;
  /** 0〜100 点満点換算（プロファイル難易度に基づく） */
  evalScore: number;
  /** 現在ゾーン倍率（プレビュー計算に使用中） */
  activeZoneMultiplier: number;
  /** 完了済みドリフトイベント数 */
  totalDrifts: number;
};

/** アクティブドリフトに適用される見込みコンボ数 */
export function projectPreviewCombo(
  events: DriftEvent[],
  activePhase: boolean,
  comboWindowMs: number,
  nowMs = Date.now(),
): number {
  if (!activePhase) return 1;
  if (events.length === 0) return 1;

  const combos = buildCombos(events, comboWindowMs);
  const last = events[events.length - 1];
  const gap = nowMs - (last.startedAt + last.durationMs);
  if (gap <= comboWindowMs) {
    return Math.min(combos[combos.length - 1] + 1, COMBO_MAX);
  }
  return 1;
}

/**
 * セッション中に呼び出し続け、リアルタイム表示するためのスコア計算。
 * scoreSession とは独立しており、永続化には使わない。
 */
export function calcLiveScore(
  events: DriftEvent[],
  activePhase: boolean,
  activeDurationMs: number,
  activePeakLateralG: number,
  activeSpeedKmh: number,
  activeSlipAngleDeg: number,
  /** アクティブゾーン倍率（現在ゾーン内なら > 1.0、プレビュー計算用） */
  activeZoneMultiplier?: number,
  /** 完了済みイベントのゾーン倍率解決に使う */
  zoneCrossings?: ZoneCrossing[],
  /** セッション開始時刻 Date.now()（zoneCrossings と同時に必要） */
  sessionStartedAt?: number,
  /** コース別スコアリングプロファイル */
  profile?: ScoringProfile,
  /** 指定時は Date.now() ベースでドリフト継続時間を算出（リアルタイム更新用） */
  activeStartedAt?: number,
  nowMs = Date.now(),
): LiveScore {
  const p      = profile ?? DEFAULT_SCORING_PROFILE;
  const combos = buildCombos(events, p.comboWindowMs);

  let totalPoints = 0;
  for (let i = 0; i < events.length; i++) {
    const base  = calcBasePoints(events[i], p.speedReferenceKmh, p.gradientCompensation);
    const angle = calcAngleBonus(events[i].peakSlipAngleDeg, p.angleScaleDeg);
    const c     = combos[i];
    const zone  = (zoneCrossings && sessionStartedAt != null && zoneCrossings.length > 0)
      ? resolveZoneMultiplier(events[i], zoneCrossings, sessionStartedAt)
      : 1.0;
    totalPoints += Math.floor(base * angle * comboMultiplier(c) * zone);
  }

  const currentCombo = combos.length > 0 ? combos[combos.length - 1] : 1;
  const previewCombo = projectPreviewCombo(events, activePhase, p.comboWindowMs, nowMs);
  const displayCombo = activePhase ? previewCombo : currentCombo;

  const effectiveDurationMs = activePhase && activeStartedAt != null
    ? Math.max(0, nowMs - activeStartedAt)
    : activeDurationMs;

  const zone = activeZoneMultiplier ?? 1.0;

  let previewPoints = 0;
  if (activePhase && effectiveDurationMs > 0 && activePeakLateralG > 0) {
    const durationSec = effectiveDurationMs / 1000;
    const speedBonus  = 1 + Math.min(activeSpeedKmh / p.speedReferenceKmh, 1.0);
    const base        = Math.floor(
      durationSec * activePeakLateralG * p.gradientCompensation * 100 * speedBonus,
    );
    const angle       = calcAngleBonus(activeSlipAngleDeg, p.angleScaleDeg);
    previewPoints     = Math.floor(base * angle * comboMultiplier(previewCombo) * zone);
  }

  const liveTotal = totalPoints + previewPoints;
  const evalScore = normalizeScore(liveTotal, p.gradeDifficulty);

  return {
    totalPoints,
    currentCombo,
    previewCombo,
    displayCombo,
    previewPoints,
    liveTotal,
    evalScore,
    activeZoneMultiplier: zone,
    totalDrifts: events.length,
  };
}

/** セッション時間のフォーマット (m:ss) */
export function formatSessionDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * グレードしきい値テーブルを返す（UI 表示用）
 */
export function getGradeThresholds(
  difficulty: ScoringProfile['gradeDifficulty'] = 'normal',
) {
  return GRADE_TABLE[difficulty];
}

/**
 * 生ポイントを 0〜100 点満点に換算する。
 *
 * 難易度別 S ランク閾値を 100 点として正規化。
 * S ランク到達で 100 点（超過しても 100 点を上限とする）。
 *
 * @example
 *   normalizeScore(5000, 'normal') // → 63 (S = 8000)
 *   normalizeScore(8000, 'normal') // → 100
 */
export function normalizeScore(
  totalPoints: number,
  difficulty: ScoringProfile['gradeDifficulty'] = 'normal',
): number {
  const sThreshold = GRADE_TABLE[difficulty][0].min;
  return Math.min(100, Math.max(0, Math.round((totalPoints / sThreshold) * 100)));
}
