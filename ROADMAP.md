# DriftScore AI — 機能・状態一覧（開発ロードマップ）

> 最終更新: 2026-06-06（クラウド保存・LINE 走行速報・追走 Tsuiso・セキュリティ強化）  
> プロジェクト全体（`app/`・`src/`・設定ファイル）を元に整理したチェックリストです。  
> 機能追加・改修のたびにこのファイルを更新してください。

**関連ドキュメント:** フルスペックの最終形態は [`MASTER_ROADMAP.md`](./MASTER_ROADMAP.md) を参照。

**技術スタック:** Expo 54 + React Native 0.81 + expo-router + TypeScript  
**画面構成:** スプラッシュ（`app/index.tsx`）→ Pit Lane（`app/home.tsx`）→ コース計測（`app/track.tsx`）/ クイック計測（`app/session.tsx`）/ 追走（`app/tsuiso.tsx`）→ 結果（`app/result.tsx`）／コース（`app/courses.tsx`, `app/course-wizard.tsx`, `app/course-editor.tsx`）／採点ガイド・履歴・設定

---

## 1. プロジェクト基盤・アーキテクチャ

- [x] Expo Router によるファイルベースルーティング（`app/index.tsx` スプラッシュ, `app/home.tsx`, `app/track.tsx`, `app/session.tsx`, `app/tsuiso.tsx`, `app/result.tsx`, `app/history.tsx`, `app/settings.tsx`, `app/field-test.tsx`, `app/courses.tsx`, `app/course-wizard.tsx`, `app/course-editor.tsx`, `app/scoring-guide.tsx`, `app/achievements.tsx`）
- [x] ドリフト検知シミュレーションスクリプト（`npm run simulate` → `scripts/simulate-drift.ts`）
- [x] ORS ルート検証スクリプト（`npm run test:ors` → `scripts/test-ors-route.ts`）
- [x] LINE 走行速報疎通テスト（`npm run test:line-notify` → `scripts/test-line-notify.ts`）
- [x] LINE Basic ID 取得スクリプト（`npm run line:basic-id` → `scripts/fetch-line-basic-id.ts`）
- [x] 環境変数テンプレート（`.env.example` — ORS / Google Maps / Supabase / LINE OA Basic ID）
- [x] 設定チェックスクリプト（`npm run config:check` → `scripts/check-config.ts`）
- [x] Expo 動的設定（`app.config.ts` — Google Maps キー注入）
- [x] グローバルコンテキスト（設定・テーマ・ロガー・端末能力）（`SettingsContext`, `ThemeContext`, `LoggerContext`, `PhoneCapabilitiesContext`, `app/_layout.tsx`）
- [x] BLE ロガー依存・権限設定（`react-native-ble-plx`, `app.json` plugins）
- [x] TypeScript strict モード + パスエイリアス `@/*`（`tsconfig.json`）
- [x] アプリ設定（名前・スラッグ・ダーク UI・権限文言）（`app.json`）
- [x] iOS 位置情報・モーション使用許可の Info.plist 設定（`app.json`）
- [x] Android 位置情報パーミッション設定（`app.json`）
- [x] README / 開発ドキュメント（`README.md` — 環境変数・Supabase / LINE / Maps セットアップ）
- [ ] ユニットテスト・E2E テスト（未実装）
- [ ] CI/CD パイプライン（未実装）

---

## 2. UI/UX — Pit Lane・ナビゲーション

- [x] Pit Lane ホーム画面（本日ベスト・前回スコア・走行ガイド）（`app/home.tsx`）
- [x] Pit Board スコアボード UI（`src/components/pit/PitScoreBoard.tsx`）
- [x] 履歴集計サマリー（今日のベスト等）（`src/lib/historyStats.ts`）
- [x] Pit Lane スプラッシュ動画（タップで Pit Lane へ遷移・テーマ BGM/SE）（`app/index.tsx`, `PitLaneSplash.tsx`, `useSplashMedia`, `themeMusic.ts`）
- [x] 共通ナビヘルパー（Pit Lane / 計測 / コース一覧）（`src/lib/navigation.ts`）
- [x] ソロ計測 UI 統合（コース / クイック並列 — 画面は `track` / `session` で分離）（`SoloRunModes.tsx`, `app/home.tsx`）
- [x] 走行モード選択 UI（コース計測 / クイック計測）（`app/home.tsx`, `SoloRunModes.tsx`）
- [x] ホームからコース一覧への導線（`HomeCoursePanel` — プレビュー・一覧・新規作成、`app/home.tsx` → `/courses`）
- [x] ホームからコース指定で計測開始（`HomeCoursePanel` → `/track?courseId=`）（`src/lib/navigation.ts`, `app/track.tsx`）
- [x] コース一覧から計測 START（選択バナー・カード RUN）（`app/courses.tsx` → `/track?courseId=`）
- [x] Pit Board からコース選択（計測前に activeCourse 設定 — エディター直行を廃止）（`app/track.tsx` `PitBoardPanel`）
- [x] PIT LANE ラベルタップでスプラッシュ再生（`app/home.tsx` → `/`）
- [x] デイリーチャレンジパネル（Pit Lane ホーム）（`DailyChallengePanel`, `app/home.tsx`）
- [x] ドライバーランク表示（Pit Lane ヒーロー・スコアボード）（`DriverRankHero`, `PitScoreBoard`, `app/home.tsx`）
- [x] 実績・称号画面への導線（`app/home.tsx` → `/achievements`）
- [x] Pit Lane から追走（Tsuiso）への導線（`app/home.tsx` → `/tsuiso`）

