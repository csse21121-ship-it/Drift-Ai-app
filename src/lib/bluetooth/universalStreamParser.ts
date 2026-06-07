/**
 * 複数プロトコルを自動判別するユニバーサルストリームパーサー
 */

import { CsvTelemetryParser } from '@/lib/bluetooth/csvTelemetryParser';
import { parseJsonFromTextBuffer } from '@/lib/bluetooth/jsonTelemetryParser';
import { parseNmeaFromTextBuffer } from '@/lib/bluetooth/nmeaParser';
import type { LoggerProtocolId, ParsedLoggerFrame } from '@/lib/bluetooth/loggerProtocol';
import { RaceBoxStreamParser } from '@/lib/bluetooth/raceboxParser';
import type { LoggerSample } from '@/types/logger';

const MAX_TEXT_BUFFER = 8192;

function mergeSamples(base: LoggerSample, extra: LoggerSample): LoggerSample {
  return {
    timestamp: extra.timestamp || base.timestamp || Date.now(),
    lateralG: extra.lateralG ?? base.lateralG,
    longitudinalG: extra.longitudinalG ?? base.longitudinalG,
    yawRateRad: extra.yawRateRad ?? base.yawRateRad,
    slipAngleDeg: extra.slipAngleDeg ?? base.slipAngleDeg,
    speedKmh: extra.speedKmh ?? base.speedKmh,
    heading: extra.heading ?? base.heading,
    latitude: extra.latitude ?? base.latitude,
    longitude: extra.longitude ?? base.longitude,
  };
}

function bytesToText(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function looksTextual(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  let printable = 0;
  for (const b of bytes) {
    if (b === 0x0a || b === 0x0d || b === 0x09 || (b >= 0x20 && b <= 0x7e)) printable++;
  }
  return printable / bytes.length > 0.85;
}

export class UniversalStreamParser {
  private racebox = new RaceBoxStreamParser();
  private csv = new CsvTelemetryParser();
  private textBuffer = '';
  private lockedProtocol: LoggerProtocolId | null = null;

  reset(): void {
    this.racebox = new RaceBoxStreamParser();
    this.csv.reset();
    this.textBuffer = '';
    this.lockedProtocol = null;
  }

  getDetectedProtocol(): LoggerProtocolId {
    return this.lockedProtocol ?? 'unknown';
  }

  push(bytes: Uint8Array): ParsedLoggerFrame | null {
    if (this.lockedProtocol === 'racebox-ubx') {
      const sample = this.racebox.push(bytes);
      return sample ? { sample, protocolId: 'racebox-ubx' } : null;
    }

    if (bytes.length >= 2 && bytes[0] === 0xb5 && bytes[1] === 0x62) {
      const sample = this.racebox.push(bytes);
      if (sample) {
        this.lockedProtocol = 'racebox-ubx';
        return { sample, protocolId: 'racebox-ubx' };
      }
    }

    if (!looksTextual(bytes) && bytes.length >= 2) {
      const sample = this.racebox.push(bytes);
      if (sample) {
        this.lockedProtocol = 'racebox-ubx';
        return { sample, protocolId: 'racebox-ubx' };
      }
    }

    this.textBuffer += bytesToText(bytes);
    if (this.textBuffer.length > MAX_TEXT_BUFFER) {
      this.textBuffer = this.textBuffer.slice(-MAX_TEXT_BUFFER);
    }

    return this.parseTextBuffer();
  }

  private parseTextBuffer(): ParsedLoggerFrame | null {
    if (this.lockedProtocol === 'json' || this.lockedProtocol === null) {
      const json = parseJsonFromTextBuffer(this.textBuffer);
      this.textBuffer = json.rest;
      if (json.sample) {
        this.lockedProtocol = 'json';
        return { sample: json.sample, protocolId: 'json' };
      }
    }

    if (this.lockedProtocol === 'nmea' || this.lockedProtocol === null) {
      const nmea = parseNmeaFromTextBuffer(this.textBuffer);
      this.textBuffer = nmea.rest;
      if (nmea.sample) {
        this.lockedProtocol = 'nmea';
        return { sample: nmea.sample, protocolId: 'nmea' };
      }
    }

    if (this.lockedProtocol === 'csv' || this.lockedProtocol === null) {
      const lines = this.textBuffer.split(/\r?\n/);
      this.textBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const sample = this.csv.pushLine(line);
        if (sample) {
          this.lockedProtocol = 'csv';
          return { sample, protocolId: 'csv' };
        }
      }
    }

    return null;
  }
}

/** 複数の部分サンプルを1つに統合 */
export function coalesceLoggerSamples(samples: LoggerSample[]): LoggerSample | null {
  if (samples.length === 0) return null;
  return samples.reduce((acc, s) => mergeSamples(acc, s));
}
