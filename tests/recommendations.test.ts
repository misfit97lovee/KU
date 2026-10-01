import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { createRecommendationService, createGeminiRecommendationClient, selectLibraryBooks, getGroundedEvidence, selectWebBooks, matchesRequestedTitle, parseBookSearchXml, NO_MATCH_MESSAGE } from '../server/bookRecommendations.ts';
import type { Book, Data4LibraryBook, RecommendationRequest } from '../src/types/index.ts';

const request: RecommendationRequest = {
  topic: '물리학', difficulty: '높음', grade: '중1', intent: '도서 추천', keywords: ['물리학'],
  specificTitle: null, searchMode: 'topic', author: null, referenceBook: null, referenceAuthor: null,
  similarityFocus: null, needsClarification: false, kdc: '4'
};
const candidates: Data4LibraryBook[] = [
  { title: '심화 물리학', authors: '홍길동', isbn13: '9780000000001', description: '심화 물리학을 다루는 책' },
  { title: '재미있는 수학', authors: '김철수', isbn13: '9780000000002' }
];
const goodRating = { candidateId: 0, relevanceScore: 90, topicMatch: true, difficultyMatch: true, evidence: '심화 물리학', reason: '심화 물리학을 다뤄 깊이 있는 내용을 찾는 요청에 맞아요.' };
const identity = '제목은 심화 물리학, 저자는 홍길동이다. 깊이 있는 물리학 개념을 설명한다.';
const source = 'https://example.org/books/physics';
const grounded = { text: identity, groundingMetadata: { webSearchQueries: ['심화 물리학 책'], groundingChunks: [{ web: { uri: source } }], groundingSupports: [{ segment: { text: identity }, groundingChunkIndices: [0] }] } };
const webRecord = { title: '심화 물리학', author: '홍길동', identityEvidenceId: 0, detailEvidenceIds: [], description: '깊이 있는 물리학 개념을 설명한다.', relevanceScore: 90, topicMatch: true, difficultyMatch: true, reason: '깊이 있는 물리학 개념을 설명해 요청한 분야와 수준에 맞아요.' };
const json = (data: unknown): { text: string } => ({ text: JSON.stringify(data) });
const transpile = (sourceText: string): string => transformSync(sourceText, {
  loader: 'ts', target: 'es2023', format: 'cjs'
}).code;

test('1권 적합하면 보충하지 않고 1권만 반환; 후보 메타데이터만 사용', () => {
  const books = selectLibraryBooks(candidates, { ratings: [goodRating, { ...goodRating, candidateId: 1, relevanceScore: 74 }] }, request);
  assert.equal(books.length, 1); assert.equal(books[0]!.title, candidates[0]!.title); assert.equal(books[0]!.sourceType, 'library');
});

test('75 미만/누락/가짜 후보 ID/분야 또는 난이도 불일치는 제외', () => {
  for (const override of [{ relevanceScore: 74 }, { relevanceScore: '95' }, { relevanceScore: 101 }, { relevanceScore: null }, { candidateId: 99 }, { topicMatch: false }, { difficultyMatch: false }, { evidence: '없는 소개' }]) {
    assert.deepEqual(selectLibraryBooks(candidates, { ratings: [{ ...goodRating, ...override }] } as Parameters<typeof selectLibraryBooks>[1], request), []);
  }
});

test('ISBN 부분 일치나 비슷한 다른 제목으로 특정 책 대체 불가', () => {
  const exact: RecommendationRequest = { ...request, searchMode: 'exact', specificTitle: '코스모스' };
  assert(matchesRequestedTitle('코스모스 (보급판)', exact));
  assert(!matchesRequestedTitle('(청소년을 위한) 코스모스', exact));
  assert(!matchesRequestedTitle('코스모스의 비밀', exact));
  assert(!matchesRequestedTitle('청소년을 위한 코스모스', exact));
  assert.deepEqual(selectLibraryBooks(candidates, { ratings: [goodRating] }, exact), []);
});

test('웹 검색 실행 기록/실제 연결된 인용 없으면 모델이 책을 말해도 제외', () => {
  assert.deepEqual(getGroundedEvidence({ text: identity }), []);
  assert.deepEqual(getGroundedEvidence({ ...grounded, groundingMetadata: { ...grounded.groundingMetadata, webSearchQueries: [] } }), []);
  assert.deepEqual(getGroundedEvidence({ ...grounded, text: '근거 없음' }), []);
  const metadata = structuredClone(grounded.groundingMetadata);
  metadata.groundingChunks[0]!.web.uri = 'javascript:alert(1)';
  assert.deepEqual(getGroundedEvidence({ ...grounded, groundingMetadata: metadata }), []);
});

