import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { setAccount, accountKey } from '../src/accountStorage.ts';
import { getSavedSessions, HISTORY_KEY } from '../src/sessionHistory.ts';
import { buildReadingRequest } from '../src/readingRequest.ts';
import { renderGazeReports } from '../src/gaze/renderReport.ts';

function engine(getUserMedia: () => Promise<unknown>, ready = true) {
  let listener: ((data: unknown) => void) | null = null;
  let reset = 0;
  const api: Record<string, unknown> = { params: {},
    getRegression: () => [{ init: () => { reset++; } }],
    setGazeListener: (fn: typeof listener) => { listener = fn; return api; },
    clearGazeListener: () => { listener = null; },
    begin: () => { if (ready) queueMicrotask(() => listener?.(null)); return api; }
  };
  for (const name of ['setRegression', 'saveDataAcrossSessions', 'showVideoPreview', 'showPredictionPoints',
    'applyKalmanFilter', 'showFaceOverlay', 'showFaceFeedbackBox', 'setStaticVideo', 'pause', 'end',
    'removeMouseEventListeners', 'resume', 'recordScreenPosition']) api[name] = () => api;
  const context = { window: { webgazer: api, setTimeout, clearTimeout }, navigator: { mediaDevices: { getUserMedia } },
    performance, DOMException, queueMicrotask, module: {exports: {}} };
  const source = fs.readFileSync(new URL('../src/gaze/gazeEngine.ts', import.meta.url), 'utf8');
  vm.createContext(context);
  vm.runInContext(transformSync(source, {loader:'ts',format:'cjs'}).code, context);
  return { context, reset: () => reset };
}

test('웹캠 종료 및 준비 중 취소는 늦게 도착한 실제 스트림도 해제하고 보정 데이터를 지운다', async () => {
  let stops = 0;
  const stream = { getTracks: () => [{ stop: () => { stops++; } }] };
  const normal = engine(async () => stream);
  const normalSource = await (normal.context.module.exports as {createWebcamSource: () => Promise<{stop():void}>}).createWebcamSource();
  normalSource.stop(); normalSource.stop();
  assert.equal(stops, 1);
  assert(normal.reset() > 0);
  let resolveCamera!: (value: unknown) => void;
  const late = engine(() => new Promise(resolve => { resolveCamera = resolve; }));
  const controller = new AbortController();
  const pending = (late.context.module.exports as {createWebcamSource: (signal: AbortSignal) => Promise<unknown>}).createWebcamSource(controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(); resolveCamera(stream);
  await assert.rejects(pending, {name:'AbortError'});
  assert.equal(stops, 2);
});

test('얼굴 모델 준비 중 취소와 카메라 거부는 스트림을 남기지 않는다', async () => {
  let stops = 0;
  const model = engine(async () => ({getTracks: () => [{stop: () => { stops++; }}]}), false);
  const controller = new AbortController();
  const pending = (model.context.module.exports as {createWebcamSource: (signal: AbortSignal) => Promise<unknown>}).createWebcamSource(controller.signal);
  await new Promise(resolve => setImmediate(resolve)); controller.abort();
  await assert.rejects(pending, {name:'AbortError'}); assert.equal(stops, 1);
  const denied = engine(async () => { throw new DOMException('Denied','NotAllowedError'); });
  await assert.rejects((denied.context.module.exports as {createWebcamSource: () => Promise<unknown>}).createWebcamSource(), {name:'NotAllowedError'});
});

test('시선 기록은 A/B 계정별로 복원·보관하고 채팅 요청에는 사진/히트맵을 추가하지 않는다', async () => {
  const memory = new Map<string,string>();
  globalThis.localStorage = {getItem: (key: string) => memory.get(key) || null,
    setItem: (key: string,value: string) => { memory.set(key,value); }} as Storage;
  setAccount('gaze-unit-A');
  const { stateManager } = await import('../src/state.ts');
  for (let i=0;i<4;i++) stateManager.addGazeReport({durationSec: i+1,focusPercent:50,
    hotspots: [{position:'가운데',dwellSec:3,revisits:2}], snapshot:'data:image/jpeg;base64,YQ==',source:'webcam'});
  assert.equal(stateManager.state.session.gazeReports?.length,3);
  const saved = structuredClone(stateManager.state.session.gazeReports);
  assert(!JSON.stringify(buildReadingRequest(stateManager.state)).includes('gazeReports'));
  assert(!JSON.stringify(buildReadingRequest(stateManager.state)).includes('data:image'));
  setAccount(null); assert.deepEqual(stateManager.state.session.gazeReports,[]);
  setAccount('gaze-unit-B'); assert.deepEqual(stateManager.state.session.gazeReports,[]);
  setAccount('gaze-unit-A'); assert.deepEqual(stateManager.state.session.gazeReports,saved);
  stateManager.resetSession();
  assert.deepEqual(getSavedSessions()[0]!.snapshot.session?.gazeReports,saved);
  setAccount('gaze-unit-B'); assert.deepEqual(getSavedSessions(),[]);
  assert(memory.has('pageon:user:gaze-unit-A:'+HISTORY_KEY));
  assert(!memory.has(accountKey(HISTORY_KEY)!));
});

test('저장된 히트맵 HTML은 책 사진 포함을 알리고 임의 URL/HTML을 출력하지 않는다', () => {
  const rendered = renderGazeReports([{id:'1',createdAt:0,durationSec:3,focusPercent:50,
    source:'webcam',snapshot:'javascript:alert(1)',hotspots:[{position:'<script>bad</script>',dwellSec:3,revisits:1}]}]);
  assert(rendered.includes('책 사진이 포함'));
  assert(!rendered.includes('javascript:'));
  assert(!rendered.includes('<script>'));
});

test('저장 히트맵은 책 사진을 합성하고 긴 이미지도 제한 크기로 저장; 질문 사진은 영역만 잘라 전송', () => {
  const drawing: unknown[][] = [];
  const canvases: Array<{width:number;height:number}> = [];
  const context = {
    document: {createElement: () => {
      const canvas = {width:0,height:0,getContext: () => ({
        drawImage: (...args: unknown[]) => drawing.push(args),
        createImageData: (w: number,h: number) => ({data: new Uint8ClampedArray(w*h*4)}),
        putImageData() {}
      }),toDataURL: () => 'data:image/jpeg;base64,YQ=='};
      canvases.push(canvas); return canvas;
    }}, heatColor: () => [255,0,0,120]
  };
  const source = fs.readFileSync(new URL('../src/components/GazeReaderModal.ts',import.meta.url),'utf8');
  vm.createContext(context);
  vm.runInContext(transformSync(source.slice(source.indexOf('function drawHeat(')),{loader:'ts',format:'cjs'}).code,context);
  vm.runInContext('buildSnapshot({naturalWidth:400,naturalHeight:4000}, {cols:24,rows:24,grid:[],maxValue:()=>1})',context);
  assert.equal(drawing.length,2,'book photo and heatmap both drawn');
  assert(canvases[0]!.width<=420 && canvases[0]!.height<=840);
  drawing.length=0;
  const payload = vm.runInContext('cropRegion({naturalWidth:400,naturalHeight:560}, {x:.3,y:.4,w:.2,h:.1})',context);
  assert.equal(payload,'YQ==','existing photo API receives raw base64 JPEG');
  assert(Number(drawing[0]![1])>0 && Number(drawing[0]![2])>0);
  assert(Number(drawing[0]![3])<400 && Number(drawing[0]![4])<560,'send a crop rather than the whole book photo');
});