---

## 3. UI/UX — テレメトリー画面（セッション）

- [x] クイック計測画面（コースなし・Pit Lane から遷移）（`app/session.tsx`, `SoloRunModes.tsx`）
- [x] コース計測画面（ゾーン・ラップ・自動スタート・GPS軌跡記録）（`app/track.tsx`, `courseId` 深リンク）
- [x] SafeArea 対応のメイン画面レイアウト（`app/track.tsx`, `app/session.tsx`）
- [x] スクロール可能な計器パネル構成（`app/track.tsx`）
- [x] ブランドヘッダー（REC/STANDBY・マウント姿勢バッジ）（`src/components/telemetry/Header.tsx`）
- [x] Gメーター（横G/前後G/ピークG のドット表示 + 数値リードアウト）（`src/components/telemetry/GMeter.tsx`）
- [x] ドリフトインジケーター（スリップアングル・強度バー・継続時間・カウント）（`src/components/telemetry/DriftIndicator.tsx`）
- [x] GPS パネル（速度・方位・高度・緯度経度・精度）（`src/components/telemetry/GpsPanel.tsx`）
- [x] ジャイロ生値リードアウト（X/Y/Z rad/s）（`src/components/telemetry/GyroReadout.tsx`）
- [x] START / STOP SESSION ボタン（ネオングロー）（`src/components/ui/NeonButton.tsx`, `app/track.tsx`, `app/session.tsx`）
- [x] 権限エラー・GPS 失敗時のエラーボックス表示（`app/track.tsx`, `src/hooks/useTelemetrySession.ts`）
- [x] ランドスケープ向け UI（2カラムレイアウト・コンパクト計器）（`app/track.tsx`, `app/session.tsx`）
- [x] ライブスコア計算フック（`src/hooks/useLiveScore.ts`）
- [x] ランドスケープ用ライブスコアストリップ（`src/components/telemetry/LiveScoreStrip.tsx`）
- [x] `app.json` 画面向き `default`（縦横両対応）（`app.json`）
- [x] リアルタイムスコア表示（累計・コンボ・ドリフト数・プレビュー）（`src/components/telemetry/LiveScoreBanner.tsx`, `src/lib/scoring.ts` `calcLiveScore`）
- [x] 詳細データ折りたたみ（GPS・ジャイロ）（`app/session.tsx`）
- [x] 計測プリフライト（センサー確認 → 3-2-1-GO・計測画面フォーカス時 BGM 停止）（`useSessionPreflight`, `SessionPreflightBanner`, `useStopBgmOnFocus`）
- [x] 設定画面（ドリフト閾値・マウント向き・3プリセット・キャリブ・フィードバック・BGM/SE 音量・UIテーマ・ロガー・端末プロファイル・**LINE 走行速報**）（`app/settings.tsx`, `LineNotifySettingsPanel`）

---

## 4. UI/UX — 結果画面

- [x] セッション完了画面（`app/result.tsx`）
- [x] トータルスコアのカウントアップアニメーション（`app/result.tsx`）
- [x] グレード（S/A/B/C/D）バッジのフェードイン演出（`app/result.tsx`）
- [x] セッション統計グリッド（ドリフト数・ベスト時間・ピークG・最高速度・セッション時間）（`app/result.tsx`）
- [x] ドリフトログテーブル（時間・角度・G・コンボ・ポイント）（`app/result.tsx`）
- [x] ドリフト未検知時の空状態メッセージ（`app/result.tsx`）
- [x] セッションデータなし時のフォールバック画面（`app/result.tsx`）
- [x] NEW SESSION ボタン（ストアクリア → メインへ戻る）（`app/result.tsx`, `src/lib/sessionStore.ts`）
- [x] 結果のテキスト共有（`Share.share` — スコア・グレード・ドリフト数）（`app/result.tsx`）
- [x] 結果の画像エクスポート / SNS 画像投稿（`ResultShareCard`, `shareResultImage.ts`, `react-native-view-shot` + `expo-sharing`）
- [x] セッション履歴一覧・過去結果の閲覧（`app/history.tsx`）
- [x] ゾーン通過ログ表示（`app/result.tsx`, `ZoneCrossing`）
- [x] ラップ / 本数サマリー表示（circuit / street）（`app/result.tsx`, `LapSummary`）
- [x] NEW SESSION → Pit Lane へ戻る（`app/result.tsx` → `/home`）
- [x] セッション GPS 軌跡の記録（`src/hooks/useGpsTrackRecord.ts`, `src/lib/gpsTrack.ts`）
- [x] 走行軌跡マップ再生（タイムライン・ドリフトマーカー付き）（`src/components/result/SessionTrackReplay.tsx`, `app/result.tsx`）
- [x] テレメトリー完全プレイバック（G・角度をメーター上でタイムライン再生）（`SessionTelemetryReplay`, `SessionReplaySection`, `useSessionReplay`, `telemetryLog`, `useTelemetryLogRecord`）
- [x] マップ＋メーター統合リプレイ UI（共通タイムライン・速度切替）（`SessionReplaySection`）
- [x] ゾーンなぞり達成率表示（コース走行ライン評価の基礎）（`ZoneTracePanel`, `zoneTrace.ts`, `app/result.tsx`）
- [x] 理想ラインズレスコア・改善ヒント（`idealLineEval.ts`, `IdealLinePanel`, `SessionResult.lineEval`）
- [x] UI テーマカスタマイズ（5プリセット・設定から配色・フォント切替）（`uiThemes.ts`, `ThemeContext`, `AppearanceThemePanel`）
- [x] セッション後ゲーム性フィードバック（デイリー達成・称号解除・ランク昇格）（`GamificationResultBanner`, `processSessionGamification`, `app/result.tsx`）
- [x] 実績・称号一覧画面（装備・デイリー・ランク詳細）（`app/achievements.tsx`, `DriverRankPanel`）

