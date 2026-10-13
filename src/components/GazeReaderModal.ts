import '../gaze.css';
import { GazeAccumulator, heatColor } from '../gaze/gazeAnalysis.ts';
import type { GazeHotspot, GazeSummary } from '../gaze/gazeAnalysis.ts';
import { createMouseSource, createWebcamSource } from '../gaze/gazeEngine.ts';
import type { GazePoint, GazeSource, WebcamGaze } from '../gaze/gazeEngine.ts';
import { getFriendlyCameraErrorMessage } from './CameraModal.ts';
import type { GazeReport, MessageImage } from '../types/index.ts';
import { getAccountId, subscribeAccount } from '../accountStorage.ts';

/**
 * 시선 추적 읽기 모달
 * 동의 → (카메라) 보정 → 책 사진을 읽는 동안 시선 기록 → 히트맵/어려운 부분 결과
 *
 * 모달은 document.body 에 붙이므로 앱의 패널 리렌더링에 영향받지 않는다.
 */

export interface GazeReaderOptions {
  imageUrl: string;
  /** 시선으로 찾은 부분을 잘라 채팅으로 질문 */
  onAskAbout: (payload: { text: string; image: MessageImage; previewUrl: string | null }) => void;
  /** 읽기가 끝나 결과가 나왔을 때(독서 기록에 저장) */
  onReport: (report: Omit<GazeReport, 'id' | 'createdAt'>) => void;
}

