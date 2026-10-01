/**
 * 책 페이지 웹캠 촬영 모달 컴포넌트
 *
 * 브라우저 표준 MediaDevices API를 사용하여 웹캠/카메라로 책 페이지를 직접 촬영하고,
 * 기존 업로드 흐름(File 객체)과 동일하게 전달합니다.
 */

export interface CameraModalOptions {
  onCapture: (file: File) => void;
  onSelectFileFallback?: () => void;
}

/**
 * MediaStream 트랙을 안전하게 정지하여 카메라를 종료합니다.
 */
export function stopCameraStream(stream: MediaStream | null): void {
  if (!stream) return;
  try {
    const tracks = stream.getTracks();
    for (const track of tracks) {
      try {
        track.stop();
      } catch {
        // ignore track stop errors
      }
    }
  } catch {
    // ignore stream access errors
  }
}

/**
 * 개발자용 에러 객체나 stack trace 대신 사용자 친화적 한글 안내 메시지 반환
 */
export function getFriendlyCameraErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const errName = (error as { name: string }).name;
    if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
      return '카메라 사용이 허용되지 않았어요. 브라우저에서 카메라 권한을 허용하거나 파일에서 사진을 선택해 주세요.';
    }
    if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
      return '사용할 수 있는 카메라를 찾지 못했어요. 파일에서 사진을 선택할 수 있어요.';
    }
    if (errName === 'NotReadableError' || errName === 'TrackStartError') {
      return '카메라를 시작할 수 없어요. 다른 프로그램에서 카메라를 사용 중인지 확인하거나 파일에서 사진을 선택해 주세요.';
    }
    if (errName === 'OverconstrainedError' || errName === 'ConstraintNotSatisfiedError') {
      return '카메라 설정을 불러올 수 없어요. 파일에서 사진을 선택할 수 있어요.';
    }
  }
  return '카메라를 연결하는 중 문제가 발생했어요. 브라우저 권한을 확인하거나 파일에서 사진을 선택해 주세요.';
}

/**
 * 카메라 촬영 모달을 띄우고 종료 정리 함수를 반환합니다.
 */
