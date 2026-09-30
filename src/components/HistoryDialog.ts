import { getSavedSessions } from '../sessionHistory.ts';
import type { SavedSession } from '../sessionHistory.ts';
import { formatText } from '../formatText.ts';
import { getUnderstandingData } from './ReadingRecordPanel.ts';

const escape = (value: unknown): string => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export function openHistoryDialog(): void {
  document.getElementById('history-dialog-overlay')?.remove();
  const previousFocus = document.activeElement as HTMLElement | null;
  const overlay = document.createElement('div');
  overlay.id = 'history-dialog-overlay';
  overlay.className = 'history-overlay';
  let records: SavedSession[];
  try { records = getSavedSessions(); }
  catch { alert('저장기록을 불러오지 못했어요. 현재 기록은 그대로 유지됩니다.'); return; }
  let selected = records[0]?.id;
  let tab = 'conversation';
  const close = () => { overlay.remove(); previousFocus?.focus(); };
  const render = () => {
    const record = records.find(r => r.id === selected);
    overlay.innerHTML = `<section class="history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div class="history-heading"><div><h2 id="history-title">저장기록</h2><p>새 세션을 시작하기 전에 보관한 기록이에요.</p></div><button class="btn-secondary-sm" id="close-history">닫기</button></div>
      ${records.length ? `<div class="history-layout"><nav class="history-list" aria-label="저장된 세션">${records.map(r => `<button class="history-item ${r.id === selected ? 'selected' : ''}" data-record="${escape(r.id)}" aria-pressed="${r.id === selected}"><span>${escape(r.title)}</span><small>${r.kind === 'reading' ? '읽기 도우미' : '책 추천'} · ${escape(new Date(r.savedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</small></button>`).join('')}</nav>
        <div class="history-detail"><h3>${escape(record?.title)}</h3>
          <div class="history-tabs" role="tablist">${(record?.kind === 'reading' ? [['conversation','대화'],['summary','요약'],['note','독서노트'],['map','이해도']] : [['conversation','대화'],['books','추천 도서'],['note','독서노트']]).map(([id,label]) => `<button role="tab" aria-selected="${tab === id}" class="history-tab ${tab === id ? 'active' : ''}" data-history-tab="${id}">${label}</button>`).join('')}</div>
          <div class="history-content" role="tabpanel">${record ? renderRecord(record, tab) : ''}</div>
        </div></div>` : '<div class="history-empty">아직 저장된 기록이 없어요.<p>대화를 나눈 뒤 새 세션을 누르면 여기에 보관돼요.</p></div>'}
      <p class="history-storage-note">이 브라우저에 저장된 기록입니다.</p>
    </section>`;
    overlay.querySelector<HTMLButtonElement>('#close-history')!.onclick = close;
    overlay.querySelectorAll<HTMLButtonElement>('[data-record]').forEach(button => button.onclick = () => { selected = button.dataset.record; tab = 'conversation'; render(); overlay.querySelector<HTMLElement>(`[data-record="${selected}"]`)?.focus(); });
    overlay.querySelectorAll<HTMLButtonElement>('[data-history-tab]').forEach(button => button.onclick = () => { tab = button.dataset.historyTab || 'conversation'; render(); overlay.querySelector<HTMLElement>(`[data-history-tab="${tab}"]`)?.focus(); });
  };
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const items = [...overlay.querySelectorAll<HTMLElement>('button, a[href]')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  render();
  document.body.appendChild(overlay);
  overlay.querySelector<HTMLElement>('#close-history')?.focus();
}

function renderRecord(record: SavedSession, tab: string): string {
  const saved = record.snapshot;
  const session = saved.session || {};
  const empty = '<p class="history-empty">이 세션에 저장된 내용이 없어요.</p>';
  if (tab === 'conversation') {
    const messages = record.kind === 'reading' ? session.recentMessages || [] : saved.chatHistory || [];
    return messages.length ? messages.map(message => {
      const image = message.image;
      const validImage = image?.data && image.mimeType && /^image\/(jpeg|jpg|png)$/.test(image.mimeType) && /^[A-Za-z0-9+/=\s]+$/.test(image.data);
      return `<div class="history-message ${message.role === 'user' ? 'user' : 'assistant'}">${validImage ? `<img alt="저장된 책 사진" src="data:${image.mimeType};base64,${image.data}" />` : ''}<div class="markdown-content">${formatText(message.content)}</div>${message.evidence?.length ? `<div class="history-evidence">책에서 본 근거${message.evidence.map(e => `<p>${escape(e)}</p>`).join('')}</div>` : ''}</div>`;
    }).join('') : empty;
  }
  if (tab === 'summary') return session.summary ? `<div class="markdown-content">${formatText(session.summary)}</div>` : empty;
  if (tab === 'note') {
    const note = record.kind === 'reading' ? session.readingNote : saved.currentDocument?.markdown;
    return note ? `<div class="markdown-content">${formatText(note)}</div>` : empty;
  }
  if (tab === 'books') return saved.recommendedBooks?.length ? saved.recommendedBooks.map(book => `<article class="history-book"><h4>${escape(book.title)}</h4><p>${escape(book.author)}</p><p>${escape(book.reason)}</p></article>`).join('') : empty;
  if (tab === 'map') {
    const groups = getUnderstandingData(session);
    const sections: Array<[keyof typeof groups, string]> = [['difficult','어려움'],['almost','조금 더 보기'],['understood','이해함']];
    return sections.map(([key,label]) => `<section class="history-status"><h4><span class="history-dot ${key}"></span>${label}</h4>${groups[key].length ? `<ul>${groups[key].map(topic => `<li>${escape(topic)}</li>`).join('')}</ul>` : '<p>저장된 항목이 없어요.</p>'}</section>`).join('');
  }
  return empty;
}
