import { getSavedSessions, mergeSavedSessions, removeSavedSession } from '../sessionHistory.ts';
import type { SavedSession } from '../sessionHistory.ts';
import { formatText } from '../formatText.ts';
import { getUnderstandingData } from './ReadingRecordPanel.ts';
import { subscribeAccount, accountFetch, accountGet, getAccountId } from '../accountStorage.ts';
import { hasReadingActivity } from '../readingActivity.ts';
import { stateManager } from '../state.ts';
import { renderGazeReports } from '../gaze/renderReport.ts';
import '../gaze.css';

subscribeAccount(() => document.getElementById('history-dialog-overlay')?.remove());

const escape = (value: unknown): string => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export function openHistoryDialog(options: { saveCurrent?: boolean } = {}): void {
  document.getElementById('history-dialog-overlay')?.remove();
  const previousFocus = document.activeElement as HTMLElement | null;
  const overlay = document.createElement('div');
  overlay.id = 'history-dialog-overlay';
  overlay.className = 'history-overlay';
  let records: SavedSession[];
  let localError = '';
  try { records = getSavedSessions(); }
  catch { records = []; localError = '일부 기록을 불러오지 못했어요. 잠시 후 다시 확인해주세요.'; }
  let selected = records[0]?.id;
  let tab = 'conversation';
  let localRecords = records;
  let remoteRecords: SavedSession[] = [];
  let remoteFailed = false;
  let status = localError;
  let busy = false;
  // Only an explicit click uploads the current reading session. Never enumerate
  // or automatically migrate pre-existing localStorage records.
  let upload: SavedSession | null = null;
  const loadDb = async () => {
    busy = true; status = '기록을 불러오는 중…'; render();
    try {
      const response = await accountFetch('/api/db/sessions', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'DB 조회 실패');
      if (!overlay.isConnected) return;
      if (!Array.isArray(data.records)) throw new Error('Invalid records');
      remoteRecords = data.records;
      records = mergeSavedSessions(localRecords, remoteRecords);
      if (!records.some(record => record.id === selected)) selected = records[0]?.id;
      remoteFailed = false; status = localError;
    } catch (error) {
      if (!overlay.isConnected) return;
      remoteFailed = true;
      status = error instanceof Error && error.name === 'AbortError' ? '' : '일부 기록을 불러오지 못했어요. 보이는 기록은 그대로 확인할 수 있어요.';
    } finally { busy = false; if (overlay.isConnected) render(); }
  };
  const close = () => { overlay.remove(); previousFocus?.focus(); };
  const render = () => {
    const record = records.find(r => r.id === selected);
    overlay.innerHTML = `<section class="history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div class="history-heading"><div><h2 id="history-title">내 독서 기록</h2><p>읽고 생각한 내용을 다시 살펴보세요.</p></div><button class="btn-secondary-sm" id="close-history">닫기</button></div>
      <div class="history-actions">
        <button class="btn-secondary-sm" id="history-save-db" ${busy || !getAccountId() ? 'disabled' : ''}>기록 저장</button>
        ${remoteFailed ? `<button class="btn-secondary-sm" id="history-refresh" ${busy ? 'disabled' : ''}>다시 불러오기</button>` : ''}
      </div>
      <p role="status">${escape(status)}</p>
      ${records.length ? `<div class="history-layout"><nav class="history-list" aria-label="저장한 독서 기록">${records.map(r => `<button class="history-item ${r.id === selected ? 'selected' : ''}" data-record="${escape(r.id)}" aria-pressed="${r.id === selected}"><span>${escape(r.title)}</span><small>${escape(new Date(r.savedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</small></button>`).join('')}</nav>
        <div class="history-detail"><h3>${escape(record?.title)}</h3>
          <div class="history-tabs" role="tablist">${(record?.kind === 'reading' ? [['conversation','대화'],['summary','요약'],['note','독서노트'],['map','이해도']] : [['conversation','대화'],['books','추천 도서'],['note','독서노트']]).map(([id,label]) => `<button role="tab" aria-selected="${tab === id}" class="history-tab ${tab === id ? 'active' : ''}" data-history-tab="${id}">${label}</button>`).join('')}</div>
          <div class="history-content" role="tabpanel">${record ? renderRecord(record, tab) : ''}</div>
        </div></div>` : '<div class="history-empty">아직 저장된 기록이 없어요.<p>함께 읽은 뒤 ‘기록 저장’을 눌러보세요.</p></div>'}
      ${record ? `<button class="btn-secondary-sm history-delete" id="history-delete-db" ${busy || remoteFailed ? 'disabled' : ''}>기록 삭제</button>` : ''}
      <p class="history-storage-note">${getAccountId() ? '로그인한 계정의 기록이에요. 기록 저장을 누르면 다른 기기에서도 확인할 수 있어요.' : '로그인하면 내 독서 기록을 저장하고 확인할 수 있어요.'} 사진이 포함된 기록은 책 사진과 읽기 흔적도 함께 저장됩니다.</p>
    </section>`;
    overlay.querySelector<HTMLButtonElement>('#close-history')!.onclick = close;
    overlay.querySelector<HTMLButtonElement>('#history-refresh')?.addEventListener('click', () => { void loadDb(); });
    overlay.querySelector<HTMLButtonElement>('#history-save-db')!.onclick = async () => {
      let current: SavedSession;
      try {
        const kind = window.location.pathname.startsWith('/curator/') ? 'recommendation' : 'reading';
        const snapshot = kind === 'reading' ? stateManager.getState() : JSON.parse(accountGet('pageon-current-recommendation') || '{}');
        if (!upload && !hasReadingActivity(kind, snapshot)) {
          status = '아직 저장할 독서 활동이 없어요. 대화를 나누거나 읽은 내용을 정리해보세요.'; render(); return;
        }
        const title = kind === 'reading' ? snapshot.book?.title || '제목 없는 독서' : snapshot.recommendedBooks?.at(-1)?.title || '책 추천 대화';
        current = upload || { id: crypto.randomUUID(), kind, savedAt: new Date().toISOString(), title, snapshot: JSON.parse(JSON.stringify(snapshot)) };
      } catch { status = '현재 기록을 확인하지 못했어요. 잠시 후 다시 시도해주세요.'; render(); return; }
      if (!upload) {
        const same = remoteRecords.find(record => record.kind === current.kind && JSON.stringify(record.snapshot) === JSON.stringify(current.snapshot));
        upload = same || current;
      }
      busy = true; status = '기록을 저장하는 중…'; render();
      try {
        const response = await accountFetch(`/api/db/sessions/${encodeURIComponent(upload.id)}`, {
          method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(upload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error('Save failed');
        if (!overlay.isConnected) return;
        await loadDb();
        if (!remoteFailed) { selected = upload.id; status = '기록을 저장했어요.'; }
      } catch {
        status = '저장을 완료하지 못했어요. 다시 눌러 시도해주세요. 현재 내용은 그대로 유지됩니다.';
      } finally { busy = false; if (overlay.isConnected) render(); }
    };
    overlay.querySelector<HTMLButtonElement>('#history-delete-db')?.addEventListener('click', async () => {
      if (!selected || !confirm('이 독서 기록을 삭제할까요?')) return;
      const id = selected;
      busy = true; render();
      try {
        if (remoteRecords.some(record => record.id === id)) {
          const response = await accountFetch(`/api/db/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
          await response.json();
          if (!response.ok) throw new Error('Delete failed');
        }
        if (!overlay.isConnected) return;
        if (localRecords.some(record => record.id === id)) removeSavedSession(id);
        localRecords = localRecords.filter(record => record.id !== id);
        remoteRecords = remoteRecords.filter(record => record.id !== id);
        records = mergeSavedSessions(localRecords, remoteRecords); selected = records[0]?.id;
        if (upload?.id === id) upload = null;
        status = '기록을 삭제했어요.';
      } catch { status = '기록 삭제를 완료하지 못했어요. 다시 시도해주세요.'; }
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
  if (getAccountId()) void loadDb().then(() => {
    if (options.saveCurrent === true && overlay.isConnected) overlay.querySelector<HTMLButtonElement>('#history-save-db')?.click();
  });
}

function renderRecord(record: SavedSession, tab: string): string {
  const saved = record.snapshot;
  const session = saved.session || {};
  const empty = '<p class="history-empty">아직 남긴 내용이 없어요.</p>';
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
