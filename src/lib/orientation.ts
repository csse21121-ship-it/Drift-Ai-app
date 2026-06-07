/**
 * 端末マウント姿勢の検知と加速度軸リマップ
 *
 * ──────────────────────────────────────────────
 * 【検知アルゴリズム】
 *
 * DeviceMotion の accelerationIncludingGravity から
 * 重力が支配的な軸を特定し、マウント姿勢を推定する。
 *
 *   gravity.z が最大 → 平置き（画面上向き / 下向き）
 *   gravity.y が最大 → 縦置き（ポートレート）
 *   gravity.x が最大 → 横置き（ランドスケープホルダー）
 *
 * ──────────────────────────────────────────────
 * 【軸リマップ】
 *
 * ┌──────────────┬──────────┬──────────────┬──────────────┐
 * │ 姿勢         │ 横G      │ 前後G        │ ヨー (重力投影) │
 * ├──────────────┼──────────┼──────────────┼──────────────┤
 * │ 平置き(Z軸)  │ acc.x    │ acc.y        │ dot(ω, ẑ)    │
 * │ 縦置き(Y軸)  │ acc.x    │ −acc.z       │ dot(ω, ŷ)    │
 * │ 横置き(X軸)  │ ±acc.y  │ ∓acc.z       │ dot(ω, x̂)    │
 * └──────────────┴──────────┴──────────────┴──────────────┘
 *
 * ヨーレートは dot(gyro, normalize(gravity)) で計算。
 * これは「重力軸（＝車体の垂直軸）まわりの角速度」であり、
 * スクリーン向きに依らず常に正確なドリフト検知ヨーを与える。
 *
 * ──────────────────────────────────────────────
 * 【端末取り付け前提】
 *
 * 縦置き: 画面がドライバー側を向いていることを想定
 *   → 前方加速 = スクリーン方向と逆 = −acc.z
 *
 * 横置きは重力 x 符号で左/右どちらに傾いているか判定し
 *   符号を揃えてから acc.y を横G として使う。
 */

export type MountOrientation =
  | 'flat'       // 平置き（画面上向き）: gravity dominant on Z
  | 'portrait'   // 縦置き: gravity dominant on Y
  | 'landscape'  // 横置きホルダー: gravity dominant on X
  | 'unknown';

const GRAVITY_MS2 = 9.80665;
/** 重力軸として信頼するための最低重力成分の大きさ (m/s²) */
const GRAVITY_AXIS_THRESHOLD = 6.0;
/** 支配軸と第2軸の差がこの値未満なら判定保留（unknown） */
const AXIS_DOMINANCE_MARGIN_MS2 = 1.5;
/** 姿勢切替に必要な連続フレーム数（~20Hz で約 0.75 秒） */
export const ORIENTATION_SWITCH_CONFIRM_FRAMES = 15;
/** unknown フォールバックがこのフレーム数続くと不安定 */
export const ORIENTATION_UNKNOWN_UNSTABLE_FRAMES = 20;
/** 直近ウィンドウ内の候補遷移回数がこの値以上で不安定 */
export const ORIENTATION_CHATTER_TRANSITIONS = 8;
/** チャタリング検出ウィンドウ（フレーム数） */
export const ORIENTATION_CHATTER_WINDOW = 90;

type Vec3 = { x: number; y: number; z: number };

/** 重力ベクトルの低域通過フィルタ（α=0.04 で約 1 秒スムージング） */
export function smoothGravity(current: Vec3, previous: Vec3, alpha = 0.04): Vec3 {
  return {
    x: alpha * current.x + (1 - alpha) * previous.x,
    y: alpha * current.y + (1 - alpha) * previous.y,
    z: alpha * current.z + (1 - alpha) * previous.z,
  };
}

/** 重力ベクトルからマウント姿勢を検知（即時・ヒステリシスなし） */
export function detectOrientation(g: Vec3): MountOrientation {
  return detectOrientationCandidate(g, null);
}

type AxisEntry = {
  orient: MountOrientation;
  value: number;
};

function axisEntries(g: Vec3): AxisEntry[] {
  return [
    { orient: 'flat', value: Math.abs(g.z) },
    { orient: 'portrait', value: Math.abs(g.y) },
    { orient: 'landscape', value: Math.abs(g.x) },
  ];
}

function axisValueForOrientation(g: Vec3, orientation: MountOrientation): number {
  switch (orientation) {
    case 'flat':
      return Math.abs(g.z);
    case 'portrait':
      return Math.abs(g.y);
    case 'landscape':
      return Math.abs(g.x);
    default:
      return 0;
  }
}

/**
 * マージン付き候補検知。
 * holdOrientation 指定時は、切替先が現姿勢軸を十分上回らない限り hold を維持。
 */
