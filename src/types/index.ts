export type SearchMode = 'exact' | 'similar' | 'topic' | 'author' | 'broad';
export type BookSourceType = 'yes24' | 'library' | 'web';
export type Difficulty = '쉬움' | '보통' | '높음' | '미지정';
export type Grade = '중1' | '중2' | '중3' | string;
export type ReadingLevel = '입문' | '중급' | '심화';

export interface Book {
  title: string;
  author?: string;
  authors?: string;
  publisher?: string;
  isbn13?: string;
  publicationYear?: string;
  cover?: string;
  bookImageURL?: string;
  category?: string;
  classNm?: string;
  description?: string;
  sourceType?: BookSourceType;
  sourceUrl?: string;
  link?: string;
  bookDtUrl?: string;
}

export interface RecommendedBook {
  title: string;
  author: string;
  publisher: string | null;
  isbn13: string | null;
  cover: string | null;
  category: string | null;
  description: string | null;
  sourceUrl: string | null;
  sourceType: BookSourceType;
  reason: string;
  relevanceScore: number;
  publicationYear: string | null;
  sources?: Array<{ url: string }>;
  verification?: {
    identityEvidence: string;
    descriptionEvidence: string;
  };
}

export type AlternativeBook = RecommendedBook;

export interface RecommendationRequest {
  topic: string;
  difficulty: Difficulty;
  grade: Grade;
  intent: '도서 추천';
  keywords: string[];
  specificTitle: string | null;
  searchMode: SearchMode;
  author: string | null;
  referenceBook: string | null;
  referenceAuthor: string | null;
  similarityFocus: string | null;
  needsClarification: boolean;
  kdc: string;
}

export interface RecommendationClarification {
  question: string;
  options: string[];
}

export interface RecommendationTrace {
  libraryAttempted: boolean;
  libraryCandidateCount: number;
  libraryEligibleCount: number;
  fallbackUsed: boolean;
  googleSearchRequested: boolean;
  googleSearchExecuted: boolean;
  searchQueries: string[];
  groundedPassageCount: number;
  failures: string[];
}

export interface RecommendationChatMessage {
  role: 'user' | 'librarian' | 'assistant' | string;
  content: string;
  books?: RecommendedBook[];
  isClarification?: boolean;
  originalRequest?: string;
}

export interface RecommendationInput {
  userMessage: string;
  userGrade?: Grade;
  userInterests?: string[];
  chatHistory?: RecommendationChatMessage[];
  recommendedBooks?: RecommendedBook[];
}

export interface RecommendationResponse {
  success: true;
  books: RecommendedBook[];
  moreBooks?: RecommendedBook[];
  response: string;
  request: RecommendationRequest | null;
  candidateCount: number;
  kdc: string | null;
  search: RecommendationTrace;
  clarification?: RecommendationClarification;
  searchSuggestionsHtml?: string;
}

export interface ComprehensionCheck {
  topic: string;
  result: string;
  difficultPart: string | null;
  timestamp?: number;
}

export interface UnderstandingTopic {
  topic: string;
  status: 'difficult' | 'almost' | 'understood';
  updatedAt?: number;
}

export interface MessageImage {
  data: string;
  mimeType: string;
}

export interface ReadingMessage {
  role: 'user' | 'assistant';
  content: string;
  image: MessageImage | null;
  evidence: string[];
  isExplanation: boolean;
  isQuizQuestion: boolean;
  timestamp: number;
}

export interface TaoLog {
  id: string;
  thoughtSummary: string;
  action: string;
  observation: string;
  timestamp: number;
}

export interface GazeReport {
  id: string;
  createdAt: number;
  durationSec: number;
  focusPercent: number;
  hotspots: Array<{ position: string; dwellSec: number; revisits: number }>;
  /** JPEG preview includes the book photo, never the webcam video. */
  snapshot: string;
  source: 'webcam' | 'mouse';
}

export interface ReadingState {
  student: { grade: Grade | null; readingLevel?: ReadingLevel; readingLevelSelected?: boolean };
  book: { title: string };
  session: {
    recentMessages: ReadingMessage[];
    difficultPoints: string[];
    understoodPoints: string[];
    summary: string | null;
    readingNote: string | null;
    comprehensionChecks: ComprehensionCheck[];
    suggestedQuestions: string[];
    isQuizActive: boolean;
    sourceText?: string;
    gazeReports?: GazeReport[];
  };
  taoLogs: TaoLog[];
}

export interface GeminiGroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: Array<{ web?: { uri?: string } }>;
  groundingSupports?: Array<{
    segment?: { text?: string };
    groundingChunkIndices?: number[];
  }>;
  searchEntryPoint?: { renderedContent?: string };
}

export interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    groundingMetadata?: GeminiGroundingMetadata;
  }>;
  error?: { message?: string; status?: string };
}

export interface GeminiGenerationResult {
  text: string;
  modelUsed?: string;
  groundingMetadata?: GeminiGroundingMetadata | null;
}

export interface ReadingApiResponse {
  extractedText?: string | null;
  message?: string;
  summary?: string;
  readingNote?: string;
  evidence?: string[];
  suggestedQuestions?: string[];
  isQuizQuestion?: boolean;
  tao?: Partial<Omit<TaoLog, 'id' | 'timestamp'>>;
  comprehensionCheck?: Omit<ComprehensionCheck, 'timestamp'>;
  error?: string;
  details?: string;
}

export interface Yes24Item {
  title?: string;
  author?: string;
  publisher?: string;
  isbn13?: string;
  publishDate?: string;
  cover?: string;
  goodsSortNm?: string;
  link?: string;
  contentDetail?: {
    bookIntroduction?: string;
    bookSummary?: string;
  };
}

export interface Yes24Response {
  data?: { items?: Yes24Item[] };
}

export interface Data4LibraryBook extends Book {
  title: string;
  authors: string;
}
