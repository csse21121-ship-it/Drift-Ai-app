export function msToKmh(speedMs: number | null): number {
  if (speedMs == null || speedMs < 0) return 0;
  return speedMs * 3.6;
}

export function formatSpeed(kmh: number): string {
  return Math.round(kmh).toString().padStart(3, ' ');
}

export function formatCoord(value: number, decimals = 5): string {
  return value.toFixed(decimals);
}

export function formatHeading(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  return `${Math.round(normalized)}°`;
}
