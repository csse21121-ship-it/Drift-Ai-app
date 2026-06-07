/**
 * デイリーミッション — 日付・選出
 */

import { DAILY_CHALLENGE_POOL } from '@/data/dailyChallenges';
import type { DailyChallengeDefinition } from '@/types/gamification';

const DAILY_COUNT = 2;

export function getDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hashDate(dateKey: string): number {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) {
    h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function getDailyChallengesForDate(
  dateKey: string,
): DailyChallengeDefinition[] {
  if (DAILY_CHALLENGE_POOL.length === 0) return [];
  const h = hashDate(dateKey);
  const picked = new Set<number>();
  let attempt = 0;
  while (picked.size < DAILY_COUNT && attempt < DAILY_CHALLENGE_POOL.length * 2) {
    picked.add((h + attempt * 7) % DAILY_CHALLENGE_POOL.length);
    attempt++;
  }
  return [...picked].map((idx) => DAILY_CHALLENGE_POOL[idx]);
}

export const DAILY_MISSION_COUNT = DAILY_COUNT;
