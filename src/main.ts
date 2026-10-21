import { stateManager } from './state.ts';
import { accountFetch, getAccountId, getAccountSignal, subscribeAccount } from './accountStorage.ts';
import { readChatResponse } from './chatStream.ts';
import { buildReadingRequest } from './readingRequest.ts';
import { hasReadingActivity } from './readingActivity.ts';
import { openHistoryDialog } from './components/HistoryDialog.ts';
import { displayText } from './formatText.ts';
import { renderHeader } from './components/Header.ts';
import { renderOnboardingModal, renderReadingLevelModal } from './components/OnboardingModal.ts';
import { renderBookInputPanel } from './components/BookInputPanel.ts';
import { renderChatPanel } from './components/ChatPanel.ts';
import { renderReadingRecordPanel } from './components/ReadingRecordPanel.ts';
import type { Grade, MessageImage, ReadingApiResponse } from './types/index.ts';

let isLoading = false;
let isSummaryLoading = false;
let isReadingNoteLoading = false;
let isModalOpen = false;
let isReadingLevelModalOpen = false;
let initialTitleHandled = false;

// DOM 엘리먼트 캐시
const headerEl = document.getElementById('header-container')!;
const panelBookEl = document.getElementById('panel-book')!;
const panelChatEl = document.getElementById('panel-chat')!;
const panelRecordEl = document.getElementById('panel-record')!;
const modalContainerEl = document.getElementById('onboarding-modal-container')!;
const alertBannerEl = document.getElementById('alert-banner');

/**
 * 에러 배너 표시 헬퍼
 */
function showAlert(message: string): void {
  if (!alertBannerEl) return;
  alertBannerEl.innerHTML = `
    <span>${message}</span>
    <button id="btn-close-alert" style="background: none; border: none; cursor: pointer; font-size: 16px; color: inherit;">✕</button>
  `;
  alertBannerEl.classList.remove('hidden');

  const closeBtn = alertBannerEl.querySelector('#btn-close-alert');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      alertBannerEl.classList.add('hidden');
    });
  }
}

/**
 * 전체 화면 리렌더링
 */
function renderApp(): void {
  const state = stateManager.getState();
  const started = hasReadingActivity('reading', state);
  document.getElementById('app')!.classList.toggle('reading-start', !started);
  const progress = document.getElementById('reading-progress')!;
  progress.hidden = !started;
  const stage = state.session.readingNote ? 3 : state.session.isQuizActive ? 2
    : state.session.comprehensionChecks.some(check => /잘 이해|거의 이해/u.test(check.result || '')) ? 3 : 1;
  progress.innerHTML = `<ol aria-label="독서 순서">${['함께 읽기','이해 확인','독서노트'].map((label,index) =>
    `<li ${stage === index+1 ? 'aria-current="step"' : ''}>${index+1}. ${label}</li>`).join('')}</ol>`;

  // 1. 헤더 렌더링
  renderHeader(headerEl, state, {
    isBusy: isLoading || isSummaryLoading || isReadingNoteLoading,
    onOpenGradeModal: () => {
      isReadingLevelModalOpen = false;
      isModalOpen = true;
      renderApp();
    },
    onResetSession: () => {
      try {
        stateManager.resetSession();
        renderApp();
      } catch {
        showAlert('저장 공간이 부족하거나 저장기록에 접근할 수 없어 새 세션을 시작하지 않았어요. 현재 대화는 그대로 유지됩니다.');
      }
    },
    onTitleChange: (title) => {
      stateManager.setBookTitle(title);
    }
  });

  // 2. 패널 1: 책 내용 (텍스트 및 사진 업로드)
  renderBookInputPanel(panelBookEl, {
    introductory: !started,
    bookTitle: state.book.title,
    onGazeReport: (report) => stateManager.addGazeReport(report),
    onSendToChat: (text) => {
      handleSendMessage(text);
      switchMobileTab('panel-chat');
    },
    onSendImage: ({ text, image }) => {
      handleSendImageMessage({ text, image });
      switchMobileTab('panel-chat');
    }
  });

  // 3. 패널 2: AI 대화 (소크라테스 대화 + 설명 단계 버튼 + 이해 확인 버튼)
  renderChatPanel(panelChatEl, {
    state,
    isLoading,
    onSendMessage: (text) => {
      handleSendMessage(text);
    },
    onExplainLevel: (level) => {
      handleExplainLevel(level);
    },
    onCheckUnderstanding: () => {
      handleCheckUnderstanding();
    }
  });

  // 4. 패널 3: 독서 기록 및 TAO (요약 생성, 독서노트 업데이트, 이해도 지도, TAO 로그)
  renderReadingRecordPanel(panelRecordEl, {
    state,
    isSummaryLoading,
    onGenerateSummary: () => {
      handleGenerateSummary();
    },
    isReadingNoteLoading,
    onGenerateReadingNote: () => {
      handleGenerateReadingNote();
    },
    onRetryExplain: (topic) => {
      handleSendMessage(`이 부분 다시 설명해줘: ${topic}`);
      switchMobileTab('panel-chat');
    },
    onSaveRecord: () => openHistoryDialog({ saveCurrent: true })
  });

  // 5. 온보딩 모달 (학년 미설정 또는 사용자가 직접 열었을 때)
  if (isReadingLevelModalOpen) {
    const finishLevel = (level: '입문' | '중급' | '심화') => {
      isReadingLevelModalOpen = false;
      isModalOpen = false;
      stateManager.setReadingLevel(level);
    };
    renderReadingLevelModal(modalContainerEl, {
      currentLevel: state.student.readingLevel || '중급',
      onSelect: finishLevel,
      onSkip: () => finishLevel(state.student.readingLevel || '중급')
    });
  } else if (isModalOpen) {
    renderOnboardingModal(modalContainerEl, {
      currentGrade: state.student.grade,
      onSelectGrade: (grade) => {
        isModalOpen = false;
        isReadingLevelModalOpen = true;
        stateManager.setGrade(grade);

        renderApp();
      },
      onOpenReadingLevel: () => {
        isModalOpen = false;
        isReadingLevelModalOpen = true;
        renderApp();
      },
      onClose: () => {
        isModalOpen = false;
        renderApp();
      }
    });
  } else {
    modalContainerEl.innerHTML = '';
  }
}