---

## 5. UI/UX — コース・マップ

- [x] コース一覧画面（マッププレビュー・削除）（`app/courses.tsx`）
- [x] コースエディター（境界・スタート/ゴール・スコアゾーン描画）（`app/course-editor.tsx`）
- [x] マップ描画モード（なぞり / 点打ち / サークル）（`app/course-editor.tsx`）
- [x] AI コーナー検知 → スコアゾーン自動生成（`src/lib/geofence.ts` `detectCorners`）
- [x] コリドー型ゾーン（幅・範囲調整）（`app/course-editor.tsx`, `src/lib/geofence.ts`）
- [x] コースタイプ自動判定（circuit / street / unknown）（`src/lib/geofence.ts` `detectCourseType`）
- [x] スタートゾーン近接検知・自動スタートカウントダウン（`app/track.tsx`）
- [x] 走行中アクティブコースバナー（ゾーン・ラップ・境界外警告）（`app/track.tsx`）
- [x] コース別ベストスコア記録（`src/lib/courseStore.ts` `updateCourseBestScore`）
- [x] コーナー（ゾーン）別ベスト記録（最高アングル・最高G・ベストポイント）（`src/lib/zoneBestRecords.ts`, `src/lib/courseStore.ts`）
- [x] ゾーンベスト表示 UI（`src/components/course/ZoneBestStats.tsx` — コース一覧・エディター・結果画面）
- [x] セッション中 MAP ボタン（コース画面へ遷移）（`app/track.tsx` → `/courses`）
- [x] スコアゾーン倍率の最終採点反映（`resolveZoneMultiplier` + `scoreSession` + 通過ログ pt 紐付け）（`src/lib/scoring.ts`, `app/track.tsx`, `app/result.tsx`）
- [x] コース別スコアリングプロファイル（速度参照・角度スケール・コンボ窓・傾斜補正・難易度）（`src/types/course.ts` `ScoringProfile`, `src/lib/geofence.ts` `detectScoringProfile`）
- [x] 採点スタイルプリセット（D1GP / FDJ / カジュアル）（`src/data/competitionPresets/`, `src/lib/competitionPresets.ts`）
- [x] AI コース自動生成ウィザード（スタート/ゴール → ルート取得 → ゾーン生成）（`app/course-wizard.tsx`, `src/lib/courseGenerator.ts`）
- [x] イン/アウトクリップゾーン自動配置（`src/lib/courseGenerator.ts`, `src/lib/geofence.ts` `createClipCorridor`）
- [x] 既知サーキット照合（エビス・筑波・TC千葉等5レイアウト）（`src/lib/circuitMatcher.ts`, `src/data/circuitPresets/`）
- [x] ルート取得 API（OpenRouteService）（`src/lib/routeService.ts`）— `EXPO_PUBLIC_ORS_API_KEY` 要設定
- [x] マップ地名検索（Nominatim）（`src/components/map/MapSearchBar.tsx`, `src/lib/geocodeService.ts`）
- [x] コースエディター採点プロファイル手動調整 UI（`app/course-editor.tsx` `ScoringProfilePanel`）
- [x] 採点システム解説画面（100点満点・加点/減点・グレード表）（`app/scoring-guide.tsx`）
- [x] ゾーンなぞり達成率の算出・永続化（GPS 軌跡 × 通過ログ）（`zoneTrace.ts`, `app/track.tsx`, `SessionResult.zoneTrace`）
- [x] 理想ラインの走行ログ学習・コースへの永続化（`idealLineLearn.ts`, `updateCourseLearnedIdealLines`, `courseStore.ts`）
- [x] Google Maps API キー本番設定（`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` → `app.config.ts`）
- [x] OpenRouteService API キー設定（`.env` → `EXPO_PUBLIC_ORS_API_KEY`、`npm run test:ors`）

---

## 6. UI/UX — 共通デザインシステム

