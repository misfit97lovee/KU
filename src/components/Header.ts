import { openHistoryDialog } from './HistoryDialog.ts';
import { mountAuth } from '../auth.ts';
import type { ReadingState } from '../types/index.ts';

type ActivePage = 'recommend' | 'reading';
interface HeaderOptions {
  onOpenGradeModal: () => void;
  onResetSession: () => void;
  onTitleChange: (title: string) => void;
  isBusy?: boolean;
}

export function serviceHeader(activePage: ActivePage, gradeControl: string, resetControl: string): string {
  return `
    <div class="app-header">
      <a class="app-logo" href="/" aria-label="페이지온 홈">페이지온</a>
      <nav class="service-nav" aria-label="주 메뉴">
        <a href="/" ${activePage === 'reading' ? 'aria-current="page"' : ''}>독서 도우미</a>
        <a href="/curator/index.html" ${activePage === 'recommend' ? 'aria-current="page"' : ''}>책 추천</a>
        <button type="button" data-open-history>내 독서 기록</button>
      </nav>
      <div class="header-right">${gradeControl}${resetControl}<div class="auth-controls" data-auth-controls></div></div>
    </div>`;
}

export function renderHeader(container: HTMLElement, state: ReadingState, { onOpenGradeModal, onResetSession, onTitleChange, isBusy = false }: HeaderOptions): void {
  const gradeText = state.student.grade || '학년 선택';
  container.innerHTML = serviceHeader('reading',
    `<button id="btn-grade-toggle" class="grade-control" aria-label="독서 설정: 학년과 독서 수준 변경">${gradeText} · ${state.student.readingLevel || '중급'}<span aria-hidden="true">⌄</span></button>`,
    `<button id="btn-reset-session" class="btn-secondary-sm" ${isBusy ? 'disabled title="답변이 끝나면 새 세션을 시작할 수 있어요"' : ''}>새 세션</button>`) + `
    <div class="reading-heading">
      <label class="current-book">책 제목 <span class="optional-label">선택</span>
        <input type="text" id="header-book-title" class="book-title-input" placeholder="제목 없이도 읽을 수 있어요" />
      </label>
    </div>`;

  bindHistoryButton(container);
  mountAuth(container);
  const titleInput = container.querySelector<HTMLInputElement>('#header-book-title')!;
  titleInput.value = state.book.title || '';
  titleInput.addEventListener('change', (e) => onTitleChange((e.target as HTMLInputElement).value.trim()));
  container.querySelector<HTMLButtonElement>('#btn-grade-toggle')!.addEventListener('click', onOpenGradeModal);
  container.querySelector<HTMLButtonElement>('#btn-reset-session')!.addEventListener('click', () => {
    if (confirm('현재 대화를 내 독서 기록에 보관하고 새로 읽을까요?')) onResetSession();
  });
}

export function bindHistoryButton(container: ParentNode): void {
  container.querySelector('[data-open-history]')?.addEventListener('click', () => openHistoryDialog());
}
