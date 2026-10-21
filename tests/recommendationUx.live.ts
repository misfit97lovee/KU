import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import type { AddressInfo } from 'node:net';
import { getOpenAIConfig } from '../server/openai.ts';
import { isCollectionLike, getBaseTitle } from '../server/bookRecommendations.ts';

// Public test inputs only; no keys or response files are written.
process.env.NODE_ENV = 'test';
const config = getOpenAIConfig();
console.log(JSON.stringify({ provider: new URL(config.baseUrl).hostname, model: config.recommendationModel }));
const originalFetch = globalThis.fetch;
let metrics: Array<{ kind: string; ms: number; status: number }> = [];
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  const kind = url.pathname.endsWith('/responses') ? 'ai' : url.hostname.includes('yes24') ? 'yes24' : url.hostname.includes('data4library') ? 'library' : '';
  if (!kind) return originalFetch(input, options);
  const metric = { kind, ms: 0, status: 0 }; metrics.push(metric);
  const start = performance.now();
  try { const response = await originalFetch(input, options); metric.status = response.status; return response; }
  finally { metric.ms = Math.round(performance.now() - start); }
};
const { app } = await import('../server/server.ts');
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const inputs = process.argv.slice(2).length ? process.argv.slice(2) : ['한국의 고전명작 추천해줘'];
try {
  for (const userMessage of inputs) {
    metrics = []; const start = performance.now();
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/recommend-books`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userMessage, userGrade: '중2' }), signal: AbortSignal.timeout(30000)
    });
    const data = await response.json();
    console.log(JSON.stringify({ label: process.env.MEASUREMENT_LABEL || 'measure', userMessage, status: response.status,
      totalMs: Math.round(performance.now() - start), calls: metrics, count: data.books?.length,
      titles: data.books?.map((b: {title:string}) => b.title), collections: data.books?.filter(isCollectionLike).length,
      uniqueWorks: new Set(data.books?.map((b: {title:string}) => getBaseTitle(b.title))).size,
      failures: data.search?.failures, clarification: Boolean(data.clarification) }));
    if (metrics.some(m => m.kind === 'ai' && m.status === 401)) throw new Error('Authentication failed; stopping API work');
    if (process.env.ASSERT_UX === 'true' && /한국.*고전/.test(userMessage)) {
      if (!data.books?.length || data.books.some(isCollectionLike)) throw new Error('Expected individual classical works');
      if (new Set(data.books.map((b: {title:string}) => getBaseTitle(b.title))).size !== data.books.length) throw new Error('Duplicate works');
    }
  }
} finally { globalThis.fetch = originalFetch; await new Promise<void>(resolve => server.close(() => resolve())); }
