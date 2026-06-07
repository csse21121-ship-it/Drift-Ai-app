/**
 * ドリフト判定シミュレーター
 *
 * 使い方:
 *   npm run simulate
 *   npm run simulate -- grip-corner
 *   npm run simulate -- semi-grip full-drift brief-spike
 *   npm run simulate -- --preset pro semi-grip
 */

import { replayFrames, type ReplayFrame } from '../src/lib/driftReplay';
import { meetsEnterCondition } from '../src/lib/driftDetection';
import { scoreSession } from '../src/lib/scoring';
import {
  DEFAULT_THRESHOLDS,
  THRESHOLD_PRESETS,
  type DriftThresholds,
  type PresetName,
} from '../src/types/settings';

// ── シナリオ定義 ─────────────────────────────────────────────

type Scenario = {
  id: string;
  label: string;
  description: string;
  frames: ReplayFrame[];
};

const SCENARIOS: Scenario[] = [
  {
    id: 'grip-corner',
    label: 'グリップコーナー',
    description: '高い横Gだがヨーレートは低い。誤検知しない想定。',
    frames: buildFrames([
      { t: 0,    g: 0.1,  yaw: 0.05, spd: 80, slip: 2 },
      { t: 200,  g: 0.85, yaw: 0.10, spd: 75, slip: 3 },
      { t: 1500, g: 0.90, yaw: 0.12, spd: 70, slip: 4 },
      { t: 2500, g: 0.3,  yaw: 0.06, spd: 72, slip: 1 },
      { t: 3000, g: 0.1,  yaw: 0.04, spd: 75, slip: 0 },
    ]),
  },
  {
    id: 'semi-grip',
    label: '半グリップ',
    description: '適度なスライド。STANDARD では検知されうる。',
    frames: buildFrames([
      { t: 0,    g: 0.1,  yaw: 0.05, spd: 50, slip: 5 },
      { t: 100,  g: 0.40, yaw: 0.28, spd: 55, slip: 12 },
      { t: 500,  g: 0.50, yaw: 0.30, spd: 58, slip: 15 },
      { t: 2000, g: 0.45, yaw: 0.27, spd: 60, slip: 14 },
      { t: 3500, g: 0.20, yaw: 0.10, spd: 62, slip: 5 },
      { t: 4000, g: 0.1,  yaw: 0.05, spd: 65, slip: 0 },
    ]),
  },
  {
    id: 'full-drift',
    label: 'フルドリフト',
    description: '高横G・高ヨーレート・大スリップ角。確実に検知想定。',
    frames: buildFrames([
      { t: 0,    g: 0.1,  yaw: 0.05, spd: 40, slip: 0 },
      { t: 50,   g: 0.60, yaw: 0.50, spd: 45, slip: 35 },
      { t: 500,  g: 0.75, yaw: 0.55, spd: 48, slip: 42 },
      { t: 3000, g: 0.70, yaw: 0.48, spd: 50, slip: 40 },
      { t: 5000, g: 0.20, yaw: 0.10, spd: 52, slip: 5 },
      { t: 5500, g: 0.1,  yaw: 0.05, spd: 55, slip: 0 },
    ]),
  },
  {
    id: 'brief-spike',
    label: '一瞬のスパイク',
    description: '300ms 未満の閾値超え。デバウンスで無視想定。',
    frames: buildFrames([
      { t: 0,   g: 0.1,  yaw: 0.05, spd: 60, slip: 0 },
      { t: 50,  g: 0.60, yaw: 0.40, spd: 62, slip: 20 },
      { t: 200, g: 0.1,  yaw: 0.05, spd: 63, slip: 0 },
      { t: 500, g: 0.1,  yaw: 0.05, spd: 64, slip: 0 },
    ]),
  },
];

type RawPoint = {
  t: number;
  g: number;
  yaw: number;
  spd: number;
  slip: number;
};

/** 粗いキーフレームを 50ms 間隔に線形補間 */
function buildFrames(keypoints: RawPoint[]): ReplayFrame[] {
  const sorted = [...keypoints].sort((a, b) => a.t - b.t);
  const frames: ReplayFrame[] = [];
  const interval = 50;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    for (let t = a.t; t < b.t; t += interval) {
      const ratio = (t - a.t) / (b.t - a.t);
      frames.push({
        tMs: t,
        lateralG: lerp(a.g, b.g, ratio),
        yawRateRad: lerp(a.yaw, b.yaw, ratio),
        speedKmh: lerp(a.spd, b.spd, ratio),
        slipAngleDeg: lerp(a.slip, b.slip, ratio),
      });
    }
  }
  const last = sorted[sorted.length - 1];
  frames.push({
    tMs: last.t,
    lateralG: last.g,
    yawRateRad: last.yaw,
    speedKmh: last.spd,
    slipAngleDeg: last.slip,
  });
  return frames;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── CLI ───────────────────────────────────────────────────────