const CALIBRATION_POINTS: Array<[number, number]> = [
  [0.1, 0.12], [0.5, 0.12], [0.9, 0.12],
  [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
  [0.1, 0.88], [0.5, 0.88], [0.9, 0.88]
];
const CLICKS_PER_POINT = 4;
const EMA_ALPHA = 0.35;

type Stage = 'consent' | 'loading' | 'calibrate' | 'reading' | 'result';

export function openGazeReader(options: GazeReaderOptions): () => void {
  let stage: Stage = 'consent';
  let source: GazeSource | null = null;
  let sourceKind: 'webcam' | 'mouse' = 'webcam';
  let acc: GazeAccumulator | null = null;
  let summary: GazeSummary | null = null;
  let startedAt = 0;
  let timer: number | null = null;
  let toastTimer: number | null = null;
  let smooth: { x: number; y: number } | null = null;
  let showDot = false;
  let reported = false;
  let closed = false;
  const cameraController = new AbortController();
  const accountId = getAccountId();
  const unsubscribeAccount = subscribeAccount(() => close());
  const onPageHide = () => close();
  window.addEventListener('pagehide', onPageHide);

  const img = new Image();
  img.src = options.imageUrl;

  const backdrop = document.createElement('div');
  backdrop.className = 'gz-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', '시선 추적으로 읽기');
  document.body.appendChild(backdrop);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  function close(): void {
    if (closed) return;
    closed = true;
    cameraController.abort();
    unsubscribeAccount();
    window.removeEventListener('pagehide', onPageHide);
    stopSource();
    if (timer !== null) window.clearInterval(timer);
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
  }

  function stopSource(): void {
    try {
      source?.stop();
    } catch {
      // ignore
    }
    source = null;
  }

  // ───────── 1. 동의 ─────────
  function renderConsent(message = ''): void {
    stage = 'consent';
    backdrop.innerHTML = `
      <div class="gz-card">
        <h3>시선으로 읽기</h3>
        <p class="gz-lead">책 사진을 읽는 동안 어디를 오래 보는지 알려 주면, 어려웠던 부분을 바로 물어볼 수 있어요.</p>
        <ul class="gz-privacy">
          <li>카메라 영상은 <strong>이 기기 안에서만</strong> 처리돼요. 서버로 보내거나 저장하지 않아요.</li>
          <li>히트맵 미리보기에는 <strong>책 사진도 포함</strong>돼요. 사진 속 이름·얼굴·메모 등 개인정보가 없는지 확인해 주세요.</li>
          <li>${accountId ? '현재 로그인 계정의 독서 기록에 이 브라우저 안에서 저장돼요.' : '로그인하지 않으면 기록은 저장되지 않아요.'} 시선 위치와 체류시간 요약도 포함돼요.</li>
          <li>‘이 부분 물어보기’를 누르면 선택한 책 사진 영역이 독서 도우미 AI 서버로 전송돼요.</li>
          <li>끝내거나 창을 닫으면 카메라가 바로 꺼져요.</li>
        </ul>
        <p class="gz-tip">밝은 곳에서 얼굴이 화면에 잘 보이게 앉고, 보정 중에는 머리를 너무 움직이지 마세요.</p>
        ${message ? `<p class="gz-error" role="alert"></p>` : ''}
        <div class="gz-actions-row">
          <button type="button" class="gz-btn gz-btn-primary" id="gz-start-cam">카메라로 시작</button>
          <button type="button" class="gz-btn" id="gz-start-mouse">마우스로 체험하기</button>
          <button type="button" class="gz-btn gz-btn-ghost" id="gz-cancel">취소</button>
        </div>
      </div>
    `;
    const err = backdrop.querySelector('.gz-error');
    if (err) err.textContent = message;
    backdrop.querySelector('#gz-start-cam')?.addEventListener('click', startWebcam);
    backdrop.querySelector('#gz-start-mouse')?.addEventListener('click', () => {
      source = createMouseSource();
      sourceKind = 'mouse';
      void beginReading();
    });
    backdrop.querySelector('#gz-cancel')?.addEventListener('click', close);
  }

  async function startWebcam(): Promise<void> {
    stage = 'loading';
    backdrop.innerHTML = `
      <div class="gz-card gz-center">
        <div class="gz-spinner" aria-hidden="true"></div>
        <p>카메라를 켜고 시선 모델을 준비하고 있어요…</p>
        <p class="gz-tip">처음에는 몇 초 걸릴 수 있어요. 카메라 권한을 물으면 "허용"을 눌러 주세요.</p>
        <button type="button" class="gz-btn" id="gz-loading-cancel">취소</button>
      </div>
    `;
    backdrop.querySelector('#gz-loading-cancel')?.addEventListener('click', close);
    try {
      const webcam = await createWebcamSource(cameraController.signal);
      if (closed) {
        webcam.stop();
        return;
      }
      source = webcam;
      sourceKind = 'webcam';
      renderCalibration(webcam);
    } catch (error) {
      if (closed) return;
      stopSource();
      const message = error instanceof Error && error.message.includes('시선 추적 모듈')
        ? error.message
        : getFriendlyCameraErrorMessage(error);
      renderConsent(`${message} 마우스로 체험하거나 다시 시도할 수 있어요.`);
    }
  }

  // ───────── 2. 보정 ─────────
  function renderCalibration(webcam: WebcamGaze): void {
    stage = 'calibrate';
    webcam.setPreviewVisible(true);
    const clicks = new Array(CALIBRATION_POINTS.length).fill(0) as number[];
    backdrop.innerHTML = `
      <div class="gz-calib">
        <p class="gz-calib-guide">
          <strong>점을 바라보면서 클릭하세요.</strong> 점마다 ${CLICKS_PER_POINT}번씩, 모두 9개예요.
          <span id="gz-calib-progress">0 / ${CALIBRATION_POINTS.length}</span>
          <button type="button" class="gz-btn gz-btn-ghost" id="gz-calib-cancel">취소</button>
        </p>
      </div>
    `;
    const wrap = backdrop.querySelector('.gz-calib') as HTMLElement;
    let done = 0;
    CALIBRATION_POINTS.forEach(([px, py], i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'gz-calib-dot';
      dot.style.left = `${px * 100}%`;
      dot.style.top = `${py * 100}%`;
      dot.setAttribute('aria-label', `보정 점 ${i + 1}`);
      dot.addEventListener('click', () => {
        const r = dot.getBoundingClientRect();
        webcam.calibrate(r.left + r.width / 2, r.top + r.height / 2);
        const count = (clicks[i] ?? 0) + 1;
        clicks[i] = count;
        dot.style.setProperty('--gz-fill', String(count / CLICKS_PER_POINT));
        if (count === CLICKS_PER_POINT) {
          dot.classList.add('done');
          dot.disabled = true;
          done++;
          const progress = backdrop.querySelector('#gz-calib-progress');
          if (progress) progress.textContent = `${done} / ${CALIBRATION_POINTS.length}`;
          if (done === CALIBRATION_POINTS.length) {
            webcam.setPreviewVisible(false);
            void beginReading();
          }
        }
      });
      wrap.appendChild(dot);
    });
    backdrop.querySelector('#gz-calib-cancel')?.addEventListener('click', close);
  }

  // ───────── 3. 읽기 ─────────
  async function beginReading(): Promise<void> {
    try {
      await img.decode();
    } catch {
      stopSource();
      renderConsent('책 사진을 불러오지 못했어요. 사진을 다시 선택해 주세요.');
      return;
    }
    if (closed) return;
    stage = 'reading';
    acc = new GazeAccumulator(img.naturalHeight / img.naturalWidth);
    summary = null;
    smooth = null;
    startedAt = performance.now();

    backdrop.innerHTML = `
      <div class="gz-reader">
        <div class="gz-topbar">
          <div class="gz-status"><span class="gz-rec" aria-hidden="true"></span><span id="gz-status-text">시선을 기록하고 있어요 · 0초</span></div>
          <div class="gz-top-actions">
            <label class="gz-check"><input type="checkbox" id="gz-toggle-dot" /> 내 시선 보기</label>
            <button type="button" class="gz-btn gz-btn-primary" id="gz-finish">다 읽었어요</button>
            <button type="button" class="gz-btn gz-btn-ghost" id="gz-cancel-read">취소</button>
          </div>
        </div>
        <div class="gz-page-wrap">
          <div class="gz-page" id="gz-page">
            <img id="gz-img" alt="읽고 있는 책 페이지" src="${options.imageUrl}" draggable="false" />
            <canvas id="gz-heat" class="gz-heat" hidden></canvas>
            <div id="gz-hot-layer" class="gz-hot-layer"></div>
          </div>
        </div>
        <div id="gz-dot" class="gz-dot" hidden></div>
        <div id="gz-toast" class="gz-toast" role="status" hidden></div>
        <div id="gz-result" class="gz-result" hidden></div>
      </div>
    `;
    backdrop.querySelector('#gz-toggle-dot')?.addEventListener('change', (e) => {
      showDot = (e.target as HTMLInputElement).checked;
      const dot = backdrop.querySelector<HTMLElement>('#gz-dot');
      if (dot && !showDot) dot.hidden = true;
    });
    backdrop.querySelector('#gz-finish')?.addEventListener('click', finishReading);
    backdrop.querySelector('#gz-cancel-read')?.addEventListener('click', close);

    timer = window.setInterval(() => {
      const text = backdrop.querySelector('#gz-status-text');
      if (text && stage === 'reading') {
        text.textContent = `시선을 기록하고 있어요 · ${Math.round((performance.now() - startedAt) / 1000)}초`;
      }
    }, 500);

    source?.start(handlePoint);
  }

  function handlePoint(raw: GazePoint): void {
    if (stage !== 'reading' || !acc) return;
    const pageImg = backdrop.querySelector<HTMLImageElement>('#gz-img');
    if (!pageImg) return;

    // 웹캠 추정값은 흔들리므로 지수이동평균으로 부드럽게 (마우스는 그대로)
    if (source?.kind === 'webcam') {
      smooth = smooth
        ? { x: smooth.x + (raw.x - smooth.x) * EMA_ALPHA, y: smooth.y + (raw.y - smooth.y) * EMA_ALPHA }
        : { x: raw.x, y: raw.y };
    } else {
      smooth = { x: raw.x, y: raw.y };
    }

    const rect = pageImg.getBoundingClientRect();
    const nx = (smooth.x - rect.left) / rect.width;
    const ny = (smooth.y - rect.top) / rect.height;

    if (showDot) {
      const dot = backdrop.querySelector<HTMLElement>('#gz-dot');
      if (dot) {
        dot.hidden = false;
        dot.style.transform = `translate(${smooth.x}px, ${smooth.y}px)`;
      }
    }

    const hot = acc.addSample(raw.t, nx, ny);
    if (hot) showHotspotToast(hot);
  }

  function showHotspotToast(hot: GazeHotspot): void {
    const toast = backdrop.querySelector<HTMLElement>('#gz-toast');
    const layer = backdrop.querySelector<HTMLElement>('#gz-hot-layer');
    if (!toast || !layer) return;

    layer.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'gz-hot-box';
    setRegionStyle(box, hot);
    layer.appendChild(box);

    toast.innerHTML = `
      <span class="gz-toast-text"><strong>${describePosition(hot)}</strong> 부분을 오래 봤어요. 어려웠나요?</span>
      <button type="button" class="gz-btn gz-btn-primary gz-btn-sm" id="gz-toast-ask">이 부분 물어보기</button>
      <button type="button" class="gz-btn gz-btn-ghost gz-btn-sm" id="gz-toast-dismiss">괜찮아요</button>
    `;
    toast.hidden = false;
    const hide = () => {
      toast.hidden = true;
      layer.innerHTML = '';
      if (toastTimer !== null) window.clearTimeout(toastTimer);
    };
    toast.querySelector('#gz-toast-dismiss')?.addEventListener('click', hide);
    toast.querySelector('#gz-toast-ask')?.addEventListener('click', () => askAbout(hot));
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hide, 12000);
  }

  // ───────── 4. 결과 ─────────
  function finishReading(): void {
    if (stage !== 'reading' || !acc) return;
    stopSource();
    if (timer !== null) window.clearInterval(timer);
    stage = 'result';
    summary = acc.summarize();

    const status = backdrop.querySelector('#gz-status-text');
    if (status) status.textContent = '읽기 결과';
    backdrop.querySelector('.gz-rec')?.remove();
    backdrop.querySelector('.gz-top-actions')?.remove();
    backdrop.querySelector<HTMLElement>('#gz-toast')!.hidden = true;
    backdrop.querySelector<HTMLElement>('#gz-dot')!.hidden = true;
    const layer = backdrop.querySelector<HTMLElement>('#gz-hot-layer')!;
    layer.innerHTML = '';

    const heat = backdrop.querySelector<HTMLCanvasElement>('#gz-heat')!;
    drawHeat(heat, acc);
    heat.hidden = false;

    summary.hotspots.forEach((h, i) => {
      const box = document.createElement('div');
      box.className = 'gz-hot-box';
      box.dataset.label = String(i + 1);
      setRegionStyle(box, h);
      layer.appendChild(box);
    });

    const result = backdrop.querySelector<HTMLElement>('#gz-result')!;
    const onPage = summary.onPageSec;
    result.innerHTML = `
      <div class="gz-stats">
        <div><span>읽은 시간</span><strong>${formatSec(summary.durationSec)}</strong></div>
        <div><span>책 페이지를 본 시간</span><strong>${formatSec(onPage)}</strong></div>
        <div><span>페이지를 본 비율</span><strong>${summary.focusPercent}%</strong></div>
      </div>
      ${summary.hotspots.length === 0
        ? '<p class="gz-none">오래 머문 곳이 감지되지 않았어요.</p>'
        : `<ol class="gz-hotlist">${summary.hotspots.map((h, i) => `
            <li>
              <span class="gz-hot-no">${i + 1}</span>
              <span class="gz-hot-desc"><strong>${describePosition(h)}</strong> · ${h.dwellSec}초${h.revisits > 0 ? ` · 다시 읽음 ${h.revisits}회` : ''}</span>
              <button type="button" class="gz-btn gz-btn-primary gz-btn-sm" data-ask="${i}">이 부분 물어보기</button>
            </li>`).join('')}</ol>`}
      <p class="gz-note">${accountId ? '책 사진을 포함한 히트맵과 시선 요약은 현재 계정의 이 브라우저 독서 기록에 저장돼요.' : '로그인하지 않아 기록은 저장되지 않아요.'} 카메라 영상은 저장되지 않았어요. 오래 본 위치는 이해도를 진단하는 결과가 아니에요.</p>
      <div class="gz-actions-row"><button type="button" class="gz-btn" id="gz-close">닫기</button></div>
    `;
    result.hidden = false;
    result.querySelectorAll<HTMLButtonElement>('[data-ask]').forEach(btn => {
      btn.addEventListener('click', () => {
        const hot = summary?.hotspots[Number(btn.dataset.ask)];
        if (hot) askAbout(hot);
      });
    });
    result.querySelector('#gz-close')?.addEventListener('click', close);

    saveReport();
  }

  function saveReport(): void {
    if (reported || !summary || !acc) return;
    reported = true;
    options.onReport({
      durationSec: summary.durationSec,
      focusPercent: summary.focusPercent,
      hotspots: summary.hotspots.map(h => ({ position: describePosition(h), dwellSec: h.dwellSec, revisits: h.revisits })),
      snapshot: buildSnapshot(img, acc),
      source: sourceKind
    });
  }

  // ───────── 질문 연결 ─────────
  function askAbout(hot: GazeHotspot): void {
    const crop = cropRegion(img, hot);
    if (stage === 'reading') finishReadingQuiet();
    else saveReport();
    const where = describePosition(hot);
    options.onAskAbout({
      text: `[시선 추적으로 찾은 부분]\n책 사진에서 내가 오래 본 부분(${where})만 잘라서 보냈어. 이 부분이 어려웠어. 쉽게 설명해줘.`,
      image: { data: crop, mimeType: 'image/jpeg' },
      previewUrl: null
    });
    close();
  }

  /** 질문하러 가기 전에 지금까지의 기록을 저장한다 */
  function finishReadingQuiet(): void {
    if (!acc) return;
    stopSource();
    summary = acc.summarize();
    saveReport();
  }

  renderConsent();
  return close;
}