export function detectOrientationCandidate(
  g: Vec3,
  holdOrientation: MountOrientation | null,
): MountOrientation {
  const sorted = [...axisEntries(g)].sort((a, b) => b.value - a.value);
  const [top, second] = sorted;
  const maxVal = top.value;

  if (maxVal < GRAVITY_AXIS_THRESHOLD) return 'unknown';
  if (top.value - second.value < AXIS_DOMINANCE_MARGIN_MS2) return 'unknown';

  const candidate = top.orient;

  if (
    holdOrientation &&
    holdOrientation !== 'unknown' &&
    candidate !== holdOrientation
  ) {
    const candidateAxis = axisValueForOrientation(g, candidate);
    const holdAxis = axisValueForOrientation(g, holdOrientation);
    if (candidateAxis <= holdAxis + AXIS_DOMINANCE_MARGIN_MS2) {
      return holdOrientation;
    }
  }

  return candidate;
}

export type OrientationTrackerSnapshot = {
  /** 出力用姿勢（unknown 時は lastKnown へフォールバック） */
  orientation: MountOrientation;
  /** 生候補（マージン適用後） */
  candidate: MountOrientation;
  /** AUTO 姿勢が不安定 */
  unstable: boolean;
  /** unknown フォールバック継続中 */
  isFallbackActive: boolean;
  /** 切替待ち中 */
  isSwitchPending: boolean;
};

/** AUTO マウント向き — ヒステリシス + unknown フォールバック */
export class OrientationTracker {
  private stable: MountOrientation = 'unknown';
  private lastKnown: MountOrientation = 'unknown';
  private pending: MountOrientation | null = null;
  private pendingFrames = 0;
  private unknownFallbackFrames = 0;
  private recentCandidates: MountOrientation[] = [];

  reset(): void {
    this.stable = 'unknown';
    this.lastKnown = 'unknown';
    this.pending = null;
    this.pendingFrames = 0;
    this.unknownFallbackFrames = 0;
    this.recentCandidates = [];
  }

  update(g: Vec3): OrientationTrackerSnapshot {
    const hold =
      this.stable !== 'unknown'
        ? this.stable
        : this.lastKnown !== 'unknown'
          ? this.lastKnown
          : null;

    const candidate = detectOrientationCandidate(g, hold);

    this.recentCandidates.push(candidate);
    if (this.recentCandidates.length > ORIENTATION_CHATTER_WINDOW) {
      this.recentCandidates.shift();
    }

    let transitions = 0;
    for (let i = 1; i < this.recentCandidates.length; i++) {
      if (this.recentCandidates[i] !== this.recentCandidates[i - 1]) {
        transitions += 1;
      }
    }

    const chatterUnstable =
      transitions >= ORIENTATION_CHATTER_TRANSITIONS &&
      this.recentCandidates.length >= ORIENTATION_CHATTER_WINDOW / 2;

    if (candidate === 'unknown') {
      this.unknownFallbackFrames += 1;
      this.pending = null;
      this.pendingFrames = 0;

      const resolved =
        this.lastKnown !== 'unknown' ? this.lastKnown : this.stable;

      const unstable =
        this.unknownFallbackFrames >= ORIENTATION_UNKNOWN_UNSTABLE_FRAMES ||
        chatterUnstable;

      return {
        orientation: resolved,
        candidate,
        unstable,
        isFallbackActive: this.lastKnown !== 'unknown',
        isSwitchPending: false,
      };
    }

    this.unknownFallbackFrames = 0;

    if (this.stable === 'unknown') {
      this.stable = candidate;
      this.lastKnown = candidate;
      this.pending = null;
      this.pendingFrames = 0;

      return {
        orientation: candidate,
        candidate,
        unstable: chatterUnstable,
        isFallbackActive: false,
        isSwitchPending: false,
      };
    }

    if (candidate === this.stable) {
      this.pending = null;
      this.pendingFrames = 0;
      this.lastKnown = this.stable;

      return {
        orientation: this.stable,
        candidate,
        unstable: chatterUnstable,
        isFallbackActive: false,
        isSwitchPending: false,
      };
    }

    if (this.pending === candidate) {
      this.pendingFrames += 1;
    } else {
      this.pending = candidate;
      this.pendingFrames = 1;
    }

    const switchReady =
      this.pendingFrames >= ORIENTATION_SWITCH_CONFIRM_FRAMES;

    if (switchReady) {
      this.stable = candidate;
      this.lastKnown = candidate;
      this.pending = null;
      this.pendingFrames = 0;
    }

    const unstable =
      chatterUnstable ||
      this.pendingFrames > 0 ||
      this.unknownFallbackFrames > 0;

    return {
      orientation: this.stable,
      candidate,
      unstable,
      isFallbackActive: false,
      isSwitchPending: this.pendingFrames > 0 && !switchReady,
    };
  }
}