- [x] Neo Street Telemetry ベーステーマ（`src/constants/theme.ts`）
- [x] UI テーマプリセット（5種・配色・タイポ・ステータスバー連動）（`uiThemes.ts`, `ThemeContext`, `AppearanceThemePanel`, `app/settings.tsx`）
- [x] テーマ対応スタイルフック（全主要画面）（`useThemedStyles.ts`, `useTheme`）
- [x] ゲーム HUD 装飾（コーナーブケット・スキャングリッド背景）（`GameHudCorners`, `GameScreenBackdrop`, `gameUi.ts`, `app/_layout.tsx`）
- [x] 計器パネル共通枠コンポーネント（`src/components/ui/TelemetryFrame.tsx`）
- [x] ネオンボタンコンポーネント（`src/components/ui/NeonButton.tsx`）
- [x] 画面遷移フェードアニメーション（`app/_layout.tsx`）
- [ ] カスタムフォントファイル導入（テーマはタイポプリセットのみ。フォントは `monospace` システムフォント）
- [ ] スプラッシュ・アイコン画像アセット（`app.json` は背景色のみ）
- [x] テーマ別 BGM / スプラッシュ SE（オープニング・Pit Lane アンビエント）（`themeMusic.ts`, `themeMusicPlayer.ts`, `audioAssets.ts`, `useSplashMedia`, `useScreenBgm`, `app/home.tsx`）
- [x] BGM トラック選択・音量（5曲 + テーマ連動・BGM/SFX 個別スライダー）（`bgmTracks.ts`, `BgmTrackPanel`, `audioVolume.ts`, `app/settings.tsx`）
- [x] グローバル音声設定同期（設定変更を即 BGM/SE に反映）（`useAudioSettingsSync`, `app/_layout.tsx`）
- [x] UI タップ SE（HUD 風・GamePressable / NeonButton・コース/履歴/ナビ）（`uiSounds.ts`, `uiSound.ts`, `GamePressable.tsx`）
- [x] ハプティクス / サウンドフィードバック（ドリフト突入時・設定で個別 ON/OFF）（`src/lib/driftFeedback.ts`, `src/hooks/useDriftFeedback.ts`, `app/track.tsx`, `app/session.tsx`, `app/settings.tsx`）

---

## 7. センサー機能

- [x] DeviceMotion（加速度・重力）50ms 間隔取得（`src/hooks/useTelemetrySession.ts`）
- [x] Gyroscope 50ms 間隔取得（`src/hooks/useTelemetrySession.ts`）
- [x] GPS `watchPositionAsync`（BestForNavigation, 500ms / 1m）（`src/hooks/useTelemetrySession.ts`）
- [x] 位置情報フォアグラウンド権限リクエスト（`src/hooks/useTelemetrySession.ts`）
- [x] モーションセンサー利用可否チェック（`src/hooks/useTelemetrySession.ts`）
- [x] 重力ベクトルのローパススムージング（`src/lib/orientation.ts`）
- [x] 端末マウント姿勢検知（flat / portrait / landscape / unknown）（`src/lib/orientation.ts`）
- [x] 姿勢に応じた加速度・ジャイロ軸リマップ（`src/lib/orientation.ts`）
- [x] 重力軸投影によるヨーレート算出（`src/lib/orientation.ts`）
- [x] G 値ローパスフィルタ + クランプ（±1.5G）（`src/lib/motion.ts`, `src/hooks/useTelemetrySession.ts`）
- [x] ピーク G 追跡（`src/hooks/useTelemetrySession.ts`）
- [x] 速度 m/s → km/h 変換（`src/lib/gps.ts`）
- [x] センサーフュージョンによるスリップアングル推定（ジャイロ積分 + GPS 補正）（`src/lib/slipAngle.ts`）
- [x] 角度計測精度向上（GPS 方位精度ゲート・カルマン平滑化・ロガー融合）（`angleTuning.ts`, `slipAngleFusion.ts`, `SlipAngleFusion`）
- [x] セッション開始/停止時のセンサー購読・リセット（`src/hooks/useTelemetrySession.ts`）
- [x] カルマンフィルタによる横G・前後Gのスムージング（`src/lib/kalmanFilter.ts`, `src/hooks/useTelemetrySession.ts`）
- [x] マウント向き手動固定（設定画面から flat / portrait / landscape を選択）（`app/settings.tsx`）
- [x] センサーキャリブレーション UI（静止時バイアス計測・永続化・ゼロ点補正）（`src/lib/calibration.ts`, `src/hooks/useCalibration.ts`, `app/settings.tsx`）
- [x] 外部 Bluetooth ロガー接続（BLE スキャン・汎用プロトコル判別 + 開発時モック）（`bleLoggerManager.ts`, `LoggerContext`, `LoggerSettingsPanel`, `loggerPresets.ts`）
- [x] ロガー接続状態バナー（Pit Lane / セッション画面）（`LoggerStatusBanner`, `app/home.tsx`, `app/track.tsx`, `app/session.tsx`）
- [x] ロガー性能に応じた採点・閾値の自動調整（`loggerCapabilities.ts`, `useMergedTelemetry`, `app/track.tsx`, `app/session.tsx`）
- [x] セッションにテレメトリソースメタデータ保存（`SessionResult.telemetrySource`）
- [x] 端末センサー能力の自動検出（モーション Hz / GPS 精度 → 動的 PHONE_CAPABILITIES）（`phoneSensorProbe.ts`, `PhoneCapabilitiesContext`, `phoneCapabilities.ts`）
- [x] プローブ結果をカルマン係数・GPS/モーション間隔に反映（`sensorTuning.ts`, `useTelemetrySession.ts`）
- [x] セッション中 GPS 精度のリアルタイム監視・悪化時の閾値動的緩和（`gpsAccuracyMonitor.ts`, `useGpsAdaptiveThresholds.ts`, `GpsPanel.tsx`）
- [x] スマホ単体走行時の端末プロファイルに応じた採点・閾値補正（`loggerCapabilities.ts` `tier === 'phone'` 分岐）
- [x] 実 BLE トランスポート — 汎用接続・プロトコル自動判別（UBX / JSON / NMEA / CSV）（`universalStreamParser.ts`, `bleNotifyDiscovery.ts`）
- [x] 受信データからロガー能力を動的推定（`loggerCapabilityInference.ts`）
- [x] 実機検証モード（ライブ診断・屋外チェックリスト・レポート共有）（`app/field-test.tsx`, `fieldTestChecklist.ts`, `fieldTestReport.ts`）
- [ ] バックグラウンド計測
- [ ] Web ブラウザ向けセンサー対応（Expo Web はモック依存の可能性）
- [ ] GPS モック検知・精度警告の強化

