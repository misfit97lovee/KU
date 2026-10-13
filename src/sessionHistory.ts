import type { ComprehensionCheck, GazeReport, MessageImage, RecommendedBook } from './types/index.ts';
import { accountGet, accountSet, getAccountId } from './accountStorage.ts';

export const HISTORY_KEY = 'pageon-saved-sessions';

export type SessionKind = 'reading' | 'recommendation';
export interface SnapshotMessage {
  role?: string;
  content?: string;
  image?: Partial<MessageImage> | null;
  evidence?: string[];
  books?: RecommendedBook[];
}
export interface SessionSnapshot {
  book?: { title?: string };
  session?: {
    recentMessages?: SnapshotMessage[];
    summary?: string | null;
    readingNote?: string | null;
    comprehensionChecks?: ComprehensionCheck[];
    difficultPoints?: string[];
    understoodPoints?: string[];
    gazeReports?: GazeReport[];
  };
  chatHistory?: SnapshotMessage[];
  recommendedBooks?: Array<Pick<RecommendedBook, 'title' | 'author' | 'reason'>>;
  currentDocument?: { markdown?: string } | null;
  [key: string]: unknown;
}
export interface SavedSession {
  id: string;
  kind: SessionKind;
  savedAt: string;
  title: string;
  snapshot: SessionSnapshot;
}
export type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;

export function getSavedSessions(storage: StorageAccess = localStorage): SavedSession[] {
  const raw = accountGet(HISTORY_KEY, storage);
  if (!raw) return [];
  const records = JSON.parse(raw);
  if (!Array.isArray(records)) throw new Error('저장기록을 읽을 수 없습니다.');
  return records as SavedSession[];
}

export function saveSessionSnapshot(kind: SessionKind, snapshot: object, storage: StorageAccess = localStorage): SavedSession | null {
  if (!getAccountId()) return null;
  const value = snapshot as SessionSnapshot;
  const session = value.session || {};
  const hasContent = kind === 'reading'
    ? Boolean(value.book?.title || session.recentMessages?.length || session.summary || session.readingNote ||
        session.comprehensionChecks?.length || session.difficultPoints?.length || session.understoodPoints?.length || session.gazeReports?.length)
    : Boolean(value.chatHistory?.length || value.recommendedBooks?.length || value.currentDocument);
  if (!hasContent) return null;
  const record = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind, savedAt: new Date().toISOString(),
    title: kind === 'reading' ? value.book?.title || '제목 없는 독서' : value.recommendedBooks?.at(-1)?.title || '책 추천 대화',
    snapshot: JSON.parse(JSON.stringify(value)) as SessionSnapshot
  };
  // Persist first. If storage is full/unavailable/corrupt, throw and retain the live session.
  const records = getSavedSessions(storage);
  accountSet(HISTORY_KEY, JSON.stringify([record, ...records]), storage);
  return record;
}
