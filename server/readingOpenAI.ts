import { callResponses, DEFAULT_OPENAI_MODEL } from './openai.ts';

export interface ReadingContent {
  role: 'user' | 'model';
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
}

export async function callReadingOpenAI(contents: ReadingContent[], systemInstruction: string, apiKey: string,
  model = DEFAULT_OPENAI_MODEL, timeoutMs = 12000, request: typeof fetch = fetch,
  stream?: { onTextDelta: (text: string) => void; signal: AbortSignal }): Promise<{ text: string; modelUsed: string }> {
  const input = contents.map(content => ({ role: content.role === 'model' ? 'assistant' : 'user',
    content: content.parts.some(part => 'inlineData' in part)
      ? content.parts.map(part => 'inlineData' in part
        ? { type: 'input_image', image_url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }
        : { type: 'input_text', text: part.text })
      : content.parts.map(part => 'text' in part ? part.text : '').join('\n') }));
  const result = await callResponses({ apiKey, model, input, system: systemInstruction, json: true, timeoutMs, request, ...stream });
  return { text: result.text, modelUsed: result.modelUsed || model };
}