---

## 8. ドリフト検知ロジック

- [x] 3条件 AND 判定（横G + ヨーレート + 最低速度 25km/h）（`src/lib/driftDetection.ts`）
- [x] ヒステリシス（入閾値 / 出閾値の分離）（`src/lib/driftDetection.ts`）
- [x] 開始確認デバウンス 300ms / 終了確認 400ms（`src/lib/driftDetection.ts`, `src/hooks/useDriftDetection.ts`）
- [x] ドリフトイベント記録（継続時間・ピークG・ピーク速度・累積角度・スリップ角）（`src/hooks/useDriftDetection.ts`, `src/types/drift.ts`）
- [x] リアルタイム状態管理（idle / active・継続時間・ピーク値）（`src/hooks/useDriftDetection.ts`）
- [x] ヨーレート積分による累積回転角度（`src/hooks/useDriftDetection.ts`）
- [x] ドリフト強度 0〜1 算出（UI バー用）（`src/lib/driftDetection.ts`）
- [x] セッション非アクティブ時の状態リセット（`src/hooks/useDriftDetection.ts`）
- [x] スリップアングルをスコア計算に反映（`angleBonus` 最大1.5×）（`src/lib/scoring.ts`）
- [x] ドリフト検知状態機械の純関数化（本番フック・シミュレーション共通）（`src/lib/driftReplay.ts`, `src/hooks/useDriftDetection.ts`）
- [x] 閾値のユーザー設定・プリセット（EASY / STANDARD / PRO）（`app/settings.tsx`, `src/types/settings.ts`）
- [ ] ML / AI ベースのドリフト判定（アプリ名の「AI」は未実装）

---

## 9. スコアリング・セッション管理ロジック

- [x] ベーススコア計算（継続時間 × ピーク横G × 100）（`src/lib/scoring.ts`）
- [x] 速度ボーナス（80km/h 基準、最大2倍）（`src/lib/scoring.ts`）
- [x] スリップアングルボーナス（5°以上、最大1.5×）（`src/lib/scoring.ts` `calcAngleBonus`）
- [x] リアルタイムスコア計算（ゾーン倍率・コースプロファイル込み）（`src/lib/scoring.ts` `calcLiveScore`）
- [x] ゾーン倍率のイベント別解決（時間帯重複で最大倍率採用）（`src/lib/scoring.ts` `resolveZoneMultiplier`）
- [x] コンボシステム（3秒以内連続で最大 ×5、倍率 1.0〜3.0）（`src/lib/scoring.ts`）
- [x] グレード判定 S/A/B/C/D（`src/lib/scoring.ts`, `src/types/score.ts`）
- [x] セッション全体採点（`scoreSession`）（`src/lib/scoring.ts`）
- [x] STOP 時の採点 → 保存 → 結果画面遷移フロー（`app/track.tsx`, `app/session.tsx`）
- [x] セッション最高速度の追跡（`app/track.tsx`, `app/session.tsx`）
- [x] セッション GPS 軌跡の永続化（`gpsTrack` を `SessionResult` に保存）（`src/types/score.ts`）
- [x] セッションテレメトリーログの記録・永続化（`useTelemetryLogRecord`, `telemetryLog`, `TelemetryLogPoint`）（`app/track.tsx`, `app/session.tsx`）
- [x] ゲーム性状態の永続化（デイリー・称号・ランク）（`gamificationStore.ts`, `gamification.ts`, `driverRank.ts`, `dailyMission.ts`）
- [x] セッション時間フォーマット（`src/lib/scoring.ts`）
- [x] ドリフト時間フォーマット（`src/lib/driftDetection.ts`）
- [x] 永続ストレージ（AsyncStorage）— 最大 50 件を JSON 配列で保存（`src/lib/sessionStore.ts`）
- [x] 複数セッション履歴の保存・一覧・個別削除・全削除（`app/history.tsx`）
- [x] コースデータ永続化（AsyncStorage、最大20件）（`src/lib/courseStore.ts`）
- [x] セッション履歴へのコース名紐づけ（`src/types/score.ts` `courseName`, `app/history.tsx`）
- [x] 理想ライン評価のセッション保存（`lineEvalTrack.ts`, `useLineEvalTrackRecord`, `SessionResult.lineEval`）（`app/track.tsx`）
- [x] STOP 時クラウドログ保存（Supabase Storage `logs` + `session_logs`、匿名認証）（`src/lib/supabase.ts` `uploadSessionLog`, `useSessionLogCloudSync`）
- [x] クラウド履歴 UI（アプリから過去のクラウドログ一覧・再生）
- [ ] リーダーボード
- [ ] AI による走行評価・コーチング提案

---

## 10. 型定義・データモデル

