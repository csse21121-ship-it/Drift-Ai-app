/**
 * LoggerContext
 *
 * 外部 Bluetooth ロガー — 製品非依存の汎用接続 + 能力自動推定
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
import { inferLoggerCapabilities } from '@/lib/bluetooth/loggerCapabilityInference';
import type { LoggerProtocolId } from '@/lib/bluetooth/loggerProtocol';
import {
  connectBleLogger,
  disconnectBleLogger,
  getBleUnavailableReason,
  isBleAvailable,
  isExpoGo,
  scanBleLoggers,
} from '@/lib/bluetooth/loggerTransport';
import { MOCK_LOGGER_DEVICES } from '@/data/loggerPresets';
import { resolveCapabilities } from '@/lib/loggerCapabilities';
import { synthesizeLoggerSample } from '@/lib/loggerTelemetryMerge';
import type {
  LoggerCapabilities,
  LoggerConnectionStatus,
  LoggerDevice,
  LoggerSample,
} from '@/types/logger';
import { PHONE_CAPABILITIES } from '@/types/logger';
import type { GpsSample, MotionSample } from '@/types/telemetry';

const LOGGER_KEY = '@driftscore/paired_logger';

type PhoneIngest = {
  motion: MotionSample | null;
  gps: GpsSample | null;
  slipAngleDeg: number;
};

type LoggerContextType = {
  status: LoggerConnectionStatus;
  device: LoggerDevice | null;
  pairedDevice: LoggerDevice | null;
  capabilities: LoggerCapabilities;
  lastSample: LoggerSample | null;
  discoveredDevices: LoggerDevice[];
  errorMessage: string | null;
  isConnected: boolean;
  isHydrated: boolean;
  bleAvailable: boolean;
  bleHint: string | null;
  /** 判明したデータ形式（UBX / JSON / NMEA 等） */
  detectedProtocol: LoggerProtocolId;
  /** 受信データから推定した能力（BLE 接続時） */
  inferredCapabilities: LoggerCapabilities | null;
  scan: () => Promise<void>;
  connect: (deviceId: string) => Promise<void>;
  reconnectPaired: () => Promise<void>;
  disconnect: () => Promise<void>;
  forgetPaired: () => Promise<void>;
  ingestPhoneTelemetry: (phone: PhoneIngest) => void;
};

const LoggerContext = createContext<LoggerContextType>({
  status: 'disconnected',
  device: null,
  pairedDevice: null,
  capabilities: PHONE_CAPABILITIES,
  lastSample: null,
  discoveredDevices: [],
  errorMessage: null,
  isConnected: false,
  isHydrated: false,
  bleAvailable: false,
  bleHint: null,
  detectedProtocol: 'unknown',
  inferredCapabilities: null,
  scan: async () => {},
  connect: async () => {},
  reconnectPaired: async () => {},
  disconnect: async () => {},
  forgetPaired: async () => {},
  ingestPhoneTelemetry: () => {},
});

function findDeviceById(
  id: string,
  discovered: LoggerDevice[],
  paired: LoggerDevice | null,
): LoggerDevice | null {
  return (
    discovered.find((d) => d.id === id)
    ?? MOCK_LOGGER_DEVICES.find((d) => d.id === id)
    ?? (paired?.id === id ? paired : null)
  );
}

async function loadPairedDevice(): Promise<LoggerDevice | null> {
  try {
    const json = await AsyncStorage.getItem(LOGGER_KEY);
    if (!json) return null;
    const stored = JSON.parse(json) as LoggerDevice;
    if (stored.transport === 'mock') {
      return MOCK_LOGGER_DEVICES.find((d) => d.id === stored.id) ?? null;
    }
    return stored;
  } catch {
    return null;
  }
}

async function savePairedDevice(device: LoggerDevice): Promise<void> {
  await AsyncStorage.setItem(LOGGER_KEY, JSON.stringify(device));
}

