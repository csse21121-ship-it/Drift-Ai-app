# DriftScore AI

Expo 54 / React Native のドリフト走行採点アプリ。G センサー・GPS・外部 BLE ロガーで計測し、コースゾーン採点・追走（Tsuiso）・クラウド保存・LINE 走行速報に対応。

詳細な機能一覧は [`ROADMAP.md`](./ROADMAP.md) を参照。

## クイックスタート

```bash
npm install
cp .env.example .env   # 各キーを設定
npm run config:check   # 設定確認
npx expo start
```

`.env` を変更したあとは **Expo を再起動**（`--clear` 推奨）してください。

## 環境変数

| 変数 | 必須 | 用途 |
|------|------|------|
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ | クラウド保存・Realtime 追走 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase 匿名認証 |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Android 推奨 | マップタイル（`react-native-maps`） |
| `EXPO_PUBLIC_ORS_API_KEY` | コース生成時 | OpenRouteService ルート取得 |
| `EXPO_PUBLIC_LINE_OA_BASIC_ID` | LINE 個人連携時 | 友だち追加ボタン（`@` なし） |

テンプレート: [`.env.example`](./.env.example)

## Google Maps API キー（Android）

1. [Google Cloud Console](https://console.cloud.google.com/google/maps-apis) でプロジェクト作成
2. **Maps SDK for Android** を有効化
3. 認証情報 → API キー作成
4. キーを制限（推奨）:
   - アプリケーション制限: Android アプリ
   - パッケージ名: `com.driftscore.ai`
   - SHA-1: 開発用 / リリース用 keystore のフィンガープリント
5. `.env` に設定:

```env
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
```

`app.config.ts` がビルド時に Android / iOS ネイティブ設定へ注入します。  
iOS はデフォルトで Apple Maps を使用するため、Google キーは Android 実機が主な対象です。

## OpenRouteService（コース自動生成）

1. [openrouteservice.org](https://openrouteservice.org/dev/#/signup) で無料 API キー取得
2. `.env` に `EXPO_PUBLIC_ORS_API_KEY` を設定
3. 疎通確認: `npm run test:ors`

## Supabase（クラウド保存・追走 Realtime・LINE）

1. Supabase プロジェクト作成
2. `.env` に URL / Anon（Publishable）キーを設定
3. SQL Editor でセットアップスクリプト実行（順不同で可、未作成テーブルのみ）:
   - `supabase/setup/session_logs_and_storage.sql`
   - `supabase/setup/alter_session_logs_columns.sql`
   - `supabase/setup/add_line_target_id_column.sql`
   - `supabase/setup/line_notify_teams_and_link.sql`
   - `supabase/setup/session_logs_line_webhook_trigger.sql`
4. Dashboard 設定:
   - Authentication → **Anonymous Sign-Ins** ON
   - Bot and Abuse Protection → モバイル向け **CAPTCHA OFF** 推奨
   - Storage バケット `logs`（public read）
5. Edge Functions デプロイ: `line-notify`, `line-webhook`, `line-bot`
6. Secrets: `LINE_ACCESS_TOKEN`, `LINE_TARGET_ENCRYPTION_KEY`
7. 疎通: `npm run test:line-notify`

## LINE 走行速報

- **チームモード**: LINE グループに Bot 招待 → アプリ設定で PIN 連携
- **個人モード**: `EXPO_PUBLIC_LINE_OA_BASIC_ID` 設定 → 友だち追加 → 6桁コード連携
- Basic ID 確認: `npm run line:basic-id`

## 開発スクリプト

| コマンド | 内容 |
|----------|------|
| `npm start` | Expo 開発サーバー |
| `npm run config:check` | 環境変数・API キー確認 |
| `npm run simulate` | ドリフト採点シミュレーション |
| `npm run test:ors` | ORS ルート API 疎通 |
| `npm run test:line-notify` | Supabase + LINE 通知疎通 |
| `npm run migrate:line-encrypt` | LINE ID 暗号化移行（要 service role） |

## 実機検証（屋外テスト）

設定 → **実機検証モードを開く**（`/field-test`）

- ライブ GPS / モーション / 閾値緩和の確認
- BLE ロガー・GPS 適応・追走 Tsuiso のチェックリスト（端末に保存）
- **レポートを共有** — テスト結果をテキストでエクスポート

BLE ロガーは **Development Build** 必須。Expo Go ではモックデバイスになります。

## ビルド

Google Maps キーを変更した場合は **ネイティブ再ビルド**（EAS Build / `npx expo prebuild`）が必要です。Expo Go では Android マップタイルが制限される場合があります。

Development Build 推奨: BLE 外部ロガー連携
