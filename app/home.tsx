import { useCallback, useState, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useScreenBgm } from '@/hooks/useScreenBgm';
import { preloadUiSounds } from '@/lib/uiSound';
import { GamePressable } from '@/components/ui/GamePressable';
import { router, useFocusEffect } from 'expo-router';
import { MountSetupOnboarding } from '@/components/onboarding/MountSetupOnboarding';
import { PitScoreBoard } from '@/components/pit/PitScoreBoard';
import { HomeCoursePanel } from '@/components/pit/HomeCoursePanel';
import { SoloRunModes } from '@/components/pit/SoloRunModes';
import { DailyChallengePanel } from '@/components/gamification/DailyChallengePanel';
import { LoggerStatusBanner } from '@/components/logger/LoggerStatusBanner';
import { DriverRankHero } from '@/components/gamification/DriverRankHero';
import { TsuisoFlowGuide } from '@/components/tsuiso/TsuisoFlowGuide';
import { loadCourses } from '@/lib/courseStore';
import { loadGamificationOverview } from '@/lib/gamification';
import { isMountSetupComplete } from '@/lib/onboardingStore';
import { loadPitLaneSummary, type PitLaneSummary } from '@/lib/historyStats';
import { openCourses, openSplash } from '@/lib/navigation';
import type { Course } from '@/types/course';
import type { GamificationOverview } from '@/types/gamification';

const EMPTY_SUMMARY: PitLaneSummary = {
  todayBestPoints: null,
  todayBestGrade: null,
  lastPoints: null,
  lastGrade: null,
  totalRuns: 0,
};

