import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GamificationState } from '@/types/gamification';

const STORAGE_KEY = '@driftscore/gamification';

export const DEFAULT_GAMIFICATION_STATE: GamificationState = {
  unlockedAchievementIds: [],
  unlockedAt: {},
  activeTitleId: null,
  daily: {
    dateKey: '',
    completedChallengeIds: [],
  },
  dailyArchive: [],
};

export async function loadGamificationState(): Promise<GamificationState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GAMIFICATION_STATE };
    const parsed = JSON.parse(raw) as Partial<GamificationState>;
    return {
      ...DEFAULT_GAMIFICATION_STATE,
      ...parsed,
      unlockedAchievementIds: parsed.unlockedAchievementIds ?? [],
      unlockedAt: parsed.unlockedAt ?? {},
      daily: {
        ...DEFAULT_GAMIFICATION_STATE.daily,
        ...parsed.daily,
        completedChallengeIds: parsed.daily?.completedChallengeIds ?? [],
      },
      dailyArchive: parsed.dailyArchive ?? [],
    };
  } catch {
    return { ...DEFAULT_GAMIFICATION_STATE };
  }
}

export async function saveGamificationState(state: GamificationState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function setActiveTitleId(achievementId: string | null): Promise<void> {
  const state = await loadGamificationState();
  if (achievementId != null && !state.unlockedAchievementIds.includes(achievementId)) {
    return;
  }
  state.activeTitleId = achievementId;
  await saveGamificationState(state);
}
