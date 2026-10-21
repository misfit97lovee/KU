import test from 'node:test';
import assert from 'node:assert/strict';
import { hasReadingActivity } from '../src/readingActivity.ts';
import { mergeSavedSessions, type SavedSession } from '../src/sessionHistory.ts';
import { cacheBookSearch } from '../server/bookSearchCache.ts';
import { createRecommendationService, selectLibraryBooks, literaryWorkKey, isCollectionLike } from '../server/bookRecommendations.ts';
import type { Book, RecommendationRequest } from '../src/types/index.ts';

test('제목·초기 인사·빈 노트만 있으면 저장하지 않고 실제 대화·정리·이해도·시선 활동은 저장한다', () => {
  for (const value of [{}, { book: { title: '책 제목' } }, { session: { recentMessages: [{role:'assistant',content:'안녕!'}] } }, { session: { readingNote: '  ', summary: '' } }]) assert.equal(hasReadingActivity('reading', value), false);
  for (const session of [{ recentMessages: [{role:'user',content:'궁금한 문장'}] }, { recentMessages: [{role:'user',image:{data:'photo'}}] }, { readingNote:'노트' }, { summary:'요약' }, { comprehensionChecks:[{}] }, { gazeReports:[{}] }]) assert(hasReadingActivity('reading', {session}));
  assert(!hasReadingActivity('recommendation', {currentDocument:{},chatHistory:[{role:'librarian',content:'인사'}]}));
  assert(hasReadingActivity('recommendation', {chatHistory:[{role:'user',content:'고전 추천'}]}));
});

test('통합 목록은 날짜순이고 동일 ID를 한번만 표시하며 원본·저장 위치를 변경하지 않는다', () => {
  const record = (id:string,savedAt:string,title:string): SavedSession => ({id,savedAt,title,kind:'reading',snapshot:{session:{summary:title}}});
  const local=[record('same','2026-01-01','옛 내용'),record('local','2026-02-01','임시 기록')];
  const remote=[record('same','2026-03-01','최신 내용')];
  const before=JSON.stringify([local,remote]);
  const merged=mergeSavedSessions(local,remote);
  assert.deepEqual(merged.map(r=>r.id),['same','local']);
  assert.equal(merged[0]!.title,'최신 내용'); assert(merged[0]!.local&&merged[0]!.remote);
  assert.equal(JSON.stringify([local,remote]),before);
});

test('검색 캐시는 동시 요청을 합치고 복사본을 반환하며 만료·용량 제한·실패 재검색을 지원한다', async () => {
  let calls=0,now=0;
  const search=cacheBookSearch(async(query:string)=>{calls++;if(query==='fail')throw Error('offline');return[{title:query}];},{stage:'test',now:()=>now,ttlMs:100,maxEntries:2});
  const [a,b]=await Promise.all([search('A'),search('A')]); assert.equal(calls,1);
  a[0]!.title='mutated';assert.equal(b[0]!.title,'A');assert.equal((await search('A'))[0]!.title,'A');
  now=101;await search('A');assert.equal(calls,2);
  await search('B');await search('C');await search('A');assert.equal(calls,5);
  await assert.rejects(search('fail'));await assert.rejects(search('fail'));assert.equal(calls,7);
});

const request:RecommendationRequest={topic:'한국 고전소설',keywords:['한국 고전'],searchMode:'topic',grade:'중2',difficulty:'미지정',intent:'도서 추천',specificTitle:null,author:null,referenceBook:null,referenceAuthor:null,similarityFocus:null,needsClarification:false,kdc:'8'};
const classics:Book[]=[
  {title:'한국 고전 전집 세트 전30권',author:'여러 작가',isbn13:'9780000000001',category:'한국 고전소설'},
  {title:'춘향전',author:'작자 미상',isbn13:'9780000000002',category:'한국 고전소설'},
  {title:'춘향전 특별판',author:'작자 미상',isbn13:'9780000000003',category:'한국 고전소설'},
  {title:'홍길동전',author:'허균',isbn13:'9780000000004',category:'한국 고전소설'},
  {title:'구운몽',author:'김만중',isbn13:'9780000000005',category:'한국 고전소설'}
];
test('한국 고전 topic도 전집보다 개별 작품 우선, 다른 ISBN의 판본과 전집 변형은 중복하지 않는다', () => {
  const ratings=classics.map((b,candidateId)=>({candidateId,relevanceScore:candidateId===0?99:90,topicMatch:true,difficultyMatch:true,evidence:b.title,reason:'실제 한국 고전소설'}));
  const books=selectLibraryBooks(classics,{ratings},request);
  assert.equal(books.length,3);assert(!books.some(isCollectionLike));
  assert.equal(new Set(books.map(literaryWorkKey)).size,3);
  assert.equal(literaryWorkKey(classics[1]!),literaryWorkKey(classics[2]!));
});
test('판본은 평가 전에 통합하지만 GPT 평가는 유지하며 추가 목록에도 같은 작품을 반복하지 않는다', async () => {
  let evaluations=0;
  const recommend=createRecommendationService({generate:async options=>{
    if(options.stage==='analyze')return{text:JSON.stringify(request)};
    evaluations++;const candidates=JSON.parse(options.prompt).candidates;
    assert.equal(candidates.length,3);assert(!candidates.some(isCollectionLike));
    return{text:JSON.stringify({ratings:candidates.map((b:Book,candidateId:number)=>({candidateId,relevanceScore:90,topicMatch:true,difficultyMatch:true,evidence:b.title,reason:'한국 고전소설'}))})};
  },fetchYes24:async()=>classics,fetchCandidates:async()=>[],searchTitle:async()=>[]});
  const result=await recommend({userMessage:'한국의 고전명작 추천해줘'});
  assert.equal(evaluations,1);assert.equal(result.books.length,3);
  const selected=new Set(result.books.map(literaryWorkKey));
  assert(result.moreBooks?.every(b=>!selected.has(literaryWorkKey(b))));
});
