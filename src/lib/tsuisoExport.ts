/**
 * 追走走行データ — .tsuiso エクスポート / インポート
 * expo-sharing + expo-document-picker + AirDrop Open In（Post-Run Merge）
 */

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import type { TelemetryLogPoint } from '@/types/score';
import type { TsuisoRole, TsuisoRunExport } from '@/types/tsuiso';

export const TSUISO_EXPORT_EXT = '.tsuiso';
export const TSUISO_EXPORT_MIME = 'application/vnd.driftscore.tsuiso+json';
export const TSUISO_EXPORT_UTI = 'com.driftscore.tsuiso';

const LEGACY_JSON_EXT = '.json';

export function buildTsuisoRunExport(
  role: TsuisoRole,
  telemetryLog: TelemetryLogPoint[],
  startedAtUtcMs: number,
  sessionDurationMs: number,
  driverLabel?: string,
): TsuisoRunExport {
  return {
    formatVersion: 1,
    role,
    exportedAtUtcMs: Date.now(),
    startedAtUtcMs,
    sessionDurationMs,
    driverLabel,
    telemetryLog,
  };
}

function exportFilename(role: TsuisoRole): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `driftscore-tsuiso-${role}-${stamp}${TSUISO_EXPORT_EXT}`;
}

export function isValidRunExport(data: unknown): data is TsuisoRunExport {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (obj.formatVersion !== 1) return false;
  if (obj.role !== 'lead' && obj.role !== 'chase') return false;
  if (typeof obj.startedAtUtcMs !== 'number') return false;
  if (typeof obj.sessionDurationMs !== 'number') return false;
  if (!Array.isArray(obj.telemetryLog)) return false;
  return obj.telemetryLog.length >= 2;
}

/** 追走同期に必要な UTC + GPS が含まれるか簡易検証 */
export function countSyncReadyPoints(log: TelemetryLogPoint[]): number {
  return log.filter(
    (p) =>
      p.timestampUtcMs != null
      && Number.isFinite(p.latitude)
      && Number.isFinite(p.longitude),
  ).length;
}

export function parseTsuisoJson(raw: string): TsuisoRunExport | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidRunExport(parsed)) return null;
    if (countSyncReadyPoints(parsed.telemetryLog) < 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function parseTsuisoFileFromUri(uri: string): Promise<TsuisoRunExport | null> {
  try {
    const raw = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return parseTsuisoJson(raw);
  } catch {
    return null;
  }
}

/** AirDrop / ディープリンク URL から .tsuiso ファイル URI を解決 */
export function resolveTsuisoInboundUri(url: string): string | null {
  const decoded = decodeURIComponent(url);

  if (decoded.endsWith(TSUISO_EXPORT_EXT) || decoded.endsWith(LEGACY_JSON_EXT)) {
    if (decoded.startsWith('file://') || decoded.startsWith('content://')) {
      return decoded;
    }
  }

  if (decoded.startsWith('file://') && decoded.includes('tsuiso')) {
    return decoded;
  }

  const parsed = LinkingParseTsuisoPath(decoded);
  return parsed;
}

function LinkingParseTsuisoPath(url: string): string | null {
  try {
    const qIndex = url.indexOf('?');
    if (qIndex === -1) return null;
    const query = url.slice(qIndex + 1);
    const params = new URLSearchParams(query);
    const uri = params.get('uri') ?? params.get('url') ?? params.get('path');
    if (uri && (uri.endsWith(TSUISO_EXPORT_EXT) || uri.endsWith(LEGACY_JSON_EXT))) {
      return decodeURIComponent(uri);
    }
  } catch {
    return null;
  }
  return null;
}

export async function shareTsuisoRunExport(
  exportData: TsuisoRunExport,
): Promise<'shared' | 'unavailable' | 'failed'> {
  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) return 'failed';

    const path = `${dir}${exportFilename(exportData.role)}`;
    await FileSystem.writeAsStringAsync(path, JSON.stringify(exportData, null, 2), {
      encoding: FileSystem.EncodingType.UTF8,
    });

    let shareUri = path;
    if (Platform.OS === 'android') {
      shareUri = await FileSystem.getContentUriAsync(path);
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(shareUri, {
        mimeType: TSUISO_EXPORT_MIME,
        dialogTitle: `DriftScore AI — 追走 ${exportData.role === 'lead' ? '先行' : '後追い'} データ`,
        UTI: TSUISO_EXPORT_UTI,
      });
      return 'shared';
    }

    if (Platform.OS === 'ios') {
      const result = await Share.share({
        url: shareUri,
        title: 'DriftScore AI — 追走データ',
      });
      return result.action !== Share.dismissedAction ? 'shared' : 'unavailable';
    }

    return 'unavailable';
  } catch {
    return 'failed';
  }
}

export type ImportTsuisoResult =
  | { ok: true; data: TsuisoRunExport }
  | { ok: false; reason: 'cancelled' | 'parse_error' | 'invalid_format' | 'insufficient_gps' };

export async function pickAndImportTsuisoRun(
  expectedRole?: TsuisoRole,
): Promise<ImportTsuisoResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: [TSUISO_EXPORT_MIME, 'application/json', '*/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return { ok: false, reason: 'cancelled' };
    }

    const uri = result.assets[0].uri;
    const name = result.assets[0].name ?? '';
    if (
      !name.endsWith(TSUISO_EXPORT_EXT)
      && !name.endsWith(LEGACY_JSON_EXT)
      && !name.includes('tsuiso')
    ) {
      // 拡張子不明でも JSON として試行
    }

    const parsed = await parseTsuisoFileFromUri(uri);
    if (!parsed) {
      return { ok: false, reason: 'parse_error' };
    }

    if (expectedRole && parsed.role !== expectedRole) {
      return { ok: false, reason: 'invalid_format' };
    }

    if (countSyncReadyPoints(parsed.telemetryLog) < 2) {
      return { ok: false, reason: 'insufficient_gps' };
    }

    return { ok: true, data: parsed };
  } catch {
    return { ok: false, reason: 'parse_error' };
  }
}
