import { accountFetch } from '../src/accountStorage.ts';
import type { BookSummaryResponse } from '../src/types/index.ts';

export function mountBookSummary(card: HTMLElement, book: { isbn13?: string | null; title: string }): void {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'book-btn btn-secondary-sm'; button.textContent = '책 요약 받기';
  button.setAttribute('aria-expanded', 'false');
  const region = document.createElement('section');
  region.className = 'book-summary'; region.hidden = true;
  region.setAttribute('aria-label', `${book.title} 소개 요약`);
  region.setAttribute('aria-live', 'polite');
  const id = 'book-summary-' + crypto.randomUUID(); region.id = id; button.setAttribute('aria-controls', id);
  card.querySelector('.book-actions')?.prepend(button); card.append(region);
  let pending = false;
  let loaded = false;
  const paragraph = (text: string, className = '') => {
    const p = document.createElement('p'); p.textContent = text; p.className = className; region.append(p);
  };
  async function load(): Promise<void> {
    if (pending || loaded) return;
    region.replaceChildren();
    if (!book.isbn13) { loaded = true; paragraph('도서 식별 정보가 부족해 요약을 제공하기 어려워요.'); return; }
    pending = true; paragraph('도서 소개를 정리하고 있어요…');
    try {
      const response = await accountFetch('/api/book-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbn13: book.isbn13 }), signal: AbortSignal.timeout(15000) });
      const result = await response.json() as BookSummaryResponse & { error?: string };
      if (!card.isConnected) return;
      if (!response.ok) throw Error(result.error || '요약을 불러오지 못했어요. 다시 시도해 주세요.');
      region.replaceChildren();
      if (result.available) {
        paragraph(result.sentences.join(' '));
        const heading = document.createElement('h3'); heading.textContent = '핵심 내용과 특징'; region.append(heading);
        const list = document.createElement('ul');
        for (const feature of result.features) { const li = document.createElement('li'); li.textContent = feature; list.append(li); }
        region.append(list);
      } else paragraph(result.message || '확인된 도서 소개 정보가 부족해요.');
      paragraph('도서 소개 정보를 바탕으로 정리한 내용입니다', 'book-summary-source');
      loaded = true;
    } catch (error) {
      if (!card.isConnected) return;
      region.replaceChildren();
      paragraph(error instanceof Error && error.name === 'TimeoutError' ? '요약 준비 시간이 길어지고 있어요. 다시 시도해 주세요.' : '요약을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn-secondary-sm'; retry.textContent = '다시 받기';
      retry.addEventListener('click', () => void load()); region.append(retry);
    } finally { pending = false; }
  }
  button.addEventListener('click', () => {
    const opening = region.hidden; region.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening)); button.textContent = opening ? '요약 접기' : '책 요약 받기';
    if (opening) void load();
  });
}