export default function HomeScreen() {
  const styles = useStyles();
  const { id: themeId } = useTheme();
  const { settings } = useSettings();
  useScreenBgm(themeId, settings.feedback);
  const [summary, setSummary] = useState<PitLaneSummary>(EMPTY_SUMMARY);
  const [courses, setCourses] = useState<Course[]>([]);
  const [gamification, setGamification] = useState<GamificationOverview | null>(null);
  const [showMountSetup, setShowMountSetup] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadPitLaneSummary().then(setSummary);
      loadCourses().then(setCourses);
      loadGamificationOverview().then(setGamification);
      void isMountSetupComplete().then((done) => {
        if (!done) setShowMountSetup(true);
      });
      if (settings.feedback.soundEnabled) {
        void preloadUiSounds();
      }
    }, [settings.feedback.soundEnabled]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <View style={styles.brandRow}>
              <Text style={styles.brand} numberOfLines={1}>
                DRIFTSCORE
              </Text>
              <Text style={styles.brandAccent}> AI</Text>
            </View>
            <GamePressable
              uiSound="nav"
              onPress={() => openSplash()}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              hitSlop={8}
            >
              <Text style={styles.pitLabel}>PIT LANE</Text>
            </GamePressable>
          </View>

          <View style={styles.headerActions}>
            <DriverRankHero
              rank={gamification?.driverRank ?? null}
              variant="chip"
              onPress={() => router.push('/achievements')}
            />
            <GamePressable
              uiSound="nav"
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [styles.settingsBtn, pressed && styles.settingsBtnPressed]}
              hitSlop={8}
            >
              <Text style={styles.settingsIcon}>⚙</Text>
            </GamePressable>
          </View>
        </View>

        <LoggerStatusBanner variant="inline" style={styles.headerLogger} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <PitScoreBoard
          todayBestPoints={summary.todayBestPoints}
          todayBestGrade={summary.todayBestGrade}
          lastPoints={summary.lastPoints}
          lastGrade={summary.lastGrade}
          totalRuns={summary.totalRuns}
          driverRank={gamification?.driverRank ?? null}
          onRankPress={() => router.push('/achievements')}
        />

        <HomeCoursePanel courses={courses} />

        <SoloRunModes />

        {/* ── 追走モード ── */}
        <View style={styles.modeHero}>
          <View style={styles.modeHeroHeader}>
            <Text style={styles.modeHeroKicker}>TSUISO</Text>
            <Text style={styles.modeHeroTitle}>2台追走</Text>
            <Text style={styles.modeHeroSub}>
              Lead と Chase を PIN で接続。D1/FDJ 基準の追走採点。圏外は .tsuiso 共有。
            </Text>
          </View>

          <GamePressable
            onPress={() => router.push('/tsuiso')}
            style={({ pressed }) => [
              styles.modeCard,
              styles.modeCardTsuiso,
              styles.modeCardTsuisoHero,
              pressed && styles.modeCardPressed,
            ]}
          >
            <View style={styles.modeCardBody}>
              <View style={styles.modeCardHeader}>
                <Text style={styles.modeIconTsuiso}>◎</Text>
                <Text style={[styles.modeTitle, styles.modeTitleTsuiso]}>追走採点 (Tsuiso)</Text>
                <View style={styles.modeBadge}>
                  <Text style={styles.modeBadgeText}>2台</Text>
                </View>
              </View>
              <Text style={[styles.modeCta, styles.modeCtaTsuiso]}>追走モードを開く  →</Text>
            </View>
          </GamePressable>
        </View>

        <View style={styles.guide}>
          <Text style={styles.guideSectionLabel}>ソロ計測</Text>
          <GuideStep number="1" text="MY COURSES からコースを選ぶか、ソロ計測カードで開始" />
          <GuideStep number="2" text="初回ガイドで固定向き・CALIBRATE を設定" />
          <GuideStep number="3" text="STOP でスコア表示（任意でクラウド保存）" />
          <Text style={[styles.guideSectionLabel, styles.guideSectionLabelSpaced]}>2台追走</Text>
          <TsuisoFlowGuide variant="compact" />
        </View>

        <View style={styles.secondarySection}>
          <Text style={styles.secondaryLabel}>PIT DATA</Text>

          <DailyChallengePanel overview={gamification} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.subActions}>
          <GamePressable
            uiSound="nav"
            onPress={() => openCourses()}
            style={({ pressed }) => [styles.subBtn, pressed && styles.subBtnPressed]}
          >
            <Text style={[styles.subBtnLabel, styles.subBtnLabelAccent]}>コース</Text>
          </GamePressable>

          <View style={styles.subDivider} />

          <GamePressable
            uiSound="nav"
            onPress={() => router.push('/history')}
            style={({ pressed }) => [styles.subBtn, pressed && styles.subBtnPressed]}
          >
            <Text style={styles.subBtnLabel}>履歴</Text>
          </GamePressable>

          <View style={styles.subDivider} />

          <GamePressable
            uiSound="nav"
            onPress={() => router.push('/tsuiso')}
            style={({ pressed }) => [styles.subBtn, pressed && styles.subBtnPressed]}
          >
            <Text style={[styles.subBtnLabel, styles.subBtnLabelAccent]}>追走</Text>
          </GamePressable>

          <View style={styles.subDivider} />

          <GamePressable
            uiSound="nav"
            onPress={() => router.push('/achievements')}
            style={({ pressed }) => [styles.subBtn, pressed && styles.subBtnPressed]}
          >
            <Text style={styles.subBtnLabel}>称号</Text>
          </GamePressable>
        </View>
      </View>

      <MountSetupOnboarding
        visible={showMountSetup}
        onClose={() => setShowMountSetup(false)}
      />
    </SafeAreaView>
  );
}

