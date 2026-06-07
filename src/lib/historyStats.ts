import { loadHistory } from '@/lib/sessionStore';
import type { Grade, SessionHistoryEntry } from '@/types/score';

export type PitLaneSummary = {
  todayBestPoints: number | null;
  todayBestGrade: Grade | null;
  lastPoints: number | null;
  lastGrade: Grade | null;
  totalRuns: number;
};

function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function summarizeHistory(entries: SessionHistoryEntry[]): PitLaneSummary {
  const todayEntries = entries.filter((e) => isToday(e.savedAt));
  const todayBest = todayEntries.reduce<SessionHistoryEntry | null>((best, entry) => {
    if (!best || entry.totalPoints > best.totalPoints) return entry;
    return best;
  }, null);

  const last = entries[0] ?? null;

  return {
    todayBestPoints: todayBest?.totalPoints ?? null,
    todayBestGrade: todayBest?.grade ?? null,
    lastPoints: last?.totalPoints ?? null,
    lastGrade: last?.grade ?? null,
    totalRuns: entries.length,
  };
}

export async function loadPitLaneSummary(): Promise<PitLaneSummary> {
  const entries = await loadHistory();
  return summarizeHistory(entries);
}