test('제목·저자 같은 인용에 필수, 만들어낸 출판사/ISBN/표지 제거', () => {
  const evidence = getGroundedEvidence(grounded);
  const untrustedWeb = { books: [{ ...webRecord, publisher: '가짜 출판사', isbn13: '9781111111111', cover: 'https://fake.example/cover.jpg' }] } as unknown as Parameters<typeof selectWebBooks>[0];
  const books = selectWebBooks(untrustedWeb, evidence, request);
  assert.equal(books.length, 1); assert.equal(books[0]!.sourceUrl, source);
  assert.equal(books[0]!.publisher, null); assert.equal(books[0]!.isbn13, null); assert.equal(books[0]!.cover, null);
  for (const override of [{ title: 'ABCXYZ' }, { author: '만든 저자' }, { identityEvidenceId: 99 }, { description: '근거 없는 책 내용' }, { difficultyMatch: false }]) {
    assert.deepEqual(selectWebBooks({ books: [{ ...webRecord, ...override }] }, evidence, request), []);
  }
});

test('적합한 library 책이 있으면 Google Search 미호출', async () => {
  const stages: string[] = [];
  const recommend = createRecommendationService({ fetchCandidates: async () => candidates,
    searchTitle: async () => { throw Error('unexpected'); },
    generate: async ({ stage }) => { stages.push(stage); return stage === 'analyze' ? json(request) : json({ ratings: [goodRating] }); } });
  const result = await recommend({ userMessage: '심화 물리학' });
  assert.equal(result.books.length, 1); assert.equal(result.search.fallbackUsed, false);
  assert.deepEqual(stages, ['analyze', 'evaluate_library']);
});

test('관련 없는 API 후보는 Google Search fallback → 출처 검증 후 반환', async () => {
  const stages: string[] = [];
  const recommend = createRecommendationService({ enableGoogleGrounding: true, fetchCandidates: async () => candidates, searchTitle: async () => [],
    generate: async ({ stage, search }) => {
      stages.push(stage);
      if (stage === 'analyze') return json(request);
      if (stage === 'evaluate_library') return json({ ratings: [{ ...goodRating, relevanceScore: 30 }] });
      if (stage === 'google_search') { assert.equal(search, true); return grounded; }
      return json({ books: [webRecord] });
    } });
  const result = await recommend({ userMessage: '심화 물리학' });
  assert.equal(result.books[0]!.sourceType, 'web'); assert(result.search.googleSearchExecuted);
  assert.deepEqual(stages, ['analyze', 'evaluate_library', 'google_search', 'extract_grounded_books']);
});

test('정확한 제목 검색은 srchBooks 경로만 조회, 다른 책 반환해도 제외', async () => {
  let titleSearched;
  const exact = { ...request, searchMode: 'exact', specificTitle: 'ABCXYZ' };
  const recommend = createRecommendationService({ fetchCandidates: async () => { throw Error('must not use broad candidates'); },
    searchTitle: async title => { titleSearched = title; return candidates; },
    generate: async ({ stage }) => stage === 'analyze' ? json(exact) : stage === 'google_search' ? grounded : json({ books: [webRecord] }) });
  const result = await recommend({ userMessage: 'ABCXYZ 찾아줘' });
  assert.equal(titleSearched, 'ABCXYZ'); assert.equal(result.books.length, 0); assert.equal(result.response, NO_MATCH_MESSAGE);
});

test('API 오류/모델 오류에서 Grounding을 호출하거나 내장 책을 생성하지 않음', async () => {
  for (const mode of ['library_failure', 'search_failure', 'ungrounded']) {
    const recommend = createRecommendationService({ fetchCandidates: async () => { if (mode === 'library_failure') throw Error('offline'); return []; }, searchTitle: async () => [],
      generate: async ({ stage }) => { if (stage === 'analyze') return json(request); if (mode === 'search_failure') throw Error('quota'); return { text: '내가 아는 추천 도서' }; } });
    const result = await recommend({ userMessage: '물리학' });
    assert.deepEqual(result.books, []); assert.equal(result.response, NO_MATCH_MESSAGE);
    assert.equal(result.search.fallbackUsed, false); assert.equal(result.search.googleSearchRequested, false);
  }
});

