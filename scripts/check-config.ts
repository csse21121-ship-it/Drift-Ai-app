/**
 * 本番ビルド前の環境変数・Expo 設定チェック
 *
 * Usage: npm run config:check
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

type CheckResult = {
  label: string;
  ok: boolean;
  detail: string;
  required?: boolean;
};

const PLACEHOLDER_GOOGLE = 'YOUR_GOOGLE_MAPS_API_KEY_HERE';

function loadDotEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return {};

  const out: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function env(name: string, dotEnv: Record<string, string>): string {
  return process.env[name]?.trim() || dotEnv[name]?.trim() || '';
}

function runChecks(): CheckResult[] {
  const dotEnv = loadDotEnv();

  const supabaseUrl = env('EXPO_PUBLIC_SUPABASE_URL', dotEnv);
  const supabaseAnon = env('EXPO_PUBLIC_SUPABASE_ANON_KEY', dotEnv);
  const googleMaps = env('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY', dotEnv);
  const orsKey = env('EXPO_PUBLIC_ORS_API_KEY', dotEnv);
  const lineBasicId = env('EXPO_PUBLIC_LINE_OA_BASIC_ID', dotEnv);

  return [
    {
      label: 'Supabase URL',
      ok: supabaseUrl.startsWith('https://') && supabaseUrl.includes('supabase'),
      detail: supabaseUrl ? supabaseUrl : '未設定 — .env に EXPO_PUBLIC_SUPABASE_URL',
      required: true,
    },
    {
      label: 'Supabase Anon Key',
      ok: supabaseAnon.length >= 20,
      detail: supabaseAnon ? `${supabaseAnon.slice(0, 12)}…` : '未設定 — EXPO_PUBLIC_SUPABASE_ANON_KEY',
      required: true,
    },
    {
      label: 'Google Maps API Key',
      ok: googleMaps.length >= 20 && googleMaps !== PLACEHOLDER_GOOGLE,
      detail: googleMaps && googleMaps !== PLACEHOLDER_GOOGLE
        ? `${googleMaps.slice(0, 8)}…（Android マップ用）`
        : '未設定 — EXPO_PUBLIC_GOOGLE_MAPS_API_KEY（Android 実機でタイル表示に必要）',
      required: false,
    },
    {
      label: 'OpenRouteService API Key',
      ok: orsKey.length >= 10,
      detail: orsKey
        ? `${orsKey.slice(0, 8)}…（コース自動生成）`
        : '未設定 — EXPO_PUBLIC_ORS_API_KEY（コースウィザードのみ）',
      required: false,
    },
    {
      label: 'LINE OA Basic ID',
      ok: lineBasicId.length >= 4,
      detail: lineBasicId
        ? `@${lineBasicId.replace(/^@/, '')}（個人モード友だち追加）`
        : '未設定 — EXPO_PUBLIC_LINE_OA_BASIC_ID（LINE 個人連携時）',
      required: false,
    },
  ];
}

function main(): void {
  console.log('DriftScore AI — config check\n');

  const results = runChecks();
  let failedRequired = 0;
  let warnings = 0;

  for (const item of results) {
    const icon = item.ok ? '✓' : item.required ? '✗' : '⚠';
    console.log(`${icon} ${item.label}`);
    console.log(`  ${item.detail}\n`);

    if (!item.ok) {
      if (item.required) failedRequired += 1;
      else warnings += 1;
    }
  }

  if (failedRequired > 0) {
    console.log(`FAILED — 必須 ${failedRequired} 件。 .env.example を参照して .env を設定してください。`);
    process.exit(1);
  }

  if (warnings > 0) {
    console.log(`OK（警告 ${warnings} 件 — 機能によっては API キーが必要です）`);
    process.exit(0);
  }

  console.log('OK — すべてのチェック項目が設定済みです');
}

main();
