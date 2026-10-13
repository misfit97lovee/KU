/**
 * 시선 입력원
 *  - webcam: WebGazer.js (브라우저 안에서만 처리, 영상은 서버로 전송/저장하지 않음)
 *  - mouse : 카메라가 없거나 허용하지 않을 때 마우스를 시선처럼 사용 (체험/대체용)
 */

export interface GazePoint {
  /** 뷰포트 좌표(px) */
  x: number;
  y: number;
  t: number;
}

export interface GazeSource {
  kind: 'webcam' | 'mouse';
  start(onPoint: (p: GazePoint) => void): void;
  stop(): void;
}

interface WebGazerApi {
  params: Record<string, unknown>;
  setRegression(name: string): WebGazerApi;
  setGazeListener(fn: (data: { x: number; y: number } | null, elapsed: number) => void): WebGazerApi;
  saveDataAcrossSessions?(v: boolean): WebGazerApi;
  showVideoPreview(v: boolean): WebGazerApi;
  showPredictionPoints(v: boolean): WebGazerApi;
  showFaceOverlay?(v: boolean): WebGazerApi;
  showFaceFeedbackBox?(v: boolean): WebGazerApi;
  applyKalmanFilter(v: boolean): WebGazerApi;
  begin(onFail?: () => void): Promise<WebGazerApi>;
  recordScreenPosition(x: number, y: number, type?: string): void;
  pause(): void;
  resume(): void;
  end(): void;
  setStaticVideo(stream: MediaStream | null): WebGazerApi;
  removeMouseEventListeners(): WebGazerApi;
  clearGazeListener(): WebGazerApi;
  getRegression(): Array<{ init(): void }>;
  clearData?(): Promise<void> | void;
  isReady?(): boolean;
}

declare global {
  interface Window {
    webgazer?: WebGazerApi;
  }
}

const WEBGAZER_BASE = '/vendor/webgazer';
let loading: Promise<WebGazerApi> | null = null;

export function loadWebGazer(): Promise<WebGazerApi> {
  if (window.webgazer) return Promise.resolve(window.webgazer);
  if (loading) return loading;
  loading = new Promise<WebGazerApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${WEBGAZER_BASE}/webgazer.js`;
    script.async = true;
    script.onload = () => (window.webgazer ? resolve(window.webgazer) : reject(new Error('webgazer not found')));
    script.onerror = () => {
      loading = null;
      reject(new Error('시선 추적 모듈을 불러오지 못했어요.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export interface WebcamGaze extends GazeSource {
  kind: 'webcam';
  /** 보정용: 화면의 (x, y)를 지금 보고 있다고 학습시킨다 */
  calibrate(x: number, y: number): void;
  setPreviewVisible(v: boolean): void;
}

/**
 * 카메라를 켜고 WebGazer를 준비한다. 권한 거부 등은 예외로 던진다.
 */
export async function createWebcamSource(signal?: AbortSignal): Promise<WebcamGaze> {
  const wg = await loadWebGazer();
  signal?.throwIfAborted();
  wg.params.faceMeshSolutionPath = `${WEBGAZER_BASE}/mediapipe/face_mesh`;
  wg.saveDataAcrossSessions?.(false); // 눈 영상 특징을 브라우저에 남기지 않는다
  wg.setRegression('ridge')
    .showVideoPreview(true)
    .showPredictionPoints(false)
    .applyKalmanFilter(true);
  wg.showFaceOverlay?.(false);
  wg.showFaceFeedbackBox?.(true);

  let listener: ((p: GazePoint) => void) | null = null;
  let stream: MediaStream | null = null;
  let stopped = false;
  let ready: (() => void) | null = null;
  const stop = () => {
    stopped = true;
    listener = null;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    wg.pause();
    wg.clearGazeListener();
    wg.removeMouseEventListeners();
    try { wg.showVideoPreview(false); wg.end(); } catch { /* startup may not have created elements */ }
    wg.setStaticVideo(null);
    wg.getRegression().forEach(regression => regression.init());
  };
  signal?.addEventListener('abort', stop, { once: true });
  wg.setGazeListener((data) => {
    ready?.(); // First processed frame, including a frame without a face.
    if (data && listener) listener({ x: data.x, y: data.y, t: performance.now() });
  });

  try {
    // Own the stream: this WebGazer build's end() only removes its UI.
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    if (stopped || signal?.aborted) { stop(); throw new DOMException('Camera cancelled', 'AbortError'); }
    wg.setStaticVideo(stream);
    // Static-stream begin() returns before this build finishes its async camera/model setup.
    // Wait for an actual processed frame instead of showing calibration prematurely.
    await new Promise<void>((resolve, reject) => {
      const fail = () => { cleanup(); reject(new DOMException('Camera cancelled', 'AbortError')); };
      const timer = window.setTimeout(() => {
        cleanup(); reject(new Error('시선 추적 모듈을 준비하지 못했어요. 카메라와 모델을 확인해 주세요.'));
      }, 30000);
      const cleanup = () => {
        ready = null;
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', fail);
      };
      ready = () => { cleanup(); resolve(); };
      signal?.addEventListener('abort', fail, { once: true });
      try { Promise.resolve(wg.begin()).catch(error => { cleanup(); reject(error); }); }
      catch (error) { cleanup(); reject(error); }
    });
    if (stopped || signal?.aborted) { stop(); throw new DOMException('Camera cancelled', 'AbortError'); }
  } catch (error) {
    stop();
    signal?.removeEventListener('abort', stop);
    throw error;
  }

  return {
    kind: 'webcam',
    calibrate(x, y) {
      wg.recordScreenPosition(x, y, 'click');
    },
    setPreviewVisible(v) {
      wg.showVideoPreview(v);
    },
    start(onPoint) {
      listener = onPoint;
      wg.resume();
    },
    stop() {
      stop();
      signal?.removeEventListener('abort', stop);
    }
  };
}

export function createMouseSource(): GazeSource {
  let handler: ((e: MouseEvent) => void) | null = null;
  let timer: number | null = null;
  return {
    kind: 'mouse',
    start(onPoint) {
      // 마우스가 멈춰 있어도 같은 곳을 보고 있는 것으로 계속 샘플링한다
      let last: { x: number; y: number } | null = null;
      handler = (e) => { last = { x: e.clientX, y: e.clientY }; };
      window.addEventListener('mousemove', handler);
      timer = window.setInterval(() => {
        if (last) onPoint({ ...last, t: performance.now() });
      }, 33);
    },
    stop() {
      if (handler) window.removeEventListener('mousemove', handler);
      if (timer !== null) window.clearInterval(timer);
      handler = null;
      timer = null;
    }
  };
}