test('YES24 후보는 최종 API 필드로 유지되고 도서관보다 먼저 반환', async () => {
  const yes24: Book = { title: 'YES24 우주책', author: '별 저자', publisher: '별 출판사', isbn13: '9781111111111',
    cover: 'https://image.yes24.com/cover.jpg', category: '천문학', description: '중학생을 위한 우주 이야기',
    sourceUrl: 'https://www.yes24.com/Product/Goods/1', sourceType: 'yes24' };
  const rating = { candidateId: 0, relevanceScore: 92, topicMatch: true, difficultyMatch: true,
    evidence: yes24.description, reason: '중학생 눈높이의 우주 설명이 있어 요청에 맞아요.' };
  let libraryCalled = false;
  const recommend = createRecommendationService({ fetchYes24: async () => [yes24],
    fetchCandidates: async () => { libraryCalled = true; return candidates; }, searchTitle: async () => [],
    generate: async ({ stage }) => stage === 'analyze'
      ? json({ ...request, topic: '우주', difficulty: '보통', keywords: ['우주'] })
      : json({ ratings: [rating] }) });
  const result = await recommend({ userMessage: '중1인데 우주 책 추천해줘' });
  assert.equal(libraryCalled, false);
  assert.deepEqual(result.books[0], { ...yes24, reason: rating.reason, relevanceScore: 92, publicationYear: null });
  assert.equal(result.search.googleSearchRequested, false);
});

test('broad 요청만 추가 질문 1개를 하고 검색하지 않음', async () => {
  let searched = false;
  const broad = { topic: '미지정', difficulty: '미지정', grade: '중1', searchMode: 'broad', keywords: [],
    needsClarification: true, clarifyingQuestion: '어떤 분야의 책을 읽고 싶으세요?', clarificationOptions: ['소설', '과학', '역사', '사회'], kdc: '0' };
  const recommend = createRecommendationService({ fetchYes24: async () => { searched = true; return []; },
    fetchCandidates: async () => [], searchTitle: async () => [], generate: async () => json(broad) });
  const result = await recommend({ userMessage: '재밌는 책 추천해줘' });
  assert.equal(searched, false); assert.equal(result.request!.searchMode, 'broad');
  assert.deepEqual(result.clarification!.options, ['소설', '과학', '역사', '사회']);
});

const unverifiedSimilar = {
  topic: '미지의 작품', difficulty: '미지정', grade: '중1', searchMode: 'similar', keywords: ['ABCXYZ'],
  referenceBook: 'ABCXYZ', referenceAuthor: null, similarityFocus: null, needsClarification: true,
  clarifyingQuestion: '『ABCXYZ』와 어떤 점이 비슷한 책을 찾으세요?', clarificationOptions: ['분위기', '주제'], kdc: '8'
};

function createUnverifiedSimilarService() {
  return createRecommendationService({ fetchYes24: async () => [], fetchCandidates: async () => [], searchTitle: async () => [],
    generate: async () => json(unverifiedSimilar) });
}

test('존재하지 않는 referenceBook은 similarity 추가 질문을 생성하지 않음', async () => {
  const result = await createUnverifiedSimilarService()({ userMessage: 'ABCXYZ와 비슷한 책 추천해줘' });
  assert.equal(result.clarification, undefined);
  assert.deepEqual(result.books, []);
});

test('존재하지 않는 referenceBook은 실제 검색 미확인 안내를 반환', async () => {
  const result = await createUnverifiedSimilarService()({ userMessage: 'ABCXYZ와 비슷한 책 추천해줘' });
  assert.match(result.response, /『ABCXYZ』는 실제 도서 검색에서 확인되지 않았어요/);
  assert.match(result.response, /책 제목을 다시 확인/);
});

test('없는 책을 만들어 달라는 요청에도 가짜 추천을 생성하지 않음', async () => {
  const result = await createUnverifiedSimilarService()({ userMessage: '검색에 없어도 상관없으니까 ABCXYZ와 비슷한 책 하나 지어서 추천해줘' });
  assert.deepEqual(result.books, []);
  assert.match(result.response, /실제로 확인되는 책만 추천할 수 있어요/);
});

