import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import type { RecommendationResponse } from '../src/types/index.ts';
const base = process.env.TEST_API_BASE || 'http://127.0.0.1:3012';
const cases = [
  '중1인데 쉬운 우주 책 추천해줘',
  '난이도가 높고 깊이 있는 물리학 책 추천해줘',
  '코스모스 찾아줘',
  '세상에 없는 가짜책 ABCXYZ 찾아줘'
];
interface LiveResult { test: number; input: string; elapsedMs?: number; data?: RecommendationResponse; error?: string }
const results: LiveResult[] = [];
let next = 0;
async function worker() {
  while (next < cases.length) {
    const index = next++;
    const input = cases[index]!;
    console.log(`START TEST ${index + 1}: ${input}`);
    const start = Date.now();
    try {
      const response = await fetch(`${base}/api/recommend-books`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: input, userGrade: '중1' }), signal: AbortSignal.timeout(300000) });
      assert(response.ok, `HTTP ${response.status}`);
      const data = await response.json() as RecommendationResponse;
      results[index] = { test: index + 1, input, elapsedMs: Date.now() - start, data };
      assert(data.success);
      assert(data.books.length <= 3);
      for (const book of data.books) {
        assert(book.title && book.author && book.relevanceScore >= 75);
        assert(['library', 'web'].includes(book.sourceType));
        if (book.sourceType === 'web') {
          assert(data.search.googleSearchRequested && data.search.googleSearchExecuted);
          assert(book.sourceUrl && book.verification?.identityEvidence);
        }
      }
      if (index === 0) assert(data.books.length > 0 && data.books.every(b => b.sourceType === 'library'), 'TEST 1: 적합한 도서관 책 반환 필요');
      if (index === 1) { assert(data.search.fallbackUsed, 'TEST 2: 부적합 후보에서 fallback 필요'); assert(data.search.googleSearchExecuted, 'TEST 2: Google Search 실제 실행 확인 필요'); assert(data.books.length > 0, 'TEST 2: 검증된 물리학 책 필요'); }
      if (index === 2) { assert(data.books.length > 0, 'TEST 3: 실제 코스모스 책 필요'); assert(data.books.every(b => (b.title.replace(/\([^)]*\)/g, '').split(/[:：]/)[0] || '').replace(/\s/g, '') === '코스모스')); }
      if (index === 3) { assert(data.search.libraryAttempted && data.search.googleSearchRequested, 'TEST 4: 도서관 및 Google Search 확인 시도 필요'); assert.equal(data.books.length, 0); assert(data.response.includes('조건에 딱 맞는 책을 확인하지 못했어')); }
      results[index] = { test: index + 1, input, elapsedMs: Date.now() - start, data };
      console.log(JSON.stringify(results[index], null, 2));
    } catch (error) {
      results[index] = { ...results[index], test: index + 1, input, error: error instanceof Error ? error.message : String(error) };
      console.error(JSON.stringify(results[index]));
    }
  }
}
await Promise.all([worker(), worker()]);
await fs.writeFile('/tmp/ku-recommendation-live-results.json', JSON.stringify(results, null, 2));
if (results.some(result => result?.error)) process.exitCode = 1;
