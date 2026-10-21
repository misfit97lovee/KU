import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { ReadingDatabase, createDatabaseRouter } from '../server/database.ts';

test('DB 조회·삭제는 검증된 Google sub로 제한하고 저장 시 서버 소유자를 사용한다', async () => {
  const calls: Array<{ url: URL; method: string; body: Record<string, any> }> = [];
  const db = new ReadingDatabase('https://db.example', 'server-secret', async (input, init) => {
    calls.push({ url: new URL(String(input)), method: init!.method!, body: JSON.parse(String(init?.body || '{}')) });
    return init?.method === 'GET' ? new Response('[]') : new Response(null, { status: 204 });
  });
  const user = { id: 'verified-A', name: 'A', email: 'a@example.invalid', picture: '' };
  await db.list(user);
  await db.save(user, { id: 'id', kind: 'reading', title: 'title', savedAt: new Date().toISOString(), snapshot: { session: { readingNote: 'note' } } });
  await db.remove(user, 'id');
  assert.equal(calls[0]!.url.searchParams.get('user_sub'), 'eq.verified-A');
  assert.equal(calls[1]!.body.google_sub, user.id);
  assert.equal(calls[2]!.body.user_sub, user.id);
  assert.equal(calls[3]!.body.user_sub, user.id);
  assert.equal(calls[4]!.url.searchParams.get('user_sub'), 'eq.verified-A');
  assert.equal(calls[4]!.url.searchParams.get('id'), 'eq.id');
});

test('DB 장애는 503으로 격리되고 인증 없는 요청은 DB에 접근하지 않는다; 키와 진단 미노출', async () => {
  let calls = 0;
  const db = new ReadingDatabase('https://db.example', 'sensitive-key', async () => {
    calls++; throw new Error('sensitive-key provider URL private records');
  });
  const app = express(); app.use(express.json());
  app.use('/api/db', createDatabaseRouter(db, async req => req.headers.cookie === 'valid' ? { id: 'A', name: '', email: '', picture: '' } : null));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/db/sessions`;
  try {
    assert.equal((await fetch(url)).status, 401); assert.equal(calls, 0);
    const empty = await fetch(url + '/empty-record', { method: 'PUT', headers: { Cookie: 'valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind:'reading', title:'제목만 있는 기록', savedAt:new Date().toISOString(), snapshot:{book:{title:'제목만'},session:{recentMessages:[{role:'assistant',content:'안녕!'}]}} }) });
    assert.equal(empty.status,400); assert.equal(calls,0);
    const response = await fetch(url, { headers: { Cookie: 'valid' } });
    assert.equal(response.status, 503); assert.equal(calls, 1);
    assert(!JSON.stringify(await response.json()).includes('sensitive-key'));
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
