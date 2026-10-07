import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReadingRequest } from '../src/readingRequest.ts';
import { compactReadingBody } from '../server/readingContext.ts';
import { callReadingGemini } from '../server/readingGemini.ts';
import type { ReadingState } from '../src/types/index.ts';

test('최근 6개만 전송, 오래된 대화 압축, 이미지/TAO/전체 상태 제외', () => {
  const state: ReadingState = { student: { grade: '중2' }, book: { title: '코스모스' }, taoLogs: [], session: {
    recentMessages: Array.from({ length: 100 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `대화 ${i}: ${'설명'.repeat(300)}`,
      image: { data: 'base64-photo', mimeType: 'image/png' }, evidence: [], isExplanation: true, isQuizQuestion: false, timestamp: i })),
    difficultPoints: Array(100).fill('별'), understoodPoints: [], comprehensionChecks: [], summary: '앞서 별의 탄생을 설명했다.',
    readingNote: '긴 독서노트', suggestedQuestions: [], isQuizActive: false
  } };
  const body = buildReadingRequest(state);
  assert.equal(body.messages.length, 6);
  assert.ok(body.conversationSummary.includes(state.session.summary!));
  assert.ok(body.conversationSummary.length <= 3000);
  assert.ok(!JSON.stringify(body).includes('base64-photo'));
  assert.ok(!JSON.stringify(body).includes('긴 독서노트'));
  assert.equal(body.readingState.session.difficultPoints.length, 3);
  assert.ok(JSON.stringify(body).length < JSON.stringify(state).length / 5);
  const bounded = compactReadingBody({ messages: state.session.recentMessages, readingState: state });
  assert.equal(bounded.messages.length, 6);
  assert.equal(bounded.image, null);
});

test('일반 텍스트는 text part만; 성공/503 모두 Gemini 1회 호출', async () => {
  for (const status of [200, 503]) {
    let calls = 0;
    const request: typeof fetch = async (_url, options) => {
      calls++;
      const payload = JSON.parse(String(options?.body));
      assert.deepEqual(payload.contents, [{ role: 'user', parts: [{ text: '별이 뭔가요?' }] }]);
      assert.equal(payload.generationConfig.thinkingConfig.thinkingBudget, 0);
      assert.equal(payload.tools, undefined);
      assert.ok(options?.signal);
      return new Response(JSON.stringify(status === 200 ? { candidates: [{ content: { parts: [{ text: '별은 빛을 냅니다.' }] } }] } : { error: { message: 'busy' } }), { status });
    };
    const result = callReadingGemini([{ role: 'user', parts: [{ text: '별이 뭔가요?' }] }], '도우미', 'test-key', 'gemini-2.5-flash', 12000, request);
    if (status === 503) await assert.rejects(result, /503/);
    else assert.equal((await result).text, '별은 빛을 냅니다.');
    assert.equal(calls, 1);
  }
});
