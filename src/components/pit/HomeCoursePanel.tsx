import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { GamePressable } from '@/components/ui/GamePressable';
import { openCourseTrack, openCourses, openCourseWizard } from '@/lib/navigation';
import type { Course } from '@/types/course';

type Props = {
  courses: Course[];
};

function sortCourses(courses: Course[]): Course[] {
  return [...courses].sort((a, b) => {
    const aTime = new Date(a.lastUsedAt ?? a.savedAt).getTime();
    const bTime = new Date(b.lastUsedAt ?? b.savedAt).getTime();
    return bTime - aTime;
  });
}

function formatCourseMeta(course: Course): string {
  const zonePart =
    course.scoringZones.length > 0
      ? `${course.scoringZones.length} ZONE${course.scoringZones.length > 1 ? 'S' : ''}`
      : 'ゾーン未設定';
  const bestPart =
    course.bestScore != null
      ? `  ·  BEST ${course.bestScore.toLocaleString()} pt`
      : '';
  return zonePart + bestPart;
}

/** Pit Lane ホーム — 保存コースのプレビューと一覧への導線 */
export function HomeCoursePanel({ courses }: Props) {
  const styles = useStyles();
  const sorted = sortCourses(courses);
  const preview = sorted.slice(0, 3);

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>◈</Text>
          <Text style={styles.headerLabel}>MY COURSES</Text>
          {courses.length > 0 ? (
            <Text style={styles.headerCount}>{courses.length}</Text>
          ) : null}
        </View>
        <GamePressable
          uiSound="nav"
          onPress={() => openCourses()}
          style={({ pressed }) => [styles.headerLink, pressed && styles.pressed]}
          hitSlop={6}
        >
          <Text style={styles.headerLinkText}>一覧  →</Text>
        </GamePressable>
      </View>

      {preview.length === 0 ? (
        <GamePressable
          onPress={() => openCourseWizard()}
          style={({ pressed }) => [styles.emptyRow, pressed && styles.pressed]}
        >
          <View style={styles.emptyRowInner}>
            <Text style={styles.emptyIcon}>＋</Text>
            <View style={styles.emptyTextWrap}>
              <Text style={styles.emptyTitle}>コースがまだありません</Text>
              <Text style={styles.emptySub}>AI 自動生成または手動で作成</Text>
            </View>
          </View>
        </GamePressable>
      ) : (
        preview.map((course) => (
          <GamePressable
            key={course.id}
            onPress={() => openCourseTrack(course.id)}
            onLongPress={() => openCourses({ select: course.id })}
            style={({ pressed }) => [pressed && styles.rowPressed]}
          >
            <View style={styles.row}>
              <View style={styles.rowDot} />
              <View style={styles.rowMain}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {course.name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {formatCourseMeta(course)}
                </Text>
              </View>
              <Text style={styles.rowRunCta}>計測 →</Text>
            </View>
          </GamePressable>
        ))
      )}

      <View style={styles.actions}>
        <GamePressable
          uiSound="nav"
          onPress={() => openCourses()}
          style={({ pressed }) => [styles.actionBtn, styles.actionBtnPrimary, pressed && styles.pressed]}
        >
          <Text style={styles.actionBtnTextPrimary}>コース一覧・マップ</Text>
        </GamePressable>
        <GamePressable
          onPress={() => openCourseWizard()}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
        >
          <Text style={styles.actionBtnText}>＋ 新規</Text>
        </GamePressable>
      </View>
    </View>
  );
}

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerIcon: {
    color: colors.neonGreen,
    fontSize: 12,
  },
  headerLabel: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  headerCount: {
    ...typography.mono,
    color: colors.neonGreenDim,
    fontSize: 9,
    fontWeight: '700',
  },
  headerLink: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  headerLinkText: {
    ...typography.mono,
    color: colors.neonGreen,
    fontSize: 10,
    fontWeight: '700',
  },
  emptyRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  emptyRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyIcon: {
    ...typography.mono,
    color: colors.neonGreenDim,
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  emptyTextWrap: {
    flex: 1,
    gap: 2,
  },
  emptyTitle: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
    textTransform: 'none',
    letterSpacing: 0.3,
  },
  emptySub: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowPressed: {
    backgroundColor: colors.neonGreen + '08',
  },
  rowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neonGreenDim,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 10,
    textTransform: 'none',
    letterSpacing: 0.3,
  },
  rowMeta: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
  },
  rowRunCta: {
    ...typography.mono,
    color: colors.neonGreen,
    fontSize: 9,
    fontWeight: '700',
  },
  rowChevron: {
    color: colors.textMuted,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  actionBtnPrimary: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  actionBtnTextPrimary: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 9,
    letterSpacing: 1,
  },
  actionBtnText: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 9,
    letterSpacing: 1,
  },
  pressed: {
    opacity: 0.7,
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