/**
 * 일반 텍스트 메시지 전송
 */
async function handleSendMessage(content: string): Promise<void> {
  if (isLoading) return;

  stateManager.addMessage('user', content);
  if (content.startsWith('[책 내용]')) stateManager.setSourceText(content.slice(0, 6000));
  isLoading = true;
  renderApp();

  try {
    const state = stateManager.getState();
    const signal = getAccountSignal();
    const response = await accountFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(buildReadingRequest(state))
    });

    const data = await readChatResponse(response, signal, message => {
      signal.throwIfAborted();
      const preview = panelChatEl.querySelector('#streaming-response');
      if (preview) { preview.textContent = displayText(message); preview.classList.remove('typing-indicator'); }
      const box = panelChatEl.querySelector('#chat-messages-box');
      if (box) box.scrollTop = box.scrollHeight;
    });

    if (!response.ok) {
      throw new Error(data.details || data.error || '답변 요청에 실패했습니다.');
    }

    if (data.message) {
      const msgText = data.message;
      const isCompleteFeedback = msgText.includes('✅ 잘 이해했어요') || msgText.includes('🟡 거의 이해했어요');
      const isRetryFeedback = msgText.includes('🔄 조금 더 살펴볼까요?');
      const isQuizQuestion = Boolean(data.isQuizQuestion) || (
        (msgText.includes('물어볼게') || msgText.includes('질문 하나') || msgText.includes('가볍게 한 가지')) &&
        !isCompleteFeedback && !isRetryFeedback
      );

      const evidence = Array.isArray(data.evidence) ? data.evidence : [];

      if (isCompleteFeedback) {
        // 퀴즈 완료 -> 퀴즈 종료, 설명 버튼 복원
        stateManager.setQuizActive(false);
        stateManager.addMessage('assistant', msgText, { isExplanation: true, isQuizQuestion: false, evidence });
      } else if (isRetryFeedback || isQuizQuestion) {
        // 퀴즈 질문 또는 재시도 힌트 -> 버튼 숨김 유지
        stateManager.setQuizActive(true);
        stateManager.addMessage('assistant', msgText, { isExplanation: false, isQuizQuestion: true, evidence: [] });
      } else {
        // 일반 대화 또는 설명
        stateManager.setQuizActive(false);
        stateManager.addMessage('assistant', msgText, { isExplanation: true, isQuizQuestion: false, evidence });
      }

      if (Array.isArray(data.suggestedQuestions) && data.suggestedQuestions.length > 0) {
        stateManager.setSuggestedQuestions(data.suggestedQuestions);
      } else if (isQuizQuestion) {
        stateManager.setSuggestedQuestions([]);
      }
    }
    if (data.tao) {
      stateManager.addTaoLog(data.tao);
    }
    if (data.comprehensionCheck) {
      stateManager.addComprehensionCheck(data.comprehensionCheck);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    console.error('채팅 요청 에러:', err);
    showAlert('일시적으로 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.');
    stateManager.addMessage(
      'assistant',
      '미안해, 답변을 생성하는 중에 일시적인 오류가 발생했어. 잠시 후 다시 질문해 줄래?'
    );
  } finally {
    isLoading = false;
    renderApp();
  }
}

