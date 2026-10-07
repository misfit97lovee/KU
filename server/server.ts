import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createAuthRouter } from './auth.ts';
import { callReadingGemini } from './readingGemini.ts';
import { compactReadingBody, readingMemory } from './readingContext.ts';
import { buildSystemPrompt, buildSummaryPrompt, buildReadingNotePrompt } from './prompts.ts';
import { createRecommendationService, createGeminiRecommendationClient, parseBookSearchXml } from './bookRecommendations.ts';
import type {
  Book,
  ComprehensionCheck,
  GeminiResponse,
  RecommendationInput,
  TaoLog,
  Yes24Response
} from '../src/types/index.ts';

interface CandidateSearchOptions {
  kdc?: string;
  pageSize?: number;
  pageNo?: number;
  keyword?: string;
  startDt?: string;
  endDt?: string;
  timeoutMs?: number;
}

interface GeminiTextPart { text: string }
interface GeminiImagePart { inlineData: { mimeType: string; data: string } }
type GeminiPart = GeminiTextPart | GeminiImagePart;
interface GeminiContent { role: 'user' | 'model'; parts: GeminiPart[] }

interface ClientMessage { role: string; content: string }
interface ChatBody {
  messages?: ClientMessage[];
  readingState?: Parameters<typeof buildSystemPrompt>[0];
  image?: { data: string; mimeType?: string } | null;
  explanationLevel?: string | null;
}

interface SummaryBody {
  messages?: ClientMessage[];
  readingState?: Parameters<typeof buildSummaryPrompt>[0];
}

interface ParsedGeminiResponse {
  message: string;
  evidence: string[];
  suggestedQuestions: string[];
  summary: string | null;
  comprehensionCheck: Omit<ComprehensionCheck, 'timestamp'> | null;
  tao: Omit<TaoLog, 'id' | 'timestamp'>;
  extractedText?: string | null;
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
const queryString = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;

dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 3002;

// API 키 로드 (기존 .env의 GEMINI_API 또는 표준 GEMINI_API_KEY 지원)
const rawApiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API || '';
const apiKey = rawApiKey.trim();

// 정보나루 (data4library) API 설정
const DATA4LIBRARY_AUTH_KEY = process.env.DATA4LIBRARY_AUTH_KEY || '';
const DATA4LIBRARY_LIB_CODE = process.env.DATA4LIBRARY_LIB_CODE || '';
const DATA4LIBRARY_BASE_URL = process.env.DATA4LIBRARY_BASE_URL || 'https://data4library.kr/api';

// YES24 API 설정
const YES24_API_KEY = (process.env.YES24_API || '').trim();

export { normalizeText, validateEvidence } from './guardrails.ts';
import { sanitizeError as baseSanitizeError, normalizeText, validateEvidence } from './guardrails.ts';

export function sanitizeError(error: unknown): string {
  return baseSanitizeError(error, [apiKey, DATA4LIBRARY_AUTH_KEY, YES24_API_KEY]);
}

// 미들웨어 설정 (이미지 Base64 처리를 위해 20MB로 넉넉하게 설정)
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/api/auth', createAuthRouter({ clientId: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '' }));

// 헬스체크 엔드포인트
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    configured: Boolean(apiKey),
    targetModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    data4library: {
      hasAuthKey: Boolean(DATA4LIBRARY_AUTH_KEY),
      libCode: DATA4LIBRARY_LIB_CODE,
      baseUrl: DATA4LIBRARY_BASE_URL
    }
  });
});

/**
 * data4library XML 파싱 헬퍼 함수 (외부 라이브러리 없이 안전한 정규식 추출)
 */
