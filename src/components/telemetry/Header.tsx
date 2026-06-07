import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';import { orientationLabel } from '@/lib/orientation';
import { useTheme } from '@/contexts/ThemeContext';
import { GamePressable } from '@/components/ui/GamePressable';
import type { MountOrientation } from '@/lib/orientation';

type HeaderProps = {
  status?: 'idle' | 'arming' | 'recording';
  mountOrientation?: MountOrientation;
  /** AUTO マウント利用中 */
  mountOrientationAuto?: boolean;
  /** AUTO 時の姿勢不安定 */
  mountOrientationUnstable?: boolean;
  subtitle?: string;
  /** STANDBY 時のみ表示される戻るボタン */
  onBackPress?: () => void;
  /** STANDBY 時のみ表示される設定ボタンのコールバック */
  onSettingsPress?: () => void;
  /** STANDBY 時のみ表示されるマップコースボタンのコールバック */
  onMapPress?: () => void;
};

export function Header({
  status = 'idle',
  mountOrientation = 'unknown',
  mountOrientationAuto = false,
  mountOrientationUnstable = false,
  subtitle,
  onBackPress,
  onSettingsPress,
  onMapPress,
}: HeaderProps) {
  const { colors, typography, spacing } = useTheme();
  const orientPulse = useRef(new Animated.Value(1)).current;
  const showUnstable = mountOrientationAuto && mountOrientationUnstable;

  useEffect(() => {
    if (!showUnstable) {
      orientPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(orientPulse, {
          toValue: 0.35,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.timing(orientPulse, {
          toValue: 1,
          duration: 480,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showUnstable, orientPulse]);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderBottomWidth: 2,
          borderBottomColor: colors.neonGreen + '44',
          backgroundColor: colors.surface + 'CC',
        },
        left: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          flex: 1,
        },
        backBtn: {
          width: 28,
          height: 28,
          alignItems: 'center',
          justifyContent: 'center',
        },
        backBtnPressed: {
          opacity: 0.5,
        },
        backLabel: {
          color: colors.textSecondary,
          fontSize: 18,
          fontWeight: '600',
        },
        brandRow: {
          flexDirection: 'row',
          alignItems: 'baseline',
        },
        subtitle: {
          ...typography.label,
          color: colors.textMuted,
          fontSize: 7,
          marginTop: 2,
          letterSpacing: 2,
        },
        brand: {
          ...typography.title,
          color: colors.textPrimary,
          fontSize: 16,
          textShadowColor: colors.neonGreen + '88',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 8,
        },
        brandAccent: {
          ...typography.title,
          color: colors.neonGreen,
          fontSize: 16,
        },
        right: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        },
        orientBadge: {
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 2,
        },
        orientBadgeActive: {
          borderColor: colors.neonGreenDim,
        },
        orientLabel: {
          ...typography.label,
          color: colors.textMuted,
          fontSize: 8,
        },
        orientLabelActive: {
          color: colors.neonGreenDim,
        },
        orientBadgeUnstable: {
          borderColor: colors.amber,
          backgroundColor: colors.amber + '18',
        },
        orientLabelUnstable: {
          color: colors.amber,
        },
        mapBtn: {
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderWidth: 1,
          borderColor: colors.neonGreen + '88',
          borderRadius: 3,
          backgroundColor: colors.neonGreen + '10',
        },
        mapBtnInner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
        },
        mapBtnRecording: {
          borderColor: colors.textMuted + '66',
          backgroundColor: 'transparent',
        },
        mapBtnPressed: {
          opacity: 0.6,
        },
        mapBtnIcon: {
          color: colors.neonGreen,
          fontSize: 11,
        },
        mapBtnIconRecording: {
          color: colors.textMuted,
        },
        mapBtnLabel: {
          ...typography.label,
          color: colors.neonGreen,
          fontSize: 8,
          letterSpacing: 1,
        },
        mapBtnLabelRecording: {
          color: colors.textMuted,
        },
        settingsBtn: {
          width: 22,
          height: 22,
          alignItems: 'center',
          justifyContent: 'center',
        },
        settingsBtnPressed: {
          opacity: 0.5,
        },
        settingsIcon: {
          color: colors.textMuted,
          fontSize: 14,
        },
        statusRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
        },
        statusDot: {
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.textMuted,
        },
        statusDotActive: {
          backgroundColor: colors.recRed,
          shadowColor: colors.recRed,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: 6,
        },
        statusDotArming: {
          backgroundColor: colors.amber,
          shadowColor: colors.amber,
          shadowOpacity: 0.9,
          shadowRadius: 6,
        },
        statusLabel: {
          ...typography.label,
          color: colors.textSecondary,
          fontSize: 9,
        },
        statusLabelArming: {
          color: colors.amber,
        },
      }),
    [colors, typography, spacing],
  );

  const isRecording   = status === 'recording';
  const isArming      = status === 'arming';
  const orientLabel   = orientationLabel(mountOrientation);
  const hasOrientation = mountOrientation !== 'unknown';

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {!isRecording && !isArming && onBackPress ? (
          <GamePressable
            uiSound="back"
            onPress={onBackPress}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            hitSlop={8}
          >
            <Text style={styles.backLabel}>←</Text>
          </GamePressable>
        ) : null}
        <View>
          <View style={styles.brandRow}>
            <Text style={styles.brand}>DRIFTSCORE</Text>
            <Text style={styles.brandAccent}> AI</Text>
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      <View style={styles.right}>
        {/* 姿勢インジケーター */}
        <Animated.View
          style={[
            styles.orientBadge,
            hasOrientation && styles.orientBadgeActive,
            showUnstable && styles.orientBadgeUnstable,
            showUnstable && { opacity: orientPulse },
          ]}
        >
          <Text
            style={[
              styles.orientLabel,
              hasOrientation && styles.orientLabelActive,
              showUnstable && styles.orientLabelUnstable,
            ]}
          >
            {showUnstable ? '⚠ ' : ''}{orientLabel}
          </Text>
        </Animated.View>

        {/* マップコースボタン — 常に表示（録音中は半透明スタイル） */}
        {onMapPress ? (
          <GamePressable
            uiSound="nav"
            onPress={onMapPress}
            style={({ pressed }) => [
              styles.mapBtn,
              isRecording && styles.mapBtnRecording,
              pressed && styles.mapBtnPressed,
            ]}
            hitSlop={8}
          >
            <View style={styles.mapBtnInner}>
              <Text style={[styles.mapBtnIcon, isRecording && styles.mapBtnIconRecording]}>◈</Text>
              <Text style={[styles.mapBtnLabel, isRecording && styles.mapBtnLabelRecording]}>MAP</Text>
            </View>
          </GamePressable>
        ) : null}

        {/* 設定ボタン — STANDBY 中のみ表示 */}
        {!isRecording && !isArming && onSettingsPress ? (
          <GamePressable
            uiSound="nav"
            onPress={onSettingsPress}
            style={({ pressed }) => [styles.settingsBtn, pressed && styles.settingsBtnPressed]}
            hitSlop={8}
          >
            <Text style={styles.settingsIcon}>⚙</Text>
          </GamePressable>
        ) : null}

        {/* 計測ステータス */}
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, isRecording && styles.statusDotActive, isArming && styles.statusDotArming]} />
          <Text style={[styles.statusLabel, isArming && styles.statusLabelArming]}>
            {isRecording ? 'REC' : isArming ? 'ARM' : 'STANDBY'}
          </Text>
        </View>
      </View>
    </View>
  );
}
