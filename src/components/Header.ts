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
      <a class="app-logo" href="/curator/index.html" aria-label="페이지온 홈">페이지온</a>
      <nav class="service-nav" aria-label="주 메뉴">
        <a href="/curator/index.html" ${activePage === 'recommend' ? 'aria-current="page"' : ''}>책 추천</a>
        <a href="/" ${activePage === 'reading' ? 'aria-current="page"' : ''}>읽기 도우미</a>
        <a href="/#panel-record">독서 기록</a>
      </nav>
      <div class="header-right"><button type="button" class="btn-secondary-sm" data-open-history>저장기록</button>${gradeControl}${resetControl}<div class="auth-controls" data-auth-controls></div></div>
    </div>`;
}

export function renderHeader(container: HTMLElement, state: ReadingState, { onOpenGradeModal, onResetSession, onTitleChange, isBusy = false }: HeaderOptions): void {
  const gradeText = state.student.grade || '학년 선택';
  container.innerHTML = serviceHeader('reading',
    `<button id="btn-grade-toggle" class="grade-control" aria-label="독서 설정: 학년과 독서 수준 변경">${gradeText} · ${state.student.readingLevel || '중급'}<span aria-hidden="true">⌄</span></button>`,
    `<button id="btn-reset-session" class="btn-secondary-sm" ${isBusy ? 'disabled title="답변이 끝나면 새 세션을 시작할 수 있어요"' : ''}>새 세션</button>`) + `
    <div class="reading-heading">
      <div><h1>읽기 도우미</h1><p>어려운 문장부터, 함께 천천히 읽어요.</p></div>
      <label class="current-book">읽고 있는 책
        <input type="text" id="header-book-title" class="book-title-input" placeholder="책 제목을 입력해주세요" />
      </label>
    </div>`;

  bindHistoryButton(container);
  mountAuth(container);
  const titleInput = container.querySelector<HTMLInputElement>('#header-book-title')!;
  titleInput.value = state.book.title || '';
  titleInput.addEventListener('change', (e) => onTitleChange((e.target as HTMLInputElement).value.trim()));
  container.querySelector<HTMLButtonElement>('#btn-grade-toggle')!.addEventListener('click', onOpenGradeModal);
  container.querySelector<HTMLButtonElement>('#btn-reset-session')!.addEventListener('click', () => {
    if (confirm('현재 대화와 독서 기록을 저장기록에 보관하고 새 세션을 시작할까요?')) onResetSession();
  });
}

export function bindHistoryButton(container: ParentNode): void {
  container.querySelector('[data-open-history]')?.addEventListener('click', openHistoryDialog);
}
