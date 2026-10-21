// Responses SSE transport. Never treat deltas or an incomplete stream as a
// successful response; the caller validates the completed response as usual.
export async function readResponsesStream(response: Response, onDelta: (text: string) => void): Promise<unknown> {
  if (!response.body) throw new Error('Missing response stream');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', completed: unknown;
  const event = (block: string) => {
    const payload = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!payload || payload === '[DONE]') return;
    const data = JSON.parse(payload);
    if (data.type === 'response.output_text.delta' && typeof data.delta === 'string') onDelta(data.delta);
    if (data.type === 'response.completed') completed = data.response;
    if (['error', 'response.failed', 'response.incomplete'].includes(data.type)) throw new Error('Stream failed');
  };
  try {
    for (;;) {
      const {done,value} = await reader.read();
      buffer = (buffer + decoder.decode(value, {stream:!done})).replace(/\r\n/g,'\n');
      let boundary: number;
      while ((boundary=buffer.indexOf('\n\n'))>=0) { event(buffer.slice(0,boundary)); buffer=buffer.slice(boundary+2); }
      if (done) break;
    }
    if (buffer.trim()) event(buffer);
    if (!completed) throw new Error('Stream did not complete');
    return completed;
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
}