/**
 * 책 사진과 함께 메시지 전송 (멀티모달)
 */
async function handleSendImageMessage({ text, image }: { text: string; image: MessageImage }): Promise<void> {
  if (isLoading) return;

  // 유저 메시지에 이미지 메타데이터 첨부하여 저장
  stateManager.addMessage('user', text, { image });
  isLoading = true;
  renderApp();

  try {
    const state = stateManager.getState();
    const response = await accountFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...buildReadingRequest(state),
        image: image // { data: base64, mimeType }
      })
    });

    const data = await response.json() as ReadingApiResponse;

    if (!response.ok) {
      throw new Error(data.details || data.error || '사진 분석 요청에 실패했습니다.');
    }

    if (data.extractedText) stateManager.setSourceText(data.extractedText);
    if (data.message) {
      stateManager.setQuizActive(false);
      // 사진 등록 직후 후보 좁히기 질문은 버튼 비활성화
      const isIntroQuestion = data.message.includes('어느 부분이') || data.message.includes('이해하기 어려워');
      const evidence = !isIntroQuestion && Array.isArray(data.evidence) ? data.evidence : [];
      stateManager.addMessage('assistant', data.message, {
        isExplanation: !isIntroQuestion,
        isQuizQuestion: false,
        evidence
      });

      if (Array.isArray(data.suggestedQuestions) && data.suggestedQuestions.length > 0) {
        stateManager.setSuggestedQuestions(data.suggestedQuestions);
      }
    }
    if (data.tao) {
      stateManager.addTaoLog(data.tao);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    console.error('사진 분석 요청 에러:', err);
    showAlert('책 사진을 분석하는 중 문제가 발생했습니다. 사진이 너무 크거나 흐리지 않은지 확인해 주세요.');
    stateManager.addMessage(
      'assistant',
      '사진을 분석하는 중에 오류가 생겼어. 사진 속 글씨가 선명한지 확인하고 다시 올려줄래?'
    );
  } finally {
    isLoading = false;
    renderApp();
  }
}

/**
 * 설명 난이도 재조정 ([더 간단히] / [조금 더 자세히])
 */
async function handleExplainLevel(level: string): Promise<void> {
  if (isLoading) return;

  const promptText = level === 'simple'
    ? '방금 설명해 준 내용을 2~4문장으로 핵심만 더 간단하게 설명해줘.'
    : '방금 설명해 준 내용의 앞뒤 문맥과 인물 행동, 쉬운 예시를 덧붙여 조금 더 자세히 설명해줘.';

  stateManager.addMessage('user', promptText);
  isLoading = true;
  renderApp();

  try {
    const state = stateManager.getState();
    const response = await accountFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildReadingRequest(state, level))
    });

    const data = await response.json() as ReadingApiResponse;

    if (!response.ok) {
      throw new Error(data.details || data.error || '설명 변경 요청에 실패했습니다.');
    }

    if (data.message) {
      stateManager.setQuizActive(false);
      const evidence = Array.isArray(data.evidence) ? data.evidence : [];
      stateManager.addMessage('assistant', data.message, { isExplanation: true, isQuizQuestion: false, evidence });

      if (Array.isArray(data.suggestedQuestions) && data.suggestedQuestions.length > 0) {
        stateManager.setSuggestedQuestions(data.suggestedQuestions);
      }
    }
    if (data.tao) {
      stateManager.addTaoLog(data.tao);
    }
    if (data.comprehensionCheck) {
      stateManager.addComprehensionCheck(data.comprehensionCheck);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    console.error('설명 난이도 요청 에러:', err);
    showAlert(`설명 변환 실패: ${errorMessage(err)}`);
  } finally {
    isLoading = false;
    renderApp();
  }
}

/**
 * 이해했는지 확인 질문 요청
 */
