import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function harness() {
  const source = fs.readFileSync(new URL('../curator/app.ts', import.meta.url), 'utf8');
  const code = transformSync(source.slice(source.indexOf('let isRecommendationLoading'), source.indexOf('\nfunction initApp')), { loader: 'ts', format: 'cjs' }).code;
  let revision = 1;
  const pending: Array<{ signal: AbortSignal; resolve: (value: unknown) => void; reject: (error: Error) => void }> = [];
  const shown: Array<{ text: string; books?: unknown[] }> = [];
  const persisted: unknown[] = [];
  const classes = new Set<string>();
  const send = { textContent: '보내기', disabled: false, classList: { toggle(name: string, enabled: boolean) { if(enabled) classes.add(name); else classes.delete(name); } }, setAttribute() {} };
  const reset = { disabled: false };
  const state = { turnCount: 0, chatHistory: [] as unknown[], recommendedBooks: [] as unknown[] };
  const context = { AbortController, getAccountRevision: () => revision, AgentState: state, SafetyGuardrail: { check: () => ({ isSafe: true }) }, extractInterests() {},
    persistCurator: () => persisted.push(structuredClone(state)),
    document: { querySelector: () => reset, getElementById: () => send },
    callRecommendBooksApi: (_text: string, signal: AbortSignal) => new Promise((resolve, reject) => pending.push({ signal, resolve, reject })),
    renderHud() {}, renderTaoTurn() {}, appendLibrarianMessage: (text: string, books?: unknown[]) => shown.push({ text, books }) };
  vm.createContext(context); vm.runInContext(code, context);
  return { state, pending, shown, persisted, send, reset, classes,
    run: () => vm.runInContext('runAgentTurn("추천해줘")', context) as Promise<void>,
    stop: () => vm.runInContext('stopRecommendation()', context),
    changeAccount: () => { revision++; vm.runInContext('stopRecommendation(false)', context); state.chatHistory=[]; state.recommendedBooks=[]; } };
}
const result = (title: string) => ({ success: true, books: [{ title, author: '저자', sourceType: 'yes24', isbn13: title }], response: title, search: {} });

test('중지 버튼·중단 안내·복구; 취소를 무시한 이전 응답과 finally가 새 요청을 덮어쓰지 않는다', async () => {
  const h = harness();
  const first = h.run();
  assert.equal(h.send.textContent, '중지'); assert.equal(h.send.disabled, false); assert.equal(h.reset.disabled, true);
  assert(h.classes.has('stop-btn'));
  h.stop();
  assert.equal(h.pending[0]!.signal.aborted, true);
  assert.equal(h.send.textContent, '보내기'); assert.equal(h.reset.disabled, false);
  assert.equal(h.shown.length, 1); assert.equal(h.shown[0]!.text, '답변 생성을 중지했어요.');
  const second = h.run();
  h.pending[0]!.resolve(result('이전 응답')); await first;
  assert.equal(h.send.textContent, '중지'); assert.equal(h.reset.disabled, true);
  assert.deepEqual(h.state.recommendedBooks, []);
  assert(!JSON.stringify(h.shown).includes('이전 응답'));
  h.pending[1]!.resolve(result('새 응답')); await second;
  assert.equal(h.send.textContent, '보내기'); assert.equal(h.reset.disabled, false); assert(!h.classes.has('stop-btn'));
  assert.equal(h.state.recommendedBooks.length, 1);
  assert(!JSON.stringify(h.persisted).includes('이전 응답'));
  assert(JSON.stringify(h.persisted).includes('새 응답'));
});

test('중지 후 늦은 오류를 출력하지 않고 계정 전환 시 A 응답·중단 안내를 B에 쓰지 않는다', async () => {
  const h = harness();
  const first = h.run(); h.stop();
  h.pending[0]!.reject(new Error('late failure')); await first;
  assert.equal(h.shown.length, 1);
  const next = h.run(); const count = h.shown.length;
  h.changeAccount();
  assert(h.pending[1]!.signal.aborted);
  h.pending[1]!.resolve(result('A 비공개 응답')); await next;
  assert.equal(h.shown.length, count); assert.deepEqual(h.state.recommendedBooks, []);
  assert(!JSON.stringify(h.persisted).includes('A 비공개 응답'));
});

test('실제 오류 뒤에도 전송·새 세션 버튼을 복구하고 다음 요청을 처리한다', async () => {
  const h = harness(); const first = h.run();
  h.pending[0]!.reject(new Error('network failed')); await first;
  assert.equal(h.send.textContent, '보내기'); assert.equal(h.reset.disabled, false);
  assert(h.shown[0]!.text.includes('지금은 책 정보를 확인할 수 없어'));
  const second = h.run(); h.pending[1]!.resolve(result('정상 응답')); await second;
  assert.equal(h.state.recommendedBooks.length, 1);
});
