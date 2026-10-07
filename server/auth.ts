import { createHash, createPublicKey, randomBytes, verify as verifySignature, type webcrypto } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Router, type Request, type Response } from 'express';

export interface AuthUser { id: string; name: string; email: string; picture: string }
interface Session { userId: string; expiresAt: number }
interface Store { users: Record<string, AuthUser>; sessions: Record<string, Session> }
type VerifiedUser = AuthUser;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'ku_session';
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

export async function verifyGoogleIdToken(token: string, clientId: string): Promise<VerifiedUser> {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2] || token.length > 16000) throw new Error('Invalid token');
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Invalid algorithm');

  const response = await fetch(GOOGLE_CERTS, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Google public keys unavailable');
  const jwks = await response.json() as { keys?: Array<Record<string, unknown>> };
  const jwk = jwks.keys?.find(key => key.kid === header.kid && key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig');
  if (!jwk) throw new Error('Unknown signing key');
  const key = createPublicKey({ key: jwk as webcrypto.JsonWebKey, format: 'jwk' });
  if (!verifySignature('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))) {
    throw new Error('Invalid signature');
  }
  const now = Math.floor(Date.now() / 1000);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(String(payload.iss)) ||
      payload.aud !== clientId || typeof payload.exp !== 'number' || payload.exp <= now ||
      typeof payload.iat !== 'number' || payload.iat > now + 60 ||
      typeof payload.sub !== 'string' || !payload.sub ||
      payload.email_verified !== true || typeof payload.email !== 'string' || !payload.email) {
    throw new Error('Invalid claims');
  }
  return {
    id: payload.sub,
    name: typeof payload.name === 'string' ? payload.name : '',
    email: payload.email,
    picture: typeof payload.picture === 'string' && payload.picture.startsWith('https://') ? payload.picture : ''
  };
}

function cookieToken(req: Request): string | null {
  const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`));
  const token = cookie?.slice(COOKIE_NAME.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function sessionKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createAuthRouter(options: {
  clientId: string;
  storePath?: string;
  verifyToken?: (token: string, clientId: string) => Promise<VerifiedUser>;
  secureCookies?: boolean;
}) {
  const router = Router();
  const path = resolve(options.storePath || 'server/data/auth.json');
  const secure = options.secureCookies ?? process.env.NODE_ENV === 'production';
  let store: Store = { users: {}, sessions: {} };
  const ready = readFile(path, 'utf8').then(raw => {
    const saved = JSON.parse(raw) as Store;
    store = { users: saved.users || {}, sessions: saved.sessions || {} };
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
  let writeQueue = Promise.resolve();
  function persist(): Promise<void> {
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(store), { mode: 0o600 });
      await rename(tmp, path);
    });
    return writeQueue;
  }
  function setCookie(res: Response, value: string, maxAge: number): void {
    res.cookie(COOKIE_NAME, value, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge });
  }
  function currentUser(req: Request): AuthUser | null {
    const token = cookieToken(req);
    const session = token ? store.sessions[sessionKey(token)] : undefined;
    return session && session.expiresAt > Date.now() ? store.users[session.userId] || null : null;
  }

  router.get('/me', async (req, res) => {
    await ready;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ user: currentUser(req) });
  });

  router.post('/google', async (req, res) => {
    await ready;
    if (!options.clientId) return res.status(503).json({ error: 'Google 로그인이 설정되지 않았습니다.' });
    const token = req.body?.credential;
    if (typeof token !== 'string' || !token || token.length > 16000) return res.status(400).json({ error: 'ID token이 필요합니다.' });
    try {
      const user = await (options.verifyToken || verifyGoogleIdToken)(token, options.clientId);
      const previous = cookieToken(req);
      if (previous) delete store.sessions[sessionKey(previous)];
      const sessionToken = randomBytes(32).toString('hex');
      store.users[user.id] = user;
      store.sessions[sessionKey(sessionToken)] = { userId: user.id, expiresAt: Date.now() + SESSION_MS };
      await persist();
      setCookie(res, sessionToken, SESSION_MS);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ user });
    } catch (error) {
      console.warn('[Google login failed]', error instanceof Error ? error.message : String(error));
      return res.status(401).json({ error: 'Google 로그인 확인에 실패했습니다.' });
    }
  });

  router.post('/logout', async (req, res) => {
    await ready;
    const token = cookieToken(req);
    if (token) {
      delete store.sessions[sessionKey(token)];
      await persist();
    }
    setCookie(res, '', 0);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ user: null });
  });
  return router;
}
