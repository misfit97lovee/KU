import { build } from 'vite';
import { writeFile } from 'node:fs/promises';

// Static preview only. Production/local authentication, DB and API modules are
// left intact; no credentials, account storage or server code enter this build.
const base = '/KU/';
const notice = '화면 미리보기입니다. 로그인·기록 저장은 제외되어 있으며, 대화와 추천은 AI 서버 연결 후 사용할 수 있어요.';
const accountModule = `
const signal = new AbortController().signal;
export const getAccountId = () => null;
export const getAccountRevision = () => 0;
export const getAccountSignal = () => signal;
export const accountKey = () => null;
export const setAccount = () => {};
export const subscribeAccount = () => () => {};
export const accountGet = () => null;
export const accountSet = () => {};
export async function accountFetch() {
  return new Response(JSON.stringify({error:${JSON.stringify(notice)}}), {status:503,headers:{'Content-Type':'application/json'}});
}`;

await build({
  base,
  define: { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '""' },
  plugins: [{
    name: 'ku-static-preview', enforce: 'pre',
    resolveId(source) {
      if (/(?:^|\/)accountStorage\.ts$/.test(source)) return '\0ku-preview-account';
      if (/(?:^|\/)auth\.ts$/.test(source)) return '\0ku-preview-auth';
      if (/(?:^|\/)HistoryDialog\.ts$/.test(source)) return '\0ku-preview-history';
    },
    load(id) {
      if (id === '\0ku-preview-account') return accountModule;
      if (id === '\0ku-preview-auth') return 'export function mountAuth() {}';
      if (id === '\0ku-preview-history') return `export function openHistoryDialog() { alert(${JSON.stringify(notice)}); }`;
    },
    transform(code, id) {
      if (id.endsWith('/src/components/Header.ts')) return code
        .replaceAll('href="/"', `href="${base}"`)
        .replaceAll('href="/curator/index.html"', `href="${base}curator/index.html"`)
        .replace('<button type="button" data-open-history>내 독서 기록</button>', '')
        .replace('<div class="auth-controls" data-auth-controls></div>', '');
      if (id.endsWith('/curator/app.ts')) return code.replace("const targetUrl = '/?title='", `const targetUrl = '${base}?title='`);
      if (id.endsWith('/src/gaze/gazeEngine.ts')) return code.replace("'/vendor/webgazer'", `'${base}vendor/webgazer'`);
      if (id.endsWith('/src/main.ts')) return code
        .replace('일시적으로 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.', notice)
        .replace('미안해, 답변을 생성하는 중에 일시적인 오류가 발생했어. 잠시 후 다시 질문해 줄래?', notice)
        .replace('사진을 분석하는 중에 오류가 생겼어. 사진 속 글씨가 선명한지 확인하고 다시 올려줄래?', notice);
    },
    transformIndexHtml(html) {
      return html.replace('<body>', `<body><aside role="note" style="padding:10px 24px;border-bottom:1px solid #d9e2ef;background:#fff;color:#61708b;font:13px/1.6 sans-serif">${notice}</aside>`);
    }
  }]
});
await writeFile('dist/.nojekyll', '');