export function LoggerProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LoggerConnectionStatus>('disconnected');
  const [device, setDevice] = useState<LoggerDevice | null>(null);
  const [pairedDevice, setPairedDevice] = useState<LoggerDevice | null>(null);
  const [lastSample, setLastSample] = useState<LoggerSample | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<LoggerDevice[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [bleAvailable, setBleAvailable] = useState(false);
  const [bleHint, setBleHint] = useState<string | null>(null);
  const [detectedProtocol, setDetectedProtocol] = useState<LoggerProtocolId>('unknown');
  const [inferredCapabilities, setInferredCapabilities] =
    useState<LoggerCapabilities | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoveredRef = useRef<LoggerDevice[]>([]);
  const sampleHistoryRef = useRef<LoggerSample[]>([]);

  const capabilities = useMemo(() => {
    if (device?.transport === 'ble' && inferredCapabilities) {
      return inferredCapabilities;
    }
    return resolveCapabilities(device);
  }, [device, inferredCapabilities]);

  const isConnected = status === 'connected' && device != null;

  useEffect(() => {
    discoveredRef.current = discoveredDevices;
  }, [discoveredDevices]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [paired, bleOk, hint] = await Promise.all([
        loadPairedDevice(),
        isBleAvailable(),
        getBleUnavailableReason(),
      ]);
      if (cancelled) return;
      if (paired) setPairedDevice(paired);
      setBleAvailable(bleOk);
      setBleHint(hint);
      setIsHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
      disconnectBleLogger().catch(() => {});
    };
  }, []);

  const scan = useCallback(async () => {
    setErrorMessage(null);
    setStatus('scanning');

    try {
      const bleDevices = bleAvailable ? await scanBleLoggers() : [];
      const mocks = isExpoGo() || __DEV__ ? MOCK_LOGGER_DEVICES : [];
      const merged = [...bleDevices, ...mocks];
      setDiscoveredDevices(merged);
      setStatus((prev) => {
        if (prev === 'connecting') return 'connecting';
        return device != null ? 'connected' : 'disconnected';
      });
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'スキャンに失敗しました');
      setStatus('error');
    }
  }, [bleAvailable, device]);

  const connectBle = useCallback(async (target: LoggerDevice) => {
    sampleHistoryRef.current = [];
    setInferredCapabilities(null);
    setDetectedProtocol('unknown');

    await connectBleLogger(
      target,
      (sample) => {
        setLastSample(sample);
        const hist = [...sampleHistoryRef.current, sample].slice(-80);
        sampleHistoryRef.current = hist;
        if (hist.length >= 4) {
          setInferredCapabilities(inferLoggerCapabilities(hist));
        }
      },
      (protocol) => {
        setDetectedProtocol(protocol);
        setDevice((prev) =>
          prev ? { ...prev, detectedProtocol: protocol } : prev,
        );
      },
    );

    setDevice(target);
    setPairedDevice(target);
    setStatus('connected');
    await savePairedDevice({ ...target, detectedProtocol: undefined });
  }, []);

  const connectMock = useCallback(async (target: LoggerDevice) => {
    await new Promise<void>((resolve) => {
      connectTimerRef.current = setTimeout(resolve, 1100);
    });
    setDevice(target);
    setPairedDevice(target);
    setStatus('connected');
    setLastSample(null);
    await savePairedDevice(target);
  }, []);

  const connect = useCallback(async (deviceId: string) => {
    const target = findDeviceById(deviceId, discoveredRef.current, pairedDevice);
    if (!target) {
      setErrorMessage('デバイスが見つかりません');
      setStatus('error');
      return;
    }

    setErrorMessage(null);
    setStatus('connecting');

    try {
      if (target.transport === 'ble') {
        await connectBle(target);
      } else {
        await connectMock(target);
      }
    } catch (e) {
      setErrorMessage(
        e instanceof Error ? e.message : 'ロガーへの接続に失敗しました',
      );
      setStatus('error');
      await disconnectBleLogger().catch(() => {});
    }
  }, [connectBle, connectMock, pairedDevice]);

  const reconnectPaired = useCallback(async () => {
    if (!pairedDevice) return;
    if (!discoveredRef.current.some((d) => d.id === pairedDevice.id)) {
      setDiscoveredDevices((prev) => {
        if (prev.some((d) => d.id === pairedDevice.id)) return prev;
        return [pairedDevice, ...prev];
      });
    }
    await connect(pairedDevice.id);
  }, [pairedDevice, connect]);

  const disconnect = useCallback(async () => {
    if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
    await disconnectBleLogger().catch(() => {});
    sampleHistoryRef.current = [];
    setInferredCapabilities(null);
    setDetectedProtocol('unknown');
    setDevice(null);
    setLastSample(null);
    setStatus('disconnected');
    setErrorMessage(null);
  }, []);

  const forgetPaired = useCallback(async () => {
    await disconnect();
    setPairedDevice(null);
    setDiscoveredDevices([]);
    await AsyncStorage.removeItem(LOGGER_KEY);
  }, [disconnect]);

  const ingestPhoneTelemetry = useCallback(
    (phone: PhoneIngest) => {
      if (!device || status !== 'connected') return;
      if (device.transport === 'ble') return;
      const sample = synthesizeLoggerSample(device, phone);
      if (sample) setLastSample(sample);
    },
    [device, status],
  );

  return (
    <LoggerContext.Provider
      value={{
        status,
        device,
        pairedDevice,
        capabilities,
        lastSample,
        discoveredDevices,
        errorMessage,
        isConnected,
        isHydrated,
        bleAvailable,
        bleHint,
        detectedProtocol,
        inferredCapabilities,
        scan,
        connect,
        reconnectPaired,
        disconnect,
        forgetPaired,
        ingestPhoneTelemetry,
      }}
    >
      {children}
    </LoggerContext.Provider>
  );
}

export function useLogger(): LoggerContextType {
  return useContext(LoggerContext);
}
