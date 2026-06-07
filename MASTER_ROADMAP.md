# DriftScore AI — 究極の開発マスタープラン（MASTER_ROADMAP）

> 最終更新: 2026-06-06  
> 本ファイルは「DriftScore AI」の最終形態（フルスペック）を定義するマスタープランです。  
> 開発を進める際、AIおよび開発者はこのロードマップを常に参照し、実装状況（`[x]` / `[ ]`）を更新すること。

**関連ドキュメント:** 実装レベルの詳細チェックリストは [`ROADMAP.md`](./ROADMAP.md) を参照。

---

## 1. 漆黒のコックピットUI（ネオ・ストリート・テレメトリー）

- [x] 漆黒×ネオングリーンの専用UIデザイン — `src/constants/theme.ts`
- [x] Pit Lane ホーム画面（走行モード選択・本日ベスト・デイリー・ランク・ロガー状態） — `app/home.tsx`
- [x] Pit Lane スプラッシュ動画（タップでホーム遷移・テーマ BGM/SE） — `app/index.tsx`, `PitLaneSplash.tsx`, `useSplashMedia`
- [x] リアルタイムGメーター — `GMeter.tsx`
- [x] GPS・ジャイロ計器 — `GpsPanel.tsx`, `GyroReadout.tsx`
- [x] リアルタイムスコアバナー / ストリップ — `LiveScoreBanner.tsx`, `LiveScoreStrip.tsx`
- [x] 採点システム解説画面 — `app/scoring-guide.tsx`
- [x] ランドスケープ最適化（2カラム・`orientation: default`） — `app/track.tsx`, `app/session.tsx`
- [x] ハプティクス＆サウンド（ドリフト突入時の振動・スキール SE・設定で ON/OFF） — `driftFeedback.ts`, `useDriftFeedback.ts`, `app/settings.tsx`
- [x] UI テーマプリセット（5種・配色・タイポ切替） — `uiThemes.ts`, `ThemeContext`, `AppearanceThemePanel`
- [x] ゲーム HUD 装飾（コーナーブケット・スキャングリッド背景） — `GameHudCorners`, `GameScreenBackdrop`, `gameUi.ts`
- [x] テーマ連動 BGM / Pit Lane アンビエント（5曲選択・音量設定） — `themeMusicPlayer.ts`, `bgmTracks.ts`, `BgmTrackPanel`, `useScreenBgm`
- [x] UI タップ SE（GamePressable / NeonButton） — `uiSound.ts`, `uiSounds.ts`, `GamePressable.tsx`
- [x] 計測プリフライト（センサー確認 → 3-2-1-GO） — `useSessionPreflight.ts`, `SessionPreflightBanner.tsx`

## 2. 究極のセンサー＆計測基盤

- [x] 高周期センサー取得 — `useTelemetrySession.ts`
- [x] センサーフュージョン（スリップアングル） — `slipAngle.ts`, `slipAngleFusion.ts`
- [x] カルマンフィルター — `kalmanFilter.ts`
- [x] マウント姿勢設定 — `orientation.ts`, `settings.tsx`
- [x] センサーゼロ点キャリブレーション — `calibration.ts`
- [x] 端末センサー能力プローブ・動的チューニング — `phoneSensorProbe.ts`, `sensorTuning.ts`, `PhoneCapabilitiesContext`
- [x] GPS 精度適応型閾値 — `gpsAccuracyMonitor.ts`, `useGpsAdaptiveThresholds.ts`
- [x] 外部 BLE ロガー統合（汎用プロトコル自動判別・テレメトリ融合） — `bleLoggerManager.ts`, `LoggerContext`, `useMergedTelemetry`

## 3. AIドリフト解析＆スコアリングシステム

