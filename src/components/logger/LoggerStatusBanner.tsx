/**
 * 外部ロガー接続状態バナー
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';
import { ACCURACY_GRADE_LABELS, LOGGER_TIER_LABELS } from '@/data/loggerPresets';
import { useLogger } from '@/contexts/LoggerContext';
import { usePhoneCapabilities } from '@/contexts/PhoneCapabilitiesContext';

type LoggerStatusBannerProps = {
  variant?: 'compact' | 'full' | 'inline';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const STATUS_LABELS = {
  disconnected: '未接続',
  scanning: 'スキャン中…',
  connecting: '接続中…',
  connected: '接続済',
  error: '接続エラー',
} as const;

export function LoggerStatusBanner({
  variant = 'inline',
  onPress,
  style,
}: LoggerStatusBannerProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const {
    status,
    device,
    pairedDevice,
    capabilities,
    isConnected,
    isHydrated,
    errorMessage,
  } = useLogger();
  const { phoneCapabilities, probeStatus } = usePhoneCapabilities();

  const handlePress = onPress ?? (() => router.push('/settings'));

  if (!isHydrated) return null;

  const dotColor = isConnected
    ? colors.neonGreen
    : status === 'scanning' || status === 'connecting'
      ? colors.amber
      : status === 'error'
        ? '#FF4466'
        : colors.textMuted;

  const tierLabel = LOGGER_TIER_LABELS[capabilities.tier];
  const accuracyLabel = ACCURACY_GRADE_LABELS[capabilities.accuracyGrade];

  const statusBadge = isConnected ? 'ON' : 'OFF';
  const statusBadgeColor = isConnected ? colors.neonGreen : colors.textMuted;

  if (variant === 'compact') {
    return (
      <GamePressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.compact,
          isConnected && styles.compactConnected,
          pressed && styles.pressed,
        ]}
        hitSlop={6}
      >
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.compactStatus, { color: statusBadgeColor }]}>
          {statusBadge}
        </Text>
        <Text style={styles.compactLabel} numberOfLines={1}>
          {isConnected ? device?.name ?? 'LOGGER' : 'LOGGER'}
        </Text>
      </GamePressable>
    );
  }

  const title = isConnected
    ? `LOGGER · ${device?.name ?? 'External'}`
    : 'EXTERNAL LOGGER';

  let sub = STATUS_LABELS[status];
  if (isConnected) {
    sub = `${STATUS_LABELS.connected} · ${tierLabel} · ${accuracyLabel} · 採点自動調整 ON`;
  } else if (!isConnected && pairedDevice && status === 'disconnected') {
    sub = `未接続 · 前回: ${pairedDevice.name}（設定から再接続）`;
  } else if (!isConnected) {
    const caps = phoneCapabilities;
    sub = probeStatus === 'probing'
      ? '端末センサー計測中…'
      : `未接続 · スマホ ${caps.gSampleRateHz}Hz G / ${caps.gpsSampleRateHz}Hz GPS · 採点自動調整`;
  }

  return (
    <GamePressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.banner,
        variant === 'full' && styles.bannerFull,
        isConnected && styles.bannerConnected,
        !isConnected && styles.bannerDisconnected,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={styles.textBlock}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, isConnected && styles.titleConnected]}>
              {title}
            </Text>
            <View style={[
              styles.statusPill,
              isConnected ? styles.statusPillOn : styles.statusPillOff,
            ]}>
              <Text style={[
                styles.statusPillText,
                isConnected ? styles.statusPillTextOn : styles.statusPillTextOff,
              ]}>
                {statusBadge}
              </Text>
            </View>
          </View>
          <Text style={styles.sub}>{sub}</Text>
          {status === 'error' && errorMessage ? (
            <Text style={styles.error}>{errorMessage}</Text>
          ) : null}
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </GamePressable>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 130,
  },
  compactConnected: {
    borderColor: colors.neonGreen + '55',
  },
  compactStatus: {
    ...typography.mono,
    fontSize: 7,
    fontWeight: '800',
  },
  compactLabel: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 8,
    fontWeight: '700',
    flexShrink: 1,
  },
  banner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: '#0A0A0A',
  },
  bannerFull: {
    marginHorizontal: 0,
  },
  bannerConnected: {
    borderColor: colors.neonGreen + '55',
    backgroundColor: '#00CC6A08',
  },
  bannerDisconnected: {
    borderColor: colors.border,
    backgroundColor: '#0A0A0A',
  },
  pressed: { opacity: 0.75 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  textBlock: { flex: 1, gap: 2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    flex: 1,
  },
  titleConnected: {
    color: colors.neonGreenDim,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  statusPillOn: {
    borderColor: colors.neonGreen + '88',
    backgroundColor: colors.neonGreen + '18',
  },
  statusPillOff: {
    borderColor: colors.border,
    backgroundColor: '#111111',
  },
  statusPillText: {
    ...typography.mono,
    fontSize: 7,
    fontWeight: '800',
  },
  statusPillTextOn: {
    color: colors.neonGreen,
  },
  statusPillTextOff: {
    color: colors.textMuted,
  },
  sub: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.3,
  },
  error: {
    ...typography.mono,
    color: '#FF6688',
    fontSize: 8,
    marginTop: 2,
  },
  chevron: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 16,
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