function parseLibraryXml(xmlString: string): Book[] {
  const docs: Book[] = [];
  const docRegex = /<doc>([\s\S]*?)<\/doc>/g;
  let match;

  while ((match = docRegex.exec(xmlString)) !== null) {
    const docXml = match[1] ?? '';

    const getTagValue = (tagName: string): string => {
      const regex = new RegExp(`<${tagName}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tagName}>`, 'i');
      const tagMatch = docXml.match(regex);
      if (!tagMatch) return '';
      return (tagMatch[1] !== undefined ? tagMatch[1] : tagMatch[2] || '').trim();
    };

    docs.push({
      title: getTagValue('bookname'),
      authors: getTagValue('authors'),
      publisher: getTagValue('publisher'),
      publicationYear: getTagValue('publication_year'),
      isbn13: getTagValue('isbn13'),
      bookImageURL: getTagValue('bookImageURL'),
      classNm: getTagValue('class_nm')
    });
  }

  return docs;
}

/**
 * data4library 도서 검색 API 호출 헬퍼 (키워드 검색 시 srchBooks, 기본 시 itemSrch)
 */
async function fetchCandidateBooks({ kdc = '', pageSize = 30, pageNo = 1, keyword = '', startDt = '2023-01-01', endDt = '2024-12-31', timeoutMs = 20000 }: CandidateSearchOptions = {}): Promise<Book[]> {
  if (!DATA4LIBRARY_AUTH_KEY) {
    throw new Error('DATA4LIBRARY_AUTH_KEY 환경변수가 설정되지 않았습니다.');
  }

  let apiUrl;
  if (keyword) {
    apiUrl = `${DATA4LIBRARY_BASE_URL}/srchBooks?authKey=${DATA4LIBRARY_AUTH_KEY}&title=${encodeURIComponent(keyword)}&pageNo=${pageNo}&pageSize=${pageSize}`;
    if (kdc) apiUrl += `&kdc=${encodeURIComponent(kdc)}`;
  } else {
    apiUrl = `${DATA4LIBRARY_BASE_URL}/itemSrch?authKey=${DATA4LIBRARY_AUTH_KEY}&libCode=${DATA4LIBRARY_LIB_CODE}&startDt=${startDt}&endDt=${endDt}&pageSize=${pageSize}&pageNo=${pageNo}`;
    if (kdc) apiUrl += `&kdc=${encodeURIComponent(kdc)}`;
  }

  const response = await fetch(apiUrl, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`도서관 API HTTP ${response.status}`);
  const xmlText = await response.text();

  if (xmlText.includes('<error>')) {
    throw new Error(`도서관 정보나루 API 오류: ${xmlText}`);
  }

  return parseBookSearchXml(xmlText);
}

/**
 * YES24 상품 검색 API 호출 헬퍼
 */
