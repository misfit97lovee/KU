import { getOpenAIConfig } from '../server/openai.ts';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createRecommendationService, createOpenAIRecommendationClient, parseBookSearchXml, matchesRequestedTitle } from '../server/bookRecommendations.ts';
import type { Book, Yes24Response } from '../src/types/index.ts';

const cases = process.argv.slice(2).length ? process.argv.slice(2) : [
  '중학생이 읽기 좋은 미스터리 추리소설 추천해줘',
  '중학생 판타지 소설 추천해줘', '코스모스 찾아줘', '세상에 없는 가짜책 ABCXYZ 찾아줘'
];
for (const userMessage of cases) {
  const event = (data: Record<string, unknown>) => console.log(JSON.stringify(data));
  const generate = createOpenAIRecommendationClient({ apiKey: getOpenAIConfig().apiKey,
    model: getOpenAIConfig().recommendationModel,
    onEvent: ({ stage, event: kind, status, code }) => event({ stage, event: kind, status, code }) });
  const library = async (keyword: string, pageSize = 25, kdc?: string): Promise<Book[]> => {
    const url = new URL(`${process.env.DATA4LIBRARY_BASE_URL || 'https://data4library.kr/api'}/srchBooks`);
    url.search = new URLSearchParams({ authKey: process.env.DATA4LIBRARY_AUTH_KEY || '', title: keyword, pageNo: '1', pageSize: String(pageSize) }).toString();
    if (kdc) url.searchParams.set('kdc', kdc);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error('Library unavailable');
      const xml = await response.text();
      if (xml.includes('<error>')) throw new Error('Library error');
      const books = parseBookSearchXml(xml);
      event({ stage: 'library_response', query: keyword, count: books.length }); return books;
    } catch { event({ stage: 'library_response', query: keyword, failed: true }); throw new Error('Library unavailable'); }
  };
  const recommend = createRecommendationService({
    generate: async options => {
      const response = await generate(options);
      if (options.stage === 'analyze') {
        try { const analysis = JSON.parse(response.text.replace(/^```(?:json)?\s*|\s*```$/g, '')); event({ stage: 'analysis', analysis }); } catch { /* pipeline handles invalid JSON */ }
      }
      if (options.stage === 'evaluate_library') {
        try {
          const assessment = JSON.parse(response.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
          event({ stage: 'gemini_ratings', candidateCount: JSON.parse(options.prompt).candidates.length,
            ratings: assessment.ratings?.map(({ candidateId, relevanceScore, topicMatch, difficultyMatch }: Record<string, unknown>) => ({ candidateId, relevanceScore, topicMatch, difficultyMatch })) });
        } catch { event({ stage: 'gemini_ratings', invalid: true }); }
      }
      return response;
    },
    fetchYes24: async ({ query, pageSize }) => {
      const url = new URL('https://apis.yes24.com/v1/goods/itemList');
      url.search = new URLSearchParams({ query, category: 'BOOK', sort: 'RELATION', page: '1', pageSize: String(pageSize || 15), detail: 'Y' }).toString();
      try {
        const response = await fetch(url, { headers: { 'X-Api-Key': (process.env.YES24_API || '').trim(), Accept: 'application/json' }, signal: AbortSignal.timeout(3000) });
        if (!response.ok) throw new Error('YES24 unavailable');
        const data = await response.json() as Yes24Response;
        const books: Book[] = (data.data?.items || []).map(item => ({ title: item.title || '', author: item.author || '', isbn13: item.isbn13 || '',
          publisher: item.publisher || '', cover: item.cover || '', sourceUrl: item.link || '', category: item.goodsSortNm || '',
          description: item.contentDetail?.bookIntroduction || item.contentDetail?.bookSummary || '', sourceType: 'yes24' }));
        event({ stage: 'yes24_response', query, count: books.length }); return books;
      } catch { event({ stage: 'yes24_response', query, failed: true }); throw new Error('YES24 unavailable'); }
    },
    fetchCandidates: ({ keyword, pageSize, kdc }) => library(keyword || '', pageSize, kdc), searchTitle: title => library(title, 30), onEvent: event
  });
  event({ input: userMessage });
  const result = await recommend({ userMessage, userGrade: '중1' });
  event({ stage: 'final', count: result.books.length, titles: result.books.map(book => book.title), request: result.request, trace: result.search, response: result.response });
  if (process.env.ASSERT_GENRE_RESULTS === 'true') {
    if (userMessage.includes('가짜책')) assert.equal(result.books.length, 0);
    else assert(result.books.length > 0, 'Expected real matching books');
    if (userMessage === '코스모스 찾아줘') assert(result.books.every(book => matchesRequestedTitle(book.title, { searchMode: 'exact', specificTitle: '코스모스' })));
  }
}
