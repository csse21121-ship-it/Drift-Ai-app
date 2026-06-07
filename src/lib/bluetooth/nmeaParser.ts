/**
 * NMEA 0183（GPRMC / GPVTG / GPGGA 等）パーサー
 */

import type { LoggerSample } from '@/types/logger';

function parseNmeaCoord(raw: string, hemisphere: string): number | undefined {
  if (!raw) return undefined;
  const dot = raw.indexOf('.');
  if (dot < 0) return undefined;
  const degLen = dot - 2;
  if (degLen < 1) return undefined;
  const deg = Number(raw.slice(0, degLen));
  const min = Number(raw.slice(degLen));
  if (!Number.isFinite(deg) || !Number.isFinite(min)) return undefined;
  let val = deg + min / 60;
  if (hemisphere === 'S' || hemisphere === 'W') val *= -1;
  return val;
}

function parseGpgga(parts: string[]): Partial<LoggerSample> {
  const lat = parseNmeaCoord(parts[2], parts[3]);
  const lon = parseNmeaCoord(parts[4], parts[5]);
  const out: Partial<LoggerSample> = {};
  if (lat != null) out.latitude = lat;
  if (lon != null) out.longitude = lon;
  return out;
}

function parseGprmc(parts: string[]): Partial<LoggerSample> {
  const status = parts[2];
  if (status !== 'A') return {};
  const lat = parseNmeaCoord(parts[3], parts[4]);
  const lon = parseNmeaCoord(parts[5], parts[6]);
  const speedKnots = Number(parts[7]);
  const course = Number(parts[8]);
  const out: Partial<LoggerSample> = {};
  if (lat != null) out.latitude = lat;
  if (lon != null) out.longitude = lon;
  if (Number.isFinite(speedKnots)) out.speedKmh = speedKnots * 1.852;
  if (Number.isFinite(course)) out.heading = course;
  return out;
}

function parseGpvtg(parts: string[]): Partial<LoggerSample> {
  const speedKmh = Number(parts[7]);
  const course = Number(parts[1]);
  const out: Partial<LoggerSample> = {};
  if (Number.isFinite(speedKmh)) out.speedKmh = speedKmh;
  if (Number.isFinite(course)) out.heading = course;
  return out;
}

export function parseNmeaSentence(sentence: string): LoggerSample | null {
  const line = sentence.trim();
  if (!line.startsWith('$')) return null;

  const star = line.indexOf('*');
  const body = star >= 0 ? line.slice(1, star) : line.slice(1);
  const parts = body.split(',');
  const type = parts[0]?.toUpperCase() ?? '';

  let partial: Partial<LoggerSample> = {};
  if (type.endsWith('GGA')) partial = parseGpgga(parts);
  else if (type.endsWith('RMC')) partial = parseGprmc(parts);
  else if (type.endsWith('VTG')) partial = parseGpvtg(parts);
  else return null;

  const hasData =
    partial.speedKmh != null
    || partial.latitude != null
    || partial.heading != null;

  if (!hasData) return null;
  return { timestamp: Date.now(), ...partial };
}

export function parseNmeaFromTextBuffer(buffer: string): {
  sample: LoggerSample | null;
  rest: string;
} {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? '';

  for (const line of lines) {
    const sample = parseNmeaSentence(line);
    if (sample) return { sample, rest };
  }

  return { sample: null, rest };
}
