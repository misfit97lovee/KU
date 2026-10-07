import { buildReadingRequest } from '../src/readingRequest.ts';
import type { ReadingState, ReadingApiResponse } from '../src/types/index.ts';

const state: ReadingState = { student: { grade: '중2' }, book: { title: '어린 왕자' }, taoLogs: [], session: {
  recentMessages: [], difficultPoints: [], understoodPoints: [], comprehensionChecks: [],
  summary: null, readingNote: null, suggestedQuestions: [], isQuizActive: false
} };
const questions = [
  '어린 왕자에서 친구와 관계를 맺는다는 의미를 2문장으로 바로 설명해줘.',
  '그 의미를 학교 친구와의 일상적인 예로 설명해줘.',
  '그럼 친구에게 시간을 쓰는 것이 왜 중요할까? 2문장으로 알려줘.'
];
const measurements: number[] = [];
for (const [index, question] of questions.entries()) {
  state.session.recentMessages.push({ role: 'user', content: question, image: null, evidence: [], isExplanation: true, isQuizQuestion: false, timestamp: Date.now() });
  const body = buildReadingRequest(state);
  const started = performance.now();
  const response = await fetch(`${process.env.READING_TEST_URL || 'http://localhost:3002'}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
  });
  const data = await response.json() as ReadingApiResponse;
  const elapsed = Number(((performance.now() - started) / 1000).toFixed(3));
  console.log(JSON.stringify({ turn: index + 1, seconds: elapsed, status: response.status, payloadBytes: Buffer.byteLength(JSON.stringify(body)), message: data.message || data.error }));
  if (!response.ok || !data.message) throw new Error('Actual reading response failed');
  measurements.push(elapsed);
  state.session.recentMessages.push({ role: 'assistant', content: data.message, image: null, evidence: data.evidence || [], isExplanation: true, isQuizQuestion: false, timestamp: Date.now() });
}
console.log(JSON.stringify({ seconds: measurements, average: Number((measurements.reduce((a, b) => a + b, 0) / measurements.length).toFixed(3)) }));
