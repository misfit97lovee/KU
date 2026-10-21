// Only a server-verified Google sub selects a storage namespace.
let account: string | null = null;
let revision = 0;
const listeners = new Set<() => void>();
let controller = new AbortController();

export const getAccountId = (): string | null => account;
export const getAccountRevision = (): number => revision;
export const getAccountSignal = (): AbortSignal => controller.signal;
export const accountKey = (key: string): string | null => account ? `pageon:user:${encodeURIComponent(account)}:${key}` : null;

export function setAccount(id: string | null): void {
  if (account === id) return;
  controller.abort();
  controller = new AbortController();
  account = id;
  revision++;
  listeners.forEach(listener => listener());
}

export function subscribeAccount(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function accountGet(key: string, storage: Pick<Storage, 'getItem'> = localStorage): string | null {
  const scoped = accountKey(key);
  return scoped ? storage.getItem(scoped) : null;
}

export function accountSet(key: string, value: string, storage: Pick<Storage, 'setItem'> = localStorage): void {
  const scoped = accountKey(key);
  if (scoped) storage.setItem(scoped, value);
}

export async function accountFetch(url: string, options: RequestInit): Promise<Response> {
  const startedAt = revision;
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  const response = await fetch(url, { ...options, signal });
  const readJson = response.json.bind(response);
  response.json = async () => {
    signal.throwIfAborted();
    const data: unknown = await readJson();
    signal.throwIfAborted();
    if (startedAt !== revision) throw new DOMException('Account changed', 'AbortError');
    return data;
  };
  return response;
}