- [x] ドリフト自動検知 — `driftDetection.ts`, `driftReplay.ts`
- [x] ベーススコア計算 — `scoring.ts`
- [x] ディープアングル評価 — `calcAngleBonus`
- [x] スコアゾーン倍率の最終採点 — `resolveZoneMultiplier` + `scoreSession`
- [x] コース別スコアリングプロファイル — `ScoringProfile`
- [x] 採点スタイルプリセット（D1GP / FDJ / カジュアル） — `competitionPresets.ts`
- [x] ロガー/端末ティアに応じた採点・閾値補正 — `loggerCapabilities.ts`
- [ ] トランジション解析（左右切り返しのコンボボーナス）
- [ ] AI動画・音声解析

## 4. チューニング連動型データロガー＆ガレージ

- [x] 1セッションごとのリザルト — `app/result.tsx`
- [x] ローカル永続化（セッション50件 + コース20件 + ゲーム性状態） — `sessionStore.ts`, `courseStore.ts`, `gamificationStore.ts`
- [x] コース・マップ管理（一覧・手動エディター・ベストスコア） — `courses.tsx`, `course-editor.tsx`
- [x] AIコーナー検知 — `geofence.ts` `detectCorners`
- [x] AIコース自動生成ウィザード — `course-wizard.tsx`, `courseGenerator.ts`
- [x] イン/アウトクリップゾーン自動配置 — `createClipCorridor`
- [x] 既知サーキット照合 DB（5レイアウト） — `circuitMatcher.ts`
- [x] コース走行モード — `app/track.tsx`
- [x] コーナー別ベスト記録（ゾーンごとの最高アングル・G・ポイント） — `zoneBestRecords.ts`
- [x] セッション走行軌跡の記録・マップ再生 — `gpsTrack.ts`, `SessionTrackReplay.tsx`
- [x] 走行完全プレイバック（G・角度のメータータイムライン再生） — `SessionTelemetryReplay.tsx`, `telemetryLog.ts`, `SessionReplaySection.tsx`
- [x] 外部 Bluetooth ロガー接続・設定 UI — `LoggerSettingsPanel`, `loggerPresets.ts`, `react-native-ble-plx`
- [ ] クラウド永続化・マルチデバイス同期
- [ ] 詳細車両プロファイル（ガレージ機能）
- [ ] セッティング比較ロジック

## 5. ストリート＆サーキットの熱狂（追走・バトル・チーム機能）

- [ ] 追走解析 / タンデム・マッチング
- [ ] ゴーストバトル
- [ ] チーム内リーダーボード

## 6. ガチガチの車内セキュリティ＆プライベート防衛

- [ ] 走行ログのステルスロック
- [ ] 覗き見ブロック / ステルスモード

## 7. 映像拡張・世界展開（SNSマーケティング）

- [ ] テレメトリーAR合成動画
- [x] SNSテキスト共有（スコア・グレード・ドリフト数） — `app/result.tsx` `Share.share`
- [x] SNS画像投稿（結果カード PNG キャプチャ＋共有シート） — `ResultShareCard.tsx`, `shareResultImage.ts`, `react-native-view-shot`, `expo-sharing`
- [ ] 多言語・グローバル対応

---

## 8. 走行・コース解析（計測の高度化）

- [x] コースエディターでのコーナー自動検知 — `geofence.ts`
- [x] スタートゾーン近接によるコース自動選択 — `app/track.tsx`
- [x] コースタイプ判定 — `detectCourseType`
- [x] スタート/ゴール指定によるコース自動生成 — `course-wizard.tsx`
- [x] コーナー別ベストアングル・ベストGの自動記録 — `zoneBestRecords.ts`
- [x] ゾーンなぞり達成率（GPS 軌跡 × 通過ログ） — `zoneTrace.ts`, `ZoneTracePanel.tsx`
- [x] ライン評価（理想ラインとのズレスコア化・改善ヒント） — `idealLineEval.ts`, `IdealLinePanel.tsx`
- [x] 理想ライン精度向上（GPS フィルタ / ロガー専用軌跡 / corridor 再学習） — `lineEvalTrack.ts`, `idealLineLearn.ts`
- [ ] 走行軌跡からのコース自動学習（実走ログベースのコース生成）
- [ ] タイヤ温・グリップ推定
- [ ] シフトタイミング解析
- [ ] 路面コンディションタグ

