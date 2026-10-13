import { Router, type Request } from 'express';
import type { AuthUser } from './auth.ts';
export interface DatabaseSession {
  id: string; kind: 'reading' | 'recommendation'; title: string; savedAt: string;
  snapshot: {
    session?: { readingNote?: string | null };
    currentDocument?: { markdown?: string | null };
    [key: string]: unknown;
  };
}

interface SessionRow {
  id: string; kind: 'reading' | 'recommendation'; title: string;
  snapshot: DatabaseSession['snapshot']; saved_at: string;
}
export class ReadingDatabase {
  constructor(private url: string, private key: string, private request: typeof fetch = fetch) {}

  async query(table: string, query: Record<string, string>, method = 'GET', body?: unknown): Promise<any> {
    if (!this.url || !this.key) throw new Error('Database unavailable');
    const url = new URL(`/rest/v1/${table}`, this.url);
    url.search = new URLSearchParams(query).toString();
    const response = await this.request(url, {
      method, headers: { apikey: this.key, Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5000)
    });
    // Never return Supabase diagnostics (which can contain URLs/record data).
    if (!response.ok) throw new Error('Database unavailable');
    return response.status === 204 || method !== 'GET' ? undefined : response.json();
  }

  async ensureUser(user: AuthUser): Promise<void> {
    await this.query('users', { on_conflict: 'google_sub' }, 'POST', {
      google_sub: user.id, name: user.name, email: user.email, picture: user.picture,
      updated_at: new Date().toISOString()
    });
  }
  async list(user: AuthUser): Promise<DatabaseSession[]> {
    const rows: SessionRow[] = await this.query('reading_sessions', {
      user_sub: `eq.${user.id}`, select: 'id,kind,title,snapshot,saved_at', order: 'saved_at.desc,id', limit: '100'
    });
    return rows.map(row => ({ id: row.id, kind: row.kind, title: row.title, snapshot: row.snapshot, savedAt: row.saved_at }));
  }
  async save(user: AuthUser, record: DatabaseSession): Promise<void> {
    await this.ensureUser(user);
    await this.query('reading_sessions', { on_conflict: 'user_sub,id' }, 'POST', {
      user_sub: user.id, id: record.id, kind: record.kind, title: record.title,
      snapshot: record.snapshot, saved_at: record.savedAt, updated_at: new Date().toISOString()
    });
    // Snapshot is the canonical restore source. A note write failure returns 503;
    // retrying the same ID repairs the projection without duplicate sessions.
    const note = record.kind === 'reading' ? record.snapshot.session?.readingNote : record.snapshot.currentDocument?.markdown;
    if (typeof note === 'string' && note) {
      await this.query('reading_notes', { on_conflict: 'user_sub,session_id' }, 'POST', {
        user_sub: user.id, session_id: record.id, markdown: note, updated_at: new Date().toISOString()
      });
    } else {
      await this.query('reading_notes', { user_sub: `eq.${user.id}`, session_id: `eq.${record.id}` }, 'DELETE');
    }
  }
  async remove(user: AuthUser, id: string): Promise<void> {
    await this.query('reading_sessions', { user_sub: `eq.${user.id}`, id: `eq.${id}` }, 'DELETE');
  }
}

export function createDatabaseRouter(db: ReadingDatabase, resolveUser: (req: Request) => Promise<AuthUser | null>) {
  const router = Router();
  router.use(async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const allowedOrigins = [`${req.protocol}://${req.get('host')}`];
    if (process.env.NODE_ENV !== 'production') allowedOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');
    if (req.method !== 'GET' && req.headers.origin && !allowedOrigins.includes(req.headers.origin)) {
      return res.status(403).json({ error: '허용되지 않은 요청입니다.' });
    }
    try {
      const user = await resolveUser(req);
      if (!user) return res.status(401).json({ error: 'Google 로그인이 필요합니다.' });
      res.locals.user = user;
      next();
    } catch { res.status(503).json({ error: '로그인 상태를 확인할 수 없습니다.' }); }
  });
  router.get('/sessions', async (_req, res) => {
    try { res.json({ records: await db.list(res.locals.user) }); }
    catch { res.status(503).json({ error: 'DB 기록을 불러올 수 없습니다. 브라우저 기록은 유지됩니다.' }); }
  });
  router.put('/sessions/:id', async (req, res) => {
    const id = String(req.params.id);
    const { kind, title, snapshot, savedAt } = req.body || {};
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(id) || !['reading', 'recommendation'].includes(kind)
      || typeof title !== 'string' || title.length > 1000 || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || typeof savedAt !== 'string' || !Number.isFinite(Date.parse(savedAt))) {
      return res.status(400).json({ error: '올바른 세션 기록이 필요합니다.' });
    }
    try {
      await db.save(res.locals.user, { id, kind, title, snapshot, savedAt });
      res.json({ saved: true });
    } catch { res.status(503).json({ error: 'DB 저장을 완료하지 못했습니다. 같은 기록으로 다시 시도해주세요. 브라우저 기록은 유지됩니다.' }); }
  });
  router.delete('/sessions/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(id)) return res.status(400).json({ error: '잘못된 기록 ID입니다.' });
    try { await db.remove(res.locals.user, id); res.json({ deleted: true }); }
    catch { res.status(503).json({ error: 'DB 기록을 삭제할 수 없습니다.' }); }
  });
  return router;
}
