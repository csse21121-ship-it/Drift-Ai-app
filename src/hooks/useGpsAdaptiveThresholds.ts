/**
 * GPS 精度に応じたドリフト閾値のリアルタイム調整
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyGpsAccuracyRelaxation,
  buildGpsMonitorState,
  INITIAL_GPS_MONITOR,
  smoothGpsAccuracy,
  type GpsMonitorState,
} from '@/lib/gpsAccuracyMonitor';
import type { GpsSample } from '@/types/telemetry';
import type { DriftThresholds } from '@/types/settings';

type UseGpsAdaptiveThresholdsOptions = {
  isActive: boolean;
  gps: GpsSample | null;
  /** ロガー/端末能力適用済みのベース閾値 */
  baseThresholds: DriftThresholds;
  /** 外部ロガー等で速度計測が GPS 非依存の場合 minSpeed 緩和を抑える */
  loggerProvidesSpeed?: boolean;
};

export function useGpsAdaptiveThresholds({
  isActive,
  gps,
  baseThresholds,
  loggerProvidesSpeed = false,
}: UseGpsAdaptiveThresholdsOptions) {
  const smoothedRef = useRef<number | null>(null);
  const [gpsMonitor, setGpsMonitor] = useState<GpsMonitorState>(INITIAL_GPS_MONITOR);

  useEffect(() => {
    if (!isActive) {
      smoothedRef.current = null;
      setGpsMonitor(INITIAL_GPS_MONITOR);
      return;
    }

    if (!gps) return;

    smoothedRef.current = smoothGpsAccuracy(smoothedRef.current, gps.accuracy);
    setGpsMonitor(buildGpsMonitorState(smoothedRef.current));
  }, [isActive, gps]);

  const effectiveThresholds = useMemo(
    () => applyGpsAccuracyRelaxation(baseThresholds, gpsMonitor.quality, {
      loggerProvidesSpeed,
    }),
    [baseThresholds, gpsMonitor.quality, loggerProvidesSpeed],
  );

  return {
    effectiveThresholds,
    gpsMonitor,
  };
}
