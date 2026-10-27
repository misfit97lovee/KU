import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { ReadingDatabase, normalizePreferences, createDatabaseRouter } from '../server/database.ts';
import { cacheBookSearch } from '../server/bookSearchCache.ts';
import { createRecommendationService, selectLibraryBooks } from '../server/bookRecommendations.ts';
import type { Book, ReadingPreferences, RecommendationRequest } from '../src/types/index.ts';
import { probePreferences } from './preferencesProbe.ts';

test('취향 첫 저장·재로그인·수정·건너뛰기·삭제·동시 저장·A/B 격리를 실제 세션 라우터로 검증', async () => {
  const tables = new Map<string, any[]>();
  const db = new ReadingDatabase('https://db.example', 'secret', async (input, init) => {
    const url = new URL(String(input)); const table = url.pathname.split('/').at(-1)!;
    const rows = tables.get(table) || []; tables.set(table, rows);
    const filters = [...url.searchParams].filter(([, value]) => value.startsWith('eq.'));
    const matches = (row: any) => filters.every(([key, value]) => row[key] === value.slice(3));
    const body = JSON.parse(String(init?.body || '{}'));
    if (init?.method === 'GET') {
      const fields = url.searchParams.get('select')?.split(',');
      const selected = rows.filter(matches).slice(0, Number(url.searchParams.get('limit') || 100));
      return new Response(JSON.stringify(selected.map(row => fields ? Object.fromEntries(fields.map(key => [key, row[key] ?? null])) : row)));
    }
    if (init?.method === 'POST') {
      const conflict = url.searchParams.get('on_conflict')!;
      const row = rows.find(row => row[conflict] === body[conflict]);
      if (row) Object.assign(row, body); else rows.push(body);
    }
    if (init?.method === 'PATCH') rows.filter(matches).forEach(row => Object.assign(row, body));
    if (init?.method === 'DELETE') tables.set(table, rows.filter(row => !matches(row)));
    return new Response(null, { status: 204 });
  });
  await probePreferences(db);
});

