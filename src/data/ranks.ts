/**
 * ドライバーランク — ティア定義
 */

export type DriverRankId =
  | 'rookie'
  | 'club'
  | 'semi_pro'
  | 'pro'
  | 'expert'
  | 'master'
  | 'legend';

export type DriverRankDefinition = {
  id: DriverRankId;
  /** 表示名（英） */
  label: string;
  /** 表示名（日） */
  labelJa: string;
  /** このランクに到達する最低レーティング */
  minRating: number;
  color: string;
  icon: string;
};

export const DRIVER_RANKS: DriverRankDefinition[] = [
  {
    id: 'rookie',
    label: 'ROOKIE',
    labelJa: 'ルーキー',
    minRating: 0,
    color: '#888888',
    icon: '🔰',
  },
  {
    id: 'club',
    label: 'CLUB',
    labelJa: 'クラブ',
    minRating: 600,
    color: '#CD7F32',
    icon: '🏎️',
  },
  {
    id: 'semi_pro',
    label: 'SEMI-PRO',
    labelJa: 'セミプロ',
    minRating: 1800,
    color: '#00BFFF',
    icon: '💨',
  },
  {
    id: 'pro',
    label: 'PRO',
    labelJa: 'プロ',
    minRating: 3200,
    color: '#00FF88',
    icon: '⭐',
  },
  {
    id: 'expert',
    label: 'EXPERT',
    labelJa: 'エキスパート',
    minRating: 4800,
    color: '#FFD700',
    icon: '🔥',
  },
  {
    id: 'master',
    label: 'MASTER',
    labelJa: 'マスター',
    minRating: 6400,
    color: '#FF9900',
    icon: '👑',
  },
  {
    id: 'legend',
    label: 'LEGEND',
    labelJa: 'レジェンド',
    minRating: 8200,
    color: '#FF44AA',
    icon: '⚡',
  },
];

export const DRIVER_RANK_BY_ID = Object.fromEntries(
  DRIVER_RANKS.map((r) => [r.id, r]),
) as Record<DriverRankId, DriverRankDefinition>;

export function resolveRankByRating(rating: number): DriverRankDefinition {
  let current = DRIVER_RANKS[0];
  for (const rank of DRIVER_RANKS) {
    if (rating >= rank.minRating) current = rank;
  }
  return current;
}

export function nextRankAfter(
  rankId: DriverRankId,
): DriverRankDefinition | null {
  const idx = DRIVER_RANKS.findIndex((r) => r.id === rankId);
  if (idx < 0 || idx >= DRIVER_RANKS.length - 1) return null;
  return DRIVER_RANKS[idx + 1];
}

export function rankProgressInTier(
  rating: number,
  rank: DriverRankDefinition,
): number {
  const next = nextRankAfter(rank.id);
  if (!next) return 1;
  const span = next.minRating - rank.minRating;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (rating - rank.minRating) / span));
}
