import type { GazeReport, MessageImage } from '../types/index.ts';
import '../gaze.css';
import { openCameraModal } from './CameraModal.ts';
import { getAccountRevision, subscribeAccount } from '../accountStorage.ts';

let closeActiveGaze: (() => void) | null = null;
subscribeAccount(() => { closeActiveGaze?.(); closeActiveGaze = null; });

interface BookInputOptions {
  introductory?: boolean;
  bookTitle?: string;
  onSendToChat: (text: string) => void;
  onSendImage: (payload: { text: string; image: MessageImage; previewUrl: string | null }) => void;
  onGazeReport?: (report: Omit<GazeReport, 'id' | 'createdAt'>) => void;
}

export function renderBookInputPanel(container: HTMLElement, { introductory = false, bookTitle = '', onSendToChat, onSendImage, onGazeReport }: BookInputOptions): void {
  const revision = getAccountRevision();
  let activeTab: 'image' | 'direct' = 'image'; // 우선순위 1이므로 기본 탭을 '책 사진 올리기'로 설정
  let selectedFile: File | null = null;
  let previewUrl: string | null = null;
  let activeCameraCleanup: (() => void) | null = null;

  function update() {
    if (revision !== getAccountRevision()) return;
    container.innerHTML = `
      ${introductory ? `<div class="reading-intro">
        <p class="intro-label">독서 도우미</p>
        <h1>막힌 문장부터,<br>함께 읽어요.</h1>
        <p>책 사진을 찍거나 어려운 문장을 적어주세요.<br>책을 고르지 않아도 바로 시작할 수 있어요.</p>
      </div>` : `<div class="panel-header">
        <div class="panel-title">
          <span>책 내용</span>
        </div>
        <p class="panel-subtitle">궁금한 부분을 한 번에 한 장씩 보여주세요.</p>
      </div>`}

      <div class="panel-body">
        ${bookTitle ? `<div class="book-context-summary">
          <span>읽고 있는 책</span>
          <strong>${escapeHtml(bookTitle)}</strong>
        </div>` : ''}
        ${!introductory || activeTab === 'direct' ? `<div class="book-tabs">
          <button class="book-tab-btn ${activeTab === 'image' ? 'active' : ''}" data-tab="image">
            ${introductory ? '사진으로 시작' : '사진'}
          </button>
          <button class="book-tab-btn ${activeTab === 'direct' ? 'active' : ''}" data-tab="direct">
            문장 입력하기
          </button>
        </div>` : ''}

        ${activeTab === 'image' ? renderImageTab(selectedFile, previewUrl, introductory) : ''}
        ${activeTab === 'direct' ? renderTextTab(activeTab) : ''}
      </div>
    `;

    // 탭 전환 이벤트
    container.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab') === 'direct' ? 'direct' : 'image';
        if (activeTab === 'direct') {
          activeCameraCleanup?.();
          activeCameraCleanup = null;
        }
        update();
        if (activeTab === 'direct') container.querySelector<HTMLTextAreaElement>('#book-text-input')?.focus();
      });
    });

    // 텍스트 전송 이벤트 바인딩
    const submitTextBtn = container.querySelector('#btn-submit-book-text');
    if (submitTextBtn) {
      submitTextBtn.addEventListener('click', () => {
        const textarea = container.querySelector<HTMLTextAreaElement>('#book-text-input')!;
        const text = textarea.value.trim();
        if (!text) {
          alert('책 내용을 입력해 주세요.');
          return;
        }
        textarea.value = '';
        onSendToChat(`[책 내용] "${text}"\n이 부분이 잘 이해가 안 돼.`);
      });
    }

    // 파일 업로드 및 카메라 촬영 이벤트 바인딩
    const fileInput = container.querySelector<HTMLInputElement>('#book-photo-input');
    const openCameraBtn = container.querySelector('#btn-open-camera');
    const selectFileBtn = container.querySelector('#btn-select-file');
    const dropZone = container.querySelector<HTMLElement>('#photo-dropzone');
    const removeBtn = container.querySelector('#btn-remove-photo');
    const submitImageBtn = container.querySelector('#btn-submit-book-photo');
    container.querySelector('#btn-gaze-read')?.addEventListener('click', async () => {
      if (!previewUrl) return;
      const imageUrl = previewUrl;
      const { openGazeReader } = await import('./GazeReaderModal.ts');
      if (revision !== getAccountRevision() || imageUrl !== previewUrl) return;
      activeCameraCleanup?.();
      closeActiveGaze?.();
      closeActiveGaze = openGazeReader({ imageUrl,
        onAskAbout: payload => { if (revision === getAccountRevision()) onSendImage(payload); },
        onReport: report => { if (revision === getAccountRevision()) onGazeReport?.(report); }
      });
    });

    if (openCameraBtn) {
      openCameraBtn.addEventListener('click', () => {
        activeCameraCleanup?.();
        activeCameraCleanup = openCameraModal({
          onCapture: (file: File) => {
            activeCameraCleanup = null;
            handleFileSelect(file);
          },
          onSelectFileFallback: () => {
            activeCameraCleanup = null;
            fileInput?.click();
          }
        });
      });
    }

    if (selectFileBtn) {
      selectFileBtn.addEventListener('click', () => {
        fileInput?.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        handleFileSelect(file);
      });
    }

    if (dropZone) {
      dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput?.click(); }
      });
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--primary)';
        dropZone.style.background = 'var(--primary-light)';
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'var(--border-color)';
        dropZone.style.background = 'var(--bg-subtle)';
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-color)';
        dropZone.style.background = 'var(--bg-subtle)';
        const file = (e as DragEvent).dataTransfer?.files?.[0];
        handleFileSelect(file);
      });

      dropZone.addEventListener('click', () => {
        fileInput?.click();
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedFile = null;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        update();
      });
    }

    if (submitImageBtn) {
      submitImageBtn.addEventListener('click', async () => {
        if (!selectedFile) {
          alert('먼저 책 사진을 업로드해 주세요.');
          return;
        }
        const file = selectedFile;
        const commentInput = container.querySelector<HTMLInputElement>('#photo-comment-input');
        const comment = commentInput?.value.trim() || '책 페이지 사진을 찍었어. 이해하기 어려운 부분이 있어.';

        // Base64 변환
        const base64Data = await fileToBase64(file);
        if (revision !== getAccountRevision()) return;
        const mimeType = file.type || 'image/jpeg';

        const payload = {
          text: `[책 사진 업로드]\n${comment}`,
          image: {
            data: base64Data,
            mimeType: mimeType
          },
          previewUrl: previewUrl
        };

        // 전송 후 입력 폼 초기화
        selectedFile = null;
        previewUrl = null;
        update();
        onSendImage(payload);
      });
    }
  }

  function handleFileSelect(file?: File): void {
    if (revision !== getAccountRevision()) return;
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      alert('jpg, jpeg, png 형식의 이미지만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('사진 용량이 너무 큽니다. 10MB 이하의 이미지를 올려주세요.');
      return;
    }
    selectedFile = file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    update();
  }

  update();
}

