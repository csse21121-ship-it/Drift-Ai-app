/**
 * ゲーム性 — デイリーチャレンジ・称号・ランク
 */

import type { DriverRankId } from '@/data/ranks';
import type { Grade } from '@/types/score';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'legend';

/** 称号 / 実績の定義 */
export type AchievementDefinition = {
  id: string;
  /** 装備時に表示する称号 */
  title: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
};

/** デイリーチャレンジ定義 */
export type DailyChallengeDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** 報酬 pt（表示用） */
  bonusPts: number;
};

export type DailyChallengeProgress = {
  challengeId: string;
  completed: boolean;
  /** 達成したセッション ID */
  sessionId?: string;
};

/** 日別デイリー達成アーカイブ（達成率算出用） */
export type DailyArchiveEntry = {
  dateKey: string;
  completedCount: number;
  totalCount: number;
};

/** ランク内訳スコア */
export type DriverRatingBreakdown = {
  /** 30日デイリー達成率由来 (max 2500) */
  dailyPoints: number;
  /** 走行実績由来 (max 4000) */
  drivingPoints: number;
  /** 実績解除率由来 (max 2000) */
  achievementPoints: number;
  /** 本日デイリー由来 (max 500) */
  todayBonusPoints: number;
};

/** ドライバーランクのスナップショット */
export type DriverRankSnapshot = {
  rating: number;
  rankId: DriverRankId;
  rankLabel: string;
  rankLabelJa: string;
  rankColor: string;
  rankIcon: string;
  /** 次ランクまでの進捗 0〜1 */
  progressToNext: number;
  nextRankLabel: string | null;
  nextRankLabelJa: string | null;
  /** 直近30日デイリー達成率 0〜100 */
  dailyCompletionRate30d: number;
  /** 直近7日走行日数 */
  activeDays7d: number;
  breakdown: DriverRatingBreakdown;
};

/** AsyncStorage に保存するゲーム進行状態 */
export type DrivingRankLedger = {
  /** 累計走行回数（履歴削除では減らない） */
  totalRuns: number;
  bestGrade: Grade;
  /** 直近走行（新しい順・最大20） */
  recentSessions: Array<{
    grade: Grade;
    points: number;
    dayKey: string;
  }>;
  /** 走行があった日 YYYY-MM-DD（直近分） */
  activeDayKeys: string[];
  /** 最終走行 savedAt（未走行は 0） */
  lastRunAt: number;
};

/** AsyncStorage に保存するゲーム進行状態 */
export type GamificationState = {
  unlockedAchievementIds: string[];
  unlockedAt: Record<string, number>;
  /** 装備中の称号（achievementId） */
  activeTitleId: string | null;
  daily: {
    dateKey: string;
    completedChallengeIds: string[];
  };
  /** 日替わり前日分の達成記録（最大90日） */
  dailyArchive: DailyArchiveEntry[];
  /** 前回算出時のレーティング（ランクアップ検知用） */
  lastKnownRating?: number;
  lastProcessedSessionId?: string;
  /** ランク用走行実績（履歴とは独立・長期未走行時のみリセット） */
  drivingLedger?: DrivingRankLedger;
};

/** セッション保存後の更新結果（UI 表示用） */
export type GamificationUpdate = {
  newlyUnlockedAchievements: AchievementDefinition[];
  newlyCompletedDaily: DailyChallengeDefinition[];
  activeTitle: string | null;
  todayCompletedCount: number;
  todayTotalCount: number;
  driverRank: DriverRankSnapshot;
  /** ランクが上がった場合 */
  rankPromoted: boolean;
  previousRankId: DriverRankId | null;
  /** 練習モードのためデイリー・ランキング更新をスキップした */
  skippedPracticeMode?: boolean;
};

export type GamificationOverview = {
  dateKey: string;
  dailyChallenges: (DailyChallengeDefinition & DailyChallengeProgress)[];
  activeTitle: string | null;
  activeTitleLabel: string | null;
  unlockedCount: number;
  totalAchievements: number;
  driverRank: DriverRankSnapshot;
};
