import { readFileSync } from 'node:fs';
import type { AIGenerationResult, GroundingMetadata } from '../src/types/index.ts';
import { readResponsesStream } from './responsesStream.ts';

export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';
export const DEFAULT_REASONING_EFFORT = 'medium';

export function getOpenAIConfig() {
  let legacyAddress = '';
  try {
    // Compatibility with the user's existing standalone address line. Never
    // rewrite .env or persist keys. Prefer a named URL setting for new setups.
    const lines = readFileSync('.env', 'utf8').split('\n');
    const line = lines.find(line => !/^\s*(?:#|[A-Za-z_][A-Za-z_0-9]*\s*=)/.test(line) && /https:\/\//.test(line));
    legacyAddress = line?.match(/https:\/\/[^\s"'<>#]+/)?.[0] || '';
  } catch { /* Environment-only deployments need no .env file. */ }
  return {
    apiKey: (process.env.GPT_API || process.env.GPT || process.env.OPENAI_API_KEY || '').trim(),
    baseUrl: process.env.OPENAI_BASE_URL || process.env.GPT_API_URL || legacyAddress || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    readingModel: process.env.OPENAI_READING_MODEL || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    recommendationModel: process.env.OPENAI_RECOMMENDATION_MODEL || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL
  };
}

interface OutputText {
  type?: string; text?: string;
  annotations?: Array<{ type?: string; url?: string; start_index?: number; end_index?: number }>;
}
interface ResponsesBody {
  status?: string; model?: string;
  output?: Array<{ type?: string; action?: { query?: string; queries?: string[] }; content?: OutputText[] }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}
export interface ResponsesOptions {
  apiKey: string; model?: string; baseUrl?: string;
  input: unknown; system: string; json?: boolean; search?: boolean;
  timeoutMs?: number; maxOutputTokens?: number; stage?: string;
  request?: typeof fetch; onEvent?: (event: Record<string, unknown>) => void;
  onTextDelta?: (text: string) => void; signal?: AbortSignal;
}

export async function callResponses({ apiKey, model = DEFAULT_OPENAI_MODEL, baseUrl = getOpenAIConfig().baseUrl,
  input, system, json = false, search = false, timeoutMs = 12000, maxOutputTokens = 4096,
  stage = 'reading', request = fetch, onTextDelta, signal, onEvent = event => console.log('[OpenAI]', JSON.stringify(event)) }: ResponsesOptions): Promise<AIGenerationResult> {
  if (!apiKey) throw new Error('GPT_API 키가 설정되지 않았습니다.');
  const endpoint = new URL(baseUrl.replace(/\/$/, '') + '/responses');
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid GPT API address');
  const started = Date.now();
  const log = (event: Record<string, unknown>) => onEvent({ stage, provider: endpoint.hostname, model, ...event, elapsedMs: Date.now() - started });
  log({ event: 'request' });
  try {
    // The gateway validates JSON mode against input messages, not instructions.
    // Keep the application prompts intact and add only the output contract.
    const apiInput = json && !search ? [{ role: 'developer', content: 'Return a JSON object using the output format in the instructions.' },
      ...(Array.isArray(input) ? input : [{ role: 'user', content: input }])] : input;
    // Exactly one request. No retries or model cascades on 401/429/503/timeout.
    const response = await request(endpoint, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: apiInput, instructions: system,
        reasoning: { effort: DEFAULT_REASONING_EFFORT }, max_output_tokens: maxOutputTokens, store: false,
        ...(onTextDelta ? { stream: true } : {}),
        ...(json && !search ? { text: { format: { type: 'json_object' } } } : {}),
        ...(search ? { tools: [{ type: 'web_search' }], tool_choice: 'required' } : {}) }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, timeoutMs))]) : AbortSignal.timeout(Math.max(1, timeoutMs))
    });
    if (!response.ok) {
      log({ event: 'error', status: response.status });
      throw new Error(`OpenAI HTTP ${response.status}`);
    }
    log({ event: 'headers', status: response.status });
    let firstToken = true;
    const data = await (onTextDelta && response.headers.get('content-type')?.includes('text/event-stream')
      ? readResponsesStream(response, delta => { if (firstToken) { log({ event: 'first_token' }); firstToken = false; } onTextDelta(delta); })
      : response.json()) as ResponsesBody;
    if (data.status !== 'completed') throw new Error('OpenAI response incomplete');
    const parts = (data.output || []).filter(item => item.type === 'message').flatMap(item => item.content || [])
      .filter(part => part.type === 'output_text' && typeof part.text === 'string');
    const text = parts.map(part => part.text).join('\n');
    if (!text.trim()) throw new Error('OpenAI response contains no text');
    if (json && !search) {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('OpenAI JSON object required');
    }
    const metadata: GroundingMetadata = { webSearchQueries: [], groundingChunks: [], groundingSupports: [] };
    // Adapt actual web-search execution/citations to the existing grounding
    // validation contract. Uncited model text never becomes book evidence.
    for (const item of data.output || []) {
      if (item.type === 'web_search_call') metadata.webSearchQueries!.push(...(item.action?.queries || (item.action?.query ? [item.action.query] : [])));
    }
    for (const part of parts) for (const citation of part.annotations || []) {
      const { start_index: start, end_index: end, url } = citation;
      if (citation.type !== 'url_citation' || !url || !Number.isInteger(start) || !Number.isInteger(end) || start! < 0 || end! <= start! || end! > part.text!.length) continue;
      const index = metadata.groundingChunks!.push({ web: { uri: url } }) - 1;
      const segmentStart = part.text!.lastIndexOf('\n', start! - 1) + 1;
      metadata.groundingSupports!.push({ segment: { text: part.text!.slice(segmentStart, end) }, groundingChunkIndices: [index] });
    }
    log({ event: 'response', model: data.model || model,
      inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens });
    return { text, modelUsed: data.model || model, groundingMetadata: search ? metadata : null };
  } catch (error) {
    log({ event: 'failed', reason: error instanceof Error && /timeout|abort/iu.test(error.name) ? 'timeout' : 'request_failed' });
    throw error instanceof Error && /^OpenAI HTTP \d{3}$/.test(error.message) ? error
      : new Error(error instanceof Error && /timeout|abort/iu.test(error.name) ? 'OpenAI timeout' : 'OpenAI response unavailable');
  }
}
