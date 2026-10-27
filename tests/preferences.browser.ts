// Isolated browser fixture: real KU UI, real Supabase and real recommendations.
// Test Google verifier exists only here; never mount these routes in KU server.
import 'dotenv/config';
import express from 'express';
import { createServer } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ReadingDatabase, createDatabaseRouter } from '../server/database.ts';
import { createAuthRouter } from '../server/auth.ts';

process.env.NODE_ENV = 'test';
const { recommendBooks } = await import('../server/server.ts');
const directory = await mkdtemp(join(tmpdir(), 'ku-preferences-browser-'));
const suffix = randomUUID();
const users = Object.fromEntries(['A', 'B'].map(name => [name, { id: `ku-preferences-browser-${name}-${suffix}`, name: `테스트 ${name}`, email: `${name}@example.invalid`, picture: '' }]));
const db = new ReadingDatabase(process.env.SUPABASE_URL || '', process.env.SUPABASE_SECRET_KEY || '');
const auth = createAuthRouter({ clientId: 'test-only', storePath: join(directory, 'auth.json'), secureCookies: false,
  verifyToken: async token => { if (!users[token]) throw Error('Invalid test token'); return users[token]!; } });
const api = express(); api.use(express.json());
api.use('/api/auth', auth); api.use('/api/db', createDatabaseRouter(db, auth.resolveUser));
api.post('/test/login/:account', (req, res, next) => {
  req.body = { credential: req.params.account }; req.url = '/google';
  res.json = () => { res.redirect('/curator/'); return res; };
  auth(req, res, next);
});
api.post('/api/recommend-books', async (req, res) => {
  const user = await auth.resolveUser(req);
  const { userMessage, userGrade, userInterests, chatHistory, recommendedBooks: previous } = req.body;
  res.json(await recommendBooks({ userMessage, userGrade, userInterests, chatHistory, recommendedBooks: previous,
    personalization: user ? await db.getPersonalization(user) : undefined }));
});
const listener = api.listen(3014, '127.0.0.1');
const vite = await createServer({ server: { host: '127.0.0.1', port: 5184, strictPort: true, proxy: {
  '/api': { target: 'http://127.0.0.1:3014', changeOrigin: false }, '/test': 'http://127.0.0.1:3014'
} }, plugins: [{ name: 'preferences-test-toolbar', transformIndexHtml(html) {
  return html.replace('<main class="recommendation-page">', `<aside style="padding:12px;display:flex;gap:16px" aria-label="테스트 계정 전환"><form method="post" action="/test/login/A"><button>테스트 A 로그인</button></form><form method="post" action="/test/login/B"><button>테스트 B 로그인</button></form></aside><main class="recommendation-page">`);
} }] });
await vite.listen();
console.log('Browser fixture ready: http://127.0.0.1:5184/curator/ (isolated test accounts)');
let closing = false;
async function close() {
  if (closing) return; closing = true;
  try {
    await vite.close(); await new Promise<void>(resolve => listener.close(() => resolve()));
    for (const user of Object.values(users)) { await db.removePreferences(user); await db.query('users', { google_sub: `eq.${user.id}` }, 'DELETE'); }
    console.log('Browser fixture probe accounts removed.');
  } finally { await rm(directory, { recursive: true, force: true }); }
}
process.on('SIGINT', () => void close()); process.on('SIGTERM', () => void close());
