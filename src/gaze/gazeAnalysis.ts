/**
 * 시선 데이터 분석 (DOM 의존 없음)
 *
 * 책 사진 위의 시선 좌표(0~1 정규화)를 격자에 누적해 히트맵과
 * "오래 본 곳 / 되돌아 읽은 곳"(어려운 부분 후보)을 찾아냅니다.
 */

export interface GazeHotspot {
  /** 정규화 좌표계(0~1)의 영역 */
  x: number;
  y: number;
  w: number;
  h: number;
  dwellSec: number;
  revisits: number;
}

export interface GazeSummary {
  durationSec: number;
  onPageSec: number;
  focusPercent: number;
  hotspots: GazeHotspot[];
}

export interface AccumulatorOptions {
  cols?: number;
  /** 이 시간(초) 이상 한 곳을 보면 핫스팟 */
  dwellThresholdSec?: number;
  /** 되돌아온 횟수가 이 이상이고 dwell이 revisitDwellSec 이상이면 핫스팟 */
  revisitThreshold?: number;
  revisitDwellSec?: number;
  /** 시선이 이 시간(초) 이상 떠났다가 돌아오면 재방문 */
  awayGapSec?: number;
}

const DEFAULTS: Required<AccumulatorOptions> = {
  cols: 24,
  dwellThresholdSec: 2.5,
  revisitThreshold: 2,
  revisitDwellSec: 1.2,
  awayGapSec: 0.7
};

/** 한 샘플이 차지하는 최대 시간(초). 끊긴 구간이 한꺼번에 누적되는 것을 막는다. */
const MAX_DT_SEC = 0.1;
/** 핫스팟 알림이 겹치지 않도록 하는 최소 간격(격자 칸) */
const MIN_HOTSPOT_DISTANCE = 4;

export class GazeAccumulator {
  readonly cols: number;
  readonly rows: number;
  readonly grid: Float32Array;
  private readonly opts: Required<AccumulatorOptions>;
  private readonly revisitCount: Int16Array;
  private readonly lastSeen: Float64Array;
  private lastT: number | null = null;
  private lastCell = -1;
  private onPageSec = 0;
  private totalSec = 0;
  private reported: Array<{ cx: number; cy: number }> = [];

  /** @param aspect 이미지 높이/너비 */
  constructor(aspect: number, options: AccumulatorOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.cols = this.opts.cols;
    this.rows = Math.max(4, Math.round(this.cols * aspect));
    this.grid = new Float32Array(this.cols * this.rows);
    this.revisitCount = new Int16Array(this.cols * this.rows);
    this.lastSeen = new Float64Array(this.cols * this.rows).fill(-Infinity);
  }

