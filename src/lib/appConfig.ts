/** ランタイム用 — .env の EXPO_PUBLIC_* 設定状態 */

const PLACEHOLDER_GOOGLE_MAPS = 'YOUR_GOOGLE_MAPS_API_KEY_HERE';

export function getGoogleMapsApiKey(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';
}

export function isGoogleMapsConfigured(): boolean {
  const key = getGoogleMapsApiKey();
  return key.length >= 20 && key !== PLACEHOLDER_GOOGLE_MAPS;
}

export function isOrsConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_ORS_API_KEY?.trim());
}

export function isSupabaseEnvConfigured(): boolean {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  return url.startsWith('https://') && key.length >= 20;
}
