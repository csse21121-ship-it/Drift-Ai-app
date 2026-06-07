/**
 * useCalibration — センサーキャリブレーション計測フック
 */

import { DeviceMotion, Gyroscope } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeSampleVariance,
  ZERO_CALIBRATION,
  clearCalibration,
  isFixedMountOverride,
  loadCalibration,
  resolveCalibrationOrientation,
  saveCalibration,
} from '@/lib/calibration';
import { getDeviceModelLabel } from '@/lib/deviceLabel';
import {
  detectOrientation,
  remapMotion,
  smoothGravity,
  toG,
  type MountOrientation,
} from '@/lib/orientation';
import type { CalibrationData } from '@/lib/calibration';
import type { MountOrientationOverride } from '@/types/settings';

const SAMPLE_COUNT = 100;
const INTERVAL_MS = 50;
const TIMEOUT_MS = 12000;

export type CalibrationPhase =
  | 'idle'
  | 'capturing'
  | 'done'
  | 'error';

export type UseCalibrationOptions = {
  /** 手動固定中はその向きのみでサンプル収集（自動検知しない） */
  mountOverride?: MountOrientationOverride;
  /** 保存時に検出/選択した向きを settings に固定 */
  onMountLocked?: (orientation: MountOrientation) => void;
};

export type UseCalibrationReturn = {
  phase: CalibrationPhase;
  progress: number;
  calibration: CalibrationData | null;
  capture: () => void;
  clear: () => Promise<void>;
};

export function useCalibration(
  options: UseCalibrationOptions = {},
): UseCalibrationReturn {
  const { mountOverride = 'auto', onMountLocked } = options;
  const mountOverrideRef = useRef(mountOverride);
  const onMountLockedRef = useRef(onMountLocked);
  mountOverrideRef.current = mountOverride;
  onMountLockedRef.current = onMountLocked;

  const [phase, setPhase] = useState<CalibrationPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [calibration, setCalibration] = useState<CalibrationData | null>(null);

  const motionSubRef = useRef<ReturnType<typeof DeviceMotion.addListener> | null>(null);
  const gyroSubRef = useRef<ReturnType<typeof Gyroscope.addListener> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadCalibration().then((data) => {
      setCalibration(data.sampleCount > 0 ? data : null);
    });
    return () => {
      stopSensors();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopSensors = useCallback(() => {
    motionSubRef.current?.remove();
    gyroSubRef.current?.remove();
    motionSubRef.current = null;
    gyroSubRef.current = null;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const capture = useCallback(() => {
    if (phase === 'capturing') return;

    const override = mountOverrideRef.current;
    const fixedOrientation = isFixedMountOverride(override) ? override : null;

    setPhase('capturing');
    setProgress(0);

    const buf = {
      lateralG: [] as number[],
      longitudinalG: [] as number[],
      gyroX: [] as number[],
      gyroY: [] as number[],
      gyroZ: [] as number[],
    };

    const gravAcc = { x: 0, y: 0, z: 0 };
    const gyroVal = { x: 0, y: 0, z: 0 };

    /** AUTO 時のみ更新。固定時は初回から不変 */
    let detectedOrientation: MountOrientation = fixedOrientation ?? 'unknown';

    const finalize = async (success: boolean) => {
      stopSensors();

      if (!success || buf.lateralG.length < 10) {
        setPhase('error');
        return;
      }

      const mean = (arr: number[]) =>
        arr.reduce((a, b) => a + b, 0) / arr.length;

      const lateralGVariance = computeSampleVariance(buf.lateralG);
      const longitudinalGVariance = computeSampleVariance(buf.longitudinalG);
      const noiseVarianceG = Math.max(lateralGVariance, longitudinalGVariance);

      const lockedOrientation = resolveCalibrationOrientation(
        override,
        detectedOrientation,
      );

      const deviceModel = getDeviceModelLabel();
      const capturedAt = Date.now();

      const result: CalibrationData = {
        lateralGOffset: mean(buf.lateralG),
        longitudinalGOffset: mean(buf.longitudinalG),
        gyroXOffset: mean(buf.gyroX),
        gyroYOffset: mean(buf.gyroY),
        gyroZOffset: mean(buf.gyroZ),
        capturedAt,
        sampleCount: buf.lateralG.length,
        ...(lockedOrientation !== 'unknown'
          ? { mountOrientationAtCapture: lockedOrientation }
          : {}),
        mountOverrideAtCapture: override,
        ...(deviceModel ? { deviceModel } : {}),
        lateralGVariance,
        longitudinalGVariance,
        noiseVarianceG,
      };

      await saveCalibration(result);
      setCalibration(result);
      setProgress(1);
      setPhase('done');

      if (lockedOrientation !== 'unknown') {
        onMountLockedRef.current?.(lockedOrientation);
      }

      setTimeout(() => setPhase('idle'), 2000);
    };

    timeoutRef.current = setTimeout(() => finalize(false), TIMEOUT_MS);

    DeviceMotion.setUpdateInterval(INTERVAL_MS);
    Gyroscope.setUpdateInterval(INTERVAL_MS);

    gyroSubRef.current = Gyroscope.addListener(({ x, y, z }) => {
      gyroVal.x = x;
      gyroVal.y = y;
      gyroVal.z = z;
    });

    motionSubRef.current = DeviceMotion.addListener((data) => {
      const acc = data.acceleration;
      const rawG = data.accelerationIncludingGravity;
      if (!acc || !rawG) return;

      const g = smoothGravity(rawG, gravAcc);
      gravAcc.x = g.x;
      gravAcc.y = g.y;
      gravAcc.z = g.z;

      if (!fixedOrientation) {
        detectedOrientation = detectOrientation(gravAcc);
      }

      const orientation = fixedOrientation
        ?? resolveCalibrationOrientation(override, detectedOrientation);

      const remapped = remapMotion(acc, gyroVal, gravAcc, orientation);

      buf.lateralG.push(toG(remapped.lateralMs2));
      buf.longitudinalG.push(toG(remapped.longitudinalMs2));
      buf.gyroX.push(gyroVal.x);
      buf.gyroY.push(gyroVal.y);
      buf.gyroZ.push(gyroVal.z);

      setProgress(Math.min(buf.lateralG.length / SAMPLE_COUNT, 0.99));

      if (buf.lateralG.length >= SAMPLE_COUNT) {
        finalize(true);
      }
    });
  }, [phase, stopSensors]);

  const clear = useCallback(async () => {
    await clearCalibration();
    setCalibration(null);
    setPhase('idle');
    setProgress(0);
  }, []);

  return { phase, progress, calibration, capture, clear };
}
