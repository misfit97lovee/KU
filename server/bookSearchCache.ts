// Public bibliographic search results only: no AI responses, chat, auth or
// account state. Failures are never cached. Return copies to isolate callers.
export function cacheBookSearch<A extends unknown[], T>(fetcher: (...args: A) => Promise<T>, options: {
  stage: string; onEvent?: (event: Record<string, unknown>) => void; ttlMs?: number; maxEntries?: number; now?: () => number;
  key?: (args: A) => string; shouldCache?: (result: T) => boolean;
}) {
  const entries = new Map<string, { expires: number; pending: Promise<T> }>();
  const now = options.now || Date.now;
  const cached = async (...args: A): Promise<T> => {
    const started = now(), key = options.key ? options.key(args) : JSON.stringify(args);
    let entry = entries.get(key);
    const hit = Boolean(entry && entry.expires > started);
    if (!hit) {
      entries.delete(key);
      const pending = Promise.resolve().then(() => fetcher(...args));
      entry = { expires: Infinity, pending };
      entries.set(key, entry);
      while (entries.size > (options.maxEntries ?? 64)) entries.delete(entries.keys().next().value!);
      void pending.catch(() => { if (entries.get(key)?.pending === pending) entries.delete(key); });
      void pending.then(result => {
        if (entries.get(key)?.pending !== pending) return;
        if (options.shouldCache && !options.shouldCache(result)) entries.delete(key);
        else entries.get(key)!.expires = now() + (options.ttlMs ?? 60000);
      }, () => {});
    }
    try {
      const result = await entry!.pending;
      options.onEvent?.({ stage: options.stage, event: hit ? 'cache_hit' : 'search_response', elapsedMs: now() - started,
        candidateCount: Array.isArray(result) ? result.length : undefined });
      return structuredClone(result);
    } catch (error) {
      options.onEvent?.({ stage: options.stage, event: 'search_failed', elapsedMs: now() - started });
      throw error;
    }
  };
  return Object.assign(cached, {
    invalidatePrefix(prefix: string): void {
      for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
    }
  });
}
