import { router } from 'expo-router';

/** Pit Lane ホームへ（スプラッシュ後・計測終了後の戻り先） */
export function openPitLane() {
  router.replace('/home');
}

/** クイック計測（コースなし） */
export function openQuickSession() {
  router.push('/session');
}

/** コース計測。courseId を渡すと Pit Board で事前選択 */
export function openCourseTrack(courseId?: string) {
  if (courseId) {
    router.push({ pathname: '/track', params: { courseId } });
  } else {
    router.push('/track');
  }
}

/** コース一覧。select でマップ上の選択を指定 */
export function openCourses(options?: { select?: string }) {
  if (options?.select) {
    router.push({ pathname: '/courses', params: { select: options.select } });
  } else {
    router.push('/courses');
  }
}

/** コースウィザード（AI 自動生成） */
export function openCourseWizard() {
  router.push('/course-wizard');
}

/** コースエディター */
export function openCourseEditor(courseId?: string) {
  if (courseId) {
    router.push({ pathname: '/course-editor', params: { id: courseId } });
  } else {
    router.push('/course-editor');
  }
}

/** 起動スプラッシュを再生（Pit Lane ラベルなどから） */
export function openSplash() {
  router.push('/');
}