/** 人間に読みやすいラベル */
export function orientationLabel(o: MountOrientation): string {
  switch (o) {
    case 'flat':      return 'FLAT';
    case 'portrait':  return 'PORT';
    case 'landscape': return 'LAND';
    default:          return '----';
  }
}

export type RemappedMotion = {
  lateralMs2: number;       // 車体横方向の線形加速度 (m/s²)
  longitudinalMs2: number;  // 車体前後方向の線形加速度 (m/s²)
  yawRateRad: number;       // 車体ヨーレート (rad/s) — 重力軸投影
};

/**
 * 加速度・ジャイロ・重力ベクトルを受け取り、
 * 車体座標系に合わせてリマップした値を返す。
 *
 * @param acc     DeviceMotion.acceleration (重力除去済み線形加速度, m/s²)
 * @param gyro    Gyroscope (角速度, rad/s)
 * @param gravity DeviceMotion.accelerationIncludingGravity (スムージング済み)
 * @param orientation detectOrientation() の結果
 */
export function remapMotion(
  acc: Vec3,
  gyro: Vec3,
  gravity: Vec3,
  orientation: MountOrientation,
): RemappedMotion {
  // ── ヨーレート: 重力軸へのジャイロ投影 ──────────────────────────
  // 任意姿勢でも「車体垂直軸まわりの回転」を正確に取得できる
  const gMag = Math.sqrt(gravity.x ** 2 + gravity.y ** 2 + gravity.z ** 2);
  const yawRateRad =
    gMag > 0.5
      ? (gyro.x * gravity.x + gyro.y * gravity.y + gyro.z * gravity.z) / gMag
      : 0;

  // ── 横G / 前後G: マウント姿勢ごとにリマップ ──────────────────────
  switch (orientation) {
    case 'flat': {
      // 画面が上向きに寝かせた状態
      // X 軸 = 車体横方向 (短辺)
      // Y 軸 = 車体前後方向 (長辺。USB端が前か後ろかで符号が変わるが
      //         横G検知精度に影響しないためそのまま使う)
      return {
        lateralMs2: acc.x,
        longitudinalMs2: acc.y,
        yawRateRad,
      };
    }

    case 'portrait': {
      // 縦置き（画面がドライバー側）
      // X 軸 = 車体横方向 (変わらず)
      // Z 軸 = 前後方向: 画面がドライバー側 → 前方 = -Z
      return {
        lateralMs2: acc.x,
        longitudinalMs2: -acc.z,
        yawRateRad,
      };
    }

    case 'landscape': {
      // 横置きホルダー（画面がドライバー側、90° 回転）
      // gravity.x の符号で左右どちらに回転しているか判定
      const sign = gravity.x >= 0 ? 1 : -1;
      return {
        lateralMs2: sign * acc.y,
        longitudinalMs2: -sign * acc.z,
        yawRateRad,
      };
    }

    default: {
      // 姿勢不明: 平置きとして fallback
      return {
        lateralMs2: acc.x,
        longitudinalMs2: acc.y,
        yawRateRad,
      };
    }
  }
}

/** m/s² → G */
export function toG(ms2: number): number {
  return ms2 / GRAVITY_MS2;
}

/**
 * スムージング済み重力から道路ピッチ (°) を推定。
 * 正 = 登り（ノーズアップ）、負 = 下り。姿勢不明時は null。
 */
export function estimateRoadPitchDeg(
  gravity: Vec3,
  orientation: MountOrientation,
): number | null {
  const gMag = Math.sqrt(gravity.x ** 2 + gravity.y ** 2 + gravity.z ** 2);
  if (gMag < GRAVITY_AXIS_THRESHOLD) return null;

  const gx = gravity.x / gMag;
  const gy = gravity.y / gMag;
  const gz = gravity.z / gMag;

  let lx = 0;
  let ly = 0;
  let lz = 0;

  switch (orientation) {
    case 'flat':
      lx = 0;
      ly = 1;
      lz = 0;
      break;
    case 'portrait':
      lx = 0;
      ly = 0;
      lz = -1;
      break;
    case 'landscape': {
      const sign = gravity.x >= 0 ? 1 : -1;
      lx = 0;
      ly = sign;
      lz = -sign;
      break;
    }
    default:
      return null;
  }

  const dotLong = gx * lx + gy * ly + gz * lz;
  const pitchRad = Math.asin(clamp(-dotLong, -1, 1));
  return (pitchRad * 180) / Math.PI;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
