import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import { createGeminiRecommendationClient, getGroundedEvidence } from '../server/bookRecommendations.ts';
dotenv.config();
const generate = createGeminiRecommendationClient({ apiKey: (process.env.GEMINI_API_KEY || process.env.GEMINI_API || '').trim(), model: process.env.GEMINI_MODEL,
  searchModel: process.env.GEMINI_SEARCH_MODEL || process.env.GEMINI_MODEL,
  onEvent: event => console.log(JSON.stringify(event)) });
try {
  const result = await generate({ stage: 'google_search', search: true,
    system: '반드시 실제 Google Search 도구를 사용하고 출처를 인용한다. 제목과 저자는 같은 문장에 쓴다. 그 책의 소개와 난이도도 확인하여 같은 출처를 인용한다. 모르는 정보는 만들지 않는다.',
    prompt: '난이도가 높고 깊이 있는 물리학 책을 원해. 실제 출판사나 서점 정보에서 확인할 수 있는 책을 2권 찾아줘.' });
  await fs.writeFile('/tmp/ku-grounding-probe.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ text: result.text, evidence: getGroundedEvidence(result) }, null, 2));
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
