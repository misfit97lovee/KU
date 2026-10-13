import 'dotenv/config';
import assert from 'node:assert/strict';
import { ReadingDatabase } from '../server/database.ts';
import { probeDatabase } from './databaseProbe.ts';

const db = new ReadingDatabase(process.env.SUPABASE_URL || '', process.env.SUPABASE_SECRET_KEY || '');
for (const table of ['users', 'reading_sessions', 'reading_notes']) {
  await db.query(table, { select: '*', limit: '0' });
  console.log(`${table}: server SELECT OK`);
}
// No credentials must not expose records via the Data API.
const response = await fetch(new URL('/rest/v1/reading_sessions?select=id&limit=0', process.env.SUPABASE_URL), { signal: AbortSignal.timeout(5000) });
assert(response.status === 401 || response.status === 403);
console.log('Unauthenticated Data API: denied');
await probeDatabase(db);
console.log('REAL DB PASS: users/sessions/notes writes, reads, retry deduplication, A/B isolation, logout rejection, relogin restoration, delete cascade, cross-account FK rejection; probe rows removed.');
