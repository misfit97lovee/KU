import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectLibraryBooks,
  validateBooksAgainstCandidates,
  findMatchingCandidate,
  isReferenceBook,
  parseJson,
  createRecommendationService
} from '../server/bookRecommendations.ts';
import { sanitizeError, validateEvidence } from '../server/guardrails.ts';
import type { Book, Data4LibraryBook, RecommendationRequest } from '../src/types/index.ts';

const baseRequest: RecommendationRequest = {
  topic: '과학',
  difficulty: '보통',
  grade: '중1',
  intent: '도서 추천',
  keywords: ['과학'],
  specificTitle: null,
  searchMode: 'topic',
  author: null,
  referenceBook: null,
  referenceAuthor: null,
  similarityFocus: null,
  needsClarification: false,
  kdc: '4'
};

const mockCandidates: Data4LibraryBook[] = [
  {
    title: '재미있는 물리 이야기',
    authors: '김철수',
    publisher: '과학출판사',
    isbn13: '9788900000001',
    description: '물리의 기초를 쉽고 재미있게 설명하는 책',
    cover: 'https://example.com/cover1.jpg',
    sourceType: 'library'
  },
  {
    title: '화학으로 보는 세상',
    authors: '이영희',
    publisher: '화학사',
    isbn13: '9788900000002',
    description: '일상 속의 화학 원리를 다룬다.',
    cover: 'https://example.com/cover2.jpg',
    sourceType: 'library'
  },
  {
    title: '우주의 신비',
    authors: '박우주',
    publisher: '우주문화사',
    isbn13: '9788900000003',
    description: '우주와 별에 대한 흥미진진한 탐구',
    cover: 'https://example.com/cover3.jpg',
    sourceType: 'library'
  },
  {
    title: '생명과학의 이해',
    authors: '최생명',
    publisher: '생명사',
    isbn13: '9788900000004',
    description: '생명과학의 기초와 응용',
    cover: 'https://example.com/cover4.jpg',
    sourceType: 'library'
  },
  {
    title: '지구과학 여행',
    authors: '정지구',
    publisher: '지구문화사',
    isbn13: '9788900000005',
    description: '지구의 역사와 환경을 배운다',
    cover: 'https://example.com/cover5.jpg',
    sourceType: 'library'
  }
];

// 1. Gemini가 존재하지 않는 candidateId 반환 → 최종 결과에 포함되지 않음
test('가드레일 1: Gemini가 존재하지 않는 candidateId 반환 시 최종 추천에서 제외', () => {
  const fakeAssessment = {
    ratings: [
      {
        candidateId: 999, // 존재하지 않는 인덱스
        relevanceScore: 95,
        topicMatch: true,
        difficultyMatch: true,
        evidence: '물리의 기초',
        reason: '물리의 기초를 잘 설명합니다.'
      },
      {
        candidateId: 0, // 실제 후보
        relevanceScore: 90,
        topicMatch: true,
        difficultyMatch: true,
        evidence: '물리의 기초',
        reason: '실제 후보입니다.'
      }
    ]
  };

  const results = selectLibraryBooks(mockCandidates, fakeAssessment, baseRequest);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.title, '재미있는 물리 이야기');
  assert.equal(results[0]?.isbn13, '9788900000001');
});

// 2. Gemini가 후보에 없는 ISBN 반환 → 차단
test('가드레일 2: Gemini가 후보군에 없는 위조 ISBN을 지정할 경우 차단', () => {
  // candidateId는 0이지만 허구의 ISBN을 반환하는 경우
  const spoofedIsbnRating = {
    candidateId: 0,
    isbn13: '9789999999999', // 후보군 어디에도 없는 가짜 ISBN
    relevanceScore: 95,
    topicMatch: true,
    difficultyMatch: true,
    evidence: '물리의 기초',
    reason: '임의의 책'
  };

  const match = findMatchingCandidate(spoofedIsbnRating, mockCandidates);
  assert.equal(match, null, '후보군에 없는 ISBN은 매칭되지 않아야 함');

  const results = selectLibraryBooks(mockCandidates, { ratings: [spoofedIsbnRating] }, baseRequest);
  assert.equal(results.length, 0, '위조 ISBN을 가진 평가는 추천되지 않아야 함');
});

// 3. Gemini 추천 중 중복 책 반환 → 중복 제거
test('가드레일 3: Gemini가 동일 후보 또는 동일 도서를 중복 추천할 경우 중복 제거', () => {
  const duplicateRatings = {
    ratings: [
      {
        candidateId: 0,
        relevanceScore: 95,
        topicMatch: true,
        difficultyMatch: true,
        evidence: '물리의 기초',
        reason: '첫 번째 추천'
      },
      {
        candidateId: 0, // 동일 candidateId 중복
        relevanceScore: 94,
        topicMatch: true,
        difficultyMatch: true,
        evidence: '물리의 기초',
        reason: '중복 추천'
      },
      {
        candidateId: 1,
        relevanceScore: 88,
        topicMatch: true,
        difficultyMatch: true,
        evidence: '화학 원리',
        reason: '두 번째 후보'
      }
    ]
  };

  const results = selectLibraryBooks(mockCandidates, duplicateRatings, baseRequest);
  assert.equal(results.length, 2);
  const titles = results.map(b => b.title);
  assert.deepEqual(titles, ['재미있는 물리 이야기', '화학으로 보는 세상']);
});

