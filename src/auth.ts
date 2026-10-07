import { setAccount } from './accountStorage.ts';
interface AuthUser { id: string; name: string; email: string; picture: string }
interface CredentialResponse { credential: string }
interface GoogleIdentity {
  accounts: { id: {
    initialize: (options: { client_id: string; callback: (response: CredentialResponse) => void }) => void;
    renderButton: (parent: HTMLElement, options: Record<string, string>) => void;
    disableAutoSelect: () => void;
  } };
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '';
let user: AuthUser | null = null;
let started = false;
let googleReady = false;
let error = '';
let authRevision = 0;
const containers = new Set<HTMLElement>();
function announceAccountChange(): void {
  try { localStorage.setItem('pageon-auth-change', String(Date.now())); } catch { /* Storage may be full. */ }
}

function google(): GoogleIdentity | undefined {
  return (window as Window & { google?: GoogleIdentity }).google;
}

function refresh(): void {
  for (const container of containers) {
    if (!container.isConnected) {
      containers.delete(container);
      continue;
    }
    container.replaceChildren();
    if (user) {
      const profile = document.createElement('span');
      profile.className = 'auth-profile';
      if (user.picture) {
        const image = document.createElement('img');
        image.src = user.picture;
        image.alt = '';
        image.referrerPolicy = 'no-referrer';
        profile.append(image);
      }
      const name = document.createElement('span');
      name.textContent = user.name || user.email;
      name.title = user.email;
      profile.append(name);
      const logout = document.createElement('button');
      logout.type = 'button';
      logout.className = 'btn-secondary-sm';
      logout.textContent = '로그아웃';
      logout.addEventListener('click', async () => {
        logout.disabled = true;
        authRevision++;
        setAccount(null);
        try {
          const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
          if (!response.ok) throw new Error('Logout failed');
          google()?.accounts.id.disableAutoSelect();
          user = null;
          announceAccountChange();
          error = '';
        } catch {
          await restoreAccount();
          error = '로그아웃에 실패했습니다. 다시 시도해 주세요.';
        }
        refresh();
      });
      container.append(profile, logout);
    } else if (clientId && googleReady) {
      const button = document.createElement('div');
      button.className = 'google-login-button';
      container.append(button);
      google()?.accounts.id.renderButton(button, { theme: 'outline', size: 'medium', text: 'signin_with', locale: 'ko' });
    } else {
      const status = document.createElement('span');
      status.className = 'auth-status';
      status.textContent = clientId ? '로그인 준비 중…' : 'Google 로그인 설정 필요';
      container.append(status);
    }
    if (error) {
      const message = document.createElement('span');
      message.className = 'auth-error';
      message.role = 'alert';
      message.textContent = error;
      container.append(message);
    }
  }
}

async function handleCredential({ credential }: CredentialResponse): Promise<void> {
  const revision = ++authRevision;
  try {
    const response = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ credential })
    });
    if (!response.ok) throw new Error('Login failed');
    const data = await response.json() as { user: AuthUser };
    if (revision !== authRevision) return;
    user = data.user;
    setAccount(user.id);
    announceAccountChange();
    error = '';
  } catch {
    if (revision !== authRevision) return;
    error = 'Google 로그인에 실패했습니다. 다시 시도해 주세요.';
  }
  refresh();
}

async function loadGoogle(): Promise<void> {
  if (google()) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity Services unavailable'));
    document.head.append(script);
  });
}

async function restoreAccount(): Promise<void> {
  const revision = ++authRevision;
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    if (response.ok) {
      const data = await response.json() as { user: AuthUser | null };
      if (revision !== authRevision) return;
      user = data.user;
      setAccount(user?.id || null);
    }
  } catch {
    if (revision !== authRevision) return;
    user = null;
    setAccount(null);
    error = '로그인 상태를 확인할 수 없습니다.';
  }
  refresh();
}

window.addEventListener('storage', event => {
  if (event.key === 'pageon-auth-change') {
    setAccount(null);
    user = null;
    refresh();
    void restoreAccount();
  }
});

async function start(): Promise<void> {
  await restoreAccount();
  if (!clientId) return;
  try {
    await loadGoogle();
    google()?.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
    googleReady = true;
    error = '';
  } catch {
    error = 'Google 로그인 버튼을 불러오지 못했습니다.';
  }
  refresh();
}

export function mountAuth(header: ParentNode): void {
  const container = header.querySelector<HTMLElement>('[data-auth-controls]');
  if (!container) return;
  containers.add(container);
  refresh();
  if (!started) {
    started = true;
    void start();
  }
}
