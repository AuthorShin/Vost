import { spawn } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readTestUpstream, setTestUpstream, upstreamUrl } from './testUpstream.ts';

afterEach(() => setTestUpstream(null));

describe('upstreamUrl', () => {
  it('is the identity when no test upstream is set', () => {
    expect(upstreamUrl('https://api.binance.com/api/v3/klines?x=1')).toBe('https://api.binance.com/api/v3/klines?x=1');
    expect(upstreamUrl('wss://stream.binance.com:9443/ws/a')).toBe('wss://stream.binance.com:9443/ws/a');
  });

  it('keeps the original scheme and host in the path of an http(s) URL', () => {
    setTestUpstream('http://127.0.0.1:4100');
    expect(upstreamUrl('https://api.binance.com/api/v3/klines?x')).toBe('http://127.0.0.1:4100/https/api.binance.com/api/v3/klines?x');
    expect(upstreamUrl('http://example.com:8080/a?b=c&d=e')).toBe('http://127.0.0.1:4100/http/example.com:8080/a?b=c&d=e');
  });

  it('rewrites a websocket URL to ws:// and keeps an explicit port and the query', () => {
    setTestUpstream('http://127.0.0.1:4100/');
    expect(upstreamUrl('wss://stream.binance.com:9443/ws/a')).toBe('ws://127.0.0.1:4100/wss/stream.binance.com:9443/ws/a');
    expect(upstreamUrl('wss://ws.okx.com:8443/ws/v5/business?x=1')).toBe('ws://127.0.0.1:4100/wss/ws.okx.com:8443/ws/v5/business?x=1');
  });

  it('is the identity again after the setting is cleared', () => {
    setTestUpstream('http://127.0.0.1:4100');
    setTestUpstream(null);
    expect(upstreamUrl('https://api.kraken.com/0/public/OHLC')).toBe('https://api.kraken.com/0/public/OHLC');
  });
});

describe('readTestUpstream', () => {
  it('returns null when unset or empty', () => {
    expect(readTestUpstream({})).toBeNull();
    expect(readTestUpstream({ VOST_TEST_UPSTREAM: '  ' })).toBeNull();
  });

  it('accepts an http loopback URL', () => {
    expect(readTestUpstream({ VOST_TEST_UPSTREAM: 'http://127.0.0.1:4100' })).toBe('http://127.0.0.1:4100');
    expect(readTestUpstream({ VOST_TEST_UPSTREAM: 'http://localhost:4100/' })).toBe('http://localhost:4100');
    expect(readTestUpstream({ VOST_TEST_UPSTREAM: 'http://[::1]:4100' })).toBe('http://[::1]:4100');
  });

  it('throws in production', () => {
    expect(() => readTestUpstream({ NODE_ENV: 'production', VOST_TEST_UPSTREAM: 'http://127.0.0.1:4100' })).toThrow(/VOST_TEST_UPSTREAM.*production/);
  });

  it('does not throw in production when the setting is unset', () => {
    expect(readTestUpstream({ NODE_ENV: 'production' })).toBeNull();
  });

  it('throws for a non-loopback host, a non-http scheme or garbage', () => {
    for (const bad of ['http://example.com:4100', 'https://127.0.0.1:4100', 'ws://127.0.0.1:4100', 'http://10.0.0.5:80', 'nonsense']) {
      expect(() => readTestUpstream({ VOST_TEST_UPSTREAM: bad }), bad).toThrow(/VOST_TEST_UPSTREAM/);
    }
  });
});

describe('server/index.mjs', () => {
  it('refuses to start in production with the setting, before it listens', async () => {
    const entry = path.resolve(import.meta.dirname, 'index.mjs');
    const child = spawn(process.execPath, [entry], {
      env: { ...process.env, NODE_ENV: 'production', VOST_TEST_UPSTREAM: 'http://127.0.0.1:9', PORT: '0', HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const code = await new Promise<number | null>((resolve) => {
      // A server that wrongly started would never exit: kill it after a bound.
      const guard = setTimeout(() => child.kill('SIGKILL'), 15_000);
      child.once('exit', (c) => {
        clearTimeout(guard);
        resolve(c);
      });
    });
    expect(code).toBe(1);
    expect(out).toMatch(/VOST_TEST_UPSTREAM/);
    expect(out).not.toMatch(/Vost v/); // no start banner: it never listened
  });
});
