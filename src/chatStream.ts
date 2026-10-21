import type { ReadingApiResponse } from './types/index.ts';

// Decode only a JSON string value, never show JSON syntax or execute markup.
// An unfinished escape/unicode sequence is held until the next chunk.
export function partialMessage(json: string): string {
  const match = json.match(/"message"\s*:\s*"/u);
  if (!match || match.index === undefined) return '';
  const start = match.index + match[0].length;
  let end = start;
  while (end < json.length) {
    if (json[end] === '"') break;
    if (json[end] === '\\') {
      const escapeLength = json[end+1] === 'u' ? 6 : 2;
      if (end+escapeLength > json.length) break;
      end += escapeLength;
    } else end++;
  }
  try { return JSON.parse('"'+json.slice(start,end)+'"'); } catch { return ''; }
}

export async function readChatResponse(response: Response, signal: AbortSignal, onMessage: (message: string) => void): Promise<ReadingApiResponse> {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    signal.throwIfAborted(); const data = await response.json() as ReadingApiResponse; signal.throwIfAborted(); return data;
  }
  if (!response.body) throw new Error('답변을 받지 못했어요.');
  const reader=response.body.getReader(), decoder=new TextDecoder();
  let buffer='', result: ReadingApiResponse | undefined;
  const abort=()=>{ void reader.cancel(); };
  signal.addEventListener('abort',abort,{once:true});
  try {
    for (;;) {
      signal.throwIfAborted();
      const {value,done}=await reader.read(); signal.throwIfAborted();
      buffer=(buffer+decoder.decode(value,{stream:!done})).replace(/\r\n/g,'\n');
      let boundary: number;
      while((boundary=buffer.indexOf('\n\n'))>=0) {
        const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
        const raw=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5)).join('\n');
        if (!raw) continue;
        const event=JSON.parse(raw);
        if(event.type==='message' && typeof event.message==='string') onMessage(event.message);
        if(event.type==='done') result=event.data;
        if(event.type==='error') throw new Error('설명을 만드는 중 문제가 생겼어요. 다시 시도해 주세요.');
      }
      if(done) break;
    }
    if(!result?.message) throw new Error('답변이 완료되지 않았어요. 다시 시도해 주세요.');
    return result;
  } finally { signal.removeEventListener('abort',abort); await reader.cancel().catch(()=>{});reader.releaseLock(); }
}
