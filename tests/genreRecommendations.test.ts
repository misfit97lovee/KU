import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecommendationService, selectLibraryBooks, NO_MATCH_MESSAGE } from '../server/bookRecommendations.ts';
import type { Book, RecommendationRequest } from '../src/types/index.ts';

const request: RecommendationRequest = { topic: '추리소설', searchMode: 'topic', keywords: ['추리소설'], grade: '중1', difficulty: '보통',
  intent: '도서 추천', specificTitle: null, author: null, referenceBook: null, referenceAuthor: null, similarityFocus: null, needsClarification: false, kdc: '8' };
const books: Book[] = [
  { title: '검증된 작품', author: '실제 저자', isbn13: '9780000000001', category: '청소년 소설', description: '청소년을 위한 미스터리 추리소설', sourceType: 'yes24', cover: 'https://example.com/cover.jpg' },
  { title: '수학 학습 퍼즐', author: '다른 저자', category: '어린이', description: '추리소설 형식의 수학 학습' },
  { title: '일본 추리소설 사전', author: '편집자', description: '추리소설을 소개하는 사전' }
];
const rating = { candidateId: 0, relevanceScore: 70, topicMatch: true, difficultyMatch: true, evidence: books[0]!.description, reason: '제공된 소개에서 청소년 미스터리 소설임이 확인됩니다.' };
const json = (value: unknown) => ({ text: JSON.stringify(value) });

test('장르 근거와 Gemini 주제·난이도 긍정 판정이 있으면 60~74점도 인정; 다른 모드는 기존 기준 유지', () => {
  assert.equal(selectLibraryBooks(books, { ratings: [rating] }, request)[0]?.isbn13, books[0]!.isbn13);
  for (const override of [{ topicMatch: false }, { difficultyMatch: false }, { relevanceScore: 59 }, { evidence: '없는 근거' }, { candidateId: 999 }]) {
    assert.deepEqual(selectLibraryBooks(books, { ratings: [{ ...rating, ...override }] }, request), []);
  }
  for (const mode of ['exact', 'similar', 'author'] as const) {
    assert.deepEqual(selectLibraryBooks(books, { ratings: [rating] }, { ...request, searchMode: mode, specificTitle: books[0]!.title, author: books[0]!.author! }), []);
  }
  for (const candidateId of [1, 2]) assert.deepEqual(selectLibraryBooks(books, { ratings: [{ ...rating, candidateId, evidence: books[candidateId]!.title }] }, request), []);
});

test('장르 동의어로 실제 후보를 중복 제거하고 Gemini 평가를 유지한다', async () => {
  const queries: string[] = [];
  let evaluations = 0;
  const recommend = createRecommendationService({
    generate: async options => {
      if (options.stage === 'analyze') return json(request);
      evaluations++;
      const candidates = JSON.parse(options.prompt).candidates;
      const candidateId = candidates.findIndex((book: Book) => book.isbn13 === books[0]!.isbn13);
      return json({ ratings: [{ ...rating, candidateId }] });
    },
    fetchYes24: async ({ query }) => { queries.push(query); return books; },
    fetchCandidates: async () => { throw new Error('should not need library'); }, searchTitle: async () => []
  });
  const result = await recommend({ userMessage: '중학생이 읽기 좋은 미스터리 추리소설 추천해줘' });
  assert.deepEqual(queries, ['추리소설', '미스터리 소설', '탐정소설', '청소년 추리소설']);
  assert.equal(evaluations, 1); assert.equal(result.books.length, 1);
  assert.equal(result.books[0]!.cover, books[0]!.cover);
  assert.equal(result.books[0]!.title, books[0]!.title);
  assert.equal(result.candidateCount, 3);
});

test('의도 분석 장애에도 명시적 장르만 검색하고 사전·학습서 제외; 보조 검색과 오류 구분', async () => {
  let libraryCalls = 0;
  const recommend = createRecommendationService({ generate: async () => { throw new Error('timeout'); },
    fetchYes24: async () => { throw new Error('provider failed'); },
    fetchCandidates: async () => { libraryCalls++; return books; }, searchTitle: async () => [] });
  const result = await recommend({ userMessage: '중학생 미스터리 추리소설 추천해줘' });
  assert.equal(result.books.length, 1); assert.equal(result.books[0]?.isbn13, books[0]!.isbn13); assert.equal(libraryCalls, 3);
  assert(result.search.fallbackUsed); assert.match(result.response, /실제 도서 정보/);
  assert(result.search.failures.includes('model_evaluation_unavailable'));
  assert(result.moreBooks?.every(book => !/사전|학습/u.test(book.title)));
  assert(result.search.failures.includes('yes24_search_failed'));
  const empty = await createRecommendationService({ generate: async () => json(request), fetchYes24: async () => [], fetchCandidates: async () => [], searchTitle: async () => [] })({ userMessage: '추리소설 추천해줘' });
  assert.equal(empty.response, NO_MATCH_MESSAGE);
  const failed = await createRecommendationService({ generate: async () => json(request), fetchYes24: async () => { throw new Error('secret'); },
    fetchCandidates: async () => { throw new Error('secret'); }, searchTitle: async () => [] })({ userMessage: '추리소설 추천해줘' });
  assert.notEqual(failed.response, NO_MATCH_MESSAGE); assert(!JSON.stringify(failed).includes('secret'));
});

test('판타지 요청도 동의어 검색하며 Gemini가 거절한 후보를 억지로 채우지 않는다', async () => {
  const queries: string[] = [];
  const recommend = createRecommendationService({ generate: async options => options.stage === 'analyze' ? json({ ...request, topic: '판타지' }) : json({ ratings: [] }),
    fetchYes24: async ({ query }) => { queries.push(query); return books; }, fetchCandidates: async () => [], searchTitle: async () => [] });
  const result = await recommend({ userMessage: '중학생 판타지 소설 추천해줘' });
  assert(queries.includes('환상소설')); assert(queries.includes('청소년 판타지'));
  assert.equal(result.books.length, 0);
});
