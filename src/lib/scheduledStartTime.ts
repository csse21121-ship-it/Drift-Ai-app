/**
 * スケジュール・スタート — 30秒区切りターゲット時刻ユーティリティ
 */

/** ARM 可能な最短リードタイム (ms) — 30秒アナウンス余裕 */
export const MIN_SCHEDULED_ARM_LEAD_MS = 12_000;

/** 次の 30 秒区切り (xx:00 または xx:30) の UTC epoch ms */
export function getNext30SecondBoundary(fromMs: number = Date.now()): number {
  const d = new Date(fromMs);
  const sec = d.getSeconds();
  const candidate = new Date(d);
  candidate.setMilliseconds(0);

  if (sec < 30) {
    candidate.setSeconds(30);
  } else {
    candidate.setMinutes(candidate.getMinutes() + 1);
    candidate.setSeconds(0);
  }

  let target = candidate.getTime();
  if (target - fromMs < MIN_SCHEDULED_ARM_LEAD_MS) {
    target = getNext30SecondBoundary(target + 1);
  }
  return target;
}

/** ターゲットを ±30 秒シフト（30秒区切りを維持） */
export function shiftTargetBy30Seconds(targetUtcMs: number, deltaSteps: number): number {
  return targetUtcMs + deltaSteps * 30_000;
}

/** ローカル時刻表示 (例: 12:00:30) */
export function formatTargetLocalClock(targetUtcMs: number): string {
  const d = new Date(targetUtcMs);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/** 待機カウントダウン (例: -00:15.00) */
export function formatRemainingCountdown(remainingMs: number): string {
  const clamped = Math.max(0, remainingMs);
  const totalCs = Math.floor(clamped / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `-${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
