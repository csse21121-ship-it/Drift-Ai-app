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
import type {
  StartSequencePhase,
  SystemCheckLine,
} from '@/hooks/useSessionPreflight';

type Props = {
  visible: boolean;
  sequencePhase: StartSequencePhase;
  systemLines: SystemCheckLine[];
  countdown: number | null;
  onAbort?: () => void;
};

export function StartSequenceOverlay({
  visible,
  sequencePhase,
  systemLines,
  countdown,
  onAbort,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const scanY = useRef(new Animated.Value(0)).current;
  const countdownScale = useRef(new Animated.Value(0.75)).current;
  const goScale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!visible) return;
    scanY.setValue(0);
    const loop = Animated.loop(
      Animated.timing(scanY, {
        toValue: 1,
        duration: 2800,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, scanY]);

  useEffect(() => {
    if (countdown == null || countdown === 0) return;
    countdownScale.setValue(0.72);
    Animated.spring(countdownScale, {
      toValue: 1,
      friction: 5,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [countdown, countdownScale]);

  useEffect(() => {
    if (countdown !== 0) return;
    goScale.setValue(0.55);
    Animated.spring(goScale, {
      toValue: 1,
      friction: 4,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [countdown, goScale]);

  const scanTranslate = scanY.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 900],
  });

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <GameHudCorners colors={colors} accent={colors.neonGreen} />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanLine,
            { transform: [{ translateY: scanTranslate }] },
          ]}
        />

        <View style={styles.grid} pointerEvents="none" />

        <View style={styles.header}>
          <Text style={styles.kicker}>NEO STREET TELEMETRY</Text>
          <Text style={styles.phaseLabel}>
            {sequencePhase === 'system_check' ? 'SYSTEM CHECK' : 'START SEQUENCE'}
          </Text>
        </View>

        <View style={styles.body}>
          {sequencePhase === 'system_check' ? (
            <View style={styles.checkStack}>
              {systemLines.map((line) => (
                <SystemLineRow key={line.id} line={line} />
              ))}
            </View>
          ) : (
            <View style={styles.countdownWrap}>
              {countdown != null ? (
                <Animated.Text
                  style={[
                    styles.countdown,
                    countdown === 0 && styles.countdownGo,
                    {
                      transform: [
                        {
                          scale: countdown === 0 ? goScale : countdownScale,
                        },
                      ],
                    },
                  ]}
                >
                  {countdown === 0 ? 'GO GO GO!!!' : countdown}
                </Animated.Text>
              ) : null}
              <Text style={styles.countdownHint}>STAND BY FOR LAUNCH</Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.statusBar}>
            <PulseDot />
            <Text style={styles.statusText}>
              {sequencePhase === 'system_check'
                ? 'CALIBRATING SENSORS'
                : 'ARMED · RECORDING IMMINENT'}
            </Text>
          </View>

          {onAbort ? (
            <GamePressable
              onPress={onAbort}
              style={({ pressed }) => [
                styles.abortBtn,
                pressed && { opacity: 0.65 },
              ]}
            >
              <Text style={styles.abortText}>ABORT CHECK</Text>
            </GamePressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function SystemLineRow({ line }: { line: SystemCheckLine }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (line.status !== 'blink') {
      blink.setValue(line.status === 'hidden' ? 0.15 : 1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.2, duration: 220, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [line.status, blink]);

  if (line.status === 'hidden') return null;

  const tone =
    line.status === 'solid'
      ? line.tone === 'warn'
        ? colors.amber
        : colors.neonGreen
      : line.tone === 'warn'
        ? colors.amber
        : colors.neonGreenDim;

  return (
    <Animated.View style={[styles.lineRow, { opacity: blink }]}>
      <Text style={[styles.linePrefix, { color: tone }]}>{'>'}</Text>
      <Text style={[styles.lineText, { color: tone }]}>{line.text}</Text>
    </Animated.View>
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
      backgroundColor: colors.neonGreen + '33',
      shadowColor: colors.neonGreen,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 8,
    },
    grid: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.06,
      borderWidth: 1,
      borderColor: colors.neonGreen,
      margin: 18,
    },
    header: {
      alignItems: 'center',
      gap: 8,
    },
    kicker: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 9,
      letterSpacing: 4,
    },
    phaseLabel: {
      ...typography.mono,
      color: colors.neonGreen,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 6,
      textShadowColor: colors.neonGreen + 'AA',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 12,
    },
    body: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 24,
    },
    checkStack: {
      width: '100%',
      maxWidth: 340,
      gap: 14,
    },
    lineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    linePrefix: {
      ...typography.mono,
      fontSize: 14,
      fontWeight: '800',
    },
    lineText: {
      ...typography.mono,
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 2,
      textShadowColor: colors.neonGreen + '66',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 8,
    },
    countdownWrap: {
      alignItems: 'center',
      gap: 16,
    },
    countdown: {
      ...typography.title,
      color: colors.neonGreen,
      fontSize: 120,
      letterSpacing: 8,
      lineHeight: 130,
      textShadowColor: colors.neonGreen,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 24,
    },
    countdownGo: {
      fontSize: 88,
      color: colors.neonGreen,
      letterSpacing: 10,
    },
    countdownHint: {
      ...typography.label,
      color: colors.neonGreenDim,
      fontSize: 10,
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
    abortBtn: {
      borderWidth: 1,
      borderColor: colors.textMuted + '88',
      borderRadius: 4,
      paddingHorizontal: 18,
      paddingVertical: 10,
      backgroundColor: colors.surfaceElevated + 'CC',
    },
    abortText: {
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