- [x] テレメトリー型（MotionSample, GpsSample, TelemetryState）（`src/types/telemetry.ts`）
- [x] ドリフト型（DriftEvent, DriftStatus, DriftPhase）（`src/types/drift.ts`）
- [x] スコア型（DriftScore, Grade, SessionResult）（`src/types/score.ts`）
- [x] マウント姿勢型（MountOrientation）（`src/lib/orientation.ts`）
- [x] 設定型（DriftThresholds, AppSettings, FeedbackSettings, PresetName）（`src/types/settings.ts`）
- [x] キャリブレーション型（CalibrationData）（`src/lib/calibration.ts`）
- [x] コース型（Course, ScoringZone, ScoringProfile, ZoneBestRecord, GeoPoint, CourseType）（`src/types/course.ts`）
- [x] ゾーン通過・ラップ・軌跡・トレース型（ZoneCrossing, LapSummary, TrackPoint, ZoneBestUpdate, ZoneTraceSummary, TelemetryLogPoint）（`src/types/score.ts`）
- [x] 競技プリセット・サーキット型（CompetitionPreset, CircuitLayout）（`src/types/competition.ts`）
- [x] ゲーム性型（AchievementDefinition, DailyChallengeDefinition, DriverRankSnapshot, GamificationState）（`src/types/gamification.ts`, `src/data/achievements.ts`, `src/data/dailyChallenges.ts`, `src/data/ranks.ts`）
- [x] ロガー型（LoggerDevice, LoggerCapabilities, LoggerSample, LoggerConnectionStatus）（`src/types/logger.ts`, `src/data/loggerPresets.ts`）
- [x] 理想ライン評価型（LineEvalSummary, LineEvalDetail, LineEvalSegment）（`src/types/score.ts`）
- [x] 端末センサー能力型（PhoneCapabilities）（`src/types/phoneSensor.ts`, `phoneCapabilities.ts`）
- [x] UI テーマ型（UiThemePresetId, ThemeColors, AppTypography）（`src/constants/uiThemes.ts`）
- [x] 音声・BGM 型（BgmTrackId, BgmTrackDefinition, FeedbackSettings.bgmVolume/sfxVolume）（`bgmTracks.ts`, `types/settings.ts`）
- [x] セッションログクラウド型（`src/types/sessionLog.ts`）
- [x] LINE 通知設定型（`src/lib/lineNotifyStore.ts` `LineNotifyMode`）

---

## 15. クラウド保存・LINE 走行速報・追走（Tsuiso）

### 15-1. Supabase クラウド保存

- [x] 匿名認証 + セッション STOP 時アップロード（`src/lib/supabase.ts`）
- [x] Storage バケット `logs` + `session_logs` テーブル（`supabase/setup/session_logs_and_storage.sql` 他）
- [x] 保存完了トースト UI（`SessionLogUploadContext`, `useSessionLogCloudSync`）
- [x] 走行 JSON（テレメトリ・スコア・コース名）のクラウド永続化
- [x] アプリ内クラウド履歴閲覧・再ダウンロード（`app/history.tsx` CLOUD タブ, `src/lib/sessionLogCloud.ts`）

### 15-2. LINE 走行速報

- [x] **チームモード** — グループ PIN（6桁・`line-bot` 自動発行）→ アプリ設定（`LineNotifySettingsPanel`, `lineNotifyApi`）
- [x] **個人モード** — 6桁連携コード + 1:1 トーク（`user_line_links`, `line_link_pending`）
- [x] **友だち追加** — `EXPO_PUBLIC_LINE_OA_BASIC_ID` + `line://` ディープリンク（`app.json`）
- [x] STOP 保存時 `line_target_id` 付与 → Push 通知（`line-webhook` Edge Function, pg_net トリガー）
- [x] 通知先はユーザー設定のみ（グローバル一括送信なし）
- [x] 疎通テスト（`npm run test:line-notify`）

### 15-3. セキュリティ（LINE ID 保護）

- [x] `notify_teams` 直接 SELECT 禁止 + PIN 一致 RPC / Edge Function のみ
- [x] LINE ID AES-256-GCM 暗号化 at rest（`LINE_TARGET_ENCRYPTION_KEY`, `line-notify`, `line-webhook`）
- [x] PIN 当て試し対策 — 失敗時のみカウント、15分 10回/ユーザー・30回/IP
- [x] 既存平文データ移行スクリプト（`npm run migrate:line-encrypt`）
- [ ] 暗号化キーの Supabase 外バックアップ運用ドキュメント

### 15-4. 追走（Tsuiso）

- [x] 追走画面（Lead / Chase・PIN ルーム・Realtime 同期）（`app/tsuiso.tsx`）
- [x] セットバトル（Run1+Run2 役割入替・後追いスコア合計・同点サドンデス）（`useTsuisoSetBattle`, `tsuisoSetBattle.ts`, `TsuisoBattleResultPanel`, `tsuiso_battle_state` Broadcast）
- [x] `.tsuiso` 交換・採点ライブラリ（`src/lib/tsuisoExport.ts`, `src/lib/tsuisoScoring.ts` 他）
- [x] 大会減点（スピン・エンスト・フライング・ノーグッド等 — `tsuisoPenalties.ts`, `TsuisoPenaltyPanel`）
- [x] Supabase Realtime ルーム（`src/lib/realtimeSync.ts`, `src/lib/supabase.ts`）
- [x] Pit Lane からの導線（`app/home.tsx`）
- [ ] 追走結果のクラウド保存・LINE 速報連携

## 11. レガシー・未使用・モック状態

