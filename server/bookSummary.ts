import { Router } from 'express';
import { cacheBookSearch } from './bookSearchCache.ts';
import type { Book, BookSummaryResponse } from '../src/types/index.ts';

export const SUMMARY_ATTRIBUTION = '도서 소개 정보를 바탕으로 정리한 내용입니다';
const insufficient = (): BookSummaryResponse => ({ available: false, sentences: [], features: [],
  message: '확인된 도서 소개 정보가 부족해 요약을 제공하기 어려워요.', attribution: SUMMARY_ATTRIBUTION });

// Only public publisher/store introduction text, never book text or client data.
export function introductionSentences(html: string): string[] {
  const text = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, '')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/giu, '\n').replace(/<[^>]*>/gu, '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|\d+);/giu, entity => {
      const known: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
      if (known[entity.toLowerCase()]) return known[entity.toLowerCase()]!;
      const number = entity.toLowerCase().startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '';
    });
  return [...new Set(text.split(/(?<=[.!?。])(?:\s+|$)|\n+/u).map(line => line.replace(/\s+/gu, ' ').trim())
    .filter(line => line.length >= 20 && line.length <= 240 && /[.!?。]$/u.test(line)
      && !/(?:\.{2,}|…)$/u.test(line)
      && !/ignore\s+(?:all\s+)?previous|(?:이전|시스템).{0,15}(?:지시|규칙).{0,15}무시|비밀키|api[_ ]?key/iu.test(line)))].slice(0, 35);
}

interface SummaryOptions {
  lookup: (isbn: string) => Promise<Book[]>;
  generate: (sentences: string[], options: { signal: AbortSignal; timeoutMs: number }) => Promise<{ text: string }>;
}

export function createBookSummaryService({ lookup, generate }: SummaryOptions) {
  return cacheBookSearch(async (isbn: string): Promise<BookSummaryResponse> => {
    if (!/^97[89]\d{10}$/u.test(isbn)) throw Error('Invalid ISBN');
    const controller = new AbortController();
    const deadline = Date.now() + 15000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const books = await lookup(isbn);
          controller.signal.throwIfAborted();
          const book = books.find(book => book.isbn13 === isbn);
          if (!book?.description) return insufficient();
          const sentences = introductionSentences(book.description);
          if (sentences.length < 3) return insufficient();
          const output = await generate(sentences, { signal: controller.signal, timeoutMs: Math.max(1, deadline - Date.now()) });
          controller.signal.throwIfAborted();
          const result = JSON.parse(output.text) as Record<string, unknown>;
          if (!result || typeof result.sufficient !== 'boolean') throw Error('Invalid summary');
          if (!result.sufficient) return insufficient();
          const select = (ids: unknown, min: number, max: number): string[] => {
            if (!Array.isArray(ids) || ids.length < min || ids.length > max || new Set(ids).size !== ids.length
              || ids.some(id => !Number.isInteger(id) || id < 0 || id >= sentences.length)) throw Error('Invalid summary evidence');
            return ids.map(id => sentences[id]!);
          };
          // The model can select evidence IDs only. No generated factual text
          // enters the response, so a fabricated plot/ending cannot be shown.
          return { available: true, sentences: select(result.summaryIds, 3, 4), features: select(result.featureIds, 2, 3), attribution: SUMMARY_ATTRIBUTION };
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => {
          controller.abort(); reject(new Error('Summary timeout'));
        }, 15000); })
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }, { stage: 'book_summary', ttlMs: 600000, maxEntries: 64 });
}

export function createBookSummaryRouter(summarize: ReturnType<typeof createBookSummaryService>) {
  const router = Router();
  router.post('/', async (req, res) => {
    const isbn = req.body?.isbn13;
    if (typeof isbn !== 'string' || !/^97[89]\d{10}$/u.test(isbn)) return res.status(400).json({ error: '도서 정보를 확인해 주세요.' });
    try { res.json(await summarize(isbn)); }
    catch (error) {
      const message = error instanceof Error ? error.message : '';
      const status = /timeout/iu.test(message) ? 504 : /HTTP 429/u.test(message) ? 429 : 503;
      res.status(status).json({ error: status === 504 ? '요약 준비 시간이 길어지고 있어요. 다시 시도해 주세요.' : '요약을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' });
    }
  });
  return router;
}