// 4. Gemini가 3권 초과 반환 → 최대 3권 제한
test('가드레일 4: Gemini가 3권을 초과하여 높은 점수를 부여해도 최대 3권까지만 반환', () => {
  const manyRatings = {
    ratings: [
      { candidateId: 0, relevanceScore: 95, topicMatch: true, difficultyMatch: true, evidence: '물리의 기초', reason: '이유 0' },
      { candidateId: 1, relevanceScore: 94, topicMatch: true, difficultyMatch: true, evidence: '화학 원리', reason: '이유 1' },
      { candidateId: 2, relevanceScore: 93, topicMatch: true, difficultyMatch: true, evidence: '우주와 별', reason: '이유 2' },
      { candidateId: 3, relevanceScore: 92, topicMatch: true, difficultyMatch: true, evidence: '생명과학의 기초', reason: '이유 3' },
      { candidateId: 4, relevanceScore: 91, topicMatch: true, difficultyMatch: true, evidence: '지구의 역사', reason: '이유 4' }
    ]
  };

  const results = selectLibraryBooks(mockCandidates, manyRatings, baseRequest);
  assert.equal(results.length, 3, '최대 3권으로 제한되어야 함');
  assert.deepEqual(results.map(b => b.title), [
    '재미있는 물리 이야기',
    '화학으로 보는 세상',
    '우주의 신비'
  ]);
});

// 5. Gemini JSON parse 실패 → 서버 안전 처리
test('가드레일 5: Gemini 응답이 마크다운 래핑되거나 prose 섞여 있어도 파싱하고, 완전히 깨진 경우 안전 폴백', async () => {
  // 5-1: 마크다운 래핑 및 앞뒤 부가 텍스트 안전 파싱
  const wrappedJson = '```json\n{"ratings": [{"candidateId": 0}]}\n```';
  const parsed = parseJson<{ ratings: unknown[] }>(wrappedJson);
  assert.equal(parsed.ratings.length, 1);

  const textWithProse = '여기 평가 결과입니다:\n{"ratings": [{"candidateId": 1}]}\n확인 부탁드립니다.';
  const parsedProse = parseJson<{ ratings: unknown[] }>(textWithProse);
  assert.equal(parsedProse.ratings.length, 1);

  // 5-2: 완전히 깨진 JSON을 Gemini가 반환했을 때 recommendation 서비스가 크래시되지 않고 안전 처리
  const brokenClient = createRecommendationService({
    generate: async () => ({ text: '이 책은 아주 좋습니다: 추천합니다!' }),
    fetchCandidates: async () => mockCandidates,
    fetchYes24: async () => [],
    searchTitle: async () => []
  });

  const res = await brokenClient({
    userMessage: '과학 책 추천해줘',
    userGrade: '중1',
    userInterests: [],
    chatHistory: [],
    recommendedBooks: []
  });

  // 에러가 throw되지 않고 정상 응답 구조 반환
  assert.ok(Array.isArray(res.books));
  assert.ok(typeof res.response === 'string');
});

// 6. recommendedBooks는 모두 실제 후보 기반 (Gemini 생성값으로 덮어쓰지 않음)
test('가드레일 6: recommendedBooks의 메타데이터(제목, 저자, ISBN, 출판사, 표지)는 실제 후보 데이터 원본만 사용', () => {
  // Gemini 평가 객체에 조작된 title/author 등이 포함되어 있어도 무시됨
  const ratingWithFakeMetadata = {
    ratings: [
      {
        candidateId: 0,
        title: '위조된 제목',
        author: '위조된 저자',
        publisher: '위조된 출판사',
        isbn13: '9788900000001', // 후보 0과 동일 ISBN
        relevanceScore: 92,
        topicMatch: true,
        difficultyMatch: true,
        evidence: '물리의 기초',
        reason: '실제 후보 검증 테스트'
      }
    ]
  };

  const results = selectLibraryBooks(mockCandidates, ratingWithFakeMetadata, baseRequest);
  assert.equal(results.length, 1);
  const book = results[0]!;

  // Gemini가 지어낸 필드가 아닌 실제 mockCandidates[0]의 필드 유지
  assert.equal(book.title, '재미있는 물리 이야기');
  assert.equal(book.author, '김철수');
  assert.equal(book.publisher, '과학출판사');
  assert.equal(book.isbn13, '9788900000001');
  assert.equal(book.cover, 'https://example.com/cover1.jpg');
  assert.equal(book.sourceType, 'library');
});