| 項目 | 状態 | ファイル |
|------|------|----------|
| Gメータープレースホルダー | 旧実装。`GMeter.tsx` に置き換え済みだがファイルは残存 | `src/components/telemetry/GMeterPlaceholder.tsx` |
| セッションストア | AsyncStorage 最大50件 + STOP 時 Supabase クラウド保存 + クラウド履歴 UI | `sessionStore.ts`, `sessionLogCloud.ts`, `supabase.ts` |
| キャリブレーションストア | AsyncStorage 永続化済み。起動時に `useTelemetrySession` が自動適用 | `src/lib/calibration.ts` |
| セッション画面 | `track`（コース計測）と `session`（クイック計測）の2系統。Pit Lane から `SoloRunModes` で統合導線。`courseId` でコース事前選択 | `app/track.tsx`, `app/session.tsx`, `SoloRunModes.tsx`, `navigation.ts` |
| 「AI」機能 | コーナー検知・コース判定はルールベース。ML は未実装 | 全体 |
| BLE ロガー | 実機は Development Build 必須。Expo Go / `__DEV__` ではモックデバイス利用 | `LoggerContext`, `bleLoggerManager.ts` |

---

## 12. 現状サマリー

| 領域 | 完成度 | 備考 |
|------|--------|------|
| センサー取得・フュージョン | 高 | カルマン + キャリブ + スリップ角融合 + GPS適応閾値 |
| 外部ロガー連携 | 高 | BLE 汎用接続・能力推定・テレメトリ融合。Expo Go はモック |
| ドリフト検知・スコアリング | 高 | 角度ボーナス + ライブスコア + ロガー/端末ティア補正 |
| コース・マップ | 高 | ゾーン採点・ゾーントレース・理想ライン評価/学習まで。API本番設定は未 |
| Pit Lane・ナビ | 高 | スプラッシュ・デイリー・ランク・ロガー状態まで完成 |
| リアルタイム UI | 高 | ランドスケープ + ハプティクス + 5 UIテーマ + ゲームHUD + プリフライト |
| サウンド / BGM | 高 | テーマBGM・5曲選択・UI/ドリフト SE・音量設定 |
| リプレイ・結果 UI | 高 | マップ/G/角度統合リプレイ + 理想ライン・ゾーントレース表示 |
| データ永続化 | 高 | ローカル50件 + コース20件 + **Supabase 走行ログ** |
| クラウド・LINE | 高 | 保存・Push・PIN/個人連携・暗号化・クラウド履歴 UI まで完成 |
| 追走（Tsuiso） | 中〜高 | Realtime セットバトル + SD。Pit Lane 導線あり |
| ゲーム性 | 中 | デイリー・称号・DR ランク実装。シーズン/ライバルは未 |
| AI / 高度解析 | 低 | ルールベース幾何解析。ML・音声解析は未 |
| 周辺機能（共有・SNS） | 高 | テキスト共有 + 結果画像キャプチャ共有 |

---

## 13. 推奨開発優先度

1. ~~**LINE 走行速報・クラウド保存**~~ ✅ — §15（チーム/個人モード・暗号化・テスト済み）
2. ~~**クラウド履歴 UI**~~ ✅ — 履歴画面 LOCAL / CLOUD タブ（§15-1）
3. ~~**API キー・本番準備**~~ ✅ — Google Maps / ORS / `config:check` / README（§5, §1）
4. ~~**実機検証**~~ ✅ — 実機検証モード UI + チェックリスト（§7）。屋外走行テストは現地で実施
5. **ゲーム性拡張** — シーズンランキング・ライバル登録（§14-2）
6. **ビジュアル仕上げ** — アプリアイコン・スプラッシュ画像（§6）
7. ~~**README**~~ ✅ — Supabase / LINE / Maps セットアップ（§1）

---

## 14. 将来機能 — アイデアバックログ

> MASTER_ROADMAP §8–14 と対応。§14-1 の一部はコース機能として完了済み。  
> 詳細ビジョンは [`MASTER_ROADMAP.md`](./MASTER_ROADMAP.md) を参照。

### 14-1. 走行・コース解析（計測の高度化）

- [x] コースエディターでのコーナー自動検知（GPSパス曲率解析）（`src/lib/geofence.ts`）
- [x] スタートゾーン近接によるコース自動選択（`app/track.tsx`）
- [x] コースタイプ判定（周回 / ストリート）（`src/lib/geofence.ts`）
- [x] スタート/ゴール指定によるコース自動生成（ルート API + ゾーン自動配置）（`app/course-wizard.tsx`）
- [ ] 走行軌跡からのコース自動学習（実走ログからの学習は未。ウィザード経由の生成は完成）
- [x] コーナー別ベストアングル・ベストGの自動記録（`src/lib/zoneBestRecords.ts` / `src/lib/courseStore.ts`）
- [x] ゾーンなぞり達成率（GPS 軌跡 × ゾーン通過ログ）（`src/lib/zoneTrace.ts`, `ZoneTracePanel`）
- [x] ライン評価（理想ラインとのズレスコア化・改善ヒント — ゾーントレースの上位機能）（`src/lib/idealLineEval.ts`, `IdealLinePanel`, `SessionResult.lineEval`）
- [x] 理想ライン精度向上（GPS 精度フィルタ / ロガー GPS 専用軌跡 / 走行ログ corridor 再学習）（`lineEvalTrack.ts`, `idealLineLearn.ts`, `updateCourseLearnedIdealLines`）
- [ ] タイヤ温・グリップ推定（横G立ち上がりからグリップ低下推測）
- [ ] シフトタイミング解析（前後Gスパイクから最適シフトポイント検出）
- [ ] 路面コンディションタグ（天候・気温の記録と同条件スコア比較）

### 14-2. ゲーム性・モチベーション