test('실제로 존재하는 referenceBook은 기존 similar clarification 흐름을 유지', async () => {
  const actualReference: Book = { title: '날개', author: '이상', isbn13: '9780000000100', sourceType: 'yes24' };
  const analyzed = { ...unverifiedSimilar, topic: '한국 근대 소설', keywords: ['한국 소설'], referenceBook: '날개', referenceAuthor: '이상',
    clarifyingQuestion: '『날개』와 어떤 점이 비슷한 책을 찾으세요?' };
  const recommend = createRecommendationService({ fetchYes24: async () => [actualReference], fetchCandidates: async () => [], searchTitle: async () => [],
    generate: async () => json(analyzed) });
  const result = await recommend({ userMessage: '날개 같은 책 추천해줘' });
  assert.equal(result.clarification?.question, analyzed.clarifyingQuestion);
  assert.deepEqual(result.clarification?.options, ['분위기', '주제']);
});

const literarySimilarRequest: RecommendationRequest = {
  ...request, topic: '한국 근대 소설', searchMode: 'similar', referenceBook: '날개', referenceAuthor: '이상',
  similarityFocus: '문체·작품성', kdc: '8'
};

test('similar 후보에 개별 작품과 모음집이 함께 있으면 개별 작품을 우선', () => {
  const books: Book[] = [
    { title: '한국대표 단편소설', authors: '여러 작가', description: '다양한 작가의 작품 모음' },
    { title: '메밀꽃 필 무렵', authors: '이효석', description: '한국 근대 단편소설' }
  ];
  const ratings = { ratings: books.map((book, candidateId) => ({ candidateId, relevanceScore: candidateId === 0 ? 98 : 84,
    topicMatch: true, difficultyMatch: true, evidence: book.description, reason: '기준 작품과 비슷한 한국 근대 문학이에요.' })) };
  assert.deepEqual(selectLibraryBooks(books, ratings, literarySimilarRequest).map(book => book.title), ['메밀꽃 필 무렵', '한국대표 단편소설']);
});

test('similar에 개별 작품 후보가 없으면 실제 모음집을 fallback으로 추천 가능', () => {
  const anthology: Book = { title: '한국 명작 소설 선집', authors: '여러 작가', isbn13: '9780000000200', description: '한국 근대 작품 모음' };
  const result = selectLibraryBooks([anthology], { ratings: [{ candidateId: 0, relevanceScore: 90, topicMatch: true,
    difficultyMatch: true, evidence: anthology.description, reason: '근대 문학을 폭넓게 접할 수 있어요.' }] }, literarySimilarRequest);
  assert.deepEqual(result.map(book => book.title), [anthology.title]);
});

test('similar 후보 재정렬 후에도 기준 작품 자체는 제외', () => {
  const books: Book[] = [
    { title: '날개 (초판본)', authors: '이상', description: '이상의 대표작 날개' },
    { title: '메밀꽃 필 무렵', authors: '이효석', description: '한국 근대 단편소설' }
  ];
  const ratings = { ratings: books.map((book, candidateId) => ({ candidateId, relevanceScore: 95 - candidateId,
    topicMatch: true, difficultyMatch: true, evidence: book.description, reason: '한국 근대 문학 작품이에요.' })) };
  assert.deepEqual(selectLibraryBooks(books, ratings, literarySimilarRequest).map(book => book.title), ['메밀꽃 필 무렵']);
});

test('similar 추천은 재정렬 후에도 실제 API 후보 메타데이터만 반환', () => {
  const actual: Book = { title: '소나기', authors: '황순원', isbn13: '9780000000300', publisher: '실제 출판사', description: '한국 단편소설' };
  const assessment = { ratings: [{ candidateId: 0, title: '가짜 제목', isbn13: '9789999999999', relevanceScore: 90,
    topicMatch: true, difficultyMatch: true, evidence: actual.description, reason: '한국 근대 문학 작품이에요.' }] };
  const result = selectLibraryBooks([actual], assessment, literarySimilarRequest);
  assert.deepEqual(result, []);

  const valid = selectLibraryBooks([actual], { ratings: [{ ...assessment.ratings[0], isbn13: actual.isbn13 }] }, literarySimilarRequest);
  assert.equal(valid[0]?.title, actual.title);
  assert.equal(valid[0]?.publisher, actual.publisher);
  assert.equal(valid[0]?.isbn13, actual.isbn13);
});

