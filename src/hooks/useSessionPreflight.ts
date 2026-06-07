/**
 * セッション開始前プリフライト — センサーチェック演出 → 5秒カウント → 計測開始
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  speakCountdown,
  speakSystemCheckIntro,
  stopStartSequenceSpeech,
} from '@/lib/startSequenceSpeech';
import { getSetupWarnings, type SetupWarning } from '@/lib/setupWarnings';
import type { CalibrationData } from '@/lib/calibration';
import type { FeedbackSettings, MountOrientationOverride } from '@/types/settings';
import type { GpsSample, MotionSample } from '@/types/telemetry';

export type SessionRunPhase = 'idle' | 'preflight' | 'recording';

export type StartSequencePhase = 'system_check' | 'countdown';

export type SystemCheckLineStatus = 'hidden' | 'blink' | 'solid';

export type SystemCheckLine = {
  id: string;
  text: string;
  status: SystemCheckLineStatus;
  tone?: 'normal' | 'warn';
};

type SensorCheckId = 'gyro' | 'gps' | 'drift' | 'logger';

const SENSOR_CHECKS: Array<{
  id: SensorCheckId;
  text: string;
  needsLogger?: boolean;
}> = [
  { id: 'gyro', text: 'GYRO: OK' },
  { id: 'gps', text: 'GPS: LOCKED' },
  { id: 'drift', text: 'DRIFT SYS: ONLINE' },
  { id: 'logger', text: 'LOGGER: LINKED', needsLogger: true },
];

const INIT_LINE: SystemCheckLine = {
  id: 'init',
  text: 'SYSTEM CHECK INITIALIZED...',
  status: 'hidden',
  tone: 'normal',
};

const FINISH_LINE: SystemCheckLine = {
  id: 'all_go',
  text: 'ALL SYSTEMS GO',
  status: 'hidden',
  tone: 'normal',
};

const STEP_MIN_MS = 520;
const STEP_MAX_MS = 2200;
const SYSTEM_CHECK_MIN_MS = 3000;
const WARN_LINE_MS = 880;
const COUNTDOWN_FROM = 5;
const COUNTDOWN_STEP_MS = 1000;
const GO_HOLD_MS = 480;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildInitialLines(
  hasLogger: boolean,
  warnings: SetupWarning[],
): SystemCheckLine[] {
  const warningLines = warnings.map((w) => ({
    id: w.id,
    text: w.text,
    status: 'hidden' as const,
    tone: 'warn' as const,
  }));

  const sensorLines = SENSOR_CHECKS.filter(
    (c) => !c.needsLogger || hasLogger,
  ).map((c) => ({
    id: c.id,
    text: c.text,
    status: 'hidden' as const,
    tone: 'normal' as const,
  }));

  return [...warningLines, INIT_LINE, ...sensorLines, FINISH_LINE];
}

function setLineStatus(
  lines: SystemCheckLine[],
  id: string,
  status: SystemCheckLineStatus,
): SystemCheckLine[] {
  return lines.map((line) => (line.id === id ? { ...line, status } : line));
}

function isCheckReady(
  id: SensorCheckId,
  motion: MotionSample | null,
  gps: GpsSample | null,
): boolean {
  switch (id) {
    case 'gyro':
    case 'drift':
      return motion != null;
    case 'gps':
      return gps != null && gps.accuracy < 80;
    case 'logger':
      return true;
    default:
      return false;
  }
}

async function waitForCheck(
  id: SensorCheckId,
  ready: () => boolean,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < STEP_MAX_MS) {
    if (ready()) break;
    await delay(80);
  }
  const elapsed = Date.now() - started;
  if (elapsed < STEP_MIN_MS) {
    await delay(STEP_MIN_MS - elapsed);
  }
  void id;
}

type Options = {
  motion: MotionSample | null;
  gps: GpsSample | null;
  hasLogger: boolean;
  feedback: FeedbackSettings;
  mountOverride: MountOrientationOverride;
  calibration: CalibrationData | null;
  onGo: () => void;
};

export function useSessionPreflight({
  motion,
  gps,
  hasLogger,
  feedback,
  mountOverride,
  calibration,
  onGo,
}: Options) {
  const warnings = getSetupWarnings(mountOverride, calibration);

  const [phase, setPhase] = useState<SessionRunPhase>('idle');
  const [sequencePhase, setSequencePhase] =
    useState<StartSequencePhase>('system_check');
  const [systemLines, setSystemLines] = useState<SystemCheckLine[]>(() =>
    buildInitialLines(hasLogger, warnings),
  );
  const [countdown, setCountdown] = useState<number | null>(null);

  const motionRef = useRef(motion);
  const gpsRef = useRef(gps);
  const onGoRef = useRef(onGo);
  const warningsRef = useRef(warnings);
  motionRef.current = motion;
  gpsRef.current = gps;
  onGoRef.current = onGo;
  warningsRef.current = warnings;

  const resetSequence = useCallback(() => {
    stopStartSequenceSpeech();
    setSequencePhase('system_check');
    setSystemLines(buildInitialLines(hasLogger, warningsRef.current));
    setCountdown(null);
  }, [hasLogger]);

  const startPreflight = useCallback(() => {
    resetSequence();
    setPhase('preflight');
  }, [resetSequence]);

  const cancelPreflight = useCallback(() => {
    stopStartSequenceSpeech();
    setPhase('idle');
    resetSequence();
  }, [resetSequence]);

  const finishToIdle = useCallback(() => {
    stopStartSequenceSpeech();
    setPhase('idle');
    resetSequence();
  }, [resetSequence]);

  useEffect(() => {
    if (phase !== 'preflight') return;

    let cancelled = false;

    const run = async () => {
      const phaseStarted = Date.now();
      setSequencePhase('system_check');

      for (const warning of warningsRef.current) {
        if (cancelled) return;
        setSystemLines((prev) => setLineStatus(prev, warning.id, 'blink'));
        await delay(WARN_LINE_MS);
        if (cancelled) return;
        setSystemLines((prev) => setLineStatus(prev, warning.id, 'solid'));
      }

      setSystemLines((prev) => setLineStatus(prev, 'init', 'blink'));

      if (feedback.soundEnabled) {
        speakSystemCheckIntro();
      }

      await delay(650);
      if (cancelled) return;
      setSystemLines((prev) => setLineStatus(prev, 'init', 'solid'));

      for (const check of SENSOR_CHECKS) {
        if (check.needsLogger && !hasLogger) continue;
        if (cancelled) return;

        setSystemLines((prev) => setLineStatus(prev, check.id, 'blink'));

        await waitForCheck(check.id, () =>
          isCheckReady(check.id, motionRef.current, gpsRef.current),
        );

        if (cancelled) return;
        setSystemLines((prev) => setLineStatus(prev, check.id, 'solid'));
      }

      setSystemLines((prev) => setLineStatus(prev, 'all_go', 'blink'));
      await delay(450);
      if (cancelled) return;
      setSystemLines((prev) => setLineStatus(prev, 'all_go', 'solid'));

      const elapsed = Date.now() - phaseStarted;
      if (elapsed < SYSTEM_CHECK_MIN_MS) {
        await delay(SYSTEM_CHECK_MIN_MS - elapsed);
      }

      if (cancelled) return;
      setSequencePhase('countdown');

      for (let n = COUNTDOWN_FROM; n >= 1; n--) {
        if (cancelled) return;
        setCountdown(n);
        if (feedback.soundEnabled) speakCountdown(n);
        await delay(COUNTDOWN_STEP_MS);
      }

      if (cancelled) return;
      setCountdown(0);
      if (feedback.soundEnabled) speakCountdown(0);
      await delay(GO_HOLD_MS);

      if (cancelled) return;
      stopStartSequenceSpeech();
      setPhase('recording');
      setCountdown(null);
      resetSequence();
      onGoRef.current();
    };

    void run();

    return () => {
      cancelled = true;
      stopStartSequenceSpeech();
    };
  }, [phase, hasLogger, feedback.soundEnabled, resetSequence]);

  const isPreflight = phase === 'preflight';
  const isRecording = phase === 'recording';
  const metersLive = isPreflight || isRecording;
  const setupWarnings = warnings;

  return {
    phase,
    isPreflight,
    isRecording,
    metersLive,
    sequencePhase,
    systemLines,
    countdown,
    setupWarnings,
    startPreflight,
    cancelPreflight,
    finishToIdle,
  };
};
