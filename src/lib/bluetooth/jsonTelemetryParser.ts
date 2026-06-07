/**
 * JSON 行 / JSON オブジェクト形式のテレメトリパーサー
 */

import { mapRecordToLoggerSample } from '@/lib/bluetooth/loggerFieldMap';
import type { LoggerSample } from '@/types/logger';

export function parseJsonTelemetryLine(line: string): LoggerSample | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === 'object') {
          const sample = mapRecordToLoggerSample(item as Record<string, unknown>);
          if (sample) return sample;
        }
      }
      return null;
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (obj.data && typeof obj.data === 'object') {
        return mapRecordToLoggerSample(obj.data as Record<string, unknown>);
      }
      if (obj.telemetry && typeof obj.telemetry === 'object') {
        return mapRecordToLoggerSample(obj.telemetry as Record<string, unknown>);
      }
      return mapRecordToLoggerSample(obj);
    }
  } catch {
    return null;
  }
  return null;
}

export function parseJsonFromTextBuffer(buffer: string): {
  sample: LoggerSample | null;
  rest: string;
} {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? '';

  for (const line of lines) {
    const sample = parseJsonTelemetryLine(line);
    if (sample) return { sample, rest };
  }

  if (rest.trim().startsWith('{')) {
    const sample = parseJsonTelemetryLine(rest.trim());
    if (sample) return { sample, rest: '' };
  }

  return { sample: null, rest };
}
