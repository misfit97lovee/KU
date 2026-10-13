import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createAuthRouter } from '../server/auth.ts';
import { createDatabaseRouter, ReadingDatabase, type DatabaseSession } from '../server/database.ts';

// Exercises the real HttpOnly/session implementation. Google token verification
// is injected ONLY in this isolated test app, never in the production server.
export async function probeDatabase(db: ReadingDatabase): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'ku-db-test-'));
  const suffix = randomUUID();
  const users = {
    A: { id: `ku-db-test-A-${suffix}`, name: 'KU DB test A', email: 'a@example.invalid', picture: '' },
    B: { id: `ku-db-test-B-${suffix}`, name: 'KU DB test B', email: 'b@example.invalid', picture: '' }
  };
  const auth = createAuthRouter({ clientId: 'test-only', storePath: join(directory, 'auth.json'), secureCookies: false,
    verifyToken: async token => { if (token === 'A' || token === 'B') return users[token]; throw new Error('Invalid test token'); } });
  const app = express();
  app.use(express.json()); app.use('/api/auth', auth); app.use('/api/db', createDatabaseRouter(db, auth.resolveUser));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = async (account: 'A' | 'B') => {
    const response = await fetch(base + '/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: account }) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie')!, /HttpOnly/);
    return response.headers.get('set-cookie')!.split(';')[0]!;
  };
  const request = (path: string, cookie: string, method = 'GET', body?: unknown, origin?: string) => fetch(base + '/api/db' + path, {
    method, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const list = async (cookie: string): Promise<DatabaseSession[]> => {
    const response = await request('/sessions', cookie); assert.equal(response.status, 200);
    return (await response.json()).records;
  };
  try {
    assert.equal((await request('/sessions', '')).status, 401);
    const a = await login('A');
    const record = { id: 'same-id', kind: 'reading', title: 'A 독서', savedAt: new Date().toISOString(),
      snapshot: { book: { title: 'A 독서' }, session: { readingNote: 'A 노트', summary: 'A 요약', recentMessages: [{ role: 'user', content: 'A 대화' }] } }, user_sub: users.B.id };
    assert.equal((await request('/sessions/same-id', a, 'PUT', record, 'https://evil.example')).status, 403);
    assert.equal((await request('/sessions/same-id', a, 'PUT', record, 'http://localhost:5173')).status, 200);
    assert.equal((await request('/sessions/same-id', a, 'PUT', record)).status, 200);
    assert.equal((await list(a)).length, 1); // Retry does not duplicate.
    const notes = await db.query('reading_notes', { user_sub: `eq.${users.A.id}`, select: 'session_id,markdown' });
    assert.deepEqual(notes, [{ session_id: 'same-id', markdown: 'A 노트' }]);
    const b = await login('B'); assert.deepEqual(await list(b), []);
    assert.equal((await request('/sessions/same-id', b, 'DELETE')).status, 200);
    assert.equal((await list(a)).length, 1); // B cannot delete A.
    assert.equal((await request('/sessions/same-id', b, 'PUT', { ...record, title: 'B 독서' })).status, 200);
    assert.equal((await list(a))[0]?.title, 'A 독서');
    assert.equal((await list(b))[0]?.title, 'B 독서');
    assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: a } })).status, 200);
    assert.equal((await request('/sessions', a)).status, 401);
    const restored = await list(await login('A')); // New cookie/device-equivalent login.
    assert.equal(restored[0]?.snapshot.session?.readingNote, 'A 노트');
    assert.equal(restored[0]?.title, 'A 독서');
    const freshA = await login('A');
    assert.equal((await request('/sessions/same-id', freshA, 'DELETE')).status, 200);
    assert.deepEqual(await list(freshA), []);
    assert.deepEqual(await db.query('reading_notes', { user_sub: `eq.${users.A.id}`, select: 'session_id,markdown' }), []);
    assert.equal((await list(b)).length, 1);
    // Composite FK rejects a B note pointing to a session only owned by A.
    await db.save(users.A, { ...record, id: 'a-only', kind: 'reading' });
    await assert.rejects(db.query('reading_notes', {}, 'POST', { user_sub: users.B.id, session_id: 'a-only', markdown: 'bad link' }));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    // Only uniquely named probe accounts, never real user records.
    for (const user of Object.values(users)) await db.query('users', { google_sub: `eq.${user.id}` }, 'DELETE');
    await rm(directory, { recursive: true, force: true });
  }
}
