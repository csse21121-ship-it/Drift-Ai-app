/**

 * routeService — OpenRouteService Directions API ラッパー

 *

 * - 無料枠: 2,000 directions/日

 * - 認証: Authorization ヘッダー（api_key クエリは非対応）

 * - リクエスト: POST + JSON body（v2 標準）

 * - 環境変数: EXPO_PUBLIC_ORS_API_KEY

 * - 同一起終点のキャッシュを AsyncStorage に保持（24h TTL）

 */



import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GeoPoint } from '@/types/course';



// ────────────────────────────────────────────────────────────────

// 定数

// ────────────────────────────────────────────────────────────────



/** v2 POST（GeoJSON 返却）— 推奨 */

const ORS_ENDPOINTS = [

  'https://api.openrouteservice.org/v2/directions/driving-car/geojson',

  // 2026〜 移行先（旧ドメイン失敗時のフォールバック）

  'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson',

] as const;



/** ジオメトリ精度改善後にキャッシュ世代を更新 */
const CACHE_KEY   = '@driftscore/route_cache_v2';

const CACHE_TTL   = 24 * 60 * 60 * 1000;

const MAX_ENTRIES = 30;



// ────────────────────────────────────────────────────────────────

// キャッシュ

// ────────────────────────────────────────────────────────────────



type CacheEntry = {

  key:     string;

  path:    GeoPoint[];

  savedAt: number;

};



function makeCacheKey(start: GeoPoint, end: GeoPoint): string {

  const r = (n: number) => Math.round(n * 10000) / 10000;

  return `${r(start.latitude)},${r(start.longitude)}_${r(end.latitude)},${r(end.longitude)}`;

}



async function loadCache(): Promise<CacheEntry[]> {

  try {

    const raw = await AsyncStorage.getItem(CACHE_KEY);

    return raw ? (JSON.parse(raw) as CacheEntry[]) : [];

  } catch {

    return [];

  }

}



async function saveCache(entries: CacheEntry[]): Promise<void> {

  try {

    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entries));

  } catch { /* ignore */ }

}



async function getCached(key: string): Promise<GeoPoint[] | null> {

  const hit = (await loadCache()).find((e) => e.key === key);

  if (!hit || Date.now() - hit.savedAt > CACHE_TTL) return null;

  return hit.path;

}



async function putCache(key: string, path: GeoPoint[]): Promise<void> {

  let entries = (await loadCache()).filter((e) => e.key !== key);

  entries.unshift({ key, path, savedAt: Date.now() });

  if (entries.length > MAX_ENTRIES) entries.splice(MAX_ENTRIES);

  await saveCache(entries);

}



// ────────────────────────────────────────────────────────────────

// ORS レスポンス型

// ────────────────────────────────────────────────────────────────



type OrsGeoJson = {

  features?: { geometry?: { coordinates?: [number, number][] } }[];

  error?: { code?: number; message?: string };

};



function parseOrsPath(data: OrsGeoJson): GeoPoint[] | null {

  const coords = data.features?.[0]?.geometry?.coordinates;

  if (!coords || coords.length < 2) return null;

  return coords.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));

}



function orsErrorMessage(data: unknown, status: number): string {

  const err = (data as OrsGeoJson)?.error;

  if (err?.message) return err.message;



  if (status === 401 || status === 403) {

    return 'APIキーが無効です。openrouteservice.org でキーを再発行し、.env を更新して Expo を再起動してください。';

  }

  if (status === 429) {

    return '本日の API 呼び出し上限（2,000回）に達しました。明日以降にお試しください。';

  }

  return `ルート取得に失敗しました（HTTP ${status}）。`;

}



// ────────────────────────────────────────────────────────────────

// API 呼び出し

// ────────────────────────────────────────────────────────────────