function GuideStep({ number, text }: { number: string; text: string }) {
  const styles = useStyles();
  return (
    <View style={styles.guideStep}>
      <View style={styles.guideNum}>
        <Text style={styles.guideNumText}>{number}</Text>
      </View>
      <Text style={styles.guideText}>{text}</Text>
    </View>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: colors.neonGreen + '55',
    backgroundColor: colors.surface + 'DD',
    gap: spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerLeft: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  headerLogger: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brand: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 18,
    textShadowColor: colors.neonGreen + '99',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  brandAccent: {
    ...typography.title,
    color: colors.neonGreen,
    fontSize: 18,
  },
  pitLabel: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 9,
    marginTop: 4,
    letterSpacing: 4,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  settingsBtnPressed: {
    opacity: 0.6,
  },
  settingsIcon: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  scroll: {
    flex: 1,
  },
  modeHero: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.neonGreen + '66',
    borderRadius: 4,
    backgroundColor: colors.neonGreen + '08',
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  modeHeroHeader: {
    gap: 4,
    paddingBottom: spacing.xs,
  },
  modeHeroKicker: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 9,
    letterSpacing: 4,
  },
  modeHeroTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 22,
    letterSpacing: 2,
    textShadowColor: colors.neonGreen + '88',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  modeHeroSub: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 9,
    textTransform: 'none',
    letterSpacing: 0.3,
    lineHeight: 14,
  },
  secondarySection: {
    gap: spacing.md,
  },
  secondaryLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    letterSpacing: 3,
    marginBottom: -spacing.xs,
  },
  modeCard: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    backgroundColor: colors.surface,
    gap: spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  modeCardPrimary: {
    borderColor: colors.neonGreenDim + '99',
    borderLeftColor: colors.neonGreen,
    backgroundColor: colors.neonGreen + '0C',
    shadowOpacity: 0.18,
  },
  modeCardHero: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderLeftWidth: 4,
    minHeight: 132,
  },
  modeCardSecondary: {
    borderLeftWidth: 3,
    borderLeftColor: colors.amber + '99',
  },
  modeCardTsuiso: {
    borderLeftWidth: 4,
    borderLeftColor: colors.neonGreen,
    borderColor: colors.neonGreen + '55',
    backgroundColor: colors.neonGreen + '0A',
    shadowOpacity: 0.14,
  },
  modeCardTsuisoHero: {
    paddingVertical: spacing.md,
    minHeight: 108,
  },
  modeCardPressed: {
    opacity: 0.75,
  },
  modeCardBody: {
    gap: spacing.xs,
  },
  modeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modeIcon: {
    color: colors.neonGreen,
    fontSize: 16,
  },
  modeIconQuick: {
    color: colors.amber,
    fontSize: 14,
  },
  modeIconTsuiso: {
    color: colors.neonGreen,
    fontSize: 16,
  },
  modeBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.neonGreen + '66',
    backgroundColor: colors.neonGreen + '12',
  },
  modeBadgeText: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 8,
    letterSpacing: 1,
  },
  modeTitleTsuiso: {
    color: colors.neonGreen,
    fontSize: 13,
  },
  modeDescTsuiso: {
    lineHeight: 16,
  },
  modeCtaTsuiso: {
    color: colors.neonGreen,
    marginTop: 4,
  },
  modeTitle: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  modeTitleHero: {
    fontSize: 15,
    letterSpacing: 2,
    color: colors.neonGreen,
  },
  modeDesc: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 14,
    textTransform: 'none',
    letterSpacing: 0.3,
  },
  modeDescHero: {
    fontSize: 10,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  modeCta: {
    ...typography.mono,
    color: colors.neonGreen,
    fontSize: 11,
    fontWeight: '800',
    marginTop: spacing.xs,
    letterSpacing: 2,
  },
  modeCtaHero: {
    fontSize: 13,
    marginTop: spacing.sm,
  },
  modeCtaSub: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  guide: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: colors.surface,
  },
  guideSectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    letterSpacing: 3,
  },
  guideSectionLabelSpaced: {
    marginTop: spacing.xs,
  },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  guideNum: {
    width: 24,
    height: 24,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.neonGreen,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neonGreen + '18',
  },
  guideNumText: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 9,
  },
  guideText: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
    textTransform: 'none',
    letterSpacing: 0.5,
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  subActions: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  subBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  subBtnPressed: {
    backgroundColor: colors.surface,
  },
  subBtnLabel: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 2,
  },
  subBtnLabelAccent: {
    color: colors.neonGreenDim,
  },
  subDivider: {
    width: 1,
    backgroundColor: colors.border,
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
