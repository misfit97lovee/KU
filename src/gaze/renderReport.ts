import type { GazeReport } from '../types/index.ts';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]!);

export function renderGazeReports(reports: GazeReport[] = []): string {
  return reports.map(report => `<article class="gz-record">
    <div class="gz-record-head"><strong>시선으로 읽은 기록</strong><span>${escape(new Date(report.createdAt).toLocaleString('ko-KR'))}${report.source === 'mouse' ? ' · 마우스 체험' : ''}</span></div>
    ${/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(report.snapshot) ? `<img src="${report.snapshot}" alt="책 사진을 포함한 시선 히트맵" />` : ''}
    <p>읽은 시간 ${Number(report.durationSec).toFixed(1)}초 · 페이지를 본 비율 ${Number(report.focusPercent)}%</p>
    <ul>${report.hotspots.map(h => `<li>${escape(h.position)} · ${Number(h.dwellSec)}초 · 다시 읽음 ${Number(h.revisits)}회</li>`).join('')}</ul>
    <p>책 사진이 포함된 기록입니다. 오래 본 위치는 이해도를 진단하는 결과가 아니에요.</p>
  </article>`).join('');
}
