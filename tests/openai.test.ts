import test from 'node:test';
import assert from 'node:assert/strict';
import { callResponses } from '../server/openai.ts';
import { callReadingOpenAI } from '../server/readingOpenAI.ts';

test('GPT 인증/요청 제한/장애는 1회 실패하고 공급자 본문·키·입력은 로그에 노출하지 않는다', async () => {
  for (const status of [401, 429, 503]) {
    let count = 0;
    const events: unknown[] = [];
    await assert.rejects(callResponses({ apiKey: 'private-key', baseUrl: 'https://provider.example/v1',
      system: 'JSON', input: 'private-reading-text', onEvent: event => events.push(event),
      request: async (url, options) => {
        count++;
        assert.equal(String(url), 'https://provider.example/v1/responses');
        assert.equal(options?.redirect, 'error');
        assert(!String(url).includes('private-key'));
        return new Response('private-key private-reading-text', { status });
      } }), new RegExp(`OpenAI HTTP ${status}`));
    assert.equal(count, 1);
    assert(!JSON.stringify(events).includes('private-key'));
    assert(!JSON.stringify(events).includes('private-reading-text'));
  }
});

test('Responses 중단·잘못된 JSON·출력 없음·거부는 성공으로 파싱하지 않는다', async () => {
  const bodies = [
    { status: 'incomplete', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] },
    { status: 'completed', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'refused' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'not json' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '[]' }] }] }
  ];
  for (const body of bodies) await assert.rejects(callResponses({ apiKey: 'test', baseUrl: 'https://provider.example/v1',
    system: 'JSON', input: 'test', json: true, onEvent: () => {}, request: async () => new Response(JSON.stringify(body)) }));
});

test('사진은 input_image data URL로 변환하며 일반/assistant 턴은 텍스트만 보낸다', async () => {
  await callReadingOpenAI([
    { role: 'user', parts: [{ text: '이전 질문' }] }, { role: 'model', parts: [{ text: '이전 답변' }] },
    { role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'dGVzdA==' } }, { text: '사진 질문' }] }
  ], 'JSON 응답', 'test', 'gpt-5.6-luna', 20000, async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, 'gpt-5.6-luna'); assert.equal(body.reasoning.effort, 'medium');
    assert.equal(body.store, false); assert.equal(body.temperature, undefined);
    assert.deepEqual(body.text, { format: { type: 'json_object' } });
    assert.equal(body.input[0].role, 'developer'); assert.match(body.input[0].content, /JSON/);
    assert.deepEqual(body.input.slice(1), [{ role: 'user', content: '이전 질문' }, { role: 'assistant', content: '이전 답변' },
      { role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,dGVzdA==' }, { type: 'input_text', text: '사진 질문' }] }]);
    return new Response(JSON.stringify({ status: 'completed', model: 'gpt-5.6-luna', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"message":"ok"}' }] }] }));
  });
});

test('timeout은 취소 신호로 중단하고 재시도하지 않는다', async () => {
  let calls = 0;
  const pending = callResponses({ apiKey: 'test', baseUrl: 'https://provider.example/v1', system: 'JSON', input: 'test', timeoutMs: 10, onEvent: () => {},
    request: async (_url, options) => {
      calls++;
      return new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError'))));
    } });
  await Promise.all([assert.rejects(pending, /OpenAI timeout/), new Promise(resolve => setTimeout(resolve, 30))]);
  assert.equal(calls, 1);
});