async function callOrs(

  endpoint: string,

  apiKey:   string,

  start:    GeoPoint,

  end:      GeoPoint,

): Promise<{ ok: true; path: GeoPoint[] } | { ok: false; status: number; message: string }> {

  const body = JSON.stringify({
    coordinates: [
      [start.longitude, start.latitude],
      [end.longitude,   end.latitude],
    ],
    // 道路中心線をフル解像度で取得（デフォルト簡略化を無効化）
    geometry_simplify: false,
    instructions:      false,
    // タップ位置を最寄りの道路へスナップ（-1 = 制限なし）
    radiuses: [-1, -1],
  });



  let res: Response;

  try {

    res = await fetch(endpoint, {

      method:  'POST',

      headers: {

        Accept:          'application/json, application/geo+json',

        'Content-Type':  'application/json; charset=utf-8',

        Authorization:   apiKey,

      },

      body,

    });

  } catch {

    return { ok: false, status: 0, message: 'ネットワーク接続を確認してください。' };

  }



  let data: unknown;

  try {

    data = await res.json();

  } catch {

    if (!res.ok) {

      return { ok: false, status: res.status, message: orsErrorMessage(null, res.status) };

    }

    return { ok: false, status: res.status, message: 'サーバーのレスポンスを解析できませんでした。' };

  }



  if (!res.ok) {

    return { ok: false, status: res.status, message: orsErrorMessage(data, res.status) };

  }



  const path = parseOrsPath(data as OrsGeoJson);

  if (!path) {

    return {

      ok:      false,

      status:  res.status,

      message: 'この場所では道路ルートを取得できませんでした。\nスタートとゴールが道路から離れすぎている可能性があります。',

    };

  }



  return { ok: true, path };

}



/**

 * 2点間の道路ルートを GeoPoint[] として取得する。

 *

 * @throws {RouteError}

 */

export async function fetchRoute(

  start: GeoPoint,

  end:   GeoPoint,

): Promise<GeoPoint[]> {

  const key = makeCacheKey(start, end);



  const cached = await getCached(key);

  if (cached) return cached;



  const apiKey = process.env.EXPO_PUBLIC_ORS_API_KEY?.trim() ?? '';

  if (!apiKey) {

    throw new RouteError(

      'API_KEY_MISSING',

      'ORS APIキーが設定されていません。\n.env に EXPO_PUBLIC_ORS_API_KEY を追加し、Expo を再起動してください。',

    );

  }



  // スタート≒ゴール（50m 未満）はルート API 不要

  const distM = haversineM(start, end);

  if (distM < 50) {

    throw new RouteError(

      'NO_ROUTE',

      'スタートとゴールが近すぎます（50m 未満）。\n周回コースの場合はゴールをスタートから離して置くか、手動作成をご利用ください。',

    );

  }



  let lastError = 'ルート取得に失敗しました。';



  for (const endpoint of ORS_ENDPOINTS) {

    const result = await callOrs(endpoint, apiKey, start, end);

    if (result.ok) {

      await putCache(key, result.path);

      return result.path;

    }

    lastError = result.message;

    // 認証エラーはフォールバックしても同じなので即中断

    if (result.status === 401 || result.status === 403) break;

  }



  throw new RouteError('NO_ROUTE', lastError);

}



// ────────────────────────────────────────────────────────────────

// エラー型

// ────────────────────────────────────────────────────────────────



export type RouteErrorCode =

  | 'API_KEY_MISSING'

  | 'NETWORK_ERROR'

  | 'AUTH_ERROR'

  | 'RATE_LIMIT'

  | 'API_ERROR'

  | 'PARSE_ERROR'

  | 'NO_ROUTE';



export class RouteError extends Error {

  constructor(

    public readonly code: RouteErrorCode,

    message: string,

  ) {

    super(message);

    this.name = 'RouteError';

  }

}



export async function clearRouteCache(): Promise<void> {

  await AsyncStorage.removeItem(CACHE_KEY);

}



// ── 内部 ──

function haversineM(a: GeoPoint, b: GeoPoint): number {

  const R = 6371000;

  const dLat = toRad(b.latitude - a.latitude);

  const dLon = toRad(b.longitude - a.longitude);

  const lat1 = toRad(a.latitude);

  const lat2 = toRad(b.latitude);

  const h =

    Math.sin(dLat / 2) ** 2 +

    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));

}



function toRad(deg: number): number {

  return (deg * Math.PI) / 180;

}


