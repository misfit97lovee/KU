import { getSavedSessions } from '../sessionHistory.ts';
import type { SavedSession } from '../sessionHistory.ts';
import { formatText } from '../formatText.ts';
import { getUnderstandingData } from './ReadingRecordPanel.ts';
import { subscribeAccount, accountFetch, getAccountId } from '../accountStorage.ts';
import { stateManager } from '../state.ts';
import { renderGazeReports } from '../gaze/renderReport.ts';
import '../gaze.css';

subscribeAccount(() => document.getElementById('history-dialog-overlay')?.remove());

const escape = (value: unknown): string => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export function openHistoryDialog(): void {
  document.getElementById('history-dialog-overlay')?.remove();
  const previousFocus = document.activeElement as HTMLElement | null;
  const overlay = document.createElement('div');
  overlay.id = 'history-dialog-overlay';
  overlay.className = 'history-overlay';
  let records: SavedSession[];
  let localError = '';
  try { records = getSavedSessions(); }
  catch { records = []; localError = '브라우저 기록을 불러오지 못했어요. 원본은 유지되며 DB 기록은 별도로 조회할 수 있어요.'; }
  let selected = records[0]?.id;
  let tab = 'conversation';
  const localRecords = records;
  let source: 'local' | 'db' = 'local';
  let status = localError;
  let busy = false;
  // Only an explicit click uploads the current reading session. Never enumerate
  // or automatically migrate pre-existing localStorage records.
  let upload: SavedSession | null = null;
  const loadDb = async () => {
    busy = true; status = 'DB 기록을 불러오는 중…'; render();
    try {
      const response = await accountFetch('/api/db/sessions', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'DB 조회 실패');
      if (!overlay.isConnected) return;
      records = data.records; selected = records[0]?.id; status = '';
    } catch (error) {
      if (!overlay.isConnected) return;
      status = error instanceof Error && error.name === 'AbortError' ? '' : 'DB 기록을 불러오지 못했어요. 브라우저 기록은 유지됩니다.';
    } finally { busy = false; if (overlay.isConnected) render(); }
  };
  const close = () => { overlay.remove(); previousFocus?.focus(); };
  const render = () => {
    const record = records.find(r => r.id === selected);
    overlay.innerHTML = `<section class="history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div class="history-heading"><div><h2 id="history-title">저장기록</h2><p>새 세션을 시작하기 전에 보관한 기록이에요.</p></div><button class="btn-secondary-sm" id="close-history">닫기</button></div>
      <div class="history-tabs">
        <button class="btn-secondary-sm" id="history-local" ${busy ? 'disabled' : ''}>이 브라우저 기록</button>
        <button class="btn-secondary-sm" id="history-db" ${busy || !getAccountId() ? 'disabled' : ''}>내 DB 기록</button>
        <button class="btn-secondary-sm" id="history-save-db" ${busy || !getAccountId() ? 'disabled' : ''}>현재 독서 DB 저장</button>
      </div>
      <p role="status">${escape(status)}</p>
      ${records.length ? `<div class="history-layout"><nav class="history-list" aria-label="저장된 세션">${records.map(r => `<button class="history-item ${r.id === selected ? 'selected' : ''}" data-record="${escape(r.id)}" aria-pressed="${r.id === selected}"><span>${escape(r.title)}</span><small>${r.kind === 'reading' ? '읽기 도우미' : '책 추천'} · ${escape(new Date(r.savedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</small></button>`).join('')}</nav>
        <div class="history-detail"><h3>${escape(record?.title)}</h3>
          <div class="history-tabs" role="tablist">${(record?.kind === 'reading' ? [['conversation','대화'],['summary','요약'],['note','독서노트'],['map','이해도']] : [['conversation','대화'],['books','추천 도서'],['note','독서노트']]).map(([id,label]) => `<button role="tab" aria-selected="${tab === id}" class="history-tab ${tab === id ? 'active' : ''}" data-history-tab="${id}">${label}</button>`).join('')}</div>
          <div class="history-content" role="tabpanel">${record ? renderRecord(record, tab) : ''}</div>
        </div></div>` : '<div class="history-empty">아직 저장된 기록이 없어요.<p>대화를 나눈 뒤 새 세션을 누르면 여기에 보관돼요.</p></div>'}
      ${source === 'db' && record ? `<button class="btn-secondary-sm" id="history-delete-db" ${busy ? 'disabled' : ''}>선택한 DB 기록 삭제</button>` : ''}
      <p class="history-storage-note">${source === 'local' ? '이 브라우저에 저장된 기록입니다.' : '로그인한 계정의 DB 기록입니다. 다른 기기에서도 조회할 수 있어요.'} DB 저장은 직접 누를 때만 실행되며, 책 사진과 히트맵이 있으면 함께 저장됩니다. 기존 브라우저 기록은 자동 이전하지 않습니다.</p>
    </section>`;
    overlay.querySelector<HTMLButtonElement>('#close-history')!.onclick = close;
    overlay.querySelector<HTMLButtonElement>('#history-local')!.onclick = () => {
      source = 'local'; records = localRecords; selected = records[0]?.id; tab = 'conversation'; status = localError; render();
    };
    overlay.querySelector<HTMLButtonElement>('#history-db')!.onclick = () => {
      source = 'db'; records = []; selected = undefined; tab = 'conversation'; void loadDb();
    };
    overlay.querySelector<HTMLButtonElement>('#history-save-db')!.onclick = async () => {
      const state = stateManager.getState();
      if (!upload && !state.book.title && !state.session.recentMessages.length && !state.session.gazeReports?.length && !state.session.readingNote && !state.session.summary) {
        status = '저장할 현재 독서 내용이 없어요.'; render(); return;
      }
      upload ||= { id: crypto.randomUUID(), kind: 'reading', savedAt: new Date().toISOString(),
        title: state.book.title || '제목 없는 독서', snapshot: JSON.parse(JSON.stringify(state)) };
      busy = true; status = 'DB에 저장 중…'; render();
      try {
        const response = await accountFetch(`/api/db/sessions/${encodeURIComponent(upload.id)}`, {
          method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(upload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'DB 저장 실패');
        if (!overlay.isConnected) return;
        source = 'db'; await loadDb();
      } catch {
        status = 'DB 저장을 완료하지 못했어요. 다시 누르면 같은 기록으로 재시도합니다. 브라우저 기록은 유지됩니다.';
      } finally { busy = false; if (overlay.isConnected) render(); }
    };
    overlay.querySelector<HTMLButtonElement>('#history-delete-db')?.addEventListener('click', async () => {
      if (!selected || !confirm('선택한 DB 기록을 삭제할까요? 브라우저 기록은 유지됩니다.')) return;
      busy = true; render();
      try {
        const response = await accountFetch(`/api/db/sessions/${encodeURIComponent(selected)}`, { method: 'DELETE', credentials: 'same-origin' });
        await response.json();
        if (!response.ok) throw new Error('삭제 실패');
        if (overlay.isConnected) await loadDb();
      } catch { status = 'DB 기록 삭제에 실패했어요.'; }
      finally { busy = false; if (overlay.isConnected) render(); }
    });
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
    return renderGazeReports(session.gazeReports) + sections.map(([key,label]) => `<section class="history-status"><h4><span class="history-dot ${key}"></span>${label}</h4>${groups[key].length ? `<ul>${groups[key].map(topic => `<li>${escape(topic)}</li>`).join('')}</ul>` : '<p>저장된 항목이 없어요.</p>'}</section>`).join('');
  }
  return empty;
}