export function openCameraModal(options: CameraModalOptions): () => void {
  let currentStream: MediaStream | null = null;
  let capturedFile: File | null = null;
  let previewBlobUrl: string | null = null;
  let isClosed = false;

  const backdrop = document.createElement('div');
  backdrop.className = 'camera-modal-backdrop';
  backdrop.id = 'camera-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', '책 페이지 촬영');

  backdrop.innerHTML = `
    <div class="camera-modal-content">
      <div class="camera-modal-header">
        <h3 class="camera-modal-title">책 페이지 촬영</h3>
        <button type="button" class="camera-modal-close" id="btn-camera-close" aria-label="닫기">✕</button>
      </div>

      <div class="camera-modal-body">
        <!-- 1. 실시간 카메라 뷰 -->
        <div id="camera-live-section" class="camera-section">
          <p class="camera-guide-text">책 페이지를 화면 안에 맞춰 주세요</p>
          <div class="camera-viewport">
            <video id="camera-video-el" autoplay playsinline muted></video>
            <div class="camera-guide-frame" aria-hidden="true"></div>
          </div>
          <div class="camera-actions">
            <button type="button" id="btn-camera-cancel" class="btn-secondary-sm camera-btn">닫기</button>
            <button type="button" id="btn-camera-snap" class="btn-send-book camera-btn camera-btn-primary">촬영</button>
          </div>
        </div>

        <!-- 2. 촬영 후 미리보기 뷰 -->
        <div id="camera-review-section" class="camera-section" style="display: none;">
          <p class="camera-guide-text">촬영된 사진을 확인해 주세요</p>
          <div class="camera-viewport camera-preview-viewport">
            <img id="camera-preview-img" alt="촬영된 책 사진" />
          </div>
          <div class="camera-actions">
            <button type="button" id="btn-camera-retake" class="btn-secondary-sm camera-btn">다시 찍기</button>
            <button type="button" id="btn-camera-use" class="btn-send-book camera-btn camera-btn-primary">이 사진 사용하기</button>
          </div>
        </div>

        <!-- 3. 에러 안내 뷰 -->
        <div id="camera-error-section" class="camera-section" style="display: none;">
          <div class="camera-error-box">
            <p id="camera-error-message"></p>
          </div>
          <div class="camera-actions">
            <button type="button" id="btn-camera-error-fallback" class="btn-secondary-sm camera-btn">파일에서 선택</button>
            <button type="button" id="btn-camera-error-close" class="btn-secondary-sm camera-btn">닫기</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const liveSection = backdrop.querySelector<HTMLElement>('#camera-live-section')!;
  const reviewSection = backdrop.querySelector<HTMLElement>('#camera-review-section')!;
  const errorSection = backdrop.querySelector<HTMLElement>('#camera-error-section')!;
  const errorMessageEl = backdrop.querySelector<HTMLElement>('#camera-error-message')!;
  const videoEl = backdrop.querySelector<HTMLVideoElement>('#camera-video-el');
  const previewImg = backdrop.querySelector<HTMLImageElement>('#camera-preview-img');

  function showError(msg: string): void {
    if (errorMessageEl) {
      errorMessageEl.textContent = msg;
    }
    liveSection.style.display = 'none';
    reviewSection.style.display = 'none';
    errorSection.style.display = 'flex';
  }

  function closeModal(): void {
    if (isClosed) return;
    isClosed = true;

    stopCameraStream(currentStream);
    currentStream = null;

    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      previewBlobUrl = null;
    }

    document.removeEventListener('keydown', handleKeyDown);
    if (backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      closeModal();
    }
  }

  document.addEventListener('keydown', handleKeyDown);

  // 배경 클릭 시 닫기
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeModal();
    }
  });

  // 헤더 닫기 버튼
  backdrop.querySelector('#btn-camera-close')?.addEventListener('click', () => {
    closeModal();
  });

  // 하단 닫기 버튼
  backdrop.querySelector('#btn-camera-cancel')?.addEventListener('click', () => {
    closeModal();
  });

  // 에러 화면 닫기 버튼
  backdrop.querySelector('#btn-camera-error-close')?.addEventListener('click', () => {
    closeModal();
  });

  // 에러 화면 파일에서 선택 버튼
  backdrop.querySelector('#btn-camera-error-fallback')?.addEventListener('click', () => {
    closeModal();
    options.onSelectFileFallback?.();
  });

  // 촬영 버튼
  backdrop.querySelector('#btn-camera-snap')?.addEventListener('click', () => {
    if (!videoEl || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      showError('카메라 영상을 아직 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        showError('촬영 이미지를 처리하는 중 오류가 발생했어요. 다시 시도해 주세요.');
        return;
      }

      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            showError('촬영된 사진을 변환하지 못했어요. 다시 시도해 주세요.');
            return;
          }

          capturedFile = new File([blob], 'camera-capture.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now()
          });

          if (previewBlobUrl) {
            URL.revokeObjectURL(previewBlobUrl);
          }
          previewBlobUrl = URL.createObjectURL(blob);

          if (previewImg) {
            previewImg.src = previewBlobUrl;
          }

          liveSection.style.display = 'none';
          errorSection.style.display = 'none';
          reviewSection.style.display = 'flex';
        },
        'image/jpeg',
        0.9
      );
    } catch {
      showError('촬영된 사진을 변환하지 못했어요. 다시 시도해 주세요.');
    }
  });

  // 다시 찍기 버튼
  backdrop.querySelector('#btn-camera-retake')?.addEventListener('click', () => {
    capturedFile = null;
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      previewBlobUrl = null;
    }
    if (previewImg) {
      previewImg.src = '';
    }

    reviewSection.style.display = 'none';
    errorSection.style.display = 'none';
    liveSection.style.display = 'flex';

    if (videoEl && currentStream && videoEl.paused) {
      videoEl.play().catch(() => {});
    }
  });

  // 이 사진 사용하기 버튼
  backdrop.querySelector('#btn-camera-use')?.addEventListener('click', () => {
    if (!capturedFile) return;
    const fileToSend = capturedFile;
    closeModal();
    options.onCapture(fileToSend);
  });

  // 카메라 시작
  async function initCamera(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('현재 브라우저에서는 카메라 기능을 지원하지 않아요. 파일에서 사진을 선택해 주세요.');
      return;
    }

    try {
      let stream: MediaStream;
      try {
        // 책 페이지 촬영용 후면 또는 환경 카메라 우선 요청, 데스크톱에서도 자동 폴백
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
      } catch (constraintErr: unknown) {
        // 특정 제약조건으로 인한 실패 시 기본 비디오로 폴백
        if (
          constraintErr instanceof DOMException &&
          (constraintErr.name === 'OverconstrainedError' || constraintErr.name === 'ConstraintNotSatisfiedError')
        ) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } else {
          throw constraintErr;
        }
      }

      if (isClosed) {
        stopCameraStream(stream);
        return;
      }

      currentStream = stream;
      if (videoEl) {
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => {});
      }
    } catch (err: unknown) {
      if (isClosed) return;
      showError(getFriendlyCameraErrorMessage(err));
    }
  }

  initCamera();

  return closeModal;
}
