import type { DailyChallengeDefinition } from '@/types/gamification';

/** 日替わりプール — 毎日2件を日付シードで選出 */
export const DAILY_CHALLENGE_POOL: DailyChallengeDefinition[] = [
  {
    id: 'daily_score_3k',
    name: '3,000 pt',
    description: '1本で 3,000 pt 以上',
    icon: '🎯',
    bonusPts: 100,
  },
  {
    id: 'daily_score_5k',
    name: '5,000 pt',
    description: '1本で 5,000 pt 以上',
    icon: '💎',
    bonusPts: 200,
  },
  {
    id: 'daily_drifts_2',
    name: '2本ドリフト',
    description: 'ドリフト 2 本以上',
    icon: '💨',
    bonusPts: 80,
  },
  {
    id: 'daily_drifts_4',
    name: '4本ドリフト',
    description: 'ドリフト 4 本以上',
    icon: '🔥',
    bonusPts: 150,
  },
  {
    id: 'daily_combo_2',
    name: 'コンボ ×2',
    description: 'コンボ 2 以上',
    icon: '⛓',
    bonusPts: 100,
  },
  {
    id: 'daily_grade_c',
    name: 'C 以上',
    description: 'C グレード以上',
    icon: 'C',
    bonusPts: 60,
  },
  {
    id: 'daily_grade_b',
    name: 'B 以上',
    description: 'B グレード以上',
    icon: 'B',
    bonusPts: 120,
  },
  {
    id: 'daily_peak_g',
    name: '0.4G',
    description: 'ピーク横 G 0.4 以上',
    icon: '🎯',
    bonusPts: 80,
  },
  {
    id: 'daily_speed_40',
    name: '40 km/h',
    description: '最高速度 40 km/h 以上',
    icon: '🏎',
    bonusPts: 70,
  },
  {
    id: 'daily_zone_60',
    name: 'ゾーン 60%',
    description: 'ゾーンなぞり 60% 以上',
    icon: '◈',
    bonusPts: 150,
  },
];
