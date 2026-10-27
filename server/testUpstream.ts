/**
 * Test-only hook: point every outbound market-data call (REST and websocket)
 * at one fake service, so the end-to-end captures never touch the network.
 *
 * `VOST_TEST_UPSTREAM=http://127.0.0.1:<port>` rewrites
 * `https://api.binance.com/api/v3/klines?x` to
 * `http://127.0.0.1:<port>/https/api.binance.com/api/v3/klines?x` and
 * `wss://stream.binance.com:9443/ws/a` to
 * `ws://127.0.0.1:<port>/wss/stream.binance.com:9443/ws/a`.
 * Unset, `upstreamUrl` is the identity, which is the production path. The
 * server refuses to start with the setting in production or when it is not an
 * `http://` loopback URL.
 */

let base: string | null = null;

const LOOPBACK = new Set(['127.0.0.1', '[::1]', 'localhost']);

/** The validated base URL (no trailing slash), or null when the setting is unset. Throws when it is not allowed. */
export function readTestUpstream(env: Record<string, string | undefined>): string | null {
  const raw = env.VOST_TEST_UPSTREAM?.trim();
  if (!raw) return null;
  if (env.NODE_ENV === 'production') {
    throw new Error('VOST_TEST_UPSTREAM must not be set in production (NODE_ENV=production)');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`VOST_TEST_UPSTREAM must be an http://127.0.0.1:<port> URL (got "${raw}")`);
  }
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname)) {
    throw new Error(`VOST_TEST_UPSTREAM must be an http:// loopback URL (127.0.0.1, ::1 or localhost), got "${raw}"`);
  }
  return `${url.protocol}//${url.host}`;
}

/** Sets (or, with null, clears) the base every `upstreamUrl` call rewrites to. */
export function setTestUpstream(next: string | null): void {
  base = next === null ? null : next.replace(/\/+$/, '');
}

/** Rewrites an upstream `http(s)` or `ws(s)` URL to the test base; the identity when none is set. */
export function upstreamUrl(url: string): string {
  if (base === null) return url;
  const m = /^(https?|wss?):\/\/(.*)$/i.exec(url);
  if (!m) return url;
  const scheme = m[1].toLowerCase();
  const root = scheme.startsWith('ws') ? base.replace(/^http/, 'ws') : base;
  return `${root}/${scheme}/${m[2]}`;
}