  /**
   * 시선 샘플 추가. nx, ny는 이미지 기준 0~1 (범위 밖이면 페이지 밖으로 처리).
   * 새로 감지된 핫스팟이 있으면 반환한다.
   */
  addSample(tMs: number, nx: number, ny: number): GazeHotspot | null {
    const t = tMs / 1000;
    const dt = this.lastT === null ? 0 : Math.min(Math.max(t - this.lastT, 0), MAX_DT_SEC);
    this.lastT = t;
    this.totalSec += dt;

    if (!(nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1)) {
      this.lastCell = -1;
      return null;
    }
    this.onPageSec += dt;

    const cx = Math.min(this.cols - 1, Math.floor(nx * this.cols));
    const cy = Math.min(this.rows - 1, Math.floor(ny * this.rows));
    const cell = cy * this.cols + cx;

    // 같은 곳에 머물다 떠난 뒤 다시 돌아오면 재방문으로 센다.
    if (cell !== this.lastCell) {
      const seen = this.lastSeen[cell] ?? -Infinity;
      if (seen > -Infinity && t - seen > this.opts.awayGapSec && (this.grid[cell] ?? 0) > 0.5) {
        this.revisitCount[cell] = (this.revisitCount[cell] ?? 0) + 1;
      }
    }
    this.lastCell = cell;
    this.lastSeen[cell] = t;

    // 3x3 가우시안 근사로 누적 (시선 추정 오차 흡수)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        const weight = dx === 0 && dy === 0 ? 1 : dx !== 0 && dy !== 0 ? 0.25 : 0.5;
        const gi = y * this.cols + x;
        this.grid[gi] = (this.grid[gi] ?? 0) + dt * weight;
      }
    }

    return this.checkHotspot(cx, cy);
  }

  private checkHotspot(cx: number, cy: number): GazeHotspot | null {
    const idx = cy * this.cols + cx;
    const dwell = this.grid[idx] ?? 0;
    const revisits = this.revisitNear(cx, cy);
    const hot = dwell >= this.opts.dwellThresholdSec
      || (revisits >= this.opts.revisitThreshold && dwell >= this.opts.revisitDwellSec);
    if (!hot) return null;
    if (this.reported.some(r => Math.hypot(r.cx - cx, r.cy - cy) < MIN_HOTSPOT_DISTANCE)) return null;
    this.reported.push({ cx, cy });
    return this.regionAround(cx, cy, dwell, revisits);
  }

  private revisitNear(cx: number, cy: number): number {
    let max = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        max = Math.max(max, this.revisitCount[y * this.cols + x] ?? 0);
      }
    }
    return max;
  }

  /** 중심 칸 주변을 문장 한두 줄 정도 크기의 영역으로 변환 */
  private regionAround(cx: number, cy: number, dwellSec: number, revisits: number): GazeHotspot {
    const padX = 3;
    const padY = 1.5;
    const x0 = Math.max(0, cx - padX);
    const x1 = Math.min(this.cols, cx + padX + 1);
    const y0 = Math.max(0, cy - padY);
    const y1 = Math.min(this.rows, cy + padY + 1);
    return {
      x: x0 / this.cols,
      y: y0 / this.rows,
      w: (x1 - x0) / this.cols,
      h: (y1 - y0) / this.rows,
      dwellSec: round1(dwellSec),
      revisits
    };
  }

  /** 격자 최댓값 (히트맵 정규화용) */
  maxValue(): number {
    let max = 0;
    for (const v of this.grid) if (v > max) max = v;
    return max;
  }

  /** 세션 종료 시 결과 요약. 핫스팟은 체류시간 순. */
  summarize(): GazeSummary {
    const hotspots: GazeHotspot[] = [];
    const taken: Array<{ cx: number; cy: number }> = [];
    const order = Array.from(this.grid.keys()).sort((a, b) => (this.grid[b] ?? 0) - (this.grid[a] ?? 0));
    for (const idx of order) {
      const dwell = this.grid[idx] ?? 0;
      if (dwell < this.opts.revisitDwellSec || hotspots.length >= 3) break;
      const cx = idx % this.cols;
      const cy = Math.floor(idx / this.cols);
      const revisits = this.revisitNear(cx, cy);
      const hot = dwell >= this.opts.dwellThresholdSec || revisits >= this.opts.revisitThreshold;
      if (!hot) continue;
      if (taken.some(r => Math.hypot(r.cx - cx, r.cy - cy) < MIN_HOTSPOT_DISTANCE)) continue;
      taken.push({ cx, cy });
      hotspots.push(this.regionAround(cx, cy, dwell, revisits));
    }
    return {
      durationSec: round1(this.totalSec),
      onPageSec: round1(this.onPageSec),
      focusPercent: this.totalSec > 0 ? Math.round((this.onPageSec / this.totalSec) * 100) : 0,
      hotspots
    };
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 히트맵 색상: 값(0~1) → RGBA (파랑 → 초록 → 노랑 → 빨강) */
export function heatColor(v: number): [number, number, number, number] {
  const t = Math.min(1, Math.max(0, v));
  const stops: Array<[number, number, number]> = [[52, 120, 229], [60, 190, 120], [250, 210, 60], [235, 70, 60]];
  const pos = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = stops[i] ?? [0, 0, 0];
  const b = stops[i + 1] ?? a;
  const mix = (k: 0 | 1 | 2) => Math.round(a[k] + (b[k] - a[k]) * f);
  return [mix(0), mix(1), mix(2), Math.round(60 + 140 * t)];
}
