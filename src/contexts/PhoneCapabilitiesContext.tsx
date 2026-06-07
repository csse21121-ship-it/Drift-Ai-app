/**
 * PhoneCapabilitiesContext
 *
 * 起動時に端末センサーをプローブし、動的な PHONE_CAPABILITIES を提供する。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  buildPhoneCapabilitiesFromProbe,
  describePhoneCapabilities,
} from '@/lib/phoneCapabilities';
import { fallbackPhoneProbe, probePhoneSensors } from '@/lib/phoneSensorProbe';
import { normalizePhoneProbeResult } from '@/lib/phoneProbeGrade';
import {
  buildSensorTuningFromCapabilities,
  DEFAULT_SENSOR_TUNING,
  describeSensorTuning,
  type SensorTuningProfile,
} from '@/lib/sensorTuning';
import type { LoggerCapabilities } from '@/types/logger';
import { PHONE_CAPABILITIES } from '@/types/logger';
import type { PhoneProbeProgress, PhoneSensorProbeResult } from '@/types/phoneSensor';
import { DEFAULT_PHONE_PROBE } from '@/types/phoneSensor';

const CACHE_KEY = '@driftscore/phone_sensor_probe';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type PhoneProbeStatus = 'idle' | 'probing' | 'ready' | 'error';

type PhoneCapabilitiesContextType = {
  phoneCapabilities: LoggerCapabilities;
  sensorTuning: SensorTuningProfile;
  probeResult: PhoneSensorProbeResult;
  probeStatus: PhoneProbeStatus;
  probeError: string | null;
  probeProgress: PhoneProbeProgress | null;
  descriptionLines: string[];
  tuningLines: string[];
  refreshProbe: () => Promise<void>;
};

const PhoneCapabilitiesContext = createContext<PhoneCapabilitiesContextType>({
  phoneCapabilities: PHONE_CAPABILITIES,
  sensorTuning: DEFAULT_SENSOR_TUNING,
  probeResult: DEFAULT_PHONE_PROBE,
  probeStatus: 'idle',
  probeError: null,
  probeProgress: null,
  descriptionLines: [],
  tuningLines: [],
  refreshProbe: async () => {},
});

function isFreshProbe(probe: PhoneSensorProbeResult): boolean {
  if (probe.probedAt <= 0) return false;
  return Date.now() - probe.probedAt < CACHE_TTL_MS;
}

async function loadCachedProbe(): Promise<PhoneSensorProbeResult | null> {
  try {
    const json = await AsyncStorage.getItem(CACHE_KEY);
    if (!json) return null;
    const parsed = normalizePhoneProbeResult(
      JSON.parse(json) as Partial<PhoneSensorProbeResult>,
    );
    return isFreshProbe(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function saveCachedProbe(probe: PhoneSensorProbeResult): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(probe));
}

export function PhoneCapabilitiesProvider({ children }: { children: React.ReactNode }) {
  const [probeResult, setProbeResult] = useState<PhoneSensorProbeResult>(DEFAULT_PHONE_PROBE);
  const [probeStatus, setProbeStatus] = useState<PhoneProbeStatus>('idle');
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probeProgress, setProbeProgress] = useState<PhoneProbeProgress | null>(null);
  const probingRef = useRef(false);

  const phoneCapabilities = useMemo(
    () => buildPhoneCapabilitiesFromProbe(probeResult),
    [probeResult],
  );

  const sensorTuning = useMemo(
    () => buildSensorTuningFromCapabilities(phoneCapabilities),
    [phoneCapabilities],
  );

  const descriptionLines = useMemo(
    () => describePhoneCapabilities(probeResult, phoneCapabilities),
    [probeResult, phoneCapabilities],
  );

  const tuningLines = useMemo(
    () => describeSensorTuning(sensorTuning, probeResult.phonePerformanceTier),
    [sensorTuning, probeResult.phonePerformanceTier],
  );

  const runProbe = useCallback(async (force = false) => {
    if (probingRef.current) return;
    probingRef.current = true;
    setProbeStatus('probing');
    setProbeError(null);
    setProbeProgress(null);

    try {
      if (!force) {
        const cached = await loadCachedProbe();
        if (cached) {
          setProbeResult(cached);
          setProbeStatus('ready');
          return;
        }
      }

      const result = await probePhoneSensors({
        requestLocation: force,
        onProgress: setProbeProgress,
      });
      setProbeResult(result);
      await saveCachedProbe(result);
      setProbeStatus('ready');
    } catch {
      const fallback = fallbackPhoneProbe();
      setProbeResult(fallback);
      setProbeError('センサー計測に失敗しました。デフォルト値を使用します。');
      setProbeStatus('error');
    } finally {
      probingRef.current = false;
      setProbeProgress(null);
    }
  }, []);

  useEffect(() => {
    runProbe(false);
  }, [runProbe]);

  const refreshProbe = useCallback(async () => {
    await runProbe(true);
  }, [runProbe]);

  return (
    <PhoneCapabilitiesContext.Provider
      value={{
        phoneCapabilities,
        sensorTuning,
        probeResult,
        probeStatus,
        probeError,
        probeProgress,
        descriptionLines,
        tuningLines,
        refreshProbe,
      }}
    >
      {children}
    </PhoneCapabilitiesContext.Provider>
  );
}

export function usePhoneCapabilities(): PhoneCapabilitiesContextType {
  return useContext(PhoneCapabilitiesContext);
}
