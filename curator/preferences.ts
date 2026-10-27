import { accountFetch, getAccountId, getAccountRevision, subscribeAccount } from '../src/accountStorage.ts';
import type { ReadingPreferences } from '../src/types/index.ts';

const choices = {
  genres: ['추리·미스터리', '판타지', '고전소설', '현대소설', '시·에세이', '인문', '과학', '역사'],
  topics: ['우주', '물리학', '인공지능', '환경', '심리', '사회', '예술', '성장·우정']
};

export function mountReadingPreferences(container: HTMLElement, onChanged: () => void): void {
  container.innerHTML = `<div class="preferences-entry"><button type="button" class="btn-secondary-sm" hidden>내 독서 취향</button><span role="status"></span></div>
    <dialog class="preferences-dialog" aria-labelledby="preferencesTitle">
      <form>
        <header><h2 id="preferencesTitle">내 독서 취향</h2><button type="button" data-close aria-label="독서 취향 닫기">닫기</button></header>
        <p>좋아하는 것을 알려주면 다음 책을 찾을 때 참고할게요. 모두 선택하지 않아도 괜찮아요.</p>
        <fieldset data-genres><legend>좋아하는 장르 <span>여러 개 선택 가능</span></legend><div class="preferences-options"></div></fieldset>
        <fieldset data-topics><legend>관심 분야 <span>여러 개 선택 가능</span></legend><div class="preferences-options"></div></fieldset>
        <label class="preferences-text">좋아하는 작가 <span>선택 · 쉼표로 구분</span><input name="favorite_authors" maxlength="1000" placeholder="예: 김영하, 정세랑"></label>
        <label class="preferences-text">좋아하는 책 <span>선택 · 한 줄에 한 권</span><textarea name="favorite_books" rows="3" maxlength="2000" placeholder="기억에 남는 책을 적어주세요"></textarea></label>
        <p class="preferences-error" role="alert"></p>
        <footer><button type="button" data-delete class="btn-secondary-sm">취향 삭제</button><button type="button" data-skip class="btn-secondary-sm">건너뛰기</button><button type="submit" class="send-btn">저장하고 시작하기</button></footer>
      </form>
    </dialog>`;
  const button = container.querySelector<HTMLButtonElement>('.preferences-entry button')!;
  const status = container.querySelector<HTMLElement>('[role="status"]')!;
  const dialog = container.querySelector<HTMLDialogElement>('dialog')!;
  const form = dialog.querySelector('form')!;
  const error = form.querySelector<HTMLElement>('[role="alert"]')!;
  const deleteButton = form.querySelector<HTMLButtonElement>('[data-delete]')!;
  let preferences: ReadingPreferences | null = null;
  let busy = false;
  let loadRevision = 0;

  function fill(): void {
    form.reset();
    for (const field of ['genres', 'topics'] as const) {
      const options = form.querySelector(`[data-${field}] .preferences-options`)!;
      options.replaceChildren();
      for (const value of new Set([...choices[field], ...(preferences?.[field] || [])])) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox'; input.name = field; input.value = value;
        input.checked = preferences?.[field].includes(value) || false;
        label.append(input, document.createTextNode(value)); options.append(label);
      }
    }
    (form.elements.namedItem('favorite_authors') as HTMLInputElement).value = preferences?.favorite_authors.join(', ') || '';
    (form.elements.namedItem('favorite_books') as HTMLTextAreaElement).value = preferences?.favorite_books.join('\n') || '';
    deleteButton.hidden = !preferences;
    form.querySelector<HTMLButtonElement>('[data-skip]')!.textContent = preferences ? '취소' : '건너뛰기';
    form.querySelector<HTMLButtonElement>('[type="submit"]')!.textContent = preferences ? '저장하기' : '저장하고 시작하기';
    error.textContent = '';
  }
  function open(): void {
    if (!getAccountId() || busy) return;
    fill(); if (!dialog.open) dialog.showModal();
  }
  function setBusy(value: boolean): void {
    busy = value;
    button.disabled = value;
    for (const control of form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>('input,button,textarea')) control.disabled = value;
  }
  async function load(autoOpen = true): Promise<boolean> {
    const revision = ++loadRevision;
    preferences = null; button.hidden = !getAccountId(); status.textContent = '';
    dialog.close(); form.reset(); error.textContent = ''; setBusy(false);
    if (!getAccountId()) return false;
    button.disabled = true;
    try {
      const response = await accountFetch('/api/db/preferences', { cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json() as { preferences: ReadingPreferences | null; completed: boolean };
      if (revision !== loadRevision) return false;
      preferences = data.preferences;
      if (autoOpen && !data.completed) open();
      return true;
    } catch {
      if (revision === loadRevision && getAccountId()) status.textContent = '취향을 불러오지 못했어요. 일반 추천은 계속 이용할 수 있어요.';
      return false;
    } finally { if (revision === loadRevision) button.disabled = false; }
  }
  async function save(skip: boolean, remove = false): Promise<void> {
    if (busy || !getAccountId()) return;
    const revision = getAccountRevision();
    const data = new FormData(form);
    const body: Partial<ReadingPreferences> & { skip?: boolean } = skip ? { skip: true } : {
      genres: data.getAll('genres').map(String), topics: data.getAll('topics').map(String),
      favorite_authors: String(data.get('favorite_authors') || '').split(/[,\n]/).map(value => value.trim()).filter(Boolean),
      favorite_books: String(data.get('favorite_books') || '').split('\n').map(value => value.trim()).filter(Boolean)
    };
    setBusy(true); error.textContent = '';
    try {
      const response = await accountFetch('/api/db/preferences', { method: remove ? 'DELETE' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: remove ? undefined : JSON.stringify(body) });
      const result = await response.json() as { preferences?: ReadingPreferences; error?: string };
      if (!response.ok) throw new Error(result.error || '취향을 저장하지 못했어요.');
      if (revision !== getAccountRevision()) return;
      preferences = remove ? null : result.preferences!;
      onChanged(); dialog.close(); status.textContent = remove ? '독서 취향을 삭제했어요.' : skip ? '' : '독서 취향을 저장했어요.';
    } catch (cause) {
      if (revision !== getAccountRevision()) return;
      error.textContent = cause instanceof Error ? cause.message : '다시 시도해 주세요.';
      if (skip) { dialog.close(); status.textContent = '취향을 저장하지 못했어요. 일반 추천으로 시작합니다.'; }
    } finally { if (revision === getAccountRevision()) setBusy(false); }
  }
  button.addEventListener('click', async () => {
    if (busy) return;
    const revision = getAccountRevision();
    const loaded = await load(false);
    if (loaded && revision === getAccountRevision() && getAccountId()) open();
  });
  form.addEventListener('submit', event => { event.preventDefault(); void save(false); });
  form.querySelector('[data-skip]')!.addEventListener('click', () => { if (preferences) dialog.close(); else void save(true); });
  deleteButton.addEventListener('click', () => { if (confirm('저장한 독서 취향을 삭제할까요?')) void save(false, true); });
  form.querySelector('[data-close]')!.addEventListener('click', () => { if (!busy) { if (preferences) dialog.close(); else void save(true); } });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) { if (preferences) dialog.close(); else void save(true); } });
  subscribeAccount(() => void load());
  void load();
}
