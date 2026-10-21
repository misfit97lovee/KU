import 'dotenv/config';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import type { AddressInfo } from 'node:net';
import { callResponses, getOpenAIConfig } from '../server/openai.ts';

// Synthetic book page in memory only. No photos, keys or responses saved.
function pageImage(): string {
  const glyphs: Record<string, string[]> = {
    T: ['11111','00100','00100','00100','00100','00100','00100'], H:['10001','10001','10001','11111','10001','10001','10001'],
    E:['11111','10000','10000','11110','10000','10000','11111'], C:['01111','10000','10000','10000','10000','10000','01111'],
    A:['01110','10001','10001','11111','10001','10001','10001'], S:['01111','10000','10000','01110','00001','00001','11110'],
    O:['01110','10001','10001','10001','10001','10001','01110'], N:['10001','11001','10101','10011','10001','10001','10001'],
    M:['10001','11011','10101','10101','10001','10001','10001']
  };
  const width=800, height=100, scale=4;
  const pixels=Buffer.alloc((width*3+1)*height,255);
  for(let y=0;y<height;y++) pixels[y*(width*3+1)]=0;
  const text='THE CAT SAT ON THE MAT';
  [...text].forEach((c,i)=>glyphs[c]?.forEach((row,y)=>[...row].forEach((v,x)=>{
    if(v!=='1')return;
    for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
      const offset=(30+y*scale+dy)*(width*3+1)+1+(20+i*6*scale+x*scale+dx)*3;
      pixels.fill(0,offset,offset+3);
    }
  })));
  const crc=(data:Buffer)=>{let c=0xffffffff;for(const byte of data){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
  const chunk=(type:string,data:Buffer)=>{const name=Buffer.from(type);const length=Buffer.alloc(4);length.writeUInt32BE(data.length);const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,checksum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}

const config=getOpenAIConfig();
const originalFetch=globalThis.fetch;
const calls:Array<{status:number;model:string;image:boolean;json:boolean;elapsedMs:number}>=[];
globalThis.fetch=async(input,options)=>{
  const url=new URL(String(input));
  assert.notEqual(url.hostname,'generativelanguage.googleapis.com','Legacy provider call detected');
  if(!url.pathname.endsWith('/responses'))return originalFetch(input,options);
  assert.equal(url.origin,new URL(config.baseUrl).origin);
  const body=JSON.parse(String(options?.body));assert.equal(body.store,false);assert.equal(body.reasoning.effort,'medium');
  const call={status:0,model:body.model,image:JSON.stringify(body.input).includes('input_image'),json:Boolean(body.text),elapsedMs:0};
  calls.push(call);
  const start=Date.now();let response:Response;
  try{response=await originalFetch(input,options);call.status=response.status;}finally{call.elapsedMs=Date.now()-start;}
  if(!response.ok){const failure=await response.clone().json().catch(()=>({}));console.log(JSON.stringify({diagnosticStatus:response.status,
    diagnostic:typeof failure.error?.message==='string'?failure.error.message.split(config.apiKey).join('[redacted]').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,350):null,
    parameter:failure.error?.param||null}));}
  return response;
};
process.env.NODE_ENV='test';
const {app}=await import('../server/server.ts');
const server=app.listen(0,'127.0.0.1');
await new Promise<void>(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const passage='민수는 비 오는 날 떨고 있는 길고양이에게 자신의 우산을 씌워 주었다. 집으로 돌아온 민수의 옷은 젖었지만 마음은 따뜻했다.';
const state={student:{grade:'중2',readingLevel:'중급'},book:{title:'우산과 고양이'},session:{}};
const messages=[{role:'user',content:'[책 내용] '+passage},{role:'assistant',content:'어느 부분이 궁금하니?'},{role:'user',content:'민수의 마음이 따뜻한 이유를 본문에 근거해 바로 설명해줘.'}];
const results: Array<{feature:string;ok:boolean;status?:number;model?:string;calls?:number;elapsedMs?:number;error?:string}>=[];
const selected=new Set(process.argv.slice(2));
async function check(feature:string,path:string,body:unknown,verify:(data:any)=>void){
  if(selected.size&&!selected.has(feature))return null;
  const before=calls.length,start=Date.now();
  try{
    const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
    const data=await response.json();assert.equal(response.status,200);verify(data);
    if(path!=='/api/recommend-books')assert.equal(calls.length-before,1);
    results.push({feature,ok:true,status:response.status,model:data.modelUsed,calls:calls.length-before,elapsedMs:Date.now()-start});
    return data;
  }catch(error){results.push({feature,ok:false,calls:calls.length-before,elapsedMs:Date.now()-start,error:error instanceof Error?error.name:'error'});return null;}
}
try{
  if(!selected.size||selected.has('text_auth')){
    const direct=await callResponses({apiKey:config.apiKey,baseUrl:config.baseUrl,model:config.model,input:'Return JSON {"ok":true}.',system:'Return JSON.',json:true});
    assert.equal(JSON.parse(direct.text).ok,true);
    results.push({feature:'text_auth',ok:true,model:direct.modelUsed});
  }
  const chat=await check('reading_chat','/api/chat',{messages,readingState:state,sourceText:passage},d=>{assert(d.message);assert(d.modelUsed?.startsWith('gpt-5.6-luna'));});
  await check('comprehension_question','/api/chat',{messages:[...messages,{role:'assistant',content:chat?.message||'민수는 고양이를 도와서 뿌듯해.'}],readingState:state,sourceText:passage,explanationLevel:'quiz_request'},d=>{assert(d.message);assert.equal(d.isQuizQuestion,true);});
  await check('image_analysis','/api/chat',{messages:[{role:'user',content:'책 사진의 본문을 읽고 도와줘.'}],readingState:state,image:{data:pageImage(),mimeType:'image/png'}},d=>{assert(d.message);assert(/CAT/i.test(d.extractedText||''));assert(/MAT/i.test(d.extractedText||''));});
  await check('reading_note','/api/reading-note',{messages,readingState:state,sourceText:passage},d=>assert(d.readingNote));
  await check('reading_summary','/api/summary',{messages,readingState:state,sourceText:passage},d=>assert(d.summary));
  const rec=await check('recommendation','/api/recommend-books',{userMessage:'중학생이 읽기 좋은 미스터리 추리소설 추천해줘',userGrade:'중2'},d=>{assert(d.books?.length>0);assert(d.books.every((b:any)=>b.title&&(b.author||b.authors)&&b.isbn13));});
  if(rec){console.log(JSON.stringify({recommendationCount:rec.books.length,candidateCount:rec.candidateCount,failures:rec.search?.failures}));
    results.push({feature:'recommendation_gpt_evaluation',ok:!rec.search?.failures?.includes('model_evaluation_unavailable')});}
  console.log(JSON.stringify({results,calls}));
  if(results.some(r=>!r.ok))process.exitCode=1;
}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));globalThis.fetch=originalFetch;}
