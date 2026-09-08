// NOTE on script-src: TanStack Start's own hydration bootstrap (the inline
// script that seeds window.$_TSR with per-request loader data) is dynamic
// per request, so it can't be allow-listed with a fixed hash the way a
// static script could. The router supports a proper per-request
// `ssr: { nonce }` option for exactly this, but wiring a nonce from this
// middleware through to wherever TanStack Start actually invokes
// getRouter() for SSR (src/router.tsx) isn't a clean, verifiable change
// from here -- confirmed live that a naive hash-only attempt breaks
// hydration completely (blocked the framework's own bootstrap script,
// "Expected to find bootstrap data on window.$_TSR" on every page load).
// Shipping that would have been strictly worse than not having a CSP at
// all. script-src stays 'unsafe-inline' until a nonce is wired through
// properly end-to-end; every other directive below is fully enforced.

function hostFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function buildConnectSrc(): string {
  const sources = ["'self'"];

  const supabaseHost = hostFromUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  if (supabaseHost) {
    sources.push(`https://${supabaseHost}`, `wss://${supabaseHost}`);
  }

  const sentryDsn = process.env.VITE_SENTRY_DSN;
  const sentryHost = sentryDsn
    ? hostFromUrl(sentryDsn.replace(/^https:\/\/[^@]+@/, "https://"))
    : null;
  if (sentryHost) {
    sources.push(`https://${sentryHost}`);
  }

  // Only relevant while the Document AI backend is a separate origin the
  // browser talks to directly (current local-dev setup). Omitted entirely
  // in any environment where it isn't configured, rather than left as a
  // wildcard "just in case".
  const documentAiHost = hostFromUrl(process.env.VITE_DOCUMENT_AI_BACKEND_URL);
  if (documentAiHost) {
    sources.push(`http://${documentAiHost}`, `https://${documentAiHost}`);
  }

  return sources.join(" ");
}

function buildContentSecurityPolicy(): string {
  const directives = [
    "default-src 'self'",
    // See the file-level note: not hash/nonce-restricted yet.
    "script-src 'self' 'unsafe-inline'",
    // Tailwind/Radix-based components rely on inline style attributes;
    // avoiding 'unsafe-inline' here would need a much larger styling
    // refactor.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // Tesseract.js (client-side OCR) always spawns its worker from a blob:
    // URL wrapping a same-origin importScripts() call, even when workerPath
    // is self-hosted -- without this, that instantiation falls back to
    // default-src 'self' and is silently blocked (OCR fails end-to-end).
    "worker-src 'self' blob:",
    `connect-src ${buildConnectSrc()}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  return directives.join("; ");
}

const CONTENT_SECURITY_POLICY = buildContentSecurityPolicy();

export function applySecurityHeaders(headers: Headers): void {
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}
