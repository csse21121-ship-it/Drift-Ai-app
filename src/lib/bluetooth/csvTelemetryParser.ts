/**
 * CSV 形式テレメトリ（ヘッダー行 + データ行）
 */

import { mapRecordToLoggerSample } from '@/lib/bluetooth/loggerFieldMap';
import type { LoggerSample } from '@/types/logger';

export class CsvTelemetryParser {
  private headers: string[] | null = null;

  pushLine(line: string): LoggerSample | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('$') || trimmed.startsWith('{')) return null;

    const parts = trimmed.split(',').map((p) => p.trim());
    if (parts.length < 2) return null;

    if (!this.headers) {
      const maybeHeader = parts.some((p) => /[a-zA-Z_]/.test(p) && Number.isNaN(Number(p)));
      if (maybeHeader) {
        this.headers = parts.map((h) => h.toLowerCase());
        return null;
      }
    }

    const headers = this.headers ?? parts.map((_, i) => `col${i}`);
    const values = this.headers ? parts : parts;
    const record: Record<string, unknown> = {};
    for (let i = 0; i < Math.min(headers.length, values.length); i++) {
      record[headers[i]] = values[i];
    }

    return mapRecordToLoggerSample(record);
  }

  reset(): void {
    this.headers = null;
  }
}