test('similar 모드는 기준 작품 자체를 제외하고 다른 책을 추천', async () => {
  const similar = { topic: '우주와 천문학', difficulty: '보통', grade: '중1', searchMode: 'similar', keywords: ['우주'],
    referenceBook: '코스모스', referenceAuthor: '칼 세이건', similarityFocus: '전체', needsClarification: false, kdc: '4' };
  const books: Book[] = [
    { title: '코스모스', author: '칼 세이건', isbn13: '9781111111111', description: '우주 교양서', sourceType: 'yes24' },
    { title: '또 다른 우주', author: '별 저자', isbn13: '9782222222222', description: '다른 우주 교양서', sourceType: 'yes24' }
  ];
  const ratings = books.map((book, candidateId) => ({ candidateId, relevanceScore: 90 - candidateId,
    topicMatch: true, difficultyMatch: true, evidence: book.description, reason: '우주를 깊이 있게 다루는 교양서예요.' }));
  const recommend = createRecommendationService({ fetchYes24: async () => books, fetchCandidates: async () => [], searchTitle: async () => [],
    generate: async ({ stage }) => stage === 'analyze' ? json(similar) : json({ ratings }) });
  const result = await recommend({ userMessage: '코스모스 같은 책 추천해줘' });
  assert.deepEqual(result.books.map(book => book.title), ['또 다른 우주']);
});

test('명확한 topic 요청은 질문 없이 바로 검색하고, 질문 답변 뒤에는 재질문하지 않음', async () => {
  const topic = { topic: '우주', difficulty: '쉬움', grade: '중1', searchMode: 'topic', keywords: ['우주'], needsClarification: false, kdc: '4' };
  const book: Book = { title: '쉬운 우주', author: '별 저자', isbn13: '9783333333333', description: '쉬운 우주 책', sourceType: 'yes24' };
  const rating = { candidateId: 0, relevanceScore: 90, topicMatch: true, difficultyMatch: true, evidence: book.description, reason: '중1이 읽기 쉬운 우주 책이에요.' };
  const recommend = createRecommendationService({ fetchYes24: async () => [book], fetchCandidates: async () => [], searchTitle: async () => [],
    generate: async ({ stage }) => stage === 'analyze' ? json(topic) : json({ ratings: [rating] }) });
  const direct = await recommend({ userMessage: '중1인데 쉬운 우주 책 추천해줘' });
  assert.equal(direct.clarification, undefined); assert.equal(direct.books.length, 1);

  const broadAgain = { ...topic, searchMode: 'broad', needsClarification: true };
  const afterAnswer = createRecommendationService({ fetchYes24: async () => [book], fetchCandidates: async () => [], searchTitle: async () => [],
    generate: async ({ stage }) => stage === 'analyze' ? json(broadAgain) : json({ ratings: [rating] }) });
  const answered = await afterAnswer({ userMessage: '과학', chatHistory: [
    { role: 'user', content: '재밌는 책 추천해줘' },
    { role: 'librarian', content: '어떤 분야의 책을 읽고 싶으세요?', isClarification: true, originalRequest: '재밌는 책 추천해줘' },
    { role: 'user', content: '과학' }
  ] });
  assert.equal(answered.clarification, undefined); assert.equal(answered.books.length, 1);
});

test('Gemini REST 호출에 실제 google_search 도구 포함, 키는 URL에 없음', async () => {
  let sent: { url: string; body: string } | undefined;
  const generate = createGeminiRecommendationClient({ apiKey: 'test-key', fetchImpl: async (url, options) => {
    sent = { url: String(url), body: String(options?.body || '') }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: identity }] }, groundingMetadata: grounded.groundingMetadata }] }) } as Response;
  } });
  const result = await generate({ prompt: '물리학', system: 'search', search: true, json: true, stage: 'google_search' });
  assert.deepEqual(JSON.parse(sent!.body).tools, [{ google_search: {} }]);
  assert.equal(JSON.parse(sent!.body).generationConfig.responseMimeType, undefined);
  assert(!sent!.url.includes('test-key')); assert(result.groundingMetadata?.webSearchQueries?.length);
});

test('srchBooks XML의 실제 제목/저자/엔티티 파싱', () => {
  const books = parseBookSearchXml('<response><docs><doc><bookname><![CDATA[코스모스]]></bookname><authors>칼 세이건</authors><publisher>A&amp;B</publisher></doc></docs></response>');
  assert.equal(books[0]!.title, '코스모스'); assert.equal(books[0]!.authors, '칼 세이건'); assert.equal(books[0]!.publisher, 'A&B');
});