async function fetchYes24Books({ query, pageSize = 20, timeoutMs = 10000 }: { query: string; pageSize?: number; timeoutMs?: number }): Promise<Book[]> {
  if (!YES24_API_KEY || !query) return [];
  try {
    const url = new URL('https://apis.yes24.com/v1/goods/itemList');
    url.searchParams.set('query', query);
    url.searchParams.set('category', 'BOOK');
    url.searchParams.set('sort', 'RELATION');
    url.searchParams.set('page', '1');
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('detail', 'Y');

    const response = await fetch(url.toString(), {
      headers: {
        'X-Api-Key': YES24_API_KEY,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) return [];
    const data = await response.json() as Yes24Response;
    const items = data.data?.items || [];
    return items.map(item => ({
      title: item.title || '',
      author: item.author || '',
      publisher: item.publisher || '',
      isbn13: item.isbn13 || '',
      publicationYear: item.publishDate ? item.publishDate.slice(0, 4) : '',
      cover: item.cover || '',
      category: item.goodsSortNm || '',
      description: item.contentDetail?.bookIntroduction || item.contentDetail?.bookSummary || '',
      sourceType: 'yes24',
      sourceUrl: item.link || ''
    }));
  } catch (err: unknown) {
    console.warn('[YES24 Search Error]', errorMessage(err));
    return [];
  }
}

/**
 * GET /api/library/items
 * data4library itemSrch API 호출 및 XML -> JSON 변환
 */
app.get('/api/library/items', async (req, res) => {
  try {
    if (!DATA4LIBRARY_AUTH_KEY || !DATA4LIBRARY_LIB_CODE) {
      return res.status(500).json({
        error: 'DATA4LIBRARY_AUTH_KEY 또는 DATA4LIBRARY_LIB_CODE 환경변수가 설정되지 않았습니다.'
      });
    }

    const startDt = queryString(req.query.startDt, '2023-01-01');
    const endDt = queryString(req.query.endDt, '2024-12-31');
    const pageSize = queryString(req.query.pageSize, '30');
    const pageNo = queryString(req.query.pageNo, '1');
    const keyword = queryString(req.query.keyword);
    const kdc = queryString(req.query.kdc);

    const books = await fetchCandidateBooks({
      kdc,
      pageSize: parseInt(pageSize, 10) || 30,
      pageNo: parseInt(pageNo, 10) || 1,
      keyword,
      startDt,
      endDt
    });

    return res.json({
      success: true,
      count: books.length,
      kdc: kdc || '전체',
      books
    });
  } catch (error: unknown) {
    console.error('[API /api/library/items 에러]:', sanitizeError(error));
    return res.status(500).json({
      error: '지금은 책 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
    });
  }
});

/**
 * 독서 요청당 한 번만 호출, 텍스트 12초/사진 20초 제한
 */
async function callGemini(contents: GeminiContent[], systemInstruction: string, preferredModel = 'gemini-flash-lite-latest'): Promise<{ text: string; modelUsed: string }> {
  return callReadingGemini(contents, systemInstruction, apiKey, preferredModel,
    contents.some(content => content.parts.some(part => 'inlineData' in part)) ? 20000 : 12000);
}

/**
 * 응답 텍스트에서 JSON 및 TAO 구조 파싱
 */
function parseGeminiResponse(rawText: string): ParsedGeminiResponse {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  let message = rawText;
  let summary = null;
  let comprehensionCheck: Omit<ComprehensionCheck, 'timestamp'> | null = null;
  let tao = {
    thoughtSummary: '사용자의 입력을 분석하여 질문 의도를 파악함.',
    action: 'askUser',
    observation: '사용자에게 응답 메시지를 전송함.'
  };

  let evidence: string[] = [];
  let suggestedQuestions: string[] = [];
  let extractedText: string | null = null;

  try {
    const parsed = JSON.parse(cleaned) as {
      message?: string;
      summary?: string;
      evidence?: unknown[];
      suggestedQuestions?: unknown[];
      extractedText?: string;
      ocrText?: string;
      comprehensionCheck?: { topic?: string; result?: string; difficultPart?: string | null };
      tao?: Partial<Omit<TaoLog, 'id' | 'timestamp'>>;
    };
    if (parsed && typeof parsed === 'object') {
      message = parsed.message || parsed.summary || rawText;
      summary = parsed.summary || null;
      extractedText = (typeof parsed.extractedText === 'string' && parsed.extractedText.trim())
        || (typeof parsed.ocrText === 'string' && parsed.ocrText.trim())
        || null;
      if (Array.isArray(parsed.evidence)) {
        evidence = parsed.evidence
          .map((e: unknown) => typeof e === 'string' ? e.trim() : '')
          .filter((e: string) => e.length > 0);
      }
      if (Array.isArray(parsed.suggestedQuestions)) {
        suggestedQuestions = parsed.suggestedQuestions
          .map((q: unknown) => typeof q === 'string' ? q.trim() : '')
          .filter((q: string) => q.length > 0)
          .slice(0, 3);
      }
      if (parsed.comprehensionCheck) {
        let checkResult = parsed.comprehensionCheck.result || '';
        if (!checkResult) {
          if (message.includes('✅') || message.includes('잘 이해')) {
            checkResult = '✅ 잘 이해했어요';
          } else if (message.includes('🟡') || message.includes('거의 이해')) {
            checkResult = '🟡 거의 이해했어요';
          } else {
            checkResult = '🔄 조금 더 살펴볼까요?';
          }
        }
        comprehensionCheck = {
          topic: parsed.comprehensionCheck.topic || '핵심 내용',
          result: checkResult,
          difficultPart: parsed.comprehensionCheck.difficultPart || null
        };
      }
      if (parsed.tao) {
        tao = {
          thoughtSummary: parsed.tao.thoughtSummary || tao.thoughtSummary,
          action: parsed.tao.action || tao.action,
          observation: parsed.tao.observation || tao.observation
        };
      }
    }
  } catch (e) {
    // JSON 파싱 실패 시 텍스트 기반 폴백
  }

  // 메시지 텍스트 내 평가 태그 감지 및 보완
  if (!comprehensionCheck) {
    if (message.includes('✅ 잘 이해했어요')) {
      comprehensionCheck = { topic: '핵심 내용', result: '✅ 잘 이해했어요', difficultPart: null };
    } else if (message.includes('🟡 거의 이해했어요')) {
      comprehensionCheck = { topic: '핵심 내용', result: '🟡 거의 이해했어요', difficultPart: '세부 맥락 보완 필요' };
    } else if (message.includes('🔄 조금 더 살펴볼까요?')) {
      comprehensionCheck = { topic: '핵심 내용', result: '🔄 조금 더 살펴볼까요?', difficultPart: '개념 재확인 필요' };
    }
  }

  return {
    message,
    evidence,
    suggestedQuestions,
    summary,
    comprehensionCheck,
    tao,
    extractedText
  };
}

/**
 * POST /api/chat
 * 사용자 메시지 수신 (텍스트 + 책 사진 멀티모달 + 설명 난이도 조절 지원)
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, readingState, image, explanationLevel, conversationSummary, sourceText } = compactReadingBody(req.body || {});

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '대화 메시지(messages) 목록이 필요합니다.' });
    }

    const systemPrompt = buildSystemPrompt(readingState, explanationLevel) + readingMemory(conversationSummary, sourceText);

    // Gemini API 포맷으로 메시지 변환 (role: user / model)
    const contents: GeminiContent[] = messages.map((msg, idx) => {
      const parts: GeminiPart[] = [];

      // 마지막 사용자 메시지에 이미지가 첨부된 경우 멀티모달 파트 주입
      if (idx === messages.length - 1 && image && image.data) {
        parts.push({
          inlineData: {
            mimeType: image.mimeType || 'image/jpeg',
            data: image.data
          }
        });
      }

      parts.push({ text: msg.content });

      return {
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts
      };
    });

    // Gemini API는 마지막 턴이 model이면 에러가 발생하므로 마지막이 model인 경우 적절한 user 턴 추가
    if (contents.length > 0 && contents.at(-1)?.role === 'model') {
      let promptText = '방금 설명한 내용을 더 쉽게 설명해줘.';
      if (explanationLevel === 'quiz_request') {
        promptText = '방금 설명한 내용을 바탕으로 내가 잘 이해했는지 확인할 수 있는 질문이나 퀴즈를 하나 내줘.';
      } else if (explanationLevel === 'more_easy') {
        promptText = '방금 설명한 내용을 더 쉬운 비유와 일상적인 예시로 다시 설명해줘.';
      } else if (explanationLevel === 'deep') {
        promptText = '방금 설명한 내용의 배경과 더 깊은 의미를 자세히 설명해줘.';
      }
      contents.push({
        role: 'user',
        parts: [{ text: promptText }]
      });
    }

    const preferredModel = process.env.GEMINI_READING_MODEL || process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
    const { text, modelUsed } = await callGemini(contents, systemPrompt, preferredModel);
    const { message, evidence: rawEvidence = [], suggestedQuestions = [], tao, comprehensionCheck, extractedText } = parseGeminiResponse(text);

    // 실제 입력된 텍스트 및 추출 텍스트에서 검증된 근거만 필터링
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
    const verifiedEvidence = validateEvidence(rawEvidence, { userMessages: [...userMessages, sourceText], extractedText });

    const featureName = image ? '책 사진 분석' : (explanationLevel ? `설명 전환(${explanationLevel})` : '대화 응답');
    console.log(`[Gemini 호출 성공] 기능: ${featureName} | 사용 모델: ${modelUsed}`);

    const isQuizQuestion = explanationLevel === 'quiz_request' || (
      (message.includes('가볍게 한 가지') || message.includes('물어볼게') || message.includes('질문 하나') || message.includes('질문할게')) &&
      !message.includes('✅') && !message.includes('🟡') && !message.includes('🔄')
    );

    return res.json({
      message,
      extractedText,
      evidence: isQuizQuestion ? [] : verifiedEvidence,
      suggestedQuestions: isQuizQuestion ? [] : suggestedQuestions,
      tao,
      comprehensionCheck,
      isQuizQuestion,
      modelUsed,
      statePatch: {}
    });
  } catch (error: unknown) {
    console.error('[API /api/chat 에러]:', sanitizeError(error));
    return res.status(500).json({
      error: '설명을 만드는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
    });
  }
});

/**
 * POST /api/summary
 * 대화 내용 기반 지금까지 읽은 내용 요약 생성
 */
app.post('/api/summary', async (req, res) => {
  try {
    const { messages, readingState, conversationSummary, sourceText } = compactReadingBody(req.body || {});

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '요약할 대화 기록이 없습니다.' });
    }

    const summaryPrompt = buildSummaryPrompt(readingState) + readingMemory(conversationSummary, sourceText);

    const contents: GeminiContent[] = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    contents.push({
      role: 'user',
      parts: [{ text: '지금까지 우리가 대화에서 확인한 책 내용을 바탕으로 독서 요약을 작성해줘.' }]
    });

    const preferredModel = process.env.GEMINI_READING_MODEL || process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
    const { text, modelUsed } = await callGemini(contents, summaryPrompt, preferredModel);
    const { summary, tao } = parseGeminiResponse(text);

    console.log(`[Gemini 호출 성공] 기능: 독서 요약 생성 | 사용 모델: ${modelUsed}`);

    return res.json({
      summary: summary || text,
      tao: tao || {
        thoughtSummary: '대화 기반 독서 요약 완료',
        action: 'makeReadingSummary',
        observation: '요약 내용 생성 완료'
      },
      modelUsed
    });
  } catch (error: unknown) {
    console.error('[API /api/summary 에러]:', sanitizeError(error));
    return res.status(500).json({
      error: '설명을 만드는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
    });
  }
});

