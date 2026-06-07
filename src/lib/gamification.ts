/**
 * デイリーチャレンジ・称号 — 判定と進行更新
 */

import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from '@/data/achievements';
import {
  appendSessionToDrivingLedger,
  computeDriverRank,
  isRankPromotion,
  previousRankIdFromRating,
  resolveDrivingLedger,
  rolloverDailyState,
} from '@/lib/driverRank';
import { getDailyChallengesForDate, getDateKey } from '@/lib/dailyMission';
import {
  loadGamificationState,
  saveGamificationState,
} from '@/lib/gamificationStore';
import { loadHistory } from '@/lib/sessionStore';
import type {
  AchievementDefinition,
  DailyChallengeDefinition,
  DriverRankSnapshot,
  GamificationOverview,
  GamificationState,
  GamificationUpdate,
} from '@/types/gamification';
import type { Grade, SessionHistoryEntry, SessionResult } from '@/types/score';

export { getDateKey, getDailyChallengesForDate } from '@/lib/dailyMission';

const GRADE_RANK: Record<Grade, number> = {
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

const TIER_RANK = { bronze: 1, silver: 2, gold: 3, legend: 4 } as const;

// ── セッション指標 ────────────────────────────────────────────

function gradeAtLeast(grade: Grade, min: Grade): boolean {
  return GRADE_RANK[grade] >= GRADE_RANK[min];
}

function sessionMaxCombo(session: SessionResult): number {
  if (!session.driftScores.length) return 1;
  return Math.max(...session.driftScores.map((d) => d.combo));
}

function sessionMaxSlipAngle(session: SessionResult): number {
  if (!session.events.length) return 0;
  return Math.max(...session.events.map((e) => e.peakSlipAngleDeg));
}

function sessionZonePct(session: SessionResult): number | null {
  return session.zoneTrace?.overallPct ?? null;
}

function anySession(
  history: SessionHistoryEntry[],
  pred: (s: SessionResult) => boolean,
): boolean {
  return history.some(pred);
}

// ── デイリー判定 ──────────────────────────────────────────────

export function checkDailyChallenge(
  challengeId: string,
  session: SessionResult,
): boolean {
  switch (challengeId) {
    case 'daily_score_3k':
      return session.totalPoints >= 3000;
    case 'daily_score_5k':
      return session.totalPoints >= 5000;
    case 'daily_drifts_2':
      return session.events.length >= 2;
    case 'daily_drifts_4':
      return session.events.length >= 4;
    case 'daily_combo_2':
      return sessionMaxCombo(session) >= 2;
    case 'daily_grade_c':
      return gradeAtLeast(session.grade, 'C');
    case 'daily_grade_b':
      return gradeAtLeast(session.grade, 'B');
    case 'daily_peak_g':
      return session.maxLateralG >= 0.4;
    case 'daily_speed_40':
      return session.maxSpeedKmh >= 40;
    case 'daily_zone_60': {
      const pct = sessionZonePct(session);
      return pct != null && pct >= 60;
    }
    default:
      return false;
  }
}

// ── 称号判定 ──────────────────────────────────────────────────

type CheckContext = {
  history: SessionHistoryEntry[];
  dailyCompletedCount: number;
};

function isAchievementUnlocked(
  id: string,
  ctx: CheckContext,
): boolean {
  const { history, dailyCompletedCount } = ctx;

  switch (id) {
    case 'first_run':
      return history.length >= 1;
    case 'drift_3':
      return anySession(history, (s) => s.events.length >= 3);
    case 'drift_5':
      return anySession(history, (s) => s.events.length >= 5);
    case 'combo_3':
      return anySession(history, (s) => sessionMaxCombo(s) >= 3);
    case 'combo_5':
      return anySession(history, (s) => sessionMaxCombo(s) >= 5);
    case 'grade_b':
      return anySession(history, (s) => gradeAtLeast(s.grade, 'B'));
    case 'grade_a':
      return anySession(history, (s) => gradeAtLeast(s.grade, 'A'));
    case 'grade_s':
      return anySession(history, (s) => s.grade === 'S');
    case 'speed_60':
      return anySession(history, (s) => s.maxSpeedKmh >= 60);
    case 'speed_100':
      return anySession(history, (s) => s.maxSpeedKmh >= 100);
    case 'peak_g_05':
      return anySession(history, (s) => s.maxLateralG >= 0.5);
    case 'peak_g_08':
      return anySession(history, (s) => s.maxLateralG >= 0.8);
    case 'angle_25':
      return anySession(history, (s) => sessionMaxSlipAngle(s) >= 25);
    case 'zone_clear':
      return anySession(history, (s) => {
        const pct = sessionZonePct(s);
        return pct != null && pct >= 80;
      });
    case 'zone_perfect':
      return anySession(history, (s) => {
        const pct = sessionZonePct(s);
        return pct != null && pct >= 95;
      });
    case 'course_run':
      return anySession(history, (s) => !!s.courseName);
    case 'runs_10':
      return history.length >= 10;
    case 'runs_25':
      return history.length >= 25;
    case 'daily_first':
      return dailyCompletedCount >= 1;
    default:
      return false;
  }
}

function pickBestNewTitle(
  unlocked: AchievementDefinition[],
): AchievementDefinition | null {
  if (!unlocked.length) return null;
  return [...unlocked].sort(
    (a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier],
  )[0];
}

function emptyUpdate(
  dateKey: string,
  activeTitleId: string | null,
  completedIds: string[],
  driverRank: DriverRankSnapshot,
): GamificationUpdate {
  const todayChallenges = getDailyChallengesForDate(dateKey);
  return {
    newlyUnlockedAchievements: [],
    newlyCompletedDaily: [],
    activeTitle: activeTitleId
      ? ACHIEVEMENT_BY_ID[activeTitleId]?.title ?? null
      : null,
    todayCompletedCount: completedIds.length,
    todayTotalCount: todayChallenges.length,
    driverRank,
    rankPromoted: false,
    previousRankId: null,
  };
}

function ensureDailyRollover(
  state: GamificationState,
  dateKey: string,
): GamificationState {
  let next = rolloverDailyState(state, dateKey);
  if (!next.daily.dateKey) {
    next = { ...next, daily: { dateKey, completedChallengeIds: [] } };
  }
  return next;
}

// ── セッション保存後の更新 ────────────────────────────────────

export async function processSessionGamification(
  entry: SessionHistoryEntry,
  history: SessionHistoryEntry[],
): Promise<GamificationUpdate> {
  const dateKey = getDateKey();
  let state = ensureDailyRollover(await loadGamificationState(), dateKey);
  if (!state.daily.dateKey) {
    state = { ...state, daily: { dateKey, completedChallengeIds: [] } };
  }

  const historyBefore = history.filter((h) => h.id !== entry.id);
  const rankBeforeSession = computeDriverRank(historyBefore, state, dateKey);
  const previousRankId =
    state.lastKnownRating != null
      ? previousRankIdFromRating(state.lastKnownRating)
      : rankBeforeSession.rankId;

  const isPractice =
    entry.scoringMode === 'practice' || entry.gpsIntegrity?.isPracticeMode === true;

  if (isPractice) {
    const { ledger } = resolveDrivingLedger(state, historyBefore);
    const driverRank = computeDriverRank(historyBefore, { ...state, drivingLedger: ledger }, dateKey);
    return {
      ...emptyUpdate(
        dateKey,
        state.activeTitleId,
        state.daily.completedChallengeIds,
        driverRank,
      ),
      previousRankId,
      skippedPracticeMode: true,
    };
  }

  if (state.lastProcessedSessionId === entry.id) {
    const { ledger } = resolveDrivingLedger(state, history);
    const driverRank = computeDriverRank(history, { ...state, drivingLedger: ledger }, dateKey);
    return {
      ...emptyUpdate(
        dateKey,
        state.activeTitleId,
        state.daily.completedChallengeIds,
        driverRank,
      ),
      previousRankId,
    };
  }

  state = {
    ...state,
    drivingLedger: appendSessionToDrivingLedger(
      resolveDrivingLedger(state, historyBefore).ledger,
      entry,
      dateKey,
    ),
  };

  const todayChallenges = getDailyChallengesForDate(dateKey);
  const newlyCompletedDaily: DailyChallengeDefinition[] = [];

  for (const ch of todayChallenges) {
    if (state.daily.completedChallengeIds.includes(ch.id)) continue;
    if (checkDailyChallenge(ch.id, entry)) {
      state.daily.completedChallengeIds.push(ch.id);
      newlyCompletedDaily.push(ch);
    }
  }

  const ctx: CheckContext = {
    history,
    dailyCompletedCount: state.daily.completedChallengeIds.length,
  };

  const newlyUnlocked: AchievementDefinition[] = [];
  for (const ach of ACHIEVEMENTS) {
    if (state.unlockedAchievementIds.includes(ach.id)) continue;
    if (isAchievementUnlocked(ach.id, ctx)) {
      state.unlockedAchievementIds.push(ach.id);
      state.unlockedAt[ach.id] = Date.now();
      newlyUnlocked.push(ach);
    }
  }

  if (!state.activeTitleId && newlyUnlocked.length > 0) {
    const best = pickBestNewTitle(newlyUnlocked);
    if (best) state.activeTitleId = best.id;
  }

  const driverRank = computeDriverRank(history, state, dateKey);
  const rankPromoted = isRankPromotion(previousRankId, driverRank.rankId);

  state.lastProcessedSessionId = entry.id;
  state.lastKnownRating = driverRank.rating;
  await saveGamificationState(state);

  return {
    newlyUnlockedAchievements: newlyUnlocked,
    newlyCompletedDaily,
    activeTitle: state.activeTitleId
      ? ACHIEVEMENT_BY_ID[state.activeTitleId]?.title ?? null
      : null,
    todayCompletedCount: state.daily.completedChallengeIds.length,
    todayTotalCount: todayChallenges.length,
    driverRank,
    rankPromoted,
    previousRankId,
  };
}

// ── ホーム / 称号画面用 ───────────────────────────────────────

export async function loadGamificationOverview(
  history?: SessionHistoryEntry[],
): Promise<GamificationOverview> {
  const dateKey = getDateKey();
  const before = await loadGamificationState();
  let state = ensureDailyRollover(before, dateKey);

  if (!state.daily.dateKey) {
    state = { ...state, daily: { dateKey, completedChallengeIds: [] } };
  }

  const entries = history ?? (await loadHistory());
  const ledgerResult = resolveDrivingLedger(state, entries);
  if (ledgerResult.needsPersist) {
    state = { ...state, drivingLedger: ledgerResult.ledger };
  }
  const stateWithLedger = { ...state, drivingLedger: ledgerResult.ledger };
  const driverRank = computeDriverRank(entries, stateWithLedger, dateKey);

  const shouldSave =
    ledgerResult.needsPersist ||
    before.daily.dateKey !== state.daily.dateKey ||
    before.dailyArchive.length !== state.dailyArchive.length ||
    before.lastKnownRating !== driverRank.rating;

  if (shouldSave) {
    stateWithLedger.lastKnownRating = driverRank.rating;
    await saveGamificationState(stateWithLedger);
  }

  const completedIds = state.daily.completedChallengeIds;

  const dailyChallenges = getDailyChallengesForDate(dateKey).map((ch) => ({
    ...ch,
    challengeId: ch.id,
    completed: completedIds.includes(ch.id),
  }));

  const activeDef = state.activeTitleId
    ? ACHIEVEMENT_BY_ID[state.activeTitleId]
    : null;

  return {
    dateKey,
    dailyChallenges,
    activeTitle: state.activeTitleId,
    activeTitleLabel: activeDef?.title ?? null,
    unlockedCount: state.unlockedAchievementIds.length,
    totalAchievements: ACHIEVEMENTS.length,
    driverRank,
  };
}

export async function loadUnlockedAchievementIds(): Promise<string[]> {
  const state = await loadGamificationState();
  return state.unlockedAchievementIds;
}

export async function loadActiveTitleId(): Promise<string | null> {
  const state = await loadGamificationState();
  return state.activeTitleId;
}

export async function loadUnlockedAt(): Promise<Record<string, number>> {
  const state = await loadGamificationState();
  return state.unlockedAt;
}
