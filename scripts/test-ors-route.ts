/**
 * ORS Directions API 疎通テスト（コース自動生成ウィザードと同じエンドポイント）
 *
 * Usage: npm run test:ors
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env なし
  }
}

loadEnv();

const ORS_ENDPOINT =
  'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

/** 筑波サーキット付近 — 道路ルートが取れる代表座標 */
const START = { latitude: 36.2345, longitude: 140.0928 };
const END = { latitude: 36.2289, longitude: 140.1012 };

async function main(): Promise<void> {
  const apiKey = process.env.EXPO_PUBLIC_ORS_API_KEY?.trim() ?? '';
  if (!apiKey) {
    console.error('FAIL: EXPO_PUBLIC_ORS_API_KEY が .env に設定されていません。');
    process.exit(1);
  }

  console.log('ORS API key:', `${apiKey.slice(0, 8)}… (${apiKey.length} chars)`);
  console.log('Testing route:', START, '→', END);

  const body = JSON.stringify({
    coordinates: [
      [START.longitude, START.latitude],
      [END.longitude, END.latitude],
    ],
    geometry_simplify: false,
    instructions: false,
    radiuses: [-1, -1],
  });

  const res = await fetch(ORS_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json, application/geo+json',
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: apiKey,
    },
    body,
  });

  const data = (await res.json()) as {
    features?: { geometry?: { coordinates?: [number, number][] } }[];
    error?: { message?: string };
  };

  if (!res.ok) {
    console.error('FAIL: HTTP', res.status, data.error?.message ?? JSON.stringify(data));
    process.exit(1);
  }

  const coords = data.features?.[0]?.geometry?.coordinates ?? [];
  console.log('OK: route points =', coords.length);
  if (coords.length >= 2) {
    const [lon, lat] = coords[0];
    console.log('  first point:', { latitude: lat, longitude: lon });
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