/**
 * POST /api/reading-note
 * 대화 내용 및 ReadingState 기반 오늘의 독서노트 생성
 */
app.post('/api/reading-note', async (req, res) => {
  try {
    const { messages, readingState, conversationSummary, sourceText } = compactReadingBody(req.body || {});

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '독서노트를 작성할 대화 기록이 없습니다.' });
    }

    const notePrompt = buildReadingNotePrompt(readingState) + readingMemory(conversationSummary, sourceText);

    const contents: GeminiContent[] = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    contents.push({
      role: 'user',
      parts: [{ text: '지금까지 대화에서 다룬 내용과 독서 상태를 바탕으로 주어진 형식에 맞추어 오늘의 독서노트를 작성해줘.' }]
    });

    const preferredModel = process.env.GEMINI_READING_MODEL || process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
    const { text, modelUsed } = await callGemini(contents, notePrompt, preferredModel);

    let readingNote = text;
    let tao = {
      thoughtSummary: '대화와 독서상태를 바탕으로 사실에 근거하여 오늘의 독서노트 작성',
      action: 'makeReadingNote',
      observation: '오늘의 독서노트 작성 완료'
    };

    try {
      let cleaned = text.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      const json = JSON.parse(cleaned.trim()) as { readingNote?: string; tao?: Omit<TaoLog, 'id' | 'timestamp'> };
      if (json.readingNote) {
        readingNote = json.readingNote;
      }
      if (json.tao) {
        tao = json.tao;
      }
    } catch (e) {
      // 텍스트 폴백
    }

    console.log(`[Gemini 호출 성공] 기능: 오늘의 독서노트 생성 | 사용 모델: ${modelUsed}`);

    return res.json({
      readingNote,
      tao,
      modelUsed
    });
  } catch (error: unknown) {
    console.error('[API /api/reading-note 에러]:', sanitizeError(error));
    return res.status(500).json({
      error: '설명을 만드는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
    });
  }
});

