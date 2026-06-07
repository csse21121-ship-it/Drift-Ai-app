import { useCallback, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { router, useFocusEffect } from 'expo-router';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { DailyChallengePanel } from '@/components/gamification/DailyChallengePanel';
import { DriverRankPanel } from '@/components/gamification/DriverRankPanel';
import { DriverRankHero } from '@/components/gamification/DriverRankHero';
import { ACHIEVEMENTS, TIER_COLOR } from '@/data/achievements';
import {
  loadActiveTitleId,
  loadGamificationOverview,
  loadUnlockedAt,
} from '@/lib/gamification';
import {
  loadGamificationState,
  setActiveTitleId,
} from '@/lib/gamificationStore';
import type { GamificationOverview } from '@/types/gamification';

export default function AchievementsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<GamificationOverview | null>(null);
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const [unlockedAt, setUnlockedAt] = useState<Record<string, number>>({});
  const [activeTitleId, setActiveTitleIdState] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [ov, activeId, at] = await Promise.all([
      loadGamificationOverview(),
      loadActiveTitleId(),
      loadUnlockedAt(),
    ]);
    const state = await loadGamificationState();
    setOverview(ov);
    setActiveTitleIdState(activeId);
    setUnlockedIds(state.unlockedAchievementIds);
    setUnlockedAt(at);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleEquip = async (id: string) => {
    const next = activeTitleId === id ? null : id;
    await setActiveTitleId(next);
    setActiveTitleIdState(next);
    const ov = await loadGamificationOverview();
    setOverview(ov);
  };

  const unlocked = ACHIEVEMENTS.filter((a) => unlockedIds.includes(a.id));
  const locked = ACHIEVEMENTS.filter((a) => !unlockedIds.includes(a.id));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <GamePressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          hitSlop={8}
        >
          <Text style={styles.backText}>← PIT LANE</Text>
        </GamePressable>
        <Text style={styles.title}>称号 · ミッション</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.neonGreen} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <DailyChallengePanel overview={overview} />

          <DriverRankHero rank={overview?.driverRank ?? null} interactive={false} />

          <DriverRankPanel rank={overview?.driverRank ?? null} />

          <TelemetryFrame style={styles.frame}>
            <View style={styles.frameLabelBar}>
              <Text style={styles.frameLabel}>UNLOCKED TITLES</Text>
            </View>
            {unlocked.length === 0 ? (
              <Text style={styles.empty}>
                まだ称号がありません。走行して実績を解除しましょう。
              </Text>
            ) : (
              unlocked.map((ach) => {
                const equipped = activeTitleId === ach.id;
                return (
                  <GamePressable
                    key={ach.id}
                    onPress={() => handleEquip(ach.id)}
                    style={({ pressed }) => [
                      styles.achCard,
                      equipped && styles.achCardEquipped,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.achIcon}>{ach.icon}</Text>
                    <View style={styles.achMain}>
                      <View style={styles.achTitleRow}>
                        <Text style={[styles.achTitle, { color: TIER_COLOR[ach.tier] }]}>
                          {ach.title}
                        </Text>
                        {equipped ? (
                          <Text style={styles.equippedBadge}>装備中</Text>
                        ) : null}
                      </View>
                      <Text style={styles.achName}>{ach.name}</Text>
                      <Text style={styles.achDesc}>{ach.description}</Text>
                      {unlockedAt[ach.id] ? (
                        <Text style={styles.achDate}>
                          {formatUnlockDate(unlockedAt[ach.id])}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.tierTag, { color: TIER_COLOR[ach.tier] }]}>
                      {ach.tier}
                    </Text>
                  </GamePressable>
                );
              })
            )}
          </TelemetryFrame>

          {locked.length > 0 ? (
            <TelemetryFrame style={styles.frame}>
              <View style={styles.frameLabelBar}>
                <Text style={styles.frameLabel}>LOCKED</Text>
              </View>
              {locked.map((ach) => (
                <View key={ach.id} style={[styles.achCard, styles.achCardLocked]}>
                  <Text style={[styles.achIcon, styles.achIconLocked]}>?</Text>
                  <View style={styles.achMain}>
                    <Text style={styles.achNameLocked}>{ach.name}</Text>
                    <Text style={styles.achDescLocked}>{ach.description}</Text>
                  </View>
                </View>
              ))}
            </TelemetryFrame>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function formatUnlockDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    minWidth: 90,
  },
  backText: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 10,
    letterSpacing: 1,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 14,
  },
  headerSpacer: {
    minWidth: 90,
  },
  pressed: {
    opacity: 0.65,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  frame: {
    paddingBottom: spacing.sm,
  },
  frameLabelBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  frameLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 2,
  },
  empty: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'none',
    lineHeight: 16,
  },
  achCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  achCardEquipped: {
    backgroundColor: colors.neonGreen + '0A',
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 4,
  },
  achCardLocked: {
    opacity: 0.55,
  },
  achIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  achIconLocked: {
    color: colors.textMuted,
  },
  achMain: {
    flex: 1,
    gap: 2,
  },
  achTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  achTitle: {
    ...typography.mono,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
  equippedBadge: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 7,
    letterSpacing: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: colors.neonGreenDim,
    borderRadius: 2,
  },
  achName: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 10,
    textTransform: 'none',
  },
  achDesc: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    lineHeight: 12,
  },
  achDate: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    marginTop: 2,
  },
  achNameLocked: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
    textTransform: 'none',
  },
  achDescLocked: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
  },
  tierTag: {
    ...typography.label,
    fontSize: 7,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
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
