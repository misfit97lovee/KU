import test from 'node:test';
import assert from 'node:assert/strict';
import { explicitTopicRequest, createRecommendationService } from '../server/bookRecommendations.ts';
import { cacheBookSearch } from '../server/bookSearchCache.ts';
import { callResponses } from '../server/openai.ts';
import { partialMessage, readChatResponse } from '../src/chatStream.ts';

test('명확한 단순 주제만 분석 호출을 줄이고 추가 조건·작가·exact/similar·대화는 기존 분석 유지',async()=>{
  for(const text of ['한국의 고전명작 추천해줘','중학생이 읽기 좋은 미스터리 추리소설 추천해줘','중학생이 읽기 좋은 우주 과학책 추천해줘']) assert(explicitTopicRequest(text,'중2'));
  for(const text of ['재미있는 책 추천해줘','구운몽처럼 조선시대 고전 추천해줘','김영하 소설 추천해줘','코스모스 찾아줘','중학생이 읽기 좋은 우주 과학책 추천해줘. 단, 심화 수준으로','전쟁 없는 추리소설 추천해줘']) assert.equal(explicitTopicRequest(text,'중2'),null);
  const book={title:'춘향전',author:'작자 미상',isbn13:'9780000000001',category:'한국 고전소설'};
  let stages:string[]=[];
  const recommend=createRecommendationService({fastExplicitTopics:true,fetchYes24:async()=>[book],fetchCandidates:async()=>[],searchTitle:async()=>[],generate:async({stage})=>{
    stages.push(stage); return {text:JSON.stringify(stage==='analyze'?explicitTopicRequest('한국 고전소설 추천해줘','중2'):{ratings:[[0,90,true,true,'춘향전','한국 고전소설을 읽을 수 있어요.']]})};
  }});
  assert.equal((await recommend({userMessage:'한국 고전소설 추천해줘'})).books.length,1);
  assert.deepEqual(stages,['evaluate_library']);
  stages=[]; await recommend({userMessage:'한국 고전소설 추천해줘',chatHistory:[{role:'user',content:'기존 조건'}]});
  assert(stages.includes('analyze'));
});

test('완료된 검증 결과만 계정·전체 입력별 캐시하며 동시 요청 병합, 실패 재호출, 읽기 복사 유지',async()=>{
  let calls=0, now=0;
  const recommend=cacheBookSearch(async(scope:string,input:{grade:string,fail?:boolean})=>{calls++;return{books:[scope+input.grade],valid:!input.fail};},
    {stage:'test',now:()=>now,ttlMs:60,shouldCache:result=>result.valid});
  await Promise.all([recommend('A',{grade:'중1'}),recommend('A',{grade:'중1'})]);assert.equal(calls,1);
  await recommend('B',{grade:'중1'});await recommend('A',{grade:'중2'});assert.equal(calls,3);
  const copy=await recommend('A',{grade:'중1'});copy.books[0]='changed';assert.deepEqual((await recommend('A',{grade:'중1'})).books,['A중1']);
  await recommend('A',{grade:'중1',fail:true});await recommend('A',{grade:'중1',fail:true});assert.equal(calls,5);
  now=61;await recommend('A',{grade:'중1'});assert.equal(calls,6);
});

const sse=(events:unknown[])=>new Response(new ReadableStream({start(controller){
  const bytes=new TextEncoder().encode(events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join(''));
  for(let i=0;i<bytes.length;i+=3) controller.enqueue(bytes.slice(i,i+3));controller.close();
}}),{headers:{'Content-Type':'text/event-stream'}});

test('GPT SSE는 실제 delta를 전달하고 completed·JSON 검증 뒤에만 성공하며 중단/오류는 재시도하지 않음',async()=>{
  for(const completed of [true,false]) {
    let calls=0;const deltas:string[]=[],events:any[]=[];
    const result=callResponses({apiKey:'test',system:'JSON',input:'질문',json:true,onTextDelta:delta=>deltas.push(delta),onEvent:e=>events.push(e),
      request:async(_url,options)=>{calls++; const body=JSON.parse(String(options?.body));assert.equal(body.stream,true);assert.equal(body.store,false);assert.equal(body.reasoning.effort,'medium');
        return sse([{type:'response.output_text.delta',delta:'{"message":"안녕"}'},...(completed?[{type:'response.completed',response:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"message":"안녕"}'}]}]}}]:[])]);
      }});
    if(completed) assert.equal(JSON.parse((await result).text).message,'안녕');else await assert.rejects(result,/unavailable/);
    assert.equal(calls,1);assert.equal(deltas.length,1);assert(events.some(e=>e.event==='first_token'));
  }
});

test('채팅 스트림은 완성된 message 문자만 표시하고 완료 데이터만 반환; 잘림·계정 취소 시 저장 불가',async()=>{
  assert.equal(partialMessage('{"message":"a\\n나\\u'),'a\n나');
  assert.equal(partialMessage('{"message":"<script>"}'),'<script>'); // UI uses textContent.
  const previews:string[]=[];
  const response=await readChatResponse(sse([{type:'message',message:'첫 토큰'},{type:'done',data:{message:'완료',evidence:[]}}]),new AbortController().signal,text=>previews.push(text));
  assert.deepEqual(previews,['첫 토큰']);assert.equal(response.message,'완료');
  await assert.rejects(readChatResponse(sse([{type:'message',message:'미완료'}]),new AbortController().signal,()=>{}),/완료/);
  const controller=new AbortController();
  await assert.rejects(readChatResponse(sse([{type:'message',message:'A'},{type:'done',data:{message:'A'}}]),controller.signal,()=>controller.abort()),{name:'AbortError'});
});
