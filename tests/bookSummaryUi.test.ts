import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';

class Element {
  textContent = ''; className = ''; type = ''; id = ''; hidden = false; isConnected = true;
  children: Element[] = []; attributes = new Map<string, string>(); listeners = new Map<string, () => void>();
  append(...children: Element[]) { this.children.push(...children); }
  prepend(child: Element) { this.children.unshift(child); }
  replaceChildren() { this.children = []; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  addEventListener(event: string, callback: () => void) { this.listeners.set(event, callback); }
  click() { this.listeners.get('click')?.(); }
  set innerHTML(_value: string) { throw Error('Summary must not render untrusted HTML'); }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const source = readFileSync(new URL('../curator/bookSummary.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  let calls = 0, fail = false, missing = false;
  const runtime = vm.createContext({ module: { exports: {} }, exports: {}, document: { createElement: () => new Element() },
    crypto: { randomUUID: () => String(Math.random()) }, AbortSignal, Error,
    accountFetch: async (_url: string, init: RequestInit) => {
      calls++; const isbn = JSON.parse(String(init.body)).isbn13;
      return { ok: !fail, json: async () => fail ? { error: 'retry' } : missing ? { available: false, message: '확인된 소개가 부족해요.' } : { available: true, sentences: [isbn, '<img src=x onerror=alert(1)>', '세 번째 문장'], features: ['특징 1', '특징 2'] } };
    } });
  vm.runInContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, runtime);
  const mount = (isbn13: string) => {
    const actions = new Element(), card = new Element();
    Object.assign(card, { querySelector: () => actions });
    Object.assign(runtime, { testCard: card, testBook: { title: '책', isbn13 } });
    vm.runInContext('mountBookSummary(testCard,testBook)', runtime);
    return { button: actions.children[0]!, region: card.children[0]! };
  };
  return { mount, calls: () => calls, fail: (value: boolean) => { fail = value; }, missing: () => { missing = true; } };
}

test('실제 카드 요약 코드: 펼치기/접기·연속 클릭 병합·다른 책 분리·XSS 없는 텍스트 렌더링', async () => {
  const h = harness(), a = h.mount('9780000000001'), b = h.mount('9780000000002');
  a.button.click(); a.button.click(); a.button.click(); await flush();
  assert.equal(h.calls(), 1); assert.equal(a.region.hidden, false); assert.equal(a.button.textContent, '요약 접기');
  assert(a.region.children[0]!.textContent.includes('<img')); assert.equal(a.region.children[0]!.children.length, 0);
  a.button.click(); assert(a.region.hidden); a.button.click(); await flush(); assert.equal(h.calls(), 1);
  b.button.click(); await flush(); assert.equal(h.calls(), 2);
  assert.notEqual(a.region.children[0]!.textContent, b.region.children[0]!.textContent);
});

test('요약 실패 후 같은 영역에서 다시 받기 가능, 키나 소개를 클라이언트 요청에 넣지 않는다', async () => {
  const h = harness(); h.fail(true); const card = h.mount('9780000000001');
  card.button.click(); await flush(); assert.equal(h.calls(), 1);
  const retry = card.region.children.at(-1)!; assert.equal(retry.textContent, '다시 받기');
  h.fail(false); retry.click(); await flush(); assert.equal(h.calls(), 2);
  assert(card.region.children[0]!.textContent.includes('9780000000001'));
});

test('정보 부족과 ISBN 없는 카드에서는 안내만 표시하며 요약을 만들지 않는다', async () => {
  const h = harness(); h.missing(); const a = h.mount('9780000000001'); a.button.click(); await flush();
  assert.equal(a.region.children[0]!.textContent, '확인된 소개가 부족해요.');
  assert.equal(a.region.children.length, 2);
  const b = h.mount(''); b.button.click(); await flush(); assert.equal(h.calls(), 1);
  assert(b.region.children[0]!.textContent.includes('정보가 부족'));
});
