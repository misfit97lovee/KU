import type { GeminiResponse } from '../src/types/index.ts';

export interface ReadingContent {
  role: 'user' | 'model';
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
}

export async function callReadingGemini(contents: ReadingContent[], systemInstruction: string, apiKey: string,
  model = 'gemini-flash-lite-latest', timeoutMs = 12000, request: typeof fetch = fetch): Promise<{ text: string; modelUsed: string }> {
  if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다.');
  // One request, including for 503/429/timeouts. No model cascade or hidden retries.
  const response = await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        temperature: 0.7, topP: 0.95, maxOutputTokens: 2048,
        ...(/^gemini-2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {})
      }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const data = await response.json() as GeminiResponse;
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
  const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('');
  if (!text) throw new Error('Gemini 응답 텍스트가 없습니다.');
  return { text, modelUsed: model };
}
