/**
 * 設定画面 — 外部ロガー接続パネル
 */

import { useCallback, useState, useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import {
  ACCURACY_GRADE_LABELS,
  LOGGER_TIER_LABELS,
} from '@/data/loggerPresets';
import { useLogger } from '@/contexts/LoggerContext';
import { describeScoringAdjustments } from '@/lib/loggerCapabilities';
import { LOGGER_PROTOCOL_LABELS } from '@/lib/bluetooth/loggerProtocol';
import { isLikelyTelemetryDevice } from '@/lib/bluetooth/loggerBleProfiles';

function ConnectionStatusBar({
  isConnected,
  status,
}: {
  isConnected: boolean;
  status: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const label = isConnected
    ? '接続済'
    : status === 'connecting'
      ? '接続中…'
      : status === 'scanning'
        ? 'スキャン中…'
        : status === 'error'
          ? 'エラー'
          : '未接続';

  return (
    <View style={[
      styles.statusBar,
      isConnected ? styles.statusBarOn : styles.statusBarOff,
    ]}>
      <View style={[
        styles.statusBarDot,
        { backgroundColor: isConnected ? colors.neonGreen : colors.textMuted },
      ]} />
      <Text style={[
        styles.statusBarLabel,
        isConnected && styles.statusBarLabelOn,
      ]}>
        接続状態: {label}
      </Text>
      <Text style={[
        styles.statusBarBadge,
        isConnected ? styles.statusBarBadgeOn : styles.statusBarBadgeOff,
      ]}>
        {isConnected ? 'ON' : 'OFF'}
      </Text>
    </View>
  );
}

export function LoggerSettingsPanel() {
  const styles = useStyles();
  const { colors } = useTheme();
  const {
    status,
    device,
    pairedDevice,
    capabilities,
    discoveredDevices,
    isConnected,
    isHydrated,
    scan,
    connect,
    reconnectPaired,
    disconnect,
    forgetPaired,
    errorMessage,
    bleAvailable,
    bleHint,
    lastSample,
    detectedProtocol,
    inferredCapabilities,
  } = useLogger();

  const [busy, setBusy] = useState(false);

  const handleScan = useCallback(async () => {
    setBusy(true);
    try {
      await scan();
    } finally {
      setBusy(false);
    }
  }, [scan]);

  const handleConnect = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await connect(id);
      } finally {
        setBusy(false);
      }
    },
    [connect],
  );

  const handleReconnect = useCallback(async () => {
    setBusy(true);
    try {
      await reconnectPaired();
    } finally {
      setBusy(false);
    }
  }, [reconnectPaired]);

  const handleDisconnect = useCallback(async () => {
    setBusy(true);
    try {
      await disconnect();
    } finally {
      setBusy(false);
    }
  }, [disconnect]);

  const handleForget = useCallback(async () => {
    setBusy(true);
    try {
      await forgetPaired();
    } finally {
      setBusy(false);
    }
  }, [forgetPaired]);

  const adjustments = describeScoringAdjustments(capabilities);
  const hasScanned = discoveredDevices.length > 0;

  if (!isHydrated) {
    return (
      <TelemetryFrame style={styles.frame}>
        <ActivityIndicator size="small" color={colors.neonGreen} />
      </TelemetryFrame>
    );
  }

  return (
    <TelemetryFrame style={styles.frame}>
      <Text style={styles.hint}>
        任意の BLE テレメトリデバイスに接続し、データ形式を自動判別します。
        対応形式: UBX/RaceBox 互換・JSON・NMEA・CSV。
        {bleAvailable
          ? '\nスキャンで近くの Bluetooth デバイスをすべて表示します。'
          : bleHint
            ? `\n${bleHint}`
            : '\nDevelopment Build が必要です。'}
      </Text>

      <ConnectionStatusBar isConnected={isConnected} status={status} />

      {isConnected && device ? (
        <View style={styles.connectedBox}>
          <Text style={styles.connectedName}>{device.name}</Text>
          <Text style={styles.connectedMeta}>
            {device.transport === 'ble'
              ? `形式: ${LOGGER_PROTOCOL_LABELS[detectedProtocol]}`
              : `${device.manufacturer} · ${device.model}`}
          </Text>
          {inferredCapabilities ? (
            <Text style={styles.connectedMeta}>
              推定能力: {LOGGER_TIER_LABELS[inferredCapabilities.tier]} ·{' '}
              {ACCURACY_GRADE_LABELS[inferredCapabilities.accuracyGrade]}
            </Text>
          ) : (
            <Text style={styles.connectedMeta}>
              {LOGGER_TIER_LABELS[capabilities.tier]} ·{' '}
              {ACCURACY_GRADE_LABELS[capabilities.accuracyGrade]}
            </Text>
          )}
          <View style={styles.adjustList}>
            {adjustments.map((line) => (
              <Text key={line} style={styles.adjustLine}>
                ✓ {line}
              </Text>
            ))}
          </View>
          {device.transport === 'ble' && lastSample ? (
            <View style={styles.liveSample}>
              <Text style={styles.liveSampleTitle}>ライブ計測（BLE）</Text>
              <Text style={styles.liveSampleLine}>
                G {lastSample.lateralG?.toFixed(2) ?? '—'} /{' '}
                {lastSample.longitudinalG?.toFixed(2) ?? '—'}
                {' · '}
                {lastSample.speedKmh?.toFixed(0) ?? '—'} km/h
                {' · '}
                slip {lastSample.slipAngleDeg?.toFixed(0) ?? '—'}°
              </Text>
            </View>
          ) : null}
          <GamePressable
            onPress={handleDisconnect}
            disabled={busy}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.disconnectBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.disconnectLabel}>切断する</Text>
          </GamePressable>
        </View>
      ) : (
        <>
          {!hasScanned && pairedDevice ? (
            <View style={styles.pairedBox}>
              <Text style={styles.pairedTitle}>前回使用したロガー</Text>
              <Text style={styles.pairedName}>{pairedDevice.name}</Text>
              <Text style={styles.pairedHint}>
                現在は未接続です。再接続するか、新しいロガーをスキャンしてください。
              </Text>
              <View style={styles.pairedActions}>
                <GamePressable
                  onPress={handleReconnect}
                  disabled={busy || status === 'connecting'}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.scanBtn,
                    styles.pairedBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.scanLabel}>再接続</Text>
                </GamePressable>
                <GamePressable
                  onPress={handleForget}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.forgetBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.forgetLabel}>登録解除</Text>
                </GamePressable>
              </View>
            </View>
          ) : null}

          <GamePressable
            onPress={handleScan}
            disabled={busy || status === 'scanning'}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.scanBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            {status === 'scanning' || busy ? (
              <ActivityIndicator size="small" color={colors.neonGreen} />
            ) : (
              <Text style={styles.scanLabel}>
                {hasScanned ? '再スキャン' : 'ロガーをスキャン'}
              </Text>
            )}
          </GamePressable>

          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}

          {hasScanned ? (
            <View style={styles.deviceList}>
              <Text style={styles.listHeader}>検出されたロガー</Text>
              {discoveredDevices.map((d) => (
                <GamePressable
                  key={d.id}
                  onPress={() => handleConnect(d.id)}
                  disabled={busy || status === 'connecting'}
                  style={({ pressed }) => [
                    styles.deviceRow,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{d.name}</Text>
                  <Text style={styles.deviceMeta}>
                    {d.transport === 'ble'
                      ? `${isLikelyTelemetryDevice(d.name) ? 'テレメトリ候補' : 'BLE デバイス'} · 自動判別`
                      : `${d.manufacturer} · ${LOGGER_TIER_LABELS[d.capabilities.tier]} · MOCK`}
                  </Text>
                  </View>
                  <Text style={styles.connectLabel}>
                    {status === 'connecting' ? '接続中…' : '接続する'}
                  </Text>
                </GamePressable>
              ))}
            </View>
          ) : (
            <Text style={styles.scanHint}>
              スキャン後に近くのロガーが表示されます
            </Text>
          )}
        </>
      )}
    </TelemetryFrame>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  frame: { gap: spacing.sm },
  hint: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 14,
    textTransform: 'none',
    letterSpacing: 0.3,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusBarOn: {
    borderColor: colors.neonGreen + '55',
    backgroundColor: '#00CC6A0A',
  },
  statusBarOff: {
    borderColor: colors.border,
    backgroundColor: '#111111',
  },
  statusBarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBarLabel: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 9,
    flex: 1,
    textTransform: 'none',
  },
  statusBarLabelOn: {
    color: colors.neonGreen,
  },
  statusBarBadge: {
    ...typography.mono,
    fontSize: 8,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  statusBarBadgeOn: {
    color: colors.neonGreen,
    backgroundColor: colors.neonGreen + '22',
  },
  statusBarBadgeOff: {
    color: colors.textMuted,
    backgroundColor: '#1A1A1A',
  },
  connectedBox: {
    borderWidth: 1,
    borderColor: colors.neonGreen + '44',
    borderRadius: 4,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: '#00CC6A06',
  },
  connectedName: {
    ...typography.mono,
    color: colors.neonGreen,
    fontSize: 12,
    fontWeight: '700',
  },
  connectedMeta: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
  },
  adjustList: {
    marginTop: spacing.xs,
    gap: 3,
  },
  adjustLine: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 8,
    textTransform: 'none',
  },
  pairedBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: '#111111',
  },
  pairedTitle: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
  },
  pairedName: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  pairedHint: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    lineHeight: 12,
  },
  pairedActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  pairedBtn: {
    flex: 1,
  },
  actionBtn: {
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  scanBtn: {
    borderColor: colors.neonGreenDim,
    backgroundColor: '#00CC6A0A',
  },
  scanLabel: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 10,
  },
  disconnectBtn: {
    marginTop: spacing.sm,
    borderColor: colors.border,
  },
  disconnectLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
  },
  forgetBtn: {
    flex: 1,
    borderColor: colors.border,
  },
  forgetLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
  },
  errorText: {
    ...typography.mono,
    color: '#FF6688',
    fontSize: 8,
    textTransform: 'none',
  },
  scanHint: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    textAlign: 'center',
    textTransform: 'none',
  },
  deviceList: { gap: spacing.xs },
  listHeader: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    marginTop: spacing.xs,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  deviceInfo: { flex: 1, gap: 2 },
  deviceName: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  deviceMeta: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
  },
  connectLabel: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 8,
  },
  liveSample: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 3,
  },
  liveSampleTitle: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 8,
  },
  liveSampleLine: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 8,
    textTransform: 'none',
  },
});
}

function useStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createStyles(colors, typography, spacing),
    [colors, typography, spacing],
  );
}
