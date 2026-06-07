/**
 * LINE 公式アカウントの Basic ID を API から取得
 *
 * Usage:
 *   LINE_ACCESS_TOKEN=<チャネルアクセストークン> npm run line:basic-id
 *
 * トークン: LINE Developers → Messaging API 設定 → チャネルアクセストークン
 */

const token = process.env.LINE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error('LINE_ACCESS_TOKEN を指定してください');
  console.error('例: LINE_ACCESS_TOKEN=xxxxx npm run line:basic-id');
  process.exit(1);
}

type BotInfo = {
  userId?: string;
  basicId?: string;
  displayName?: string;
};

async function main(): Promise<void> {
  const res = await fetch('https://api.line.me/v2/bot/info', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = (await res.json()) as BotInfo & { message?: string };

  if (!res.ok) {
    console.error(`API エラー HTTP ${res.status}:`, body.message ?? JSON.stringify(body));
    process.exit(1);
  }

  const basicRaw = body.basicId?.trim();
  if (!basicRaw) {
    console.error('basicId が返りませんでした:', JSON.stringify(body, null, 2));
    process.exit(1);
  }

  const basicId = basicRaw.startsWith('@') ? basicRaw.slice(1) : basicRaw;

  console.log('');
  console.log('=== LINE 公式アカウント ===');
  console.log(`表示名: ${body.displayName ?? '—'}`);
  console.log(`Bot User ID: ${body.userId ?? '—'}`);
  console.log(`Basic ID: @${basicId}`);
  console.log('');
  console.log('.env に以下を追加:');
  console.log(`EXPO_PUBLIC_LINE_OA_BASIC_ID=${basicId}`);
  console.log('');
  console.log(`友だち追加 URL: https://line.me/R/ti/p/@${basicId}`);
}

void main();
