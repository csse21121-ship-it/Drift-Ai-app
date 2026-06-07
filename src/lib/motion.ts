const GRAVITY = 9.80665;

/** m/s² → G */
export function toG(valueMs2: number): number {
  return valueMs2 / GRAVITY;
}

export function lowPass(current: number, previous: number, alpha = 0.2): number {
  return alpha * current + (1 - alpha) * previous;
}

export function magnitudeG(lateralG: number, longitudinalG: number): number {
  return Math.sqrt(lateralG * lateralG + longitudinalG * longitudinalG);
}

export function formatG(value: number): string {
  return value.toFixed(2);
}

export function clampG(value: number, max = 1.5): number {
  return Math.max(-max, Math.min(max, value));
}