// Separate recommendation gateway keeps reading/photo/summary model behavior unchanged.
const recommendationEvent = (event: Record<string, unknown>): void => console.log('[Book recommendation]', JSON.stringify(event));
const recommendBooks = createRecommendationService({
  generate: createGeminiRecommendationClient({
    apiKey,
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    searchModel: process.env.GEMINI_SEARCH_MODEL || process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    onEvent: recommendationEvent
  }),
  fetchCandidates: options => fetchCandidateBooks({ ...options, timeoutMs: 3000 }),
  fetchYes24: options => fetchYes24Books({ ...options, timeoutMs: 3000 }),
  enableGoogleGrounding: process.env.ENABLE_GOOGLE_GROUNDING === 'true',
  searchTitle: async (title: string): Promise<Book[]> => {
    if (!DATA4LIBRARY_AUTH_KEY) throw new Error('Library search is not configured');
    // srchBooks is the actual title/keyword search API; itemSrch is a holdings list.
    const url = new URL(`${DATA4LIBRARY_BASE_URL}/srchBooks`);
    url.search = new URLSearchParams({ authKey: DATA4LIBRARY_AUTH_KEY, title, pageNo: '1', pageSize: '30' }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`Library title search HTTP ${response.status}`);
    const xml = await response.text();
    if (xml.includes('<error>')) throw new Error('Library title search error');
    return parseBookSearchXml(xml);
  },
  onEvent: recommendationEvent
});