- [x] デイリーチャレンジ（日替わりミッション・Pit Lane / 実績画面）（`dailyMission.ts`, `DailyChallengePanel`, `dailyChallenges.ts`）
- [x] 称号・バッジシステム（実績解除・装備表示）（`achievements.ts`, `gamification.ts`, `app/achievements.tsx`）
- [x] ドライバーランク（デイリー達成率・走行データから DR 算出・昇格演出）（`driverRank.ts`, `DriverRankHero`, `DriverRankPanel`, `ranks.ts`）
- [ ] シーズンランキング（月単位リセット）
- [ ] ライバル登録（ベストスコアの常時ダッシュボード表示）
- [ ] 今日のMVPコーナー（最高評価コーナーの自動ハイライト切り出し）

### 14-3. 車・チューニング文化（ガレージ拡張）

- [ ] セットアップスナップショット（タイヤ圧・デフ・ブースト等の走行前記録）
- [ ] パーツ効果シミュレーション（理論切れ角・挙動変化の軽量計算）
- [ ] メンテナンスリマインダー（タイヤ・オイル交換目安の通知）
- [ ] 車両サウンドプロファイル（エンジン音登録・異音検知）
- [ ] 複数車両スイッチ（車ごとのスコア・履歴完全分離）

### 14-4. コミュニティ・現場感

- [ ] 現地ヒートマップ（匿名走行密度の可視化 ※安全・法的配慮必須）
- [ ] イベントモード（当日限定リーダーボード・バッジ）
- [ ] 審査員モード（傍観者の主観採点とセンサースコアの合成）
- [ ] メンター再生（上級者セッションのメーターオーバーレイ再生）
- [ ] クルー戦（チーム合計スコアの週末バトル）
- [x] LINE 走行速報（チーム PIN / 個人連携 / Push — §15-2）

### 14-5. UI・体験の拡張（コックピット進化）

- [ ] ナイトドライブモード（超低輝度・ネオン数値のみのUI）
- [ ] REC風オーバーレイ（タイムコード・セッション名の映像風表示）
- [x] メータースキン / UIテーマ切替（5プリセット — Pit Lane / Circuit Red / Midnight Cyan / Amber Garage / Paper Light）（`uiThemes.ts`, `ThemeContext`）
- [ ] ウィジェット / CarPlay（速度・横G・ドリフト状態の超大表示）
- [ ] Apple Watch / Wear OS 連携（手首バイブ・経過時間）

### 14-6. AI・解析の別角度

- [ ] 走行スタイル分類（攻め型 / 流し型 / タンデム向きの自動ラベル）
- [ ] 疲労・集中度推定（後半のGブレから切り上げ推奨）
- [ ] ベスト1本の自動編集（最高スコア区間の15秒クリップ生成）
- [ ] 自然言語デブリーフ（セッション後の文章フィードバック）
- [ ] 音声コマンド（「マーク」「リセット」「次のヒート」等）

### 14-7. プライバシー・安全配慮（セキュリティ拡張）

- [ ] 緊急マスク（シェイク / 音量長押しで全画面ブラックアウト）
- [ ] 位置情報ぼかし（座標丸め・特定エリアマスク）
- [ ] オフレコセッション（記録・送信なしの練習モード）
- [x] LINE 通知先 ID の DB 暗号化 + PIN レート制限（§15-3）

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-06-05 | 初版作成（プロジェクト全体の現状調査に基づく） |
| 2026-06-05 | AsyncStorage 永続化・履歴画面（`app/history.tsx`）追加 |
| 2026-06-05 | 設定画面（ドリフト閾値・マウント向き・プリセット）実装（`app/settings.tsx`）|
| 2026-06-06 | §12 アイデアバックログ追加（33項目・7カテゴリ）。MASTER_ROADMAP §8–14 と同期 |
| 2026-06-05 | カルマンフィルタ・センサーキャリブレーション・スリップアングル採点を完了 `[x]` に反映 |
| 2026-06-06 | Pit Lane・コース/マップ・ライブスコア・ランドスケープ・ラップ管理を反映。§5 コース章を新設 |
| 2026-06-06 | ゾーン最終採点・コースウィザード・採点プリセット・採点ガイド・driftReplay を反映 |
| 2026-06-06 | スプラッシュ接続・`track` 分離・GPS軌跡再生・ゾーンベスト・ナビ整理・テキスト共有を反映 |
| 2026-06-05 | ハプティクス/サウンド・結果画像共有・`config:check` を反映。MASTER_ROADMAP と同期 |
| 2026-06-05 | テレメトリープレイバック・ゲーム性（デイリー/称号/DR）・ゾーントレース・`achievements` 画面を反映 |
| 2026-06-05 | BLEロガー・理想ライン評価/学習・UIテーマ5種・ゲームHUD・センサー精度向上を反映。MASTER 同期 |
| 2026-06-06 | テーマBGM/スプラッシュ音楽・BGM曲選択・UIタップSE・計測プリフライトを反映。MASTER 同期 |
| 2026-06-06 | §15 追加: Supabase クラウド保存・LINE 走行速報（チーム/個人）・暗号化・Tsuiso 追走。§13 優先度更新 |
| 2026-06-06 | クラウド履歴 UI（履歴 LOCAL/CLOUD タブ・Storage 再ダウンロード・結果再生）。Tsuiso Pit Lane 導線強化 |
| 2026-06-06 | 実機検証モード（`app/field-test.tsx`）— ライブ診断・BLE/GPS/Tsuiso チェックリスト・レポート共有 |