function renderImageTab(selectedFile: File | null, previewUrl: string | null, introductory = false): string {
  return `
    <div style="display: flex; flex-direction: column; gap: 14px; flex: 1;">
      <input
        type="file"
        id="book-photo-input"
        accept="image/jpeg, image/jpg, image/png"
        style="display: none;"
      />

      ${previewUrl ? `
        <div style="position: relative; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-color); background: var(--bg-subtle); text-align: center;">
          <img
            src="${previewUrl}"
            alt="책 사진 미리보기"
            style="max-height: 220px; max-width: 100%; object-fit: contain; display: inline-block;"
          />
          <button
            id="btn-remove-photo"
            class="photo-remove"
            title="사진 제거"
          >사진 지우기</button>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary);">
          ${escapeHtml(selectedFile?.name || '')}
        </div>
      ` : `
        <div class="photo-upload-actions">
          <button type="button" id="btn-open-camera" class="${introductory ? 'btn-send-book' : 'btn-secondary-sm'} photo-action-btn">
            책 사진 찍기
          </button>
          ${introductory ? '<button type="button" data-tab="direct" class="btn-secondary-sm photo-action-btn">문장 입력하기</button>' : ''}
        </div>
        <button type="button" id="btn-select-file" class="file-select-link">이미 찍은 사진 선택</button>
        ${!introductory ? `<div
          id="photo-dropzone"
          class="phase-placeholder photo-dropzone"
          role="button" tabindex="0" aria-label="책 페이지 사진 올리기"
        >
          <div style="font-weight: 500; color: var(--text-primary); margin-top: 4px;">책 페이지를 올려주세요</div>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 2px;">
            JPG, PNG (드래그하거나 위 버튼을 눌러주세요)
          </p>
        </div>` : ''}
      `}

      ${selectedFile ? `<input
        type="text"
        id="photo-comment-input"
        aria-label="사진에 대해 궁금한 점 (선택)"
        class="book-title-input"
        style="width: 100%;"
        placeholder="궁금한 점이 있다면 적어주세요"
      />

      <button
        id="btn-submit-book-photo"
        class="btn-send-book"
        ${!selectedFile ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}
      >
        이 부분 물어보기
      </button>` : ''}
      ${previewUrl ? `
      <button
        type="button"
        id="btn-gaze-read"
        class="gz-entry"
        ${!previewUrl ? 'disabled aria-disabled="true" style="opacity: 0.55; cursor: not-allowed;"' : ''}
      >
        <span>시선으로 읽기</span>
        <small>${previewUrl ? '카메라로 읽는 위치를 기록해요' : '책 페이지 사진을 올리면 시작할 수 있어요'}</small>
      </button>` : ''}
    </div>
  `;
}

function renderTextTab(activeTab: 'image' | 'direct'): string {
  return `
    <textarea
      id="book-text-input"
      class="book-input-textarea"
      aria-label="책 내용 직접 입력" placeholder="어려운 문장이나 표현을 입력하거나 붙여넣어 주세요."
    ></textarea>

    <button id="btn-submit-book-text" class="btn-send-book">
      이 부분 물어보기
    </button>
  `;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      // data:image/jpeg;base64,.... 에서 실제 base64 부분만 추출
      const base64 = result.split(',')[1];
      resolve(base64 || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
