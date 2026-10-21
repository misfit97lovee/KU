import type { Grade, ReadingLevel } from '../types/index.ts';

interface OnboardingModalOptions {
  currentGrade: Grade | null;
  onSelectGrade: (grade: Grade) => void;
  onClose: () => void;
  onOpenReadingLevel?: () => void;
}

export function renderOnboardingModal(container: HTMLElement, { currentGrade, onSelectGrade, onClose, onOpenReadingLevel }: OnboardingModalOptions): void {
  const grades = [
    { value: '중1', title: '중학교 1학년', desc: '기초 어휘와 흥미 중심의 쉬운 대화' },
    { value: '중2', title: '중학교 2학년', desc: '문맥과 인물 심리를 탐색하는 대화' },
    { value: '중3', title: '중학교 3학년', desc: '상징과 주제 의식을 연결하는 깊이 있는 대화' }
  ];

  container.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="grade-modal-title">
        <h2 class="modal-title" id="grade-modal-title">독서 설정</h2>
        <p class="modal-subtitle">학년과 독서 수준에 맞춰 설명해요. 선택하지 않으면 중2·중급으로 시작해요.</p>

        <div class="grade-options">
          ${grades.map(g => `
            <button class="grade-card-btn ${currentGrade === g.value ? 'selected' : ''}" data-grade="${g.value}">
              <div style="text-align: left;">
                <div style="font-weight: 600; color: var(--text-primary);">${g.title}</div>
                <div style="font-size: 12px; color: var(--text-secondary); font-weight: normal; margin-top: 2px;">${g.desc}</div>
              </div>
            </button>
          `).join('')}
        </div>

        ${currentGrade ? `
          <button id="btn-reading-settings" class="btn-secondary-sm" style="width: 100%;">독서 수준 변경</button>
        ` : ''}
        <button id="btn-close-modal" class="btn-secondary-sm" style="width: 100%;">${currentGrade ? '닫기' : '선택 없이 시작'}</button>
      </div>
    </div>
  `;

  // 카드 클릭 이벤트
  container.querySelectorAll<HTMLButtonElement>('.grade-card-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const grade = btn.getAttribute('data-grade');
      if (grade) onSelectGrade(grade);
    });
  });

  const closeBtn = container.querySelector('#btn-close-modal');
  container.querySelector('#btn-reading-settings')?.addEventListener('click', () => onOpenReadingLevel?.());
  if (closeBtn) {
    closeBtn.addEventListener('click', onClose);
  }

  // 바깥 클릭 시 닫기 (이미 학년이 있는 경우만)
  const backdrop = container.querySelector<HTMLElement>('#modal-backdrop')!;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      onClose();
    }
  });
}

export function renderReadingLevelModal(container: HTMLElement, options: {
  currentLevel: ReadingLevel;
  onSelect: (level: ReadingLevel) => void;
  onSkip: () => void;
}): void {
  const levels: Array<{ value: ReadingLevel; description: string }> = [
    { value: '입문', description: '쉬운 단어와 단계별 설명으로 차근차근 읽어요.' },
    { value: '중급', description: '문맥과 인물의 마음을 함께 살펴봐요.' },
    { value: '심화', description: '상징과 주제, 다양한 해석을 깊이 생각해요.' }
  ];
  container.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="reading-level-title">
        <h2 class="modal-title" id="reading-level-title">어떤 설명이 편한가요?</h2>
        <p class="modal-subtitle">독서 수준에 맞춰 설명과 이해 확인 질문을 조절해요. 기본값은 중급이며, 독서 설정에서 언제든 바꿀 수 있어요.</p>
        <div class="grade-options">
          ${levels.map(level => `
            <button class="grade-card-btn ${options.currentLevel === level.value ? 'selected' : ''}" data-reading-level="${level.value}" aria-pressed="${options.currentLevel === level.value}">
              <div style="text-align: left;">
                <div style="font-weight: 600;">${level.value}</div>
                <div style="font-size: 12px; margin-top: 2px;">${level.description}</div>
              </div>
            </button>`).join('')}
        </div>
        <button id="btn-skip-reading-level" class="btn-secondary-sm" style="width: 100%;">선택 생략 · ${options.currentLevel} 유지</button>
      </div>
    </div>`;
  container.querySelectorAll<HTMLButtonElement>('[data-reading-level]').forEach(button => {
    button.addEventListener('click', () => options.onSelect(button.dataset.readingLevel as ReadingLevel));
  });
  container.querySelector('#btn-skip-reading-level')?.addEventListener('click', options.onSkip);
}
