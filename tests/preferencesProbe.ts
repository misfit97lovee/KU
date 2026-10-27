import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createAuthRouter } from '../server/auth.ts';
import { createDatabaseRouter, ReadingDatabase } from '../server/database.ts';

// Test-only Google verifier and fresh probe accounts; production auth is intact.
export async function probePreferences(db: ReadingDatabase): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'ku-preferences-'));
  const suffix = randomUUID();
  const users = Object.fromEntries(['A', 'B'].map(name => [name, {
    id: `ku-preferences-test-${name}-${suffix}`, name: 'Preference test', email: `${name.toLowerCase()}@example.invalid`, picture: ''
  }]));
  const auth = createAuthRouter({ clientId: 'test-only', storePath: join(directory, 'auth.json'), secureCookies: false,
    verifyToken: async token => { if (!users[token]) throw Error('Invalid test token'); return users[token]!; } });
  let invalidations = 0;
  const app = express(); app.use(express.json()); app.use('/api/auth', auth);
  app.use('/api/db', createDatabaseRouter(db, auth.resolveUser, () => invalidations++));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = async (account: string) => {
    const response = await fetch(base + '/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: account }) });
    assert.equal(response.status, 200); assert(response.headers.get('set-cookie')?.includes('HttpOnly'));
    return response.headers.get('set-cookie')!.split(';')[0]!;
  };
  const request = (cookie: string, method = 'GET', body?: unknown, origin?: string) => fetch(base + '/api/db/preferences', {
    method, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const get = async (cookie: string) => { const response = await request(cookie); assert.equal(response.status, 200); return response.json(); };
  try {
    assert.equal((await request('')).status, 401);
    let a = await login('A'); const b = await login('B');
    assert.equal((await get(a)).completed, false);
    const preference = { genres: ['추리·미스터리'], topics: ['심리'], favorite_authors: ['아서 코난 도일'], favorite_books: ['셜록 홈즈'] };
    assert.equal((await request(a, 'PUT', preference, 'https://evil.example')).status, 403);
    assert.equal((await request(a, 'PUT', { genres: [1] })).status, 400);
    assert.equal((await request(a, 'PUT', { ...preference, user_sub: users.B!.id })).status, 200);
    assert.deepEqual((await get(a)).preferences, preference);
    assert.equal((await get(b)).completed, false);
    assert.equal((await request(b, 'DELETE')).status, 200);
    assert.deepEqual((await get(a)).preferences, preference);
    const direct = await db.query('user_preferences', { user_sub: `eq.${users.A!.id}`, select: 'genres,topics,favorite_authors,favorite_books' });
    assert.deepEqual(direct, [preference]);
    assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: a } })).status, 200);
    assert.equal((await request(a)).status, 401);
    a = await login('A'); assert.deepEqual((await get(a)).preferences, preference);
    const changed = { ...preference, genres: ['과학'], topics: ['물리학'] };
    assert.equal((await request(a, 'PUT', changed)).status, 200);
    assert.deepEqual((await db.getPersonalization(users.A!)).preferences, changed);
    // Concurrent first-save requests must not create multiple rows.
    const skipped = await Promise.all([request(b, 'PUT', { skip: true }), request(b, 'PUT', { skip: true })]);
    assert(skipped.every(response => response.status === 200));
    const skipResult = await get(await login('B'));
    assert.equal(skipResult.completed, true);
    assert.deepEqual(skipResult.preferences, { genres: [], topics: [], favorite_authors: [], favorite_books: [] });
    assert.equal((await db.query('user_preferences', { user_sub: `eq.${users.B!.id}`, select: 'id' })).length, 1);
    assert(invalidations >= 5);
    assert.equal((await request(a, 'DELETE')).status, 200);
    assert.equal((await get(a)).completed, false);
    assert.equal((await get(b)).completed, true);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    try {
      for (const user of Object.values(users)) {
        await db.removePreferences(user);
        await db.query('users', { google_sub: `eq.${user.id}` }, 'DELETE');
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}
