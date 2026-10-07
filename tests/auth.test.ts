import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { createAuthRouter, verifyGoogleIdToken } from '../server/auth.ts';
import { setAccount } from '../src/accountStorage.ts';
import { getSavedSessions, saveSessionSnapshot } from '../src/sessionHistory.ts';

test('Google ID token checks signature and claims', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'key-1', kty: 'RSA', alg: 'RS256', use: 'sig' }] }));
  const makeToken = (claims: Record<string, unknown>, key = privateKey) => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signed = sign('RSA-SHA256', Buffer.from(`${header}.${body}`), key).toString('base64url');
    return `${header}.${body}.${signed}`;
  };
  const claims = { iss: 'https://accounts.google.com', aud: 'client-id', exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000), sub: 'google-123', email_verified: true, email: 'test@example.com', name: '테스트', picture: 'https://example.com/avatar.png' };
  try {
    assert.deepEqual(await verifyGoogleIdToken(makeToken(claims), 'client-id'), {
      id: 'google-123', email: 'test@example.com', name: '테스트', picture: 'https://example.com/avatar.png'
    });
    await assert.rejects(verifyGoogleIdToken(makeToken({ ...claims, aud: 'another-client' }), 'client-id'));
    await assert.rejects(verifyGoogleIdToken(makeToken({ ...claims, exp: 1 }), 'client-id'));
    const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    await assert.rejects(verifyGoogleIdToken(makeToken(claims, otherKey), 'client-id'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('A 로그인/새로고침/로그아웃 → B 격리 → A 재로그인 및 프로필 영속화', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ku-auth-'));
  const storePath = join(directory, 'auth.json');
  const user = { id: 'google-123', name: '테스트', email: 'test@example.com', picture: 'https://example.com/avatar.png' };
  const makeApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter({ clientId: 'client-id', storePath, verifyToken: async token => {
      if (token === 'valid-token-B') return { ...user, id: 'google-B', name: 'B', email: 'b@example.com' };
      if (token !== 'valid-token') throw new Error('invalid');
      return user;
    } }));
    return app;
  };
  const listen = () => new Promise<Server>((resolve, reject) => {
    const instance = makeApp().listen(0, '127.0.0.1', () => resolve(instance));
    instance.once('error', reject);
  });
  let server = await listen();
  const values = new Map<string, string>();
  globalThis.localStorage = { getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => { values.set(key, value); } } as Storage;
  const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
  try {
    const invalid = await fetch(`${base()}/google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: 'bad' }) });
    assert.equal(invalid.status, 401);
    const login = await fetch(`${base()}/google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: 'valid-token' }) });
    assert.equal(login.status, 200);
    assert.deepEqual((await login.json() as { user: typeof user }).user, user);
    setAccount(user.id);
    saveSessionSnapshot('reading', { book: { title: 'A 비공개 기록' } });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    assert.match(login.headers.get('set-cookie')!, /HttpOnly/i);
    const stored = JSON.parse(await readFile(storePath, 'utf8')) as { users: Record<string, typeof user>; sessions: Record<string, unknown> };
    assert.deepEqual(stored.users[user.id], user);
    assert.equal(Object.keys(stored.sessions).length, 1);
    assert.ok(!JSON.stringify(stored).includes(cookie.slice(cookie.indexOf('=') + 1)));
    assert.deepEqual(await (await fetch(`${base()}/me`, { headers: { Cookie: cookie } })).json(), { user });
    await new Promise<void>(resolve => server.close(() => resolve()));
    server = await listen();
    assert.deepEqual(await (await fetch(`${base()}/me`, { headers: { Cookie: cookie } })).json(), { user });
    const logout = await fetch(`${base()}/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(logout.status, 200);
    assert.deepEqual(await (await fetch(`${base()}/me`, { headers: { Cookie: cookie } })).json(), { user: null });
    setAccount(null);
    assert.deepEqual(getSavedSessions(), []);
    const bLogin = await fetch(`${base()}/google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: 'valid-token-B' }) });
    const bUser = (await bLogin.json() as { user: typeof user }).user;
    assert.equal(bUser.id, 'google-B');
    setAccount(bUser.id);
    assert.deepEqual(getSavedSessions(), []);
    saveSessionSnapshot('reading', { book: { title: 'B 비공개 기록' } });
    const aRelogin = await fetch(`${base()}/google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: 'valid-token' }) });
    setAccount((await aRelogin.json() as { user: typeof user }).user.id);
    assert.deepEqual(getSavedSessions().map(record => record.title), ['A 비공개 기록']);
  } finally {
    setAccount(null);
    delete (globalThis as { localStorage?: Storage }).localStorage;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
