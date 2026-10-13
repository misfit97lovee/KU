import test from 'node:test';
import assert from 'node:assert/strict';
import { GazeAccumulator } from '../src/gaze/gazeAnalysis.ts';

const STEP_MS = 33;

function stare(acc: GazeAccumulator, startMs: number, seconds: number, nx: number, ny: number) {
  let hot = null;
  let t = startMs;
  for (let i = 0; i < Math.round((seconds * 1000) / STEP_MS); i++) {
    t += STEP_MS;
    hot = acc.addSample(t, nx, ny) || hot;
  }
  return { t, hot };
}

test('한 곳을 오래 보면 핫스팟을 한 번만 알린다', () => {
  const acc = new GazeAccumulator(1.4);
  acc.addSample(0, 0.5, 0.5);
  const { hot } = stare(acc, 0, 3.5, 0.5, 0.5);
  assert.ok(hot, '핫스팟 감지');
  assert.ok(hot.dwellSec >= 2.5);
  let again = null;
  for (let t = 4000; t < 6000; t += STEP_MS) again = acc.addSample(t, 0.5, 0.5) || again;
  assert.equal(again, null, '같은 곳은 다시 알리지 않음');
});

test('잠깐 훑어보는 것은 핫스팟이 아니다', () => {
  const acc = new GazeAccumulator(1.4);
  const { hot } = stare(acc, 0, 0.8, 0.3, 0.3);
  assert.equal(hot, null);
});

test('줄을 따라 읽는 시선은 핫스팟이 아니다', () => {
  const acc = new GazeAccumulator(1.4);
  let t = 0;
  let hot = null;
  for (let row = 0; row < 8; row++) {
    for (let i = 0; i < 40; i++) {
      t += STEP_MS;
      hot = acc.addSample(t, 0.1 + (i / 40) * 0.8, 0.1 + row * 0.1) || hot;
    }
  }
  assert.equal(hot, null);
});

test('같은 곳을 떠났다가 되돌아 읽으면 짧아도 핫스팟이다', () => {
  const acc = new GazeAccumulator(1.4);
  let t = 0;
  let hot = null;
  for (let round = 0; round < 3; round++) {
    let r = stare(acc, t, 0.6, 0.4, 0.4);
    hot = r.hot || hot;
    r = stare(acc, r.t, 1.0, 0.9, 0.9); // 다른 곳을 봄
    t = r.t;
  }
  assert.ok(hot, '되돌아 읽기 감지');
  assert.ok(hot.revisits >= 2);
});

test('페이지 밖 시간은 집중도에 반영된다', () => {
  const acc = new GazeAccumulator(1.4);
  let t = 0;
  for (let i = 0; i < 60; i++) { t += STEP_MS; acc.addSample(t, 0.5, 0.5); }
  for (let i = 0; i < 60; i++) { t += STEP_MS; acc.addSample(t, 1.5, 0.5); }
  const s = acc.summarize();
  assert.ok(s.focusPercent >= 40 && s.focusPercent <= 60, `focus=${s.focusPercent}`);
});

test('요약은 체류시간이 긴 영역을 최대 3개까지 돌려준다', () => {
  const acc = new GazeAccumulator(1.4);
  let t = 0;
  for (const [x = 0, y = 0] of [[0.2, 0.2], [0.8, 0.5], [0.3, 0.85], [0.7, 0.15]]) {
    t = stare(acc, t, 3, x, y).t;
  }
  const s = acc.summarize();
  assert.equal(s.hotspots.length, 3);
  for (const h of s.hotspots) {
    assert.ok(h.x >= 0 && h.y >= 0 && h.x + h.w <= 1.0001 && h.y + h.h <= 1.0001);
  }
});
