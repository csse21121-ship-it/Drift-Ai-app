/**
 * ドライバーランク — レーティング算出
 *
 * 内訳（合計 max 9000）:
 *   デイリー達成率 30日  … max 2500
 *   走行実績            … max 4000
 *   実績解除            … max 2000
 *   本日デイリー        … max 500
 */

import { ACHIEVEMENTS } from '@/data/achievements';
import {
  nextRankAfter,
  rankProgressInTier,
  resolveRankByRating,
  type DriverRankId,
} from '@/data/ranks';
import { getDailyChallengesForDate } from '@/lib/dailyMission';
import type {
  DailyArchiveEntry,
  DrivingRankLedger,
  DriverRankSnapshot,
  GamificationState,
} from '@/types/gamification';
import type { Grade, SessionHistoryEntry } from '@/types/score';

const GRADE_VALUE: Record<Grade, number> = {
  S: 400,
  A: 320,
  B: 240,
  C: 160,
  D: 80,
};

const BEST_GRADE_BONUS: Record<Grade, number> = {
  S: 600,
  A: 450,
  B: 300,
  C: 150,
  D: 0,
};

const GRADE_RANK: Record<Grade, number> = {
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

const ARCHIVE_DAYS = 90;
const DAILY_LOOKBACK_DAYS = 30;
const RECENT_SESSIONS = 20;
/** この日数以上走行がなければ走行実績レジャーをリセット */
export const RANK_INACTIVITY_RESET_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function emptyDrivingLedger(): DrivingRankLedger {
  return {
    totalRuns: 0,
    bestGrade: 'D',
    recentSessions: [],
    activeDayKeys: [],
    lastRunAt: 0,
  };
}

function savedAtToDateKey(savedAt: number): string {
  const d = new Date(savedAt);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function updateActiveDayKeys(
  keys: string[],
  dayKey: string,
  todayKey: string,
): string[] {
  const cutoff = dateKeyOffset(todayKey, -6);
  const set = new Set([dayKey, ...keys]);
  return [...set].filter((k) => k >= cutoff && k <= todayKey).sort();
}

function countActiveDays7d(activeDayKeys: string[], todayKey: string): number {
  const cutoff = dateKeyOffset(todayKey, -6);
  return activeDayKeys.filter((k) => k >= cutoff && k <= todayKey).length;
}

function avgGradeValueFromRecent(
  sessions: DrivingRankLedger['recentSessions'],
): number {
  if (!sessions.length) return 0;
  const sum = sessions.reduce((acc, s) => acc + GRADE_VALUE[s.grade], 0);
  return sum / sessions.length;
}

function avgPointsFromRecent(
  sessions: DrivingRankLedger['recentSessions'],
): number {
  if (!sessions.length) return 0;
  return sessions.reduce((acc, s) => acc + s.points, 0) / sessions.length;
}

export function appendSessionToDrivingLedger(
  ledger: DrivingRankLedger,
  entry: SessionHistoryEntry,
  todayKey: string,
): DrivingRankLedger {
  const dayKey = savedAtToDateKey(entry.savedAt);
  const stamp = {
    grade: entry.grade,
    points: entry.totalPoints,
    dayKey,
  };
  const recentSessions = [stamp, ...ledger.recentSessions].slice(0, RECENT_SESSIONS);
  const best =
    GRADE_RANK[entry.grade] > GRADE_RANK[ledger.bestGrade]
      ? entry.grade
      : ledger.bestGrade;

  return {
    totalRuns: ledger.totalRuns + 1,
    bestGrade: best,
    recentSessions,
    activeDayKeys: updateActiveDayKeys(ledger.activeDayKeys, dayKey, todayKey),
    lastRunAt: entry.savedAt,
  };
}

export function buildDrivingLedgerFromHistory(
  history: SessionHistoryEntry[],
): DrivingRankLedger {
  const sorted = [...history].sort((a, b) => a.savedAt - b.savedAt);
  let ledger = emptyDrivingLedger();
  for (const entry of sorted) {
    ledger = appendSessionToDrivingLedger(
      ledger,
      entry,
      savedAtToDateKey(entry.savedAt),
    );
  }
  return ledger;
}

export function applyDrivingLedgerInactivityReset(
  ledger: DrivingRankLedger,
  nowMs: number = Date.now(),
): { ledger: DrivingRankLedger; reset: boolean } {
  if (ledger.lastRunAt <= 0) {
    return { ledger, reset: false };
  }
  const inactiveDays = (nowMs - ledger.lastRunAt) / MS_PER_DAY;
  if (inactiveDays < RANK_INACTIVITY_RESET_DAYS) {
    return { ledger, reset: false };
  }
  return { ledger: emptyDrivingLedger(), reset: true };
}

/** レジャー初期化・未走行リセット・履歴からの初回移行 */
export function resolveDrivingLedger(
  state: GamificationState,
  history: SessionHistoryEntry[],
  nowMs: number = Date.now(),
): { ledger: DrivingRankLedger; needsPersist: boolean; reset: boolean } {
  let ledger = state.drivingLedger ?? buildDrivingLedgerFromHistory(history);
  const needsInitialMigration = !state.drivingLedger && history.length > 0;
  const inactivity = applyDrivingLedgerInactivityReset(ledger, nowMs);
  return {
    ledger: inactivity.ledger,
    needsPersist: needsInitialMigration || inactivity.reset,
    reset: inactivity.reset,
  };
}

function dateKeyOffset(baseKey: string, offsetDays: number): string {
  const [y, m, d] = baseKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + offsetDays);
  const ny = date.getFullYear();
  const nm = (date.getMonth() + 1).toString().padStart(2, '0');
  const nd = date.getDate().toString().padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

function buildDailyMap(
  archive: DailyArchiveEntry[],
  todayKey: string,
  todayCompleted: number,
  todayTotal: number,
): Map<string, DailyArchiveEntry> {
  const map = new Map<string, DailyArchiveEntry>();
  for (const entry of archive) {
    map.set(entry.dateKey, entry);
  }
  if (todayTotal > 0) {
    map.set(todayKey, {
      dateKey: todayKey,
      completedCount: todayCompleted,
      totalCount: todayTotal,
    });
  }
  return map;
}

function computeDailyRate30d(
  dailyMap: Map<string, DailyArchiveEntry>,
  todayKey: string,
): { rate: number; completedDays: number; activeDays: number } {
  let completed = 0;
  let total = 0;
  let daysWithData = 0;

  for (let i = 0; i < DAILY_LOOKBACK_DAYS; i++) {
    const key = dateKeyOffset(todayKey, -i);
    const entry = dailyMap.get(key);
    if (!entry || entry.totalCount <= 0) continue;
    daysWithData++;
    completed += entry.completedCount;
    total += entry.totalCount;
  }

  if (total === 0) return { rate: 0, completedDays: 0, activeDays: daysWithData };
  return {
    rate: completed / total,
    completedDays: completed,
    activeDays: daysWithData,
  };
}

export function computeDriverRank(
  history: SessionHistoryEntry[],
  state: GamificationState,
  todayKey: string,
): DriverRankSnapshot {
  const { ledger } = resolveDrivingLedger(state, history);

  const todayChallenges = getDailyChallengesForDate(todayKey);
  const todayTotal = todayChallenges.length;
  const todayCompleted =
    state.daily.dateKey === todayKey
      ? state.daily.completedChallengeIds.length
      : 0;

  const dailyMap = buildDailyMap(
    state.dailyArchive,
    todayKey,
    todayCompleted,
    todayTotal,
  );
  const daily30 = computeDailyRate30d(dailyMap, todayKey);
  const activeDays7d = countActiveDays7d(ledger.activeDayKeys, todayKey);

  const recent = ledger.recentSessions;
  const totalRuns = ledger.totalRuns;
  const best = ledger.bestGrade;

  // ── デイリー (max 2500) ──
  const dailyPoints = Math.round(daily30.rate * 2200);
  const streakBonus = Math.min(
    300,
    daily30.activeDays >= 7 ? Math.floor(daily30.rate * 300) : daily30.activeDays * 20,
  );
  const dailyTotal = Math.min(2500, dailyPoints + streakBonus);

  // ── 走行 (max 4000) ──
  const runPoints = Math.min(900, totalRuns * 36);
  const avgGradePts = Math.round(avgGradeValueFromRecent(recent) * 0.75);
  const bestGradePts = BEST_GRADE_BONUS[best];
  const avgScorePts = Math.min(700, Math.round(avgPointsFromRecent(recent) / 15));
  const activityPts = Math.min(700, activeDays7d * 100);
  const recentRunPts = Math.min(600, recent.length * 30);
  const drivingTotal = Math.min(
    4000,
    runPoints + avgGradePts + bestGradePts + avgScorePts + activityPts + recentRunPts,
  );

  // ── 実績 (max 2000) ──
  const achRate =
    ACHIEVEMENTS.length > 0
      ? state.unlockedAchievementIds.length / ACHIEVEMENTS.length
      : 0;
  const achievementTotal = Math.round(achRate * 2000);

  // ── 本日ボーナス (max 500) ──
  const todayBonusPoints =
    todayTotal > 0
      ? Math.round((todayCompleted / todayTotal) * 500)
      : 0;

  const rating = Math.min(
    9000,
    dailyTotal + drivingTotal + achievementTotal + todayBonusPoints,
  );

  const rank = resolveRankByRating(rating);
  const next = nextRankAfter(rank.id);

  return {
    rating,
    rankId: rank.id,
    rankLabel: rank.label,
    rankLabelJa: rank.labelJa,
    rankColor: rank.color,
    rankIcon: rank.icon,
    progressToNext: rankProgressInTier(rating, rank),
    nextRankLabel: next?.label ?? null,
    nextRankLabelJa: next?.labelJa ?? null,
    dailyCompletionRate30d: Math.round(daily30.rate * 100),
    activeDays7d,
    breakdown: {
      dailyPoints: dailyTotal,
      drivingPoints: drivingTotal,
      achievementPoints: achievementTotal,
      todayBonusPoints,
    },
  };
}

export function isRankPromotion(
  previousRankId: DriverRankId | null,
  newRankId: DriverRankId,
): boolean {
  if (!previousRankId) return false;
  const order: DriverRankId[] = [
    'rookie',
    'club',
    'semi_pro',
    'pro',
    'expert',
    'master',
    'legend',
  ];
  return order.indexOf(newRankId) > order.indexOf(previousRankId);
}

export function archiveDailyRecord(
  archive: DailyArchiveEntry[],
  dateKey: string,
  completedCount: number,
  totalCount: number,
): DailyArchiveEntry[] {
  if (!dateKey || totalCount <= 0) return archive;
  const filtered = archive.filter((e) => e.dateKey !== dateKey);
  const next = [...filtered, { dateKey, completedCount, totalCount }];
  next.sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
  return next.slice(-ARCHIVE_DAYS);
}

export function rolloverDailyState(
  state: GamificationState,
  todayKey: string,
): GamificationState {
  const prev = state.daily;
  if (!prev.dateKey || prev.dateKey === todayKey) return state;

  const prevTotal = getDailyChallengesForDate(prev.dateKey).length;
  const nextArchive = archiveDailyRecord(
    state.dailyArchive,
    prev.dateKey,
    prev.completedChallengeIds.length,
    prevTotal,
  );

  return {
    ...state,
    dailyArchive: nextArchive,
    daily: { dateKey: todayKey, completedChallengeIds: [] },
  };
}

export function previousRankIdFromRating(rating: number): DriverRankId {
  return resolveRankByRating(rating).id;
}
