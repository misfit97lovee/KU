import test from 'node:test';
import assert from 'node:assert/strict';
import { accountFetch, accountGet, accountKey, setAccount } from '../src/accountStorage.ts';
import { getSavedSessions, saveSessionSnapshot, HISTORY_KEY } from '../src/sessionHistory.ts';

test('A 기록 생성 → 로그아웃 비움 → B 격리 → A 재로그인 복원; 기존 키 보존', async () => {
  const values = new Map<string, string>([['unrelated', 'keep'], [HISTORY_KEY, JSON.stringify([{ title: '소유자 미확인 옛 기록' }])]]);
  globalThis.localStorage = { getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => { values.set(key, value); } } as Storage;
  const { stateManager } = await import('../src/state.ts');
  setAccount('google-sub-A');
  stateManager.setGrade('중2');
  stateManager.setBookTitle('A의 책');
  stateManager.addMessage('user', 'A만 볼 수 있는 독서 대화');
  stateManager.resetSession();
  stateManager.setBookTitle('A의 진행 중 책');
  assert.equal(getSavedSessions()[0]!.title, 'A의 책');
  const savedA = values.get(accountKey(HISTORY_KEY)!);

  setAccount(null);
  assert.deepEqual(getSavedSessions(), []);
  assert.equal(stateManager.getState().book.title, '');
  assert.deepEqual(stateManager.getState().session.recentMessages, []);
  assert.equal(accountGet('reading-agent-current-session'), null);
  assert.equal(values.get('unrelated'), 'keep');

  setAccount('google-sub-B');
  assert.deepEqual(getSavedSessions(), []);
  assert.equal(stateManager.getState().book.title, '');
  stateManager.setBookTitle('B의 책');
  saveSessionSnapshot('reading', stateManager.getState());
  setAccount('google-sub-A');
  assert.equal(stateManager.getState().book.title, 'A의 진행 중 책');
  assert.equal(stateManager.getState().student.grade, '중2');
  assert.equal(getSavedSessions().length, 1);
  assert.equal(getSavedSessions()[0]!.title, 'A의 책');
  assert.equal(values.get(accountKey(HISTORY_KEY)!), savedA);
  assert.ok(values.get(HISTORY_KEY)?.includes('소유자 미확인'));
  setAccount(null);
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

test('수동 중지와 계정 취소 신호를 모두 전달하고 JSON 처리 중 취소도 차단한다', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.localStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;
  let usedSignal: AbortSignal | null | undefined;
  let resolveJson!: (value: unknown) => void;
  globalThis.fetch = async (_url, options) => {
    usedSignal = options?.signal;
    const response = new Response('{}');
    response.json = () => new Promise(resolve => { resolveJson = resolve; });
    return response;
  };
  try {
    for (const cancel of ['manual', 'account']) {
      setAccount('cancel-A');
      const controller = new AbortController();
      const response = await accountFetch('/api/recommend-books', { signal: controller.signal });
      const body = response.json();
      if (cancel === 'manual') controller.abort(); else setAccount('cancel-B');
      assert.equal(usedSignal?.aborted, true);
      resolveJson({ books: ['late response'] });
      await assert.rejects(body, { name: 'AbortError' });
    }
  } finally {
    setAccount(null);
    globalThis.fetch = originalFetch;
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

test('계정 전환 전에 시작한 응답은 새 계정에 적용되지 않음', async () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'A의 응답' }));
  try {
    setAccount('A');
    const response = await accountFetch('/api/chat', {});
    setAccount('B');
    await assert.rejects(response.json(), { name: 'AbortError' });
  } finally {
    setAccount(null);
    globalThis.fetch = originalFetch;
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});