// 7. alternativeBooks가 있다면 모두 실제 후보 기반
test('가드레일 7: validateBooksAgainstCandidates를 통해 대체/추천 도서가 실제 후보에 존재하는지 검증', () => {
  const booksToValidate: Book[] = [
    {
      title: '재미있는 물리 이야기',
      author: '김철수',
      isbn13: '9788900000001'
    },
    {
      title: 'AI가 상상으로 만든 책',
      author: '가짜 저자',
      isbn13: '9789999999999'
    }
  ];

  const validated = validateBooksAgainstCandidates(booksToValidate as any, mockCandidates);
  assert.equal(validated.length, 1);
  assert.equal(validated[0]?.isbn13, '9788900000001');
  assert.equal(validated[0]?.title, '재미있는 물리 이야기');
});

// 8. similar 기준 작품 자체 → 최종 추천에서 제외
test('가드레일 8: similar 모드에서는 기준 도서 본인 및 판본/부제 변형이 최종 추천에서 차단됨', () => {
  const candidatesWithReference: Data4LibraryBook[] = [
    {
      title: '날개 (초판본)',
      authors: '이상',
      isbn13: '9788900000099',
      description: '이상의 대표작 날개 초판본'
    },
    {
      title: '메밀꽃 필 무렵',
      authors: '이효석',
      isbn13: '9788900000088',
      description: '한국 근대 단편 문학'
    }
  ];

  const similarRequest: RecommendationRequest = {
    ...baseRequest,
    searchMode: 'similar',
    referenceBook: '날개',
    referenceAuthor: '이상'
  };

  // isReferenceBook 함수 자체 검증
  assert.equal(isReferenceBook(candidatesWithReference[0]!, '날개', '이상'), true);
  assert.equal(isReferenceBook(candidatesWithReference[1]!, '날개', '이상'), false);

  // selectLibraryBooks 에서 기준 도서 제외 검증
  const ratings = {
    ratings: [
      { candidateId: 0, relevanceScore: 98, topicMatch: true, difficultyMatch: true, evidence: '이상의 대표작 날개', reason: '기준 도서' },
      { candidateId: 1, relevanceScore: 90, topicMatch: true, difficultyMatch: true, evidence: '한국 근대 단편 문학', reason: '유사한 문학 작품' }
    ]
  };

  const results = selectLibraryBooks(candidatesWithReference, ratings, similarRequest);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.title, '메밀꽃 필 무렵');
  assert.notEqual(results[0]?.title, '날개 (초판본)');
});

// 9. 근거 없는 AI 생성 문장 → "책에서 본 근거"에 표시되지 않음
test('가드레일 9: 세션 텍스트(사용자 입력/추출 텍스트)에 없는 AI 조작 근거는 완전히 제거됨', () => {
  const sessionContext = {
    userMessages: [
      '선생님, "별빛이 흐르는 밤하늘을 올려다보았다"라는 문장이 너무 아름다워요.'
    ],
    extractedText: '책 12페이지: 별빛이 흐르는 밤하늘을 올려다보았다.'
  };

  const rawEvidence = [
    '별빛이 흐르는 밤하늘을 올려다보았다', // 실제 존재하는 문장
    '인간은 생각하는 갈대이다.', // AI가 자체 기억에서 지어낸 근거
    '완전히 날조된 다른 문장'
  ];

  const filtered = validateEvidence(rawEvidence, sessionContext);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0], '별빛이 흐르는 밤하늘을 올려다보았다');

  // 세션에 아무 텍스트도 없는 경우 모두 빈 배열 반환
  const emptyFiltered = validateEvidence(rawEvidence, { userMessages: [], extractedText: null });
  assert.deepEqual(emptyFiltered, []);
});

// 10. API 오류 발생 → API key / stack trace가 사용자 응답에 포함되지 않음
test('가드레일 10: 오류 발생 시 민감 API 키, 인증 쿼리 파라미터, 내부 경로가 sanitize되어 노출되지 않음', () => {
  const sensitiveError = new Error(
    'Failed to fetch https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSySecretFakeKey123456 at /Users/ysw/Desktop/KU/server/server.ts:312:15'
  );

  const sanitized = sanitizeError(sensitiveError);

  assert.equal(sanitized.includes('AIzaSySecretFakeKey123456'), false, 'API 키가 노출되지 않아야 함');
  assert.ok(sanitized.includes('[REDACTED]'), '민감 쿼리 파라미터가 [REDACTED] 처리되어야 함');
  assert.equal(sanitized.includes('/Users/ysw/Desktop/KU/server/server.ts'), false, '내부 파일 경로가 노출되지 않아야 함');
});
