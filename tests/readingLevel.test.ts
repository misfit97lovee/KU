import test from 'node:test';
import assert from 'node:assert/strict';
import { setAccount } from '../src/accountStorage.ts';
import { buildReadingRequest } from '../src/readingRequest.ts';
import { compactReadingBody } from '../server/readingContext.ts';
import { buildSystemPrompt } from '../server/prompts.ts';
import type { ReadingLevel } from '../src/types/index.ts';

test('독서 수준은 계정별로 저장·복원하고 기존 프로필과 로그아웃은 중급으로 초기화한다', async () => {
  const values = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  } as Storage;
  values.set('unrelated', 'keep');
  values.set('pageon:user:level-A:reading-agent-profile', JSON.stringify({ grade: '중1' }));
  setAccount('level-A');
  const { stateManager } = await import('../src/state.ts');
  assert.equal(stateManager.state.student.readingLevel, '중급');
  assert.equal(stateManager.state.student.readingLevelSelected, false);
  stateManager.setReadingLevel('입문');
  assert.equal(stateManager.loadState().student.readingLevel, '입문');
  assert.equal(stateManager.loadState().student.readingLevelSelected, true);
  stateManager.resetSession();
  assert.equal(stateManager.state.student.readingLevel, '입문');
  setAccount(null);
  assert.equal(stateManager.state.student.readingLevel, '중급');
  setAccount('level-B');
  stateManager.setGrade('중3');
  stateManager.setReadingLevel('심화');
  setAccount('level-A');
  assert.equal(stateManager.state.student.grade, '중1');
  assert.equal(stateManager.state.student.readingLevel, '입문');
  setAccount('level-B');
  assert.equal(stateManager.state.student.readingLevel, '심화');
  assert.equal(values.get('unrelated'), 'keep');
  // Skipping the selection stores the default and completes onboarding.
  stateManager.setReadingLevel('중급');
  assert.equal(stateManager.loadState().student.readingLevelSelected, true);
  const request = buildReadingRequest(stateManager.state);
  assert.deepEqual(request.readingState.student, { grade: '중3', readingLevel: '중급' });
  setAccount(null);
});

test('서버는 세 수준만 허용하고 이전 클라이언트·잘못된 입력은 중급을 사용한다', () => {
  for (const value of [undefined, null, 'invalid', '<script>', {}]) {
    assert.equal(compactReadingBody({ readingState: { student: { readingLevel: value } } }).readingState.student.readingLevel, '중급');
  }
  for (const readingLevel of ['입문', '중급', '심화']) {
    assert.equal(compactReadingBody({ readingState: { student: { readingLevel } } }).readingState.student.readingLevel, readingLevel);
  }
});

test('기존 대화·설명 전환·이해 확인 프롬프트에 학년과 수준별 설명 및 질문 조건을 함께 반영한다', () => {
  const expectations: Record<ReadingLevel, string[]> = {
    '입문': ['쉬운 단어', '한 단계씩', '사건 순서'],
    '중급': ['문맥', '인물의 심리', '동기를 추론'],
    '심화': ['상징·주제·비판적 해석', '본문 근거', '해석을 비교']
  };
  for (const readingLevel of Object.keys(expectations) as ReadingLevel[]) {
    for (const mode of [null, 'simple', 'detailed', 'quiz_request']) {
      const prompt = buildSystemPrompt({ student: { grade: '중1', readingLevel } }, mode);
      assert(prompt.includes(`독서 수준: ${readingLevel} (학년 중1와 함께 반영)`));
      assert(prompt.includes('이해도 확인 질문'));
      for (const instruction of expectations[readingLevel]) assert(prompt.includes(instruction));
      assert(prompt.includes('[핵심 대화 원칙]'));
    }
  }
  assert(buildSystemPrompt({}).includes('독서 수준: 중급'));
});
