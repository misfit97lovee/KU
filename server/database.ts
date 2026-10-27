import { Router, type Request } from 'express';
import type { AuthUser } from './auth.ts';
import { hasReadingActivity } from '../src/readingActivity.ts';
import { createHash } from 'node:crypto';
import type { ReadingPreferences, RecommendationPersonalization } from '../src/types/index.ts';

const preferenceFields = ['genres', 'topics', 'favorite_authors', 'favorite_books'] as const;
export function normalizePreferences(row: Partial<ReadingPreferences>): ReadingPreferences {
  return Object.fromEntries(preferenceFields.map(field => [field,
    Array.isArray(row[field]) ? [...new Set(row[field]!.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))].slice(0, 20).map(value => value.slice(0, 200)) : []
  ])) as unknown as ReadingPreferences;
}
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

  async query(table: string, query: Record<string, string>, method = 'GET', body?: unknown, timeoutMs = 5000): Promise<any> {
    if (!this.url || !this.key) throw new Error('Database unavailable');
    const url = new URL(`/rest/v1/${table}`, this.url);
    url.search = new URLSearchParams(query).toString();
    const response = await this.request(url, {
      method, headers: { apikey: this.key, Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs)
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
  async getPreferences(user: AuthUser, timeoutMs = 5000): Promise<ReadingPreferences | null> {
    const rows = await this.query('user_preferences', {
      user_sub: `eq.${user.id}`, select: preferenceFields.join(','), order: 'created_at.asc,id.asc', limit: '1'
    }, 'GET', undefined, timeoutMs);
    return rows[0] ? normalizePreferences(rows[0]) : null;
  }
  async savePreferences(user: AuthUser, preferences: ReadingPreferences): Promise<void> {
    await this.ensureUser(user);
    const rows = await this.query('user_preferences', {
      user_sub: `eq.${user.id}`, select: 'id', order: 'created_at.asc,id.asc', limit: '1'
    });
    const body = { ...normalizePreferences(preferences), updated_at: new Date().toISOString() };
    if (rows[0]) {
      await this.query('user_preferences', { user_sub: `eq.${user.id}`, id: `eq.${rows[0].id}` }, 'PATCH', body);
    } else {
      // Stable server-generated UUID coalesces concurrent first saves using the
      // existing id PK; no assumption about a UNIQUE(user_sub) constraint.
      const hash = createHash('sha256').update('KU/preferences/v1\0' + user.id).digest('hex');
      const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      await this.query('user_preferences', { on_conflict: 'id' }, 'POST', { ...body, id, user_sub: user.id });
    }
  }
  async removePreferences(user: AuthUser): Promise<void> {
    await this.query('user_preferences', { user_sub: `eq.${user.id}` }, 'DELETE');
  }
  async getPersonalization(user: AuthUser): Promise<RecommendationPersonalization> {
    const [preferences, history] = await Promise.allSettled([
      this.getPreferences(user, 1000),
      this.query('read_books', { user_sub: `eq.${user.id}`, select: 'title,author,isbn13', order: 'created_at.desc,id.desc', limit: '12' }, 'GET', undefined, 1000)
    ]);
    return {
      preferences: preferences.status === 'fulfilled' ? preferences.value : null,
      readingHistory: history.status === 'fulfilled' && Array.isArray(history.value) ? history.value
        .filter((row: any) => typeof row.title === 'string' && row.title.trim())
        .map((row: any) => ({ title: row.title.slice(0, 200), author: typeof row.author === 'string' ? row.author.slice(0, 200) : '', isbn13: typeof row.isbn13 === 'string' ? row.isbn13 : null })) : []
    };
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

export function createDatabaseRouter(db: ReadingDatabase, resolveUser: (req: Request) => Promise<AuthUser | null>, onPreferencesChanged: (userId: string) => void = () => {}) {
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
  router.get('/preferences', async (_req, res) => {
    try {
      const preferences = await db.getPreferences(res.locals.user);
      res.json({ preferences, completed: preferences !== null });
    } catch { res.status(503).json({ error: '취향을 불러오지 못했어요. 일반 추천은 계속 이용할 수 있어요.' }); }
  });
  router.put('/preferences', async (req, res) => {
    const body = req.body;
    if (!body || Array.isArray(body) || preferenceFields.some(field => body[field] !== undefined && body[field] !== null &&
      (!Array.isArray(body[field]) || body[field].length > 20 || body[field].some((value: unknown) => typeof value !== 'string' || value.length > 200)))) {
      return res.status(400).json({ error: '취향 항목을 확인해 주세요.' });
    }
    const preferences = normalizePreferences(body.skip === true ? {} : body);
    try {
      await db.savePreferences(res.locals.user, preferences);
      onPreferencesChanged(res.locals.user.id);
      res.json({ preferences, completed: true });
    } catch { res.status(503).json({ error: '취향을 저장하지 못했어요. 다시 시도해 주세요.' }); }
  });
  router.delete('/preferences', async (_req, res) => {
    try {
      await db.removePreferences(res.locals.user);
      onPreferencesChanged(res.locals.user.id);
      res.json({ deleted: true });
    } catch { res.status(503).json({ error: '취향을 삭제하지 못했어요. 다시 시도해 주세요.' }); }
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
    if (!hasReadingActivity(kind, snapshot)) return res.status(400).json({ error: '독서 활동이 있는 기록만 저장할 수 있습니다.' });
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
