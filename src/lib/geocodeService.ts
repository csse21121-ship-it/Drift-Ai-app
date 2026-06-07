/**
 * geocodeService — Nominatim (OpenStreetMap) ジオコーディング
 *
 * - 無料・APIキー不要
 * - レート制限: 1 req/sec → 呼び出し側で 600ms+ デバウンス必須
 * - User-Agent ヘッダー必須（Nominatim 利用規約）
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const APP_UA         = 'DriftScoreAI/1.0 (drift scoring mobile app)';

// ────────────────────────────────────────────────────────────────
// 型
// ────────────────────────────────────────────────────────────────

export type GeocodeResult = {
  placeId:     number;
  displayName: string;
  shortName:   string;   // 最初のカンマまでの短縮名
  latitude:    number;
  longitude:   number;
  type:        string;
};

// ────────────────────────────────────────────────────────────────
// 検索
// ────────────────────────────────────────────────────────────────

/**
 * 地名・住所を検索して候補リストを返す。
 * レート制限を守るため、呼び出し側で最低 600ms のデバウンスを設けること。
 *
 * @param query       検索クエリ（例: "エビスサーキット", "東京タワー"）
 * @param limit       最大返却件数 (default: 5)
 */
export async function geocodeSearch(
  query: string,
  limit = 5,
): Promise<GeocodeResult[]> {
  if (!query.trim()) return [];

  const url = new URL(NOMINATIM_BASE);
  url.searchParams.set('q',               query.trim());
  url.searchParams.set('format',          'json');
  url.searchParams.set('limit',           String(limit));
  url.searchParams.set('accept-language', 'ja');
  url.searchParams.set('addressdetails',  '0');

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        'User-Agent':      APP_UA,
        'Accept-Language': 'ja',
      },
    });
  } catch {
    throw new Error('ネットワーク接続を確認してください。');
  }

  if (!res.ok) throw new Error(`地名検索に失敗しました (HTTP ${res.status})`);

  type Raw = { place_id: number; display_name: string; lat: string; lon: string; type: string };
  const data: Raw[] = await res.json();

  return data.map((d) => ({
    placeId:     d.place_id,
    displayName: d.display_name,
    shortName:   d.display_name.split(',')[0].trim(),
    latitude:    parseFloat(d.lat),
    longitude:   parseFloat(d.lon),
    type:        d.type,
  }));
}
