/**
 * RaceBox UBX パケットパーサー（Class 0xFF / ID 0x01）
 *
 * @see https://www.racebox.pro/products/mini-micro-protocol-documentation
 */

import type { LoggerSample } from '@/types/logger';

const SYNC = [0xb5, 0x62] as const;
const MSG_CLASS = 0xff;
const MSG_ID = 0x01;
const PAYLOAD_LEN = 80;

function readI16(buf: Uint8Array, offset: number): number {
  const v = buf[offset] | (buf[offset + 1] << 8);
  return v > 0x7fff ? v - 0x10000 : v;
}

function readU32(buf: Uint8Array, offset: number): number {
  return (
    buf[offset]
    | (buf[offset + 1] << 8)
    | (buf[offset + 2] << 16)
    | (buf[offset + 3] << 24)
  ) >>> 0;
}

function readI32(buf: Uint8Array, offset: number): number {
  const v = readU32(buf, offset);
  return v > 0x7fffffff ? v - 0x100000000 : v;
}

/** UBX Fletcher チェックサム */
function verifyChecksum(packet: Uint8Array, payloadLen: number): boolean {
  const bodyEnd = 4 + payloadLen;
  let ckA = 0;
  let ckB = 0;
  for (let i = 2; i < bodyEnd; i++) {
    ckA = (ckA + packet[i]) & 0xff;
    ckB = (ckB + ckA) & 0xff;
  }
  return ckA === packet[bodyEnd] && ckB === packet[bodyEnd + 1];
}

/** 80 byte RaceBox Data Message → 正規化サンプル */
export function parseRaceBoxPayload(payload: Uint8Array): LoggerSample | null {
  if (payload.length < PAYLOAD_LEN) return null;

  const fixStatus = payload[20];
  const fixFlags = payload[21];
  const hasFix = (fixFlags & 0x01) !== 0 && fixStatus === 3;

  const lon = readI32(payload, 24) / 1e7;
  const lat = readI32(payload, 28) / 1e7;
  const speedMs = readI32(payload, 48) / 1000;
  const speedKmh = Math.max(0, speedMs * 3.6);
  const heading = readI32(payload, 52) / 1e5;

  const gForceX = readI16(payload, 68) / 1000;
  const gForceY = readI16(payload, 70) / 1000;
  const gForceZ = readI16(payload, 72) / 1000;
  const rotZ_cdeg = readI16(payload, 78);
  const yawRateRad = (rotZ_cdeg / 100) * (Math.PI / 180);

  // ダッシュボード横向き想定: Y=横G, X=前後G（RaceBox 車両座標）
  const lateralG = gForceY;
  const longitudinalG = gForceX;

  let slipAngleDeg: number | undefined;
  if (hasFix && speedKmh >= 15) {
    slipAngleDeg = Math.atan2(lateralG, Math.max(0.15, Math.abs(longitudinalG)))
      * (180 / Math.PI);
  }

  return {
    timestamp: Date.now(),
    lateralG,
    longitudinalG,
    yawRateRad,
    slipAngleDeg,
    speedKmh: hasFix ? speedKmh : undefined,
    heading: hasFix && heading >= 0 ? heading : undefined,
    latitude: hasFix ? lat : undefined,
    longitude: hasFix ? lon : undefined,
  };
}

/**
 * 受信バイトストリームから UBX パケットを抽出してサンプル化。
 * 複数パケットがバッファに含まれる場合は最新のみ返す。
 */
export class RaceBoxStreamParser {
  private buffer: number[] = [];

  push(chunk: Uint8Array | number[]): LoggerSample | null {
    for (const b of chunk) this.buffer.push(b);

    let latest: LoggerSample | null = null;

    while (this.buffer.length >= 8) {
      const start = this.findSync();
      if (start < 0) {
        this.buffer = this.buffer.slice(-1);
        break;
      }
      if (start > 0) this.buffer.splice(0, start);

      if (this.buffer.length < 6) break;

      const cls = this.buffer[2];
      const id = this.buffer[3];
      const len = this.buffer[4] | (this.buffer[5] << 8);
      const total = 6 + len + 2;

      if (len > 512) {
        this.buffer.shift();
        continue;
      }
      if (this.buffer.length < total) break;

      const packet = Uint8Array.from(this.buffer.slice(0, total));
      this.buffer.splice(0, total);

      if (cls !== MSG_CLASS || id !== MSG_ID || len !== PAYLOAD_LEN) continue;
      if (!verifyChecksum(packet, len)) continue;

      const sample = parseRaceBoxPayload(packet.subarray(6, 6 + len));
      if (sample) latest = sample;
    }

    return latest;
  }

  reset(): void {
    this.buffer = [];
  }

  private findSync(): number {
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i] === SYNC[0] && this.buffer[i + 1] === SYNC[1]) return i;
    }
    return -1;
  }
}

export { MSG_CLASS, MSG_ID, PAYLOAD_LEN };