app.post('/api/recommend-books', async (req, res) => {
  try {
    const { userMessage, userGrade, userInterests, chatHistory, recommendedBooks } = req.body as Partial<RecommendationInput>;
    if (typeof userMessage !== 'string' || !userMessage.trim()) {
      return res.status(400).json({ error: '사용자 메시지가 필요합니다.' });
    }
    const result = await recommendBooks({
      userMessage: userMessage.trim(),
      userGrade: typeof userGrade === 'string' ? userGrade : '중1',
      userInterests: Array.isArray(userInterests) ? userInterests : [],
      chatHistory: Array.isArray(chatHistory) ? chatHistory : [],
      recommendedBooks: Array.isArray(recommendedBooks) ? recommendedBooks : []
    });
    console.log('[Book recommendation result]', JSON.stringify({
      count: result.books.length, sourceTypes: result.books.map(b => b.sourceType), search: result.search
    }));
    return res.json(result);
  } catch (error: unknown) {
    console.error('[API /api/recommend-books 에러]:', sanitizeError(error));
    return res.status(500).json({
      error: '지금은 책 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
    });
  }
});

const isRunningTests = process.execArgv.includes('--test') || process.env.NODE_ENV === 'test';
if (!isRunningTests) {
  app.listen(PORT, () => {
    console.log(`[Reading Agent Server] 포트 ${PORT}에서 서버가 실행 중입니다.`);
    console.log(`[API Key 상태]: ${apiKey ? '정상 등록됨' : '미등록 (확인 필요)'}`);
  });
}
