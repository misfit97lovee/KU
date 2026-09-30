import { saveSessionSnapshot } from './sessionHistory.ts';
import type { ComprehensionCheck, Grade, MessageImage, ReadingMessage, ReadingState, TaoLog } from './types/index.ts';

/**
 * READING_AGENT_SPEC.md 기반 상태 관리 및 영속화
 */

const STORAGE_KEYS = {
  PROFILE: 'reading-agent-profile',
  SESSION: 'reading-agent-current-session'
};

const DEFAULT_STATE: ReadingState = {
  student: {
    grade: null // '중1' | '중2' | '중3' | null
  },
  book: {
    title: ''
  },
  session: {
    recentMessages: [],
    difficultPoints: [],
    understoodPoints: [],
    summary: null, // 최근 생성된 독서 요약
    readingNote: null, // 오늘의 독서노트
    comprehensionChecks: [], // 이해 확인 기록 ({ topic, result, difficultPart, timestamp })
    suggestedQuestions: [], // AI 추천 질문 (최대 3개)
    isQuizActive: false // 현재 퀴즈 진행 중 여부
  },
  taoLogs: []
};

const cloneDefaultState = (): ReadingState => JSON.parse(JSON.stringify(DEFAULT_STATE)) as ReadingState;

class StateManager {
  state: ReadingState;
  listeners: Array<(state: ReadingState) => void>;

  constructor() {
    this.state = this.loadState();
    this.listeners = [];
  }

  loadState(): ReadingState {
    try {
      const profile = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILE) || '{}') as { grade?: Grade };
      const session = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || '{}') as {
        bookTitle?: string;
        recentMessages?: ReadingMessage[];
        difficultPoints?: string[];
        understoodPoints?: string[];
        summary?: string | null;
        readingNote?: string | null;
        comprehensionChecks?: ComprehensionCheck[];
        suggestedQuestions?: string[];
        isQuizActive?: boolean;
        taoLogs?: TaoLog[];
      };

      return {
        student: {
          grade: profile.grade || null
        },
        book: {
          title: session.bookTitle || ''
        },
        session: {
          recentMessages: session.recentMessages || [],
          difficultPoints: session.difficultPoints || [],
          understoodPoints: session.understoodPoints || [],
          summary: session.summary || null,
          readingNote: session.readingNote || null,
          comprehensionChecks: session.comprehensionChecks || [],
          suggestedQuestions: session.suggestedQuestions || [],
          isQuizActive: Boolean(session.isQuizActive)
        },
        taoLogs: session.taoLogs || []
      };
    } catch (e) {
      console.error('로컬스토리지 복원 실패:', e);
      return cloneDefaultState();
    }
  }

  saveState(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify({
        grade: this.state.student.grade
      }));

      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({
        bookTitle: this.state.book.title,
        recentMessages: this.state.session.recentMessages,
        difficultPoints: this.state.session.difficultPoints,
        understoodPoints: this.state.session.understoodPoints,
        summary: this.state.session.summary,
        readingNote: this.state.session.readingNote,
        comprehensionChecks: this.state.session.comprehensionChecks,
        suggestedQuestions: this.state.session.suggestedQuestions,
        isQuizActive: Boolean(this.state.session.isQuizActive),
        taoLogs: this.state.taoLogs
      }));
    } catch (e) {
      console.error('로컬스토리지 저장 실패:', e);
    }
  }

  subscribe(listener: (state: ReadingState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify(): void {
    this.saveState();
    this.listeners.forEach(fn => fn(this.state));
  }

  getState(): ReadingState {
    return this.state;
  }

  setGrade(grade: Grade): void {
    this.state.student.grade = grade;
    this.notify();
  }

  setBookTitle(title: string): void {
    this.state.book.title = title;
    this.notify();
  }

  addMessage(role: ReadingMessage['role'], content: string, extra: {
    image?: MessageImage | null;
    evidence?: string[];
    isExplanation?: boolean;
    isQuizQuestion?: boolean;
  } = {}): ReadingMessage {
    const message: ReadingMessage = {
      role, // 'user' | 'assistant'
      content,
      image: extra.image || null, // { data, mimeType }
      evidence: Array.isArray(extra.evidence) ? extra.evidence : [],
      isExplanation: extra.isExplanation !== undefined ? extra.isExplanation : true,
      isQuizQuestion: Boolean(extra.isQuizQuestion),
      timestamp: Date.now()
    };
    this.state.session.recentMessages.push(message);
    this.notify();
    return message;
  }

  setSummary(summaryText: string): void {
    this.state.session.summary = summaryText;
    this.notify();
  }

  setReadingNote(noteText: string): void {
    this.state.session.readingNote = noteText;
    this.notify();
  }

  addComprehensionCheck(check: Omit<ComprehensionCheck, 'timestamp'> | null | undefined): void {
    if (!check) return;
    if (!this.state.session.comprehensionChecks) {
      this.state.session.comprehensionChecks = [];
    }
    const record = {
      topic: check.topic || '핵심 내용 이해',
      result: check.result || '확인 완료',
      difficultPart: check.difficultPart || null,
      timestamp: Date.now()
    };
    this.state.session.comprehensionChecks.push(record);
    if (check.difficultPart && !this.state.session.difficultPoints.includes(check.difficultPart)) {
      this.state.session.difficultPoints.push(check.difficultPart);
    }
    this.notify();
  }

  addTaoLog(tao: Partial<Omit<TaoLog, 'id' | 'timestamp'>> | null | undefined): void {
    if (!tao) return;
    const log = {
      id: Date.now().toString(),
      thoughtSummary: tao.thoughtSummary || '사용자 의도 분석',
      action: tao.action || 'askUser',
      observation: tao.observation || '응답 완료',
      timestamp: Date.now()
    };
    this.state.taoLogs.unshift(log); // 최신순
    if (this.state.taoLogs.length > 10) {
      this.state.taoLogs = this.state.taoLogs.slice(0, 10);
    }
    this.notify();
  }

  setQuizActive(active: boolean): void {
    this.state.session.isQuizActive = Boolean(active);
    this.notify();
  }

  setSuggestedQuestions(questions: string[]): void {
    this.state.session.suggestedQuestions = Array.isArray(questions)
      ? questions.filter(q => typeof q === 'string' && q.trim().length > 0).slice(0, 3)
      : [];
    this.notify();
  }

  resetSession(): void {
    saveSessionSnapshot('reading', this.state);
    this.state.book.title = '';
    this.state.session = cloneDefaultState().session;
    this.state.taoLogs = [];
    this.notify();
  }
}

export const stateManager = new StateManager();