test('null 배열 정규화·이력 계정 필터·병렬 조회·DB 장애의 일반 추천 전환', async () => {
  assert.deepEqual(normalizePreferences({ genres: null } as any), { genres: [], topics: [], favorite_authors: [], favorite_books: [] });
  const user = { id: 'verified', name: '', email: '', picture: '' };
  let active = 0, peak = 0;
  const db = new ReadingDatabase('https://db.example', 'secret', async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.searchParams.get('user_sub'), 'eq.verified');
    assert(init?.signal);
    active++; peak = Math.max(active, peak);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return new Response(JSON.stringify(url.pathname.endsWith('read_books') ? [{ title: '시작한 책', author: '작가', isbn13: null }] : [{ topics: null }]));
  });
  const context = await db.getPersonalization(user);
  assert.equal(peak, 2); assert.equal(context.readingHistory[0]?.title, '시작한 책');
  assert.deepEqual(context.preferences?.topics, []);
  const offline = new ReadingDatabase('https://db.example', 'secret', async () => { throw Error('private provider diagnostic'); });
  assert.deepEqual(await offline.getPersonalization(user), { preferences: null, readingHistory: [] });
  const app = express(); app.use(express.json()); app.use('/api/db', createDatabaseRouter(offline, async () => user));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/db/preferences`);
    assert.equal(response.status, 503); assert(!(await response.text()).includes('private'));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('계정별 추천 캐시 무효화는 다른 계정과 새로 시작한 요청을 보존한다', async () => {
  let calls = 0;
  const cache = cacheBookSearch(async (account: string) => ({ account, call: ++calls }), { stage: 'test', key: args => args[0] + ':request' });
  await cache('A'); await cache('B'); cache.invalidatePrefix('A:');
  assert.equal((await cache('B')).call, 2); assert.equal((await cache('A')).call, 3);
});

const preferences: ReadingPreferences = { genres: ['추리소설'], topics: ['심리'], favorite_authors: ['작가'], favorite_books: ['우주와 물리학'] };
const physics: Book = { title: '우주와 물리학', author: '물리학자', isbn13: '9780000000001', category: '과학', description: '물리학과 우주를 설명하는 책', sourceType: 'yes24' };
const request: RecommendationRequest = { topic: '물리학', keywords: ['물리학'], difficulty: '보통', grade: '중2', intent: '도서 추천', searchMode: 'topic', specificTitle: null, author: null, referenceBook: null, referenceAuthor: null, similarityFocus: null, needsClarification: false, kdc: '4' };

test('현재 요청 우선·취향 수정 반영·미완독 이력 미제외·게스트·최종 평가 유지·추가 AI 호출 없음', async () => {
  const prompts: any[] = []; const queries: string[] = []; let evaluations = 0;
  const recommend = createRecommendationService({ fastExplicitTopics: true, generate: async options => {
    const prompt = JSON.parse(options.prompt); prompts.push(prompt);
    if (options.stage === 'analyze') return { text: JSON.stringify(request) };
    evaluations++; assert.match(options.system, /현재 요청/); assert.match(options.system, /완독/);
    return { text: JSON.stringify({ ratings: [[0, 90, true, true, '물리학', '물리학과 우주를 이해하는 데 도움이 돼요.']] }) };
  }, fetchYes24: async ({ query }) => { queries.push(query); return [physics]; }, fetchCandidates: async () => [], searchTitle: async () => [] });
  const input = { userMessage: '물리학 책 추천해줘', userGrade: '중2', personalization: { preferences, readingHistory: [{ title: physics.title, author: physics.author!, isbn13: physics.isbn13! }] } };
  const first = await recommend(input);
  assert.equal(first.books[0]?.title, physics.title); assert(queries.every(query => !/추리|심리/.test(query)));
  assert.deepEqual(prompts.at(-1).personalization.preferences, preferences);
  await recommend({ ...input, personalization: { ...input.personalization, preferences: { ...preferences, genres: ['과학'] } } });
  assert.deepEqual(prompts.at(-1).personalization.preferences.genres, ['과학']);
  await recommend({ userMessage: '물리학 책 추천해줘' }); assert.equal(prompts.at(-1).personalization, undefined);
  assert.equal(evaluations, 3); assert.equal(prompts.length, 6); // One analysis + one evaluation per request, including guest.
});

test('이전에 추천하거나 읽기 시작한 책도 exact 요청에서는 검색 결과로 유지', async () => {
  const recommend = createRecommendationService({ generate: async options => ({ text: JSON.stringify(options.stage === 'analyze'
    ? { ...request, searchMode: 'exact', specificTitle: physics.title }
    : { ratings: [[0, 95, true, true, '물리학', '찾으신 물리학 책이에요.']] }) }),
    fetchYes24: async () => [physics], fetchCandidates: async () => [], searchTitle: async () => [physics] });
  const result = await recommend({ userMessage: '우주와 물리학 찾아줘', recommendedBooks: [{ ...physics } as any], personalization: { preferences, readingHistory: [{ title: physics.title, author: '', isbn13: null }] } });
  assert.equal(result.books[0]?.title, physics.title);
});

test('topic 추천은 제목에 표시되지 않은 서점 분류의 학습서도 제외하고 exact는 보존', () => {
  const study = { ...physics, category: '국내도서-중고등학습서-중학교' };
  const rating = { candidateId: 0, relevanceScore: 95, topicMatch: true, difficultyMatch: true, evidence: '물리학', reason: '물리학 책' };
  assert.deepEqual(selectLibraryBooks([study], { ratings: [rating] }, request), []);
  assert.equal(selectLibraryBooks([study], { ratings: [rating] }, { ...request, searchMode: 'exact', specificTitle: study.title }).length, 1);
});
