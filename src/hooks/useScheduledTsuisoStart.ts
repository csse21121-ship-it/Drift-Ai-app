/**
 * 追走スケジュール・スタート — UTC ターゲット時刻同期
 * ARM 待機 → 5秒おきアナウンス → T-5 で StartSequenceOverlay → GO で計測開始
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  speakCountdown,
  speakStandbyAnnounce,
  stopStartSequenceSpeech,
} from '@/lib/startSequenceSpeech';
import { getNext30SecondBoundary, shiftTargetBy30Seconds } from '@/lib/scheduledStartTime';
import type { StartSequencePhase } from '@/hooks/useSessionPreflight';
import type { FeedbackSettings } from '@/types/settings';

export type ScheduledStartPhase = 'idle' | 'armed' | 'start_sequence' | 'recording';

const STANDBY_MARKS_SEC = [30, 25, 20, 15, 10] as const;
const COUNTDOWN_MARKS = [
  { remainingMs: 5000, n: 5 },
  { remainingMs: 4000, n: 4 },
  { remainingMs: 3000, n: 3 },
  { remainingMs: 2000, n: 2 },
  { remainingMs: 1000, n: 1 },
  { remainingMs: 0, n: 0 },
] as const;

const GO_HOLD_MS = 480;
const DISPLAY_TICK_MS = 50;

type Options = {
  feedback: FeedbackSettings;
  onArmSensors: () => Promise<void>;
  onDisarmSensors: () => Promise<void>;
  setSessionStartAt: (utcMs: number) => void;
  onGo: (targetUtcMs: number) => void;
};

export function useScheduledTsuisoStart({
  feedback,
  onArmSensors,
  onDisarmSensors,
  setSessionStartAt,
  onGo,
}: Options) {
  const [phase, setPhase] = useState<ScheduledStartPhase>('idle');
  const [targetUtcMs, setTargetUtcMs] = useState(() => getNext30SecondBoundary());
  const [remainingMs, setRemainingMs] = useState(0);
  const [sequencePhase] = useState<StartSequencePhase>('countdown');
  const [countdown, setCountdown] = useState<number | null>(null);

  const phaseRef = useRef(phase);
  const targetRef = useRef(targetUtcMs);
  const onGoRef = useRef(onGo);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const displayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const goTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  phaseRef.current = phase;
  targetRef.current = targetUtcMs;
  onGoRef.current = onGo;

  const clearAllTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
    if (goTimerRef.current) {
      clearTimeout(goTimerRef.current);
      goTimerRef.current = null;
    }
    if (displayTimerRef.current) {
      clearInterval(displayTimerRef.current);
      displayTimerRef.current = null;
    }
  }, []);

  const goFiredRef = useRef(false);

  const fireGo = useCallback(() => {
    if (goFiredRef.current) return;
    if (phaseRef.current !== 'armed' && phaseRef.current !== 'start_sequence') return;
    goFiredRef.current = true;

    const target = targetRef.current;
    setSessionStartAt(target);
    onGoRef.current(target);
    setPhase('recording');
    setCountdown(null);

    if (feedback.soundEnabled) {
      setTimeout(() => stopStartSequenceSpeech(), GO_HOLD_MS);
    } else {
      stopStartSequenceSpeech();
    }
  }, [feedback.soundEnabled, setSessionStartAt]);

  const scheduleTimeline = useCallback(() => {
    clearAllTimers();
    stopStartSequenceSpeech();

    const target = targetRef.current;
    const now = Date.now();

    for (const sec of STANDBY_MARKS_SEC) {
      const fireAt = target - sec * 1000;
      const delay = fireAt - now;
      if (delay <= 0) continue;
      timersRef.current.push(
        setTimeout(() => {
          if (phaseRef.current !== 'armed' && phaseRef.current !== 'start_sequence') return;
          if (feedback.soundEnabled) speakStandbyAnnounce(sec);
        }, delay),
      );
    }

    for (const mark of COUNTDOWN_MARKS) {
      const fireAt = target - mark.remainingMs;
      const delay = fireAt - now;
      if (delay <= 0) continue;
      timersRef.current.push(
        setTimeout(() => {
          if (phaseRef.current !== 'armed' && phaseRef.current !== 'start_sequence') return;

          if (mark.remainingMs === 5000) {
            setPhase('start_sequence');
          }

          setCountdown(mark.n);
          if (feedback.soundEnabled) speakCountdown(mark.n);

          if (mark.n === 0) {
            // GO 計測開始は goTimerRef が担当
          }
        }, delay),
      );
    }

    const msUntilGo = target - now;
    if (msUntilGo <= 5000) {
      setPhase('start_sequence');
      const secLeft = Math.max(0, Math.ceil(msUntilGo / 1000));
      setCountdown(Math.min(5, secLeft));
    }

    if (msUntilGo > 0) {
      goTimerRef.current = setTimeout(fireGo, msUntilGo);
    } else {
      fireGo();
    }
  }, [clearAllTimers, feedback.soundEnabled, fireGo]);

  const startDisplayTick = useCallback(() => {
    if (displayTimerRef.current) clearInterval(displayTimerRef.current);
    const tick = () => {
      setRemainingMs(Math.max(0, targetRef.current - Date.now()));
    };
    tick();
    displayTimerRef.current = setInterval(tick, DISPLAY_TICK_MS);
  }, []);

  const arm = useCallback(async () => {
    if (phaseRef.current !== 'idle') return;
    goFiredRef.current = false;
    await onArmSensors();
    setPhase('armed');
    setCountdown(null);
    setRemainingMs(Math.max(0, targetRef.current - Date.now()));
    scheduleTimeline();
    startDisplayTick();
  }, [onArmSensors, scheduleTimeline, startDisplayTick]);

  const disarm = useCallback(async () => {
    if (phaseRef.current === 'recording') return;
    goFiredRef.current = false;
    clearAllTimers();
    stopStartSequenceSpeech();
    setPhase('idle');
    setCountdown(null);
    setRemainingMs(0);
    await onDisarmSensors();
  }, [clearAllTimers, onDisarmSensors]);

  const finishRecording = useCallback(() => {
    clearAllTimers();
    stopStartSequenceSpeech();
    setPhase('idle');
    setCountdown(null);
    setRemainingMs(0);
  }, [clearAllTimers]);

  const bumpTarget = useCallback((deltaSteps: number) => {
    if (phaseRef.current !== 'idle') return;
    setTargetUtcMs((prev) => shiftTargetBy30Seconds(prev, deltaSteps));
  }, []);

  const resetTargetToNext = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    setTargetUtcMs(getNext30SecondBoundary());
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimers();
      stopStartSequenceSpeech();
    };
  }, [clearAllTimers]);

  const isArmed = phase === 'armed';
  const isStartSequence = phase === 'start_sequence';
  const isRecording = phase === 'recording';
  const isScheduledActive = isArmed || isStartSequence || isRecording;
  const metersLive = isScheduledActive;

  return {
    phase,
    isArmed,
    isStartSequence,
    isRecording,
    isScheduledActive,
    metersLive,
    targetUtcMs,
    remainingMs,
    sequencePhase,
    countdown,
    systemLines: [] as const,
    arm,
    disarm,
    finishRecording,
    bumpTarget,
    resetTargetToNext,
    setTargetUtcMs,
  };
}