async function handleCheckUnderstanding(): Promise<void> {
  if (isLoading) return;

  const promptText = '방금 설명해 준 내용을 내가 잘 이해했는지 확인해 볼 수 있게 짧은 질문 하나만 내줘.';
  stateManager.addMessage('user', promptText);
  stateManager.setQuizActive(true);
  stateManager.setSuggestedQuestions([]);
  isLoading = true;
  renderApp();

  try {
    const state = stateManager.getState();
    const response = await accountFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildReadingRequest(state, 'quiz_request'))
    });

    const data = await response.json() as ReadingApiResponse;

    if (!response.ok) {
      throw new Error(data.details || data.error || '이해 확인 질문 요청에 실패했습니다.');
    }

    if (data.message) {
      stateManager.setQuizActive(true);
      stateManager.addMessage('assistant', data.message, {
        isExplanation: false,
        isQuizQuestion: true
      });
    }
    if (data.tao) {
      stateManager.addTaoLog(data.tao);
    }
    if (data.comprehensionCheck) {
      stateManager.addComprehensionCheck(data.comprehensionCheck);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    console.error('이해 확인 질문 에러:', err);
    showAlert('이해 확인 질문을 생성하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  } finally {
    isLoading = false;
    renderApp();
  }
}

/**
 * 지금까지 읽은 내용 요약 생성
 */
async function handleGenerateSummary(): Promise<void> {
  if (isSummaryLoading) return;

  const state = stateManager.getState();
  if (state.session.recentMessages.length === 0) {
    alert('먼저 책 내용에 대해 대화를 나눈 뒤 요약을 생성해 주세요.');
    return;
  }

  isSummaryLoading = true;
  renderApp();

  try {
    const response = await accountFetch('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildReadingRequest(state))
    });

    const data = await response.json() as ReadingApiResponse;

    if (!response.ok) {
      throw new Error(data.details || data.error || '요약 생성 요청에 실패했습니다.');
    }

    if (data.summary) {
      stateManager.setSummary(data.summary);
    }
    if (data.tao) {
      stateManager.addTaoLog(data.tao);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    console.error('요약 생성 에러:', err);
    showAlert('독서 요약을 생성하는 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  } finally {
    isSummaryLoading = false;
    renderApp();
  }
}

/**
 * 대화 내용 및 ReadingState 기반 오늘의 독서노트 생성
 */
async function handleGenerateReadingNote(): Promise<void> {
  if (isReadingNoteLoading) return;

  const state = stateManager.getState();
  if (!state.session.recentMessages || state.session.recentMessages.length === 0) {
    showAlert('먼저 책 내용에 대해 질문하거나 대화를 나눈 뒤 독서노트를 업데이트해 주세요.');
    return;
  }

  isReadingNoteLoading = true;
  renderApp();

  try {
    const response = await accountFetch('/api/reading-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildReadingRequest(state))
    });

    const data = await response.json() as ReadingApiResponse;

    if (!response.ok) {
      throw new Error(data.details || data.error || '독서노트 생성 요청에 실패했습니다.');
    }

    if (data.readingNote) {
      stateManager.setReadingNote(data.readingNote);
    }
    if (data.tao) {
      stateManager.addTaoLog(data.tao);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    console.error('독서노트 생성 에러:', err);
    showAlert(`독서노트 생성 중 오류: ${errorMessage(err)}`);
  } finally {
    isReadingNoteLoading = false;
    renderApp();
  }
}

/**
 * 모바일 탭 전환
 */
function switchMobileTab(targetId: string | null): void {
  const tabs = document.querySelectorAll('.mobile-tab-btn');
  const panels = document.querySelectorAll('.panel-section');

  tabs.forEach(tab => {
    if (tab.getAttribute('data-target') === targetId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  panels.forEach(panel => {
    if (panel.id === targetId) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });
}

function initMobileNav(): void {
  const nav = document.getElementById('mobile-nav');
  if (!nav) return;
  nav.querySelectorAll('.mobile-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      switchMobileTab(target);
    });
  });
}

// 앱 시작
window.addEventListener('DOMContentLoaded', () => {
  // [이 책 읽기] 연동: URL 파라미터로 전달된 책 제목이 있는 경우 즉시 반영
  const urlParams = new URLSearchParams(window.location.search);
  const titleParam = urlParams.get('title');
  if (titleParam) {
    stateManager.setBookTitle(decodeURIComponent(titleParam));
  }
  initMobileNav();
  renderApp();
});

// 상태 변경 시 리렌더링
subscribeAccount(() => {
  isModalOpen = false;
  isReadingLevelModalOpen = false;
  alertBannerEl?.classList.add('hidden');
  const title = new URLSearchParams(window.location.search).get('title');
  if (getAccountId() && !initialTitleHandled) {
    initialTitleHandled = true;
    if (title) stateManager.setBookTitle(title);
  }
  renderApp();
});
stateManager.subscribe(() => {
  renderApp();
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
