/**
 * BLE ロガー接続マネージャ（汎用 — 製品名非依存）
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Device, Subscription } from 'react-native-ble-plx';
import {
  discoverNotifyCharacteristics,
  pickNotifyTargets,
} from '@/lib/bluetooth/bleNotifyDiscovery';
import { buildUniversalBleDevice } from '@/lib/bluetooth/loggerBleProfiles';
import type { LoggerProtocolId } from '@/lib/bluetooth/loggerProtocol';
import { UniversalStreamParser } from '@/lib/bluetooth/universalStreamParser';
import type { LoggerDevice, LoggerSample } from '@/types/logger';

export type BleSampleCallback = (sample: LoggerSample) => void;
export type BleProtocolCallback = (protocolId: LoggerProtocolId) => void;

let managerInstance: import('react-native-ble-plx').BleManager | null = null;
let loadError: string | null = null;

async function getBleManager(): Promise<import('react-native-ble-plx').BleManager | null> {
  if (managerInstance) return managerInstance;
  if (loadError) return null;

  try {
    const { BleManager, State } = await import('react-native-ble-plx');
    const mgr = new BleManager();
    const state = await mgr.state();
    if (state === State.PoweredOff && Platform.OS === 'ios') {
      // Bluetooth OFF — 接続時にエラーになる
    }
    managerInstance = mgr;
    return mgr;
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'BLE module unavailable';
    return null;
  }
}

export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

export async function isBleAvailable(): Promise<boolean> {
  if (isExpoGo()) return false;
  const mgr = await getBleManager();
  return mgr != null;
}

export async function getBleUnavailableReason(): Promise<string | null> {
  if (isExpoGo()) {
    return 'Expo Go では BLE ロガーに接続できません。Development Build を使用してください。';
  }
  if (loadError) return loadError;
  const mgr = await getBleManager();
  if (!mgr) return 'Bluetooth モジュールを読み込めません。';
  return null;
}

function deviceDisplayName(d: Device): string {
  return (d.localName ?? d.name)?.trim() || '';
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export class BleLoggerManager {
  private connectedDevice: Device | null = null;
  private connectedMeta: LoggerDevice | null = null;
  private sampleListener: BleSampleCallback | null = null;
  private protocolListener: BleProtocolCallback | null = null;
  private streamParser = new UniversalStreamParser();
  private monitorSubs: Subscription[] = [];
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  /** 近くの BLE デバイスをすべて列挙（製品名フィルタなし） */
  async scan(durationMs = 8000): Promise<LoggerDevice[]> {
    const mgr = await getBleManager();
    if (!mgr) return [];

    const found = new Map<string, LoggerDevice>();

    return new Promise((resolve) => {
      const finish = () => {
        if (this.scanTimer) clearTimeout(this.scanTimer);
        mgr.stopDeviceScan().catch(() => {});
        resolve([...found.values()].sort((a, b) => a.name.localeCompare(b.name)));
      };

      mgr.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          finish();
          return;
        }
        if (!device) return;

        const rawName = deviceDisplayName(device);
        const name = rawName || `BLE ${device.id.slice(-8).toUpperCase()}`;
        found.set(device.id, buildUniversalBleDevice(device.id, name));
      });

      this.scanTimer = setTimeout(finish, durationMs);
    });
  }

  async connect(
    device: LoggerDevice,
    onSample: BleSampleCallback,
    onProtocol?: BleProtocolCallback,
  ): Promise<void> {
    if (device.transport !== 'ble' || !device.bleId) {
      throw new Error('Invalid BLE logger device');
    }

    const mgr = await getBleManager();
    if (!mgr) {
      throw new Error((await getBleUnavailableReason()) ?? 'BLE unavailable');
    }

    await this.disconnect();

    const bleDevice = await mgr.connectToDevice(device.bleId, { timeout: 15000 });
    await bleDevice.discoverAllServicesAndCharacteristics();

    const notifyChars = await discoverNotifyCharacteristics(bleDevice);
    const targets = pickNotifyTargets(notifyChars, 2);
    if (targets.length === 0) {
      await bleDevice.cancelConnection();
      throw new Error(
        'このデバイスからテレメトリを受信できません（通知特性が見つかりません）',
      );
    }

    this.streamParser.reset();
    this.sampleListener = onSample;
    this.protocolListener = onProtocol ?? null;
    this.connectedDevice = bleDevice;
    this.connectedMeta = device;
    this.monitorSubs = [];

    for (const target of targets) {
      const sub = bleDevice.monitorCharacteristicForService(
        target.serviceUuid,
        target.characteristicUuid,
        (error, characteristic) => {
          if (error || !characteristic?.value) return;
          this.handleIncoming(base64ToBytes(characteristic.value));
        },
      );
      this.monitorSubs.push(sub);
    }
  }

  async disconnect(): Promise<void> {
    for (const sub of this.monitorSubs) sub.remove();
    this.monitorSubs = [];
    this.sampleListener = null;
    this.protocolListener = null;
    this.streamParser.reset();

    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
      } catch {
        // already disconnected
      }
    }
    this.connectedDevice = null;
    this.connectedMeta = null;
  }

  getConnectedDevice(): LoggerDevice | null {
    return this.connectedMeta;
  }

  getDetectedProtocol(): LoggerProtocolId {
    return this.streamParser.getDetectedProtocol();
  }

  private handleIncoming(bytes: Uint8Array): void {
    const frame = this.streamParser.push(bytes);
    if (!frame) return;

    const protocol = frame.protocolId;
    if (protocol !== 'unknown') {
      this.protocolListener?.(protocol);
    }
    this.sampleListener?.(frame.sample);
  }
}

export const bleLoggerManager = new BleLoggerManager();
