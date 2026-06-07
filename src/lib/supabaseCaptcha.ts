/**
 * Supabase Auth CAPTCHA（Cloudflare Turnstile）トークン取得
 *
 * Dashboard で CAPTCHA 保護が ON の場合、signInAnonymously に captchaToken が必要。
 * EXPO_PUBLIC_TURNSTILE_SITE_KEY を .env に設定すると WebView で自動取得する。
 */

type CaptchaRefreshListener = () => void;

let pendingRequest: {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
} | null = null;

let cachedToken: string | null = null;
let cachedAtMs = 0;

/** Turnstile トークンは短時間で失効するため、4 分以内なら再利用 */
const TOKEN_TTL_MS = 4 * 60 * 1000;

const refreshListeners = new Set<CaptchaRefreshListener>();

export function getTurnstileSiteKey(): string | null {
  const key = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return key || null;
}

/** WebView の origin（Cloudflare Turnstile の許可ドメインに登録すること） */
export function getTurnstileBaseUrl(): string {
  return process.env.EXPO_PUBLIC_TURNSTILE_BASE_URL?.trim() || 'http://localhost';
}

export function isTurnstileConfigured(): boolean {
  return getTurnstileSiteKey() != null;
}

export function getCachedCaptchaToken(): string | null {
  if (!cachedToken) return null;
  if (Date.now() - cachedAtMs > TOKEN_TTL_MS) {
    cachedToken = null;
    cachedAtMs = 0;
    return null;
  }
  return cachedToken;
}

export function onCaptchaRefresh(listener: CaptchaRefreshListener): () => void {
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
}

function notifyRefresh(): void {
  refreshListeners.forEach((listener) => listener());
}

function storeCaptchaToken(token: string): void {
  cachedToken = token;
  cachedAtMs = Date.now();
}

/** アプリ起動時に Turnstile トークンを先行取得 */
export function preloadCaptchaToken(): void {
  if (!isTurnstileConfigured()) return;
  void requestFreshCaptchaToken().catch((err) => {
    if (__DEV__) {
      console.warn('[turnstile] preload failed:', err instanceof Error ? err.message : err);
    }
  });
}

/** 匿名認証直前に呼び出し — Turnstile トークンを 1 回分取得 */
export async function requestFreshCaptchaToken(): Promise<string> {
  const siteKey = getTurnstileSiteKey();
  if (!siteKey) {
    throw new Error('CAPTCHA_SITE_KEY_NOT_CONFIGURED');
  }

  const cached = getCachedCaptchaToken();
  if (cached) {
    return cached;
  }

  if (pendingRequest) {
    pendingRequest.reject(new Error('CAPTCHA_REQUEST_SUPERSEDED'));
    pendingRequest = null;
  }

  return new Promise((resolve, reject) => {
    pendingRequest = { resolve, reject };
    notifyRefresh();

    setTimeout(() => {
      if (pendingRequest?.resolve !== resolve) return;
      pendingRequest.reject(new Error('CAPTCHA_TIMEOUT'));
      pendingRequest = null;
    }, 45_000);
  });
}

export function deliverCaptchaToken(token: string): void {
  if (!token || token === 'error') {
    failCaptchaToken('CAPTCHA_FAILED');
    return;
  }

  storeCaptchaToken(token);

  if (!pendingRequest) return;
  pendingRequest.resolve(token);
  pendingRequest = null;
}

export function failCaptchaToken(message: string): void {
  if (!pendingRequest) return;
  pendingRequest.reject(new Error(message));
  pendingRequest = null;
}

export function buildTurnstileHtml(siteKey: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad" async defer></script>
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #fff; }
      #turnstile { min-height: 65px; }
    </style>
  </head>
  <body>
    <div id="turnstile"></div>
    <script>
      var widgetId = null;

      function post(token) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(token);
        }
      }

      function renderWidget() {
        if (typeof turnstile === 'undefined') {
          post('error');
          return;
        }
        try {
          if (widgetId !== null) {
            turnstile.remove(widgetId);
            widgetId = null;
          }
          widgetId = turnstile.render('#turnstile', {
            sitekey: ${JSON.stringify(siteKey)},
            size: 'normal',
            callback: function (token) { post(token); },
            'error-callback': function () { post('error'); },
            'timeout-callback': function () { post('error'); },
          });
        } catch (e) {
          post('error');
        }
      }

      window.__refreshTurnstile = renderWidget;

      function onTurnstileLoad() {
        renderWidget();
      }
    </script>
  </body>
</html>`;
}