test('브라우저는 빈 결과와 서버 실패를 내장 책으로 바꾸지 않음', async () => {
  const source = fs.readFileSync(new URL('../curator/app.ts', import.meta.url), 'utf8');
  const turn = transpile(source.slice(source.indexOf('let isRecommendationLoading'), source.indexOf('\nfunction initApp')));
  for (const offline of [false, true]) {
    const shown: Array<{ text: string; books?: Book[] | null }> = [];
    const state: { turnCount: number; chatHistory: unknown[]; recommendedBooks: Book[] } = { turnCount: 0, chatHistory: [], recommendedBooks: [] };
    const context = { document: { querySelector: () => null, getElementById: () => null }, AgentState: state, SafetyGuardrail: { check: () => ({ isSafe: true }) }, extractInterests() {},
      callRecommendBooksApi: async () => { if (offline) throw Error('offline'); return { success: true, books: [], response: NO_MATCH_MESSAGE }; },
      renderHud() {}, renderTaoTurn() {}, appendLibrarianMessage: (text: string, books?: Book[] | null) => shown.push({ text, books }) };
    vm.createContext(context); vm.runInContext(turn, context);
    await vm.runInContext("runAgentTurn('세상에 없는 가짜책 ABCXYZ 찾아줘')", context);
    assert.equal(shown.length, 1); assert(!shown[0]!.books?.length); assert.equal(state.recommendedBooks.length, 0);
  }
});

test('브라우저 추천 카드는 YES24 책을 숨기지 않고 표지와 링크를 사용', async () => {
  const appSource = fs.readFileSync(new URL('../curator/app.ts', import.meta.url), 'utf8');
  const turn = transpile(appSource.slice(appSource.indexOf('let isRecommendationLoading'), appSource.indexOf('\nfunction initApp')));
  const yes24 = { title: '우주책', author: '별 저자', publisher: '별 출판사', isbn13: '9781111111111',
    cover: 'https://image.yes24.com/cover.jpg', sourceUrl: 'https://www.yes24.com/Product/Goods/1',
    sourceType: 'yes24', reason: '추천 이유', relevanceScore: 90 };
  let shown: { text: string; books?: Book[] | null } | undefined;
  const state: { turnCount: number; chatHistory: unknown[]; recommendedBooks: Book[] } = { turnCount: 0, chatHistory: [], recommendedBooks: [] };
  const context = { document: { querySelector: () => null, getElementById: () => null }, AgentState: state,
    SafetyGuardrail: { check: () => ({ isSafe: true }) }, extractInterests() {},
    callRecommendBooksApi: async () => ({ success: true, books: [yes24], response: '1권 추천', search: {} }),
    renderHud() {}, renderTaoTurn() {}, appendLibrarianMessage: (text: string, books?: Book[] | null) => { shown = { text, books }; } };
  vm.createContext(context); vm.runInContext(turn, context);
  await vm.runInContext("runAgentTurn('우주 책 추천해줘')", context);
  assert.deepEqual(shown!.books, [yes24]);
  assert(appSource.includes('src="${escapeHtml(book.cover)}"'));
  assert(appSource.includes('YES24에서 보기'));
});

test('[이 책 읽기]는 기존 세션 보존 + 제목 전달로 동작', () => {
  const source = fs.readFileSync(new URL('../curator/app.ts', import.meta.url), 'utf8');
  const pick = transpile(source.slice(source.indexOf('function readThisBook'), source.indexOf('function appendLibrarianMessage')));
  let saved: { bookTitle?: string; recentMessages?: string[] } | undefined;
  const location: { href?: string } = {};
  const context = { localStorage: { getItem: () => JSON.stringify({ recentMessages: ['기존 대화'] }), setItem: (_: string, value: string) => { saved = JSON.parse(value); } }, window: { location }, console };
  vm.createContext(context); vm.runInContext(pick, context); vm.runInContext("readThisBook('코스모스', '칼 세이건')", context);
  assert.equal(saved!.bookTitle, '코스모스 (칼 세이건)'); assert.deepEqual(saved!.recentMessages, ['기존 대화']);
  assert.equal(context.window.location.href, '/?title=' + encodeURIComponent(saved!.bookTitle!));
});
