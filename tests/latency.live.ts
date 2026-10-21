import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { buildReadingRequest } from '../src/readingRequest.ts';
import { readChatResponse } from '../src/chatStream.ts';
import { isCollectionLike, literaryWorkKey } from '../server/bookRecommendations.ts';

// Fresh process per pair ensures the cold sample cannot reuse application caches.
const cases = [
  ['classic', '한국의 고전명작 추천해줘'],
  ['mystery', '중학생이 읽기 좋은 미스터리 추리소설 추천해줘'],
  ['general', '중학생이 읽기 좋은 우주 과학책 추천해줘']
];
if (!process.env.LATENCY_CHILD) {
  const rows: any[] = [];
  for (let round = 0; round < 5; round++) for (const [name] of cases) {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url)], {
        env: { ...process.env, LATENCY_CHILD: name }, stdio: ['ignore', 'pipe', 'pipe']
      });
      let result = ''; child.stdout.on('data', chunk => { result += chunk; });
      child.stderr.on('data', () => {});
      child.on('exit', code => code ? reject(new Error(`Live benchmark failed: ${name}`)) : resolve(result));
    });
    for (const line of output.split('\n').filter(line => line.startsWith('METRIC '))) {
      const row = { round: round + 1, ...JSON.parse(line.slice(7)) }; rows.push(row); console.log('SAMPLE ' + JSON.stringify(row));
    }
  }
  for (const name of [...cases.map(c => c[0]), 'chat']) for (const cache of name === 'chat' ? ['none'] : ['cold', 'warm']) {
    const group = rows.filter(r => r.name === name && r.cache === cache), times = group.map(r => r.ms).sort((a,b) => a-b);
    console.log('SUMMARY ' + JSON.stringify({ label: process.env.MEASUREMENT_LABEL, name, cache, n: times.length,
      averageMs: Math.round(times.reduce((a,b) => a+b,0)/times.length), p95Ms: times[Math.ceil(times.length*.95)-1],
      failures: group.filter(r => !r.ok).length, averageAiCalls: group.reduce((n,r) => n+r.aiCalls,0)/group.length,
      averageSearchCalls: group.reduce((n,r) => n+r.searchCalls,0)/group.length }));
    if(name==='chat' && group.some(r=>r.firstMessageMs)) {
      const first=group.map(r=>r.firstMessageMs).sort((a,b)=>a-b);
      console.log('FIRST_MESSAGE '+JSON.stringify({averageMs:Math.round(first.reduce((a,b)=>a+b,0)/first.length),p95Ms:first[Math.ceil(first.length*.95)-1]}));
    }
  }
} else {
  process.env.NODE_ENV = 'test';
  let aiCalls = 0, searchCalls = 0; const ai: any[] = [];
  const originalFetch = globalThis.fetch, originalLog = console.log;
  console.log = (...args) => {
    if (/OpenAI|Book recommendation/.test(String(args[0]))) {
      try { const event = JSON.parse(String(args[1])); if (['response','first_token','headers'].includes(event.event)) ai.push(event); } catch {}
    }
  };
  globalThis.fetch = async (url, options) => {
    const address = new URL(String(url));
    if (address.pathname.endsWith('/responses')) aiCalls++;
    if (/yes24|data4library/.test(address.hostname)) searchCalls++;
    const response = await originalFetch(url, options);
    if (address.pathname.endsWith('/responses') && response.status === 401) throw new Error('Authentication failed');
    return response;
  };
  const { app } = await import('../server/server.ts');
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const [name, userMessage] = cases.find(c => c[0] === process.env.LATENCY_CHILD)!;
    for (const cache of ['cold', 'warm']) {
      aiCalls = 0; searchCalls = 0; ai.length = 0; const start = performance.now();
      const response = await fetch(base + '/api/recommend-books', { method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({userMessage, userGrade:'중2'}), signal: AbortSignal.timeout(35000) });
      const data = await response.json();
      const quality = Boolean(data.books?.length) && data.books.every((book:any)=>book.title && book.author && book.isbn13 && !isCollectionLike(book))
        && new Set(data.books.map(literaryWorkKey)).size === data.books.length;
      originalLog('METRIC ' + JSON.stringify({name, cache, ms: Math.round(performance.now()-start), ok: response.ok && data.books?.length > 0 && !data.search?.failures?.length,
        aiCalls, searchCalls, ai, quality, titles: data.books?.map((b:any) => b.title), failures: data.search?.failures}));
    }
    if (name === 'classic') {
      aiCalls = 0; searchCalls = 0; ai.length = 0; const start = performance.now();
      const body = buildReadingRequest({ student:{grade:'중2'}, book:{title:'어린 왕자'}, taoLogs:[], session:{recentMessages:[{
        role:'user', content:'친구에게 시간을 쓰는 것이 왜 중요할까? 2문장으로 알려줘.', timestamp:0, image:null, evidence:[], isExplanation:true, isQuizQuestion:false
      }], difficultPoints:[],understoodPoints:[],comprehensionChecks:[],summary:null,readingNote:null,suggestedQuestions:[],isQuizActive:false} });
      const response = await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',...(process.env.STREAM_CHAT?{Accept:'text/event-stream'}:{})},body:JSON.stringify(body)});
      let firstMessageMs:number|undefined;
      const data = await readChatResponse(response,new AbortController().signal,()=>{firstMessageMs??=Math.round(performance.now()-start);});
      originalLog('METRIC '+JSON.stringify({name:'chat', cache:'none',ms:Math.round(performance.now()-start),firstMessageMs,ok:response.ok&&Boolean(data.message),aiCalls,searchCalls,ai}));
    }
  } finally { globalThis.fetch = originalFetch; await new Promise<void>(resolve => server.close(() => resolve())); }
}