const PRESET_NAMES = Object.keys(THRESHOLD_PRESETS) as PresetName[];

function parseArgs(argv: string[]) {
  let preset: PresetName = 'standard';
  const scenarioIds: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--preset' && argv[i + 1]) {
      const name = argv[++i] as PresetName;
      if (!PRESET_NAMES.includes(name)) {
        console.error(`不明なプリセット: ${name} (${PRESET_NAMES.join(', ')})`);
        process.exit(1);
      }
      preset = name;
    } else if (!arg.startsWith('--')) {
      scenarioIds.push(arg);
    }
  }

  return { preset, scenarioIds };
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function runScenario(scenario: Scenario, thresholds: DriftThresholds, presetLabel: string) {
  const sessionStart = 1_700_000_000_000;
  const { steps, events } = replayFrames(scenario.frames, thresholds, sessionStart);

  const sessionDurationMs = scenario.frames[scenario.frames.length - 1]?.tMs ?? 0;
  const maxSpeed = Math.max(...scenario.frames.map((f) => f.speedKmh));
  const result = scoreSession(events, sessionStart, sessionDurationMs, maxSpeed);

  console.log('');
  console.log(`━━ ${scenario.label} (${scenario.id}) ━━`);
  console.log(scenario.description);
  console.log(`プリセット: ${presetLabel}`);
  console.log(`閾値: 横G≥${thresholds.enterLateralG} / ヨーレ≥${thresholds.enterYawRate} / 速度≥${thresholds.minSpeedKmh}km/h`);
  console.log('');

  const enterFrames = scenario.frames.filter((f) =>
    meetsEnterCondition(f.lateralG, f.yawRateRad, f.speedKmh, thresholds),
  );
  console.log(`入閾値を満たしたフレーム: ${enterFrames.length} / ${scenario.frames.length}`);

  const phaseChanges = steps.filter((s, i) => i === 0 || s.phase !== steps[i - 1].phase);
  if (phaseChanges.length > 0) {
    console.log('フェーズ遷移:');
    for (const s of phaseChanges) {
      console.log(`  ${formatMs(s.tMs)} → ${s.phase.toUpperCase()}`);
    }
  } else {
    console.log('フェーズ遷移: なし (常に IDLE)');
  }

  const ended = steps.filter((s) => s.eventEnded);
  console.log(`検知ドリフト数: ${events.length}`);

  if (events.length === 0) {
    console.log('採点: 0 pt (ドリフト未検知)');
    return;
  }

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const score = result.driftScores[i];
    console.log('');
    console.log(`  [#${i + 1}] 継続 ${formatMs(e.durationMs)}`);
    console.log(`       ピーク横G ${e.peakLateralG.toFixed(2)}G / ヨーレ ${e.peakYawRate.toFixed(2)} rad/s`);
    console.log(`       ピーク速度 ${e.peakSpeedKmh.toFixed(0)} km/h / スリップ ${e.peakSlipAngleDeg.toFixed(0)}°`);
    console.log(`       スコア ${score.finalPoints} pt (base ${score.basePoints} × angle ${score.angleBonus.toFixed(2)} × combo ×${score.combo})`);
  }

  console.log('');
  console.log(`合計: ${result.totalPoints} pt / グレード ${result.grade}`);
}

function printUsage() {
  console.log('DriftScore AI — ドリフト判定シミュレーター');
  console.log('');
  console.log('使い方:');
  console.log('  npm run simulate');
  console.log('  npm run simulate -- semi-grip');
  console.log('  npm run simulate -- --preset pro semi-grip full-drift');
  console.log('');
  console.log('シナリオ:');
  for (const s of SCENARIOS) {
    console.log(`  ${s.id.padEnd(14)} ${s.label} — ${s.description}`);
  }
  console.log('');
  console.log(`プリセット: ${PRESET_NAMES.join(', ')}`);
}

const { preset, scenarioIds } = parseArgs(process.argv.slice(2));
const thresholds = THRESHOLD_PRESETS[preset];

const selected =
  scenarioIds.length === 0
    ? SCENARIOS
    : SCENARIOS.filter((s) => scenarioIds.includes(s.id));

const unknown = scenarioIds.filter((id) => !SCENARIOS.some((s) => s.id === id));
if (unknown.length > 0) {
  console.error(`不明なシナリオ: ${unknown.join(', ')}`);
  printUsage();
  process.exit(1);
}

printUsage();
console.log(`\n実行: ${selected.map((s) => s.id).join(', ')} / preset=${preset}`);

for (const scenario of selected) {
  runScenario(scenario, thresholds, preset);
}

console.log('\n完了');
