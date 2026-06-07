import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeZoneBestRecords } from '@/lib/zoneBestRecords';
import type { Course, ScoringZone } from '@/types/course';
import type { SessionResult, ZoneBestUpdate, ZoneCrossing } from '@/types/score';

const COURSES_KEY = '@driftscore/courses';
const MAX_COURSES = 20;

// ────────────────────────────────────────────────────────────────
// 読み込み
// ────────────────────────────────────────────────────────────────

export async function loadCourses(): Promise<Course[]> {
  try {
    const raw = await AsyncStorage.getItem(COURSES_KEY);
    if (!raw) return [];
    const parsed: Course[] = JSON.parse(raw);
    return parsed.sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    );
  } catch {
    return [];
  }
}

export async function loadCourseById(id: string): Promise<Course | null> {
  const courses = await loadCourses();
  return courses.find((c) => c.id === id) ?? null;
}

// ────────────────────────────────────────────────────────────────
// 保存 / 更新
// ────────────────────────────────────────────────────────────────

export async function saveCourse(course: Course): Promise<void> {
  const courses = await loadCourses();
  const idx = courses.findIndex((c) => c.id === course.id);
  if (idx >= 0) {
    courses[idx] = course;
  } else {
    // 上限を超えたら古い順から削除
    if (courses.length >= MAX_COURSES) {
      courses.splice(MAX_COURSES - 1, courses.length - MAX_COURSES + 1);
    }
    courses.unshift(course);
  }
  await AsyncStorage.setItem(COURSES_KEY, JSON.stringify(courses));
}

export async function updateCourseBestScore(
  id: string,
  score: number,
): Promise<void> {
  const course = await loadCourseById(id);
  if (!course) return;
  if ((course.bestScore ?? 0) < score) {
    await saveCourse({
      ...course,
      bestScore: score,
      lastUsedAt: new Date().toISOString(),
    });
  } else {
    await saveCourse({ ...course, lastUsedAt: new Date().toISOString() });
  }
}

/**
 * セッション結果からコーナー（ゾーン）別ベストをコースデータに蓄積する。
 * @returns 記録が更新された zoneId 一覧
 */
export async function updateCourseZoneBestRecords(
  id: string,
  result: SessionResult,
  zoneCrossings: ZoneCrossing[] = [],
): Promise<ZoneBestUpdate[]> {
  const course = await loadCourseById(id);
  if (!course || zoneCrossings.length === 0) return [];

  const { zones, updatedZoneIds } = mergeZoneBestRecords(
    course.scoringZones,
    result,
    zoneCrossings,
  );

  if (updatedZoneIds.length === 0) return [];

  await saveCourse({
    ...course,
    scoringZones: zones,
    lastUsedAt: new Date().toISOString(),
  });

  return updatedZoneIds.map((zoneId) => {
    const zone = zones.find((z) => z.id === zoneId)!;
    return {
      zoneId,
      zoneName: zone.name,
      bestRecord: zone.bestRecord!,
    };
  });
}

/**
 * 走行ログから再学習した corridorPath をコースに反映する。
 * @returns 更新したゾーン数
 */
export async function updateCourseLearnedIdealLines(
  id: string,
  learnedZones: ScoringZone[],
  updatedZoneIds: string[],
): Promise<number> {
  if (updatedZoneIds.length === 0) return 0;

  const course = await loadCourseById(id);
  if (!course) return 0;

  const zoneMap = new Map(learnedZones.map((z) => [z.id, z]));
  const scoringZones = course.scoringZones.map((z) => zoneMap.get(z.id) ?? z);

  await saveCourse({
    ...course,
    scoringZones,
    lastUsedAt: new Date().toISOString(),
  });

  return updatedZoneIds.length;
}

// ────────────────────────────────────────────────────────────────
// 削除
// ────────────────────────────────────────────────────────────────

export async function deleteCourse(id: string): Promise<void> {
  const courses = await loadCourses();
  const filtered = courses.filter((c) => c.id !== id);
  await AsyncStorage.setItem(COURSES_KEY, JSON.stringify(filtered));
}

export async function clearAllCourses(): Promise<void> {
  await AsyncStorage.removeItem(COURSES_KEY);
}
