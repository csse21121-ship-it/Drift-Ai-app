/**
 * アプリ内オーディオソース
 *
 * BGM: OpenGameArt（MintoDog / お絵描き少年）— CC BY 4.0
 *   Neon sign Circuit [Remake] / Pure Raceway（レーシング向けループ）
 *   クレジット: Music by お絵描き少年 — https://opengameart.org/users/mintodog
 *
 * ローカルバンドルする場合: assets/audio/bgm/*.mp3 を置き、
 * BGM_LOCAL の require を有効化（下記 USE_LOCAL_BGM）。
 *
 * SE: Google Actions Sound Library（アプリ内ストリーミング可）
 */

const G = 'https://actions.google.com/sounds/v1';
const OGA = 'https://opengameart.org/sites/default/files';

/** OpenGameArt 直リンク — レーシング / シンセウェイブ系ループ */
export const BGM = {
  /** Neon sign Circuit — Pit Lane デフォルト */
  pitLane: `${OGA}/neon_sign_circuit_remake_bpm145.mp3`,
  /** Pure Raceway — サーキット赤テーマ */
  circuitRed: `${OGA}/pure_raceway_bpm160.mp3`,
  /** Neon sign Circuit Climax — ミッドナイトシアン */
  midnightCyan: `${OGA}/neon_sign_circuit_climax_remake_bpm160.mp3`,
  /** Pure Raceway Climax — アンバーガレージ */
  amberGarage: `${OGA}/pure_raceway_climax_bpm175.mp3`,
  /** Neon sign Circuit（低音量で使用）— ペーパーライト */
  paperLight: `${OGA}/neon_sign_circuit_remake_bpm145.mp3`,
} as const;

/** 短尺 SE */
export const SFX = {
  /** ドリフト突入・危険操作 */
  skid: `${G}/cartoon/wood_plank_flicks.ogg`,
  /** スウッシュ・アクセント */
  skidAccent: `${G}/foley/swoosh.ogg`,
  /** エンジン / スタート */
  engine: `${G}/transportation/car_horn.ogg`,
  /** HUD ビープ */
  sciFi: `${G}/alarms/beep_short.ogg`,
  /** 決定音 */
  arcade: `${G}/cartoon/pop.ogg`,
  /** 達成・ウィン */
  win: `${G}/cartoon/cartoon_boing.ogg`,
} as const;

/** UI タップ専用（種別ごとに音色を分岐） */
export const UI_SFX = {
  nav: `${G}/alarms/beep_short.ogg`,
  launch: `${G}/transportation/car_horn.ogg`,
  confirm: `${G}/cartoon/pop.ogg`,
  back: `${G}/foley/swoosh.ogg`,
  danger: `${G}/impacts/crash.ogg`,
} as const;
