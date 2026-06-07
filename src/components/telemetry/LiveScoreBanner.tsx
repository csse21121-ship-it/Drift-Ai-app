/**
 * LiveScoreBanner
 *
 * セッション中にヘッダー直下へ常時表示するリアルタイムスコアバナー。
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import type { LiveScore } from '@/lib/scoring';

type Props = {
  live: LiveScore;
  /** driftStatus.phase */
  driftPhase: 'idle' | 'active';
};

const COUNT_DURATION_MS = 500;

export function LiveScoreBanner({ live, driftPhase }: Props) {
  const styles = useStyles();
  const isDrifting = driftPhase === 'active' && live.previewPoints > 0;
  const settledScore = live.totalPoints;

  const [displayScore, setDisplayScore] = useState(settledScore);
  const prevScoreRef = useRef(settledScore);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isDrifting) return;
    if (settledScore === prevScoreRef.current) return;

    const startVal = prevScoreRef.current;
    const endVal = settledScore;
    prevScoreRef.current = endVal;

    if (intervalRef.current) clearInterval(intervalRef.current);

    const steps = COUNT_DURATION_MS / 16;
    let stepNum = 0;

    intervalRef.current = setInterval(() => {
      stepNum++;
      const t = stepNum / steps;
      const eased = 1 - (1 - t) ** 2;
      setDisplayScore(Math.floor(startVal + (endVal - startVal) * eased));
      if (stepNum >= steps) {
        setDisplayScore(endVal);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 16);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [settledScore, isDrifting]);

  useEffect(() => {
    if (!isDrifting) {
      setDisplayScore(settledScore);
    }
  }, [isDrifting, settledScore]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (driftPhase === 'active') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.25, duration: 450, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 450, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
    return () => {
      pulseLoop.current?.stop();
    };
  }, [driftPhase, pulseAnim]);

  const comboFlash = useRef(new Animated.Value(1)).current;
  const prevComboRef = useRef(live.displayCombo);

  useEffect(() => {
    if (live.displayCombo <= 1 || live.displayCombo === prevComboRef.current) {
      prevComboRef.current = live.displayCombo;
      return;
    }
    prevComboRef.current = live.displayCombo;
    Animated.sequence([
      Animated.timing(comboFlash, { toValue: 0.2, duration: 80, useNativeDriver: true }),
      Animated.timing(comboFlash, { toValue: 1.0, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [live.displayCombo, comboFlash]);

  const isCombo = live.displayCombo > 1;
  const hasPreview = isDrifting;
  const mainScore = isDrifting ? live.liveTotal : displayScore;

  return (
    <View style={styles.container}>
      <View style={styles.mainRow}>
        <View style={styles.scoreCell}>
          <Text style={styles.cellLabel}>LIVE SCORE</Text>
          <View style={styles.scoreValueRow}>
            <Text style={[styles.scoreValue, isDrifting && styles.scoreValueActive]}>
              {mainScore.toLocaleString()}
            </Text>
            <Text style={styles.scoreUnit}>pt</Text>
            <View style={styles.evalPill}>
              <Text style={styles.evalValue}>{live.evalScore}</Text>
              <Text style={styles.evalMax}>/100</Text>
            </View>
          </View>
        </View>

        <View style={styles.sep} />

        <View style={styles.statCell}>
          <Text style={styles.cellLabel}>COMBO</Text>
          <Animated.Text
            style={[
              styles.comboValue,
              isCombo && styles.comboValueActive,
              { opacity: comboFlash },
            ]}
          >
            ×{live.displayCombo}
          </Animated.Text>
        </View>

        <View style={styles.sep} />

        <View style={styles.statCell}>
          <Text style={styles.cellLabel}>DRIFTS</Text>
          <Text style={styles.statValue}>{live.totalDrifts}</Text>
        </View>
      </View>

      {hasPreview ? (
        <View style={styles.previewRow}>
          <Animated.View style={[styles.previewDot, { opacity: pulseAnim }]} />
          <Text style={styles.previewLabel}>DRIFTING</Text>
          {live.activeZoneMultiplier > 1 ? (
            <Text style={styles.zoneBadge}>
              ZONE ×{live.activeZoneMultiplier.toFixed(1)}
            </Text>
          ) : null}
          <View style={styles.previewFlex} />
          <Text style={styles.previewPoints}>
            +{live.previewPoints.toLocaleString()} pt
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sep: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  scoreCell: {
    flex: 2.4,
  },
  cellLabel: {
    ...typography.label,
    fontSize: 7,
    color: colors.textMuted,
    marginBottom: 2,
  },
  scoreValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    flexWrap: 'wrap',
  },
  scoreValue: {
    fontFamily: 'monospace',
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  scoreValueActive: {
    color: colors.neonGreen,
    textShadowColor: colors.neonGreen,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  scoreUnit: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.textSecondary,
  },
  evalPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.amber + '55',
    borderRadius: 3,
    backgroundColor: colors.amber + '12',
  },
  evalValue: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '700',
    color: colors.amber,
  },
  evalMax: {
    ...typography.label,
    fontSize: 7,
    color: colors.textMuted,
    marginLeft: 1,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  comboValue: {
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  comboValueActive: {
    color: colors.neonGreen,
    textShadowColor: colors.neonGreen,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  statValue: {
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  previewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neonGreen,
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  previewLabel: {
    ...typography.label,
    fontSize: 8,
    color: colors.neonGreenDim,
  },
  zoneBadge: {
    ...typography.label,
    fontSize: 8,
    color: colors.amber,
    marginLeft: spacing.xs,
  },
  previewFlex: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  previewPoints: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
    color: colors.neonGreenDim,
    letterSpacing: 1,
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
