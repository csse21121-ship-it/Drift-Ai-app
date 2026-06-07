/**
 * ロガープロトコル識別子（製品名ではなくデータ形式）
 */

export type LoggerProtocolId =
  | 'unknown'
  | 'racebox-ubx'
  | 'json'
  | 'nmea'
  | 'csv';

export const LOGGER_PROTOCOL_LABELS: Record<LoggerProtocolId, string> = {
  'unknown':     '自動検出中',
  'racebox-ubx': 'UBX / RaceBox 互換',
  'json':        'JSON テレメトリ',
  'nmea':        'NMEA GPS',
  'csv':         'CSV テレメトリ',
};

export type ParsedLoggerFrame = {
  sample: import('@/types/logger').LoggerSample;
  protocolId: LoggerProtocolId;
};