## 9. ゲーム性・モチベーション

- [x] デイリーチャレンジ — `dailyMission.ts`, `DailyChallengePanel`, `dailyChallenges.ts`
- [x] 称号・バッジシステム — `achievements.ts`, `gamification.ts`, `app/achievements.tsx`
- [x] ドライバーランク（DR 算出・昇格演出） — `driverRank.ts`, `DriverRankHero`, `ranks.ts`
- [ ] シーズンランキング
- [ ] ライバル登録
- [ ] 今日のMVPコーナー

## 10. 車・チューニング文化（ガレージ拡張）

- [ ] セットアップスナップショット
- [ ] パーツ効果シミュレーション
- [ ] メンテナンスリマインダー
- [ ] 車両サウンドプロファイル
- [ ] 複数車両スイッチ

## 11. コミュニティ・現場感

- [ ] 現地ヒートマップ
- [ ] イベントモード
- [ ] 審査員モード
- [ ] メンター再生
- [ ] クルー戦

## 12. UI・体験の拡張（コックピット進化）

- [ ] ナイトドライブモード
- [ ] REC風オーバーレイ
- [x] メータースキン / UIテーマ（5プリセット切替） — `uiThemes.ts`, `ThemeContext`
- [x] ゲーム HUD フレーム装飾 — `GameHudCorners`, `GameScreenBackdrop`
- [x] UI 操作音（タップ SE） — `uiSound.ts`, `GamePressable.tsx`
- [ ] ウィジェット / CarPlay
- [ ] Apple Watch / Wear OS 連携

## 13. AI・解析の別角度

- [ ] 走行スタイル分類
- [ ] 疲労・集中度推定
- [ ] ベスト1本の自動編集
- [ ] 自然言語デブリーフ
- [ ] 音声コマンド

## 14. プライバシー・安全配慮（セキュリティ拡張）

- [ ] 緊急マスク
- [ ] 位置情報ぼかし
- [ ] オフレコセッション

---

## 進捗サマリー（2026-06-06 時点）

| セクション | 完了 | 未完了 | 進捗 |
|-----------|------|--------|------|
| 1. コックピットUI | 14 | 0 | 100% |
| 2. センサー基盤 | 8 | 0 | 100% |
| 3. AI解析＆スコア | 7 | 2 | 78% |
| 4. ロガー＆ガレージ | 12 | 3 | 80% |
| 5. 追走・バトル | 0 | 3 | 0% |
| 6. セキュリティ | 0 | 2 | 0% |
| 7. 映像・世界展開 | 2 | 2 | 50% |
| 8. 走行・コース解析 | 8 | 4 | 67% |
| 9. ゲーム性・モチベ | 3 | 3 | 50% |
| 10. ガレージ拡張 | 0 | 5 | 0% |
| 11. コミュニティ | 0 | 5 | 0% |
| 12. UI体験拡張 | 3 | 3 | 50% |
| 13. AI別角度 | 0 | 5 | 0% |
| 14. プライバシー拡張 | 0 | 3 | 0% |
| **合計（§1–7 コア）** | **43** | **12** | **約78%** |
| **合計（§8–14 アイデア）** | **14** | **28** | **約33%** |
| **全体** | **57** | **40** | **約59%** |

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-06-05 | 初版作成 |
| 2026-06-06 | Pit Lane・コース/マップ・ライブスコア・ゾーン採点を反映 |
| 2026-06-06 | スプラッシュ・`track` 分離・GPS軌跡再生・ゾーンベスト・ナビ整理・テキスト共有を反映 |
| 2026-06-05 | ハプティクス/サウンド・SNS画像共有を `[x]` に更新 |
| 2026-06-05 | テレメトリープレイバック・ゲーム性（デイリー/称号/DR）・ゾーントレースを反映 |
| 2026-06-05 | BLEロガー・理想ライン評価/学習・UIテーマ・ゲームHUD・センサー精度向上を反映 |
| 2026-06-06 | テーマBGM・BGM曲選択・UIタップSE・計測プリフライトを反映 |