// ───────── 보조 함수 ─────────

function setRegionStyle(el: HTMLElement, r: { x: number; y: number; w: number; h: number }): void {
  el.style.left = `${r.x * 100}%`;
  el.style.top = `${r.y * 100}%`;
  el.style.width = `${r.w * 100}%`;
  el.style.height = `${r.h * 100}%`;
}

export function describePosition(r: { x: number; y: number; w: number; h: number }): string {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const v = cy < 0.34 ? '위쪽' : cy < 0.67 ? '가운데' : '아래쪽';
  const h = cx < 0.34 ? '왼쪽' : cx < 0.67 ? '가운데' : '오른쪽';
  if (v === '가운데' && h === '가운데') return '가운데';
  if (h === '가운데') return v;
  if (v === '가운데') return h;
  return `${v} ${h}`;
}

function formatSec(sec: number): string {
  const s = Math.round(sec);
  return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`;
}

/** 격자 → 히트맵 캔버스 (격자 해상도로 그린 뒤 CSS로 늘려 부드럽게 보이게 한다) */
function drawHeat(canvas: HTMLCanvasElement, acc: GazeAccumulator): void {
  canvas.width = acc.cols;
  canvas.height = acc.rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const max = acc.maxValue() || 1;
  const data = ctx.createImageData(acc.cols, acc.rows);
  for (let i = 0; i < acc.grid.length; i++) {
    const value = acc.grid[i] ?? 0;
    if (value < 0.05) continue;
    const v = Math.sqrt(value / max);
    const [r, g, b, a] = heatColor(v);
    data.data.set([r, g, b, a], i * 4);
  }
  ctx.putImageData(data, 0, 0);
}

/** 독서 기록에 저장할 작은 히트맵 미리보기 (가로 420px JPEG) */
function buildSnapshot(img: HTMLImageElement, acc: GazeAccumulator): string {
  const width = Math.max(1, Math.round(Math.min(420, 840 * img.naturalWidth / img.naturalHeight)));
  const height = Math.min(840, Math.max(1, Math.round(width * (img.naturalHeight / img.naturalWidth))));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(img, 0, 0, width, height);
  const heat = document.createElement('canvas');
  drawHeat(heat, acc);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(heat, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.6);
}

/** 핫스팟 주변(앞뒤 문맥 포함)을 잘라 base64 JPEG로 반환 */
function cropRegion(img: HTMLImageElement, r: { x: number; y: number; w: number; h: number }): string {
  const padX = r.w * 0.2;
  const padY = r.h * 0.8;
  const x = Math.max(0, r.x - padX);
  const y = Math.max(0, r.y - padY);
  const w = Math.min(1 - x, r.w + padX * 2);
  const h = Math.min(1 - y, r.h + padY * 2);
  const sx = x * img.naturalWidth;
  const sy = y * img.naturalHeight;
  const sw = w * img.naturalWidth;
  const sh = h * img.naturalHeight;
  const scale = Math.min(1, 1200 / sw);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext('2d')?.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1] || '';
}
