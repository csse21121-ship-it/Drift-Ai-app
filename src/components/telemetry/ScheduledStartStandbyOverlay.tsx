import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { GameHudCorners } from '@/components/ui/GameHudCorners';
import { useTheme } from '@/contexts/ThemeContext';
import { formatRemainingCountdown, formatTargetLocalClock } from '@/lib/scheduledStartTime';

type Props = {
  visible: boolean;
  targetUtcMs: number;
  remainingMs: number;
  onDisarm?: () => void;
};

export function ScheduledStartStandbyOverlay({
  visible,
  targetUtcMs,
  remainingMs,
  onDisarm,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const blink = useRef(new Animated.Value(1)).current;
  const scanY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.25, duration: 420, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, blink]);

  useEffect(() => {
    if (!visible) return;
    scanY.setValue(0);
    const loop = Animated.loop(
      Animated.timing(scanY, {
        toValue: 1,
        duration: 2400,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, scanY]);

  const scanTranslate = scanY.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, 720],
  });

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <GameHudCorners colors={colors} accent={colors.neonGreen} />

        <Animated.View
          pointerEvents="none"
          style={[styles.scanLine, { transform: [{ translateY: scanTranslate }] }]}
        />

        <View style={styles.header}>
          <Text style={styles.kicker}>TSUISO SYNC START</Text>
          <Text style={styles.targetLabel}>TARGET · {formatTargetLocalClock(targetUtcMs)}</Text>
        </View>

        <View style={styles.body}>
          <Animated.Text style={[styles.standby, { opacity: blink }]}>
            SYSTEM STANDBY
          </Animated.Text>
          <Text style={styles.countdown}>{formatRemainingCountdown(remainingMs)}</Text>
          <Text style={styles.hint}>AWAITING SCHEDULED LAUNCH</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.statusBar}>
            <PulseDot />
            <Text style={styles.statusText}>ARMED · SENSORS LIVE</Text>
          </View>
          {onDisarm ? (
            <GamePressable
              onPress={onDisarm}
              style={({ pressed }) => [styles.disarmBtn, pressed && { opacity: 0.65 }]}
            >
              <Text style={styles.disarmText}>DISARM</Text>
            </GamePressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function PulseDot() {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.neonGreen,
        opacity: pulse,
        shadowColor: colors.neonGreen,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
      }}
    />
  );
}

function createStyles(
  colors: import('@/constants/uiThemes').ThemeColors,
  typography: import('@/constants/uiThemes').AppTypography,
) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: '#020402F5',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: 56,
      paddingBottom: 40,
    },
    scanLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: colors.neonGreen + '44',
      shadowColor: colors.neonGreen,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 8,
    },
    header: {
      alignItems: 'center',
      gap: 10,
    },
    kicker: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 9,
      letterSpacing: 4,
    },
    targetLabel: {
      ...typography.mono,
      color: colors.neonGreenDim,
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 4,
    },
    body: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 20,
    },
    standby: {
      ...typography.mono,
      color: colors.neonGreen,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 8,
      textShadowColor: colors.neonGreen + 'AA',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 12,
    },
    countdown: {
      ...typography.mono,
      color: colors.neonGreen,
      fontSize: 64,
      fontWeight: '800',
      letterSpacing: 4,
      fontVariant: ['tabular-nums'],
      textShadowColor: colors.neonGreen,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 18,
    },
    hint: {
      ...typography.label,
      color: colors.neonGreenDim,
      fontSize: 9,
      letterSpacing: 5,
    },
    footer: {
      gap: 16,
      alignItems: 'center',
    },
    statusBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: colors.neonGreen + '44',
      borderRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.surface + '88',
    },
    statusText: {
      ...typography.label,
      color: colors.neonGreenDim,
      fontSize: 8,
      letterSpacing: 2,
    },
    disarmBtn: {
      borderWidth: 1,
      borderColor: colors.textMuted + '88',
      borderRadius: 4,
      paddingHorizontal: 18,
      paddingVertical: 10,
      backgroundColor: colors.surfaceElevated + 'CC',
    },
    disarmText: {
      ...typography.label,
      color: colors.textSecondary,
      fontSize: 9,
      letterSpacing: 2,
    },
  });
}

function useStyles() {
  const { colors, typography } = useTheme();
  return useMemo(
    () => createStyles(colors, typography),
    [colors, typography],
  );
}
