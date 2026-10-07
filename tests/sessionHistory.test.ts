import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { HISTORY_KEY, getSavedSessions, saveSessionSnapshot } from '../src/sessionHistory.ts';
import type { StorageAccess } from '../src/sessionHistory.ts';
import type { ReadingState } from '../src/types/index.ts';
import { accountKey, setAccount } from '../src/accountStorage.ts';

setAccount('test-reader');

function memoryStorage(): StorageAccess {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
}
const original: ReadingState = { student: { grade: '중2' }, book: { title: '코스모스' }, session: {
  recentMessages: [
    { role: 'user', content: '별은 어떻게 태어나?', image: null, evidence: [], isExplanation: true, isQuizQuestion: false, timestamp: 1 },
    { role: 'assistant', content: '별 이야기', evidence: ['책의 근거'], image: null, isExplanation: true, isQuizQuestion: false, timestamp: 2 }
  ],
  summary: '**주요 사건**\n별이 태어난다.', readingNote: '오늘의 기록', comprehensionChecks: [{ topic: '별의 탄생', result: '잘 이해했어요', difficultPart: null }],
  difficultPoints: ['별의 탄생'], understoodPoints: [], suggestedQuestions: ['다음 질문'], isQuizActive: true
}, taoLogs: [{ id: '1', thoughtSummary: '이해 분석', action: 'explain', observation: '완료', timestamp: 1 }] };

test('대화·요약·독서노트·이해도 모두 저장, 원본과 독립된 스냅샷', () => {
  const storage = memoryStorage();
  const state = structuredClone(original);
  saveSessionSnapshot('reading', state, storage);
  state.session.recentMessages.length = 0;
  const saved = getSavedSessions(storage)[0];
  assert.deepEqual(saved!.snapshot, original);
  assert.equal(saved!.title, '코스모스');
  // A new history reader after a reload sees the same persisted snapshot.
  assert.deepEqual(getSavedSessions(storage), [saved]);
});

test('여러 세션의 기록을 최신순으로 유지, 빈 세션은 추가하지 않음', () => {
  const storage = memoryStorage();
  assert.equal(saveSessionSnapshot('reading', { session: {} }, storage), null);
  saveSessionSnapshot('reading', original, storage);
  saveSessionSnapshot('recommendation', { chatHistory: [{ role: 'user', content: '물리학 책' }], recommendedBooks: [{ title: '책 제목', author: '저자', sourceType: 'web' }] }, storage);
  assert.equal(getSavedSessions(storage).length, 2); assert.equal(getSavedSessions(storage)[0]!.kind, 'recommendation');
});

test('저장 공간 부족 또는 손상된 기록이면 기존 내용은 그대로 남김', () => {
  const state = structuredClone(original);
  assert.throws(() => saveSessionSnapshot('reading', state, { getItem: () => null, setItem: () => { throw Error('quota'); } }));
  assert.deepEqual(state, original);
  assert.throws(() => saveSessionSnapshot('reading', state, { getItem: () => '{corrupt', setItem: () => assert.fail('must not overwrite') }));
  assert.deepEqual(state, original);
});

test('실제 StateManager 새 세션: 저장 후 이해도 체크를 포함한 모든 현재 기록 초기화', async () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage as Storage;
  const { stateManager } = await import('../src/state.ts');
  stateManager.state = structuredClone(original);
  stateManager.resetSession();
  assert.deepEqual(getSavedSessions(storage)[0]!.snapshot, original);
  const current = stateManager.getState();
  assert.equal(current.book.title, ''); assert.equal(current.student.grade, '중2');
  for (const key of ['recentMessages','comprehensionChecks','difficultPoints','understoodPoints','suggestedQuestions'] as const) assert.deepEqual(current.session[key], []);
  assert.equal(current.session.summary, null); assert.equal(current.session.readingNote, null); assert.equal(current.session.isQuizActive, false);
  assert.deepEqual(JSON.parse(storage.getItem(accountKey('reading-agent-current-session')!) || '{}').comprehensionChecks, []);
  const archive = storage.getItem(accountKey(HISTORY_KEY)!);
  const failStorage: StorageAccess = { getItem: (key: string) => key === accountKey(HISTORY_KEY) ? archive : null, setItem: () => { throw Error('quota'); } };
  globalThis.localStorage = failStorage as Storage;
  stateManager.state = structuredClone(original);
  assert.throws(() => stateManager.resetSession()); assert.deepEqual(stateManager.getState(), original);
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

test('책 추천의 새 세션도 먼저 보관하고, 저장 실패 시 초기화하지 않음', () => {
  const source = fs.readFileSync(new URL('../curator/app.ts', import.meta.url), 'utf8');
  const reset = transformSync(source.slice(source.indexOf('function resetSession()'), source.indexOf('function clearTaoFeed()')), {
    loader: 'ts', target: 'es2023', format: 'cjs'
  }).code;
  for (const fail of [false, true]) {
    const state = { userGrade: '중2', turnCount: 1, chatHistory: [{ role: 'user', content: '물리학 책' }], userInterests: ['물리학'], recommendedBooks: [{ title: '검증된 책' }], currentDocument: { markdown: '독서노트' } };
    const before = structuredClone(state); let saved: typeof state | undefined;
    const requiredElement = () => ({ innerHTML: '', value: '', style: {} });
    const context = { isRecommendationLoading: false, AgentState: state, confirm: () => true, alert() {}, initApp() {}, renderHud() {}, persistCurator() {},
      requiredElement, document: { getElementById: requiredElement }, saveSessionSnapshot: (_kind: string, value: typeof state) => { if (fail) throw Error('quota'); saved = structuredClone(value); } };
    vm.createContext(context); vm.runInContext(reset, context); vm.runInContext('resetSession()', context);
    if (fail) assert.deepEqual(state, before);
    else { assert.deepEqual(saved, before); assert.equal(state.chatHistory.length, 0); assert.equal(state.recommendedBooks.length, 0); assert.equal(state.currentDocument, null); }
  }
});
