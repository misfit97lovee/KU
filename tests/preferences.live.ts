import 'dotenv/config';
import { ReadingDatabase } from '../server/database.ts';
import { probePreferences } from './preferencesProbe.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const db = new ReadingDatabase(process.env.SUPABASE_URL || '', process.env.SUPABASE_SECRET_KEY || '');
await probePreferences(db);
console.log('Supabase preferences: save, restore, update, A/B isolation, skip, concurrency, delete PASS. Probe accounts removed.');

if (process.argv.includes('--recommend')) {
  process.env.NODE_ENV = 'test';
  const { recommendBooks } = await import('../server/server.ts');
  const user = { id: `ku-preferences-recommend-test-${randomUUID()}`, name: 'Recommendation test', email: 'test@example.invalid', picture: '' };
  try {
    const mystery = { genres: ['추리·미스터리'], topics: ['심리'], favorite_authors: ['아서 코난 도일'], favorite_books: ['셜록 홈즈'] };
    await db.savePreferences(user, mystery);
    for (const [label, message] of [['preferred', '내 취향에 맞는 책 추천해줘'], ['current_request_priority', '물리학 책 추천해줘']] as const) {
      const started = performance.now();
      const result = await recommendBooks({ userMessage: message, userGrade: '중2', personalization: await db.getPersonalization(user) });
      assert(result.books.length > 0, 'Expected real recommendations');
      assert(result.books.every(book => book.isbn13 && book.sourceType === 'yes24' && !/학습서|수험서|문제집/.test(`${book.category} ${book.title}`)));
      assert.match(result.request!.topic, label === 'preferred' ? /추리|미스터리|탐정/ : /물리/);
      console.log(JSON.stringify({ label, titles: result.books.map(book => book.title), ms: Math.round(performance.now() - started), failures: result.search.failures }));
    }
    await db.savePreferences(user, { genres: ['과학'], topics: ['물리학'], favorite_authors: [], favorite_books: [] });
    const changed = await recommendBooks({ userMessage: '내 취향에 맞는 책 추천해줘', userGrade: '중2', personalization: await db.getPersonalization(user) });
    assert(changed.books.length > 0); assert.match(changed.request!.topic, /물리|과학/);
    console.log(JSON.stringify({ label: 'updated_preferences', titles: changed.books.map(book => book.title), failures: changed.search.failures }));
  } finally {
    await db.removePreferences(user);
    await db.query('users', { google_sub: `eq.${user.id}` }, 'DELETE');
    console.log('Recommendation probe account removed.');
  }
}
