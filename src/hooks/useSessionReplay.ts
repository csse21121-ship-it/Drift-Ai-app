import { useCallback, useEffect, useState } from 'react';

export const REPLAY_TICK_MS = 50;
export const REPLAY_SPEED = 8;

export function useSessionReplay(durationMs: number) {
  const [playMs, setPlayMs] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setPlayMs((prev) => {
        const next = prev + REPLAY_TICK_MS * REPLAY_SPEED;
        if (next >= durationMs) {
          setPlaying(false);
          return durationMs;
        }
        return next;
      });
    }, REPLAY_TICK_MS);
    return () => clearInterval(id);
  }, [playing, durationMs]);

  const togglePlay = useCallback(() => {
    if (playMs >= durationMs) {
      setPlayMs(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }, [playMs, durationMs]);

  const replay = useCallback(() => {
    setPlayMs(0);
    setPlaying(true);
  }, []);

  const progressPct = durationMs > 0 ? (playMs / durationMs) * 100 : 0;

  return {
    playMs,
    setPlayMs,
    playing,
    setPlaying,
    togglePlay,
    replay,
    durationMs,
    progressPct,
  };
}
