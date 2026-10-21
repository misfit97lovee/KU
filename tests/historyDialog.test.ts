import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { mergeSavedSessions, type SavedSession } from '../src/sessionHistory.ts';
import { hasReadingActivity } from '../src/readingActivity.ts';

const record = (id:string):SavedSession=>({id,kind:'reading',title:'테스트 책',savedAt:'2026-10-20T00:00:00Z',snapshot:{session:{summary:'테스트 요약'}}});
function harness(local:SavedSession[],remote:SavedSession[],state:unknown,saveCurrent=false) {
  const source=fs.readFileSync(new URL('../src/components/HistoryDialog.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  const buttons=new Map<string,{onclick?:()=>unknown;disabled:boolean;click():void;focus():void;addEventListener(type:string,fn:()=>unknown):void}>();
  let overlay:any;
  let html='';let accountListener=()=>{};
  let account='A';const calls:Array<{method:string;url:string;body?:any}>=[];
  let localRecords=[...local],remoteRecords=[...remote];
  const element={id:'',className:'',isConnected:false,
    get innerHTML(){return html;},set innerHTML(value:string){html=value;buttons.clear();},
    remove(){this.isConnected=false;},addEventListener(){},querySelectorAll(){return[];},
    querySelector(selector:string){
      const id=selector.replace(/^#/,'');
      const tag=html.match(new RegExp('<button[^>]*id="'+id+'"[^>]*>'))?.[0];
      if(!tag)return null;
      if(!buttons.has(id))buttons.set(id,{disabled:tag.includes('disabled'),click(){if(!this.disabled)void this.onclick?.();},focus(){},addEventListener(_type,fn){this.onclick=fn;}});
      return buttons.get(id);
    }
  };
  const context={
    subscribeAccount:(fn:()=>void)=>{accountListener=fn;},getAccountId:()=>account,
    getSavedSessions:()=>localRecords,mergeSavedSessions,removeSavedSession:(id:string)=>{localRecords=localRecords.filter(r=>r.id!==id);},
    hasReadingActivity,accountGet:()=>null,stateManager:{getState:()=>state},
    crypto:{randomUUID:()=> 'current-record'},confirm:()=>true,formatText:(v:string)=>v,
    window:{location:{pathname:'/'}},
    document:{activeElement:null,getElementById:()=>overlay?.isConnected?overlay:null,createElement:()=>{overlay=element;return element;},body:{appendChild:(value:any)=>{value.isConnected=true;}}},
    accountFetch:async(url:string,options:RequestInit)=>{
      calls.push({url,method:options.method||'GET',body:options.body?JSON.parse(String(options.body)):undefined});
      if(options.method==='PUT')remoteRecords=[JSON.parse(String(options.body))];
      if(options.method==='DELETE')remoteRecords=remoteRecords.filter(r=>!url.endsWith('/'+r.id));
      return{ok:true,json:async()=>options.method?{}:{records:remoteRecords}};
    }
  };
  // Keep declarations and exports in one context for invoking the real dialog.
  const runtime=vm.createContext({...context,module:{exports:{}},exports:{}});
  vm.runInContext(transformSync(source,{loader:'ts',format:'cjs'}).code,runtime);
  vm.runInContext(`openHistoryDialog({saveCurrent:${saveCurrent}})`,runtime);
  return{calls,html:()=>html,local:()=>localRecords,remote:()=>remoteRecords,
    click:async(id:string)=>{const button=buttons.get(id)||element.querySelector('#'+id);assert(button&&!button.disabled);await button.onclick?.();},
    logout:()=>{account='';accountListener();},connected:()=>element.isConnected};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('내 독서 기록 단일 목록: 자동 조회만 실행하고 기존 기록을 업로드하거나 삭제하지 않는다',async()=>{
  const h=harness([record('same'),record('local-only')],[record('same')],{book:{title:'제목만'},session:{recentMessages:[{role:'assistant',content:'안녕'}]}});
  await flush();
  assert(h.html().includes('내 독서 기록'));assert(h.html().includes('>기록 저장<'));
  assert(!/이 브라우저 기록|내 DB 기록|현재 독서 DB 저장|localStorage/.test(h.html()));
  assert.equal((h.html().match(/data-record="same"/g)||[]).length,1);
  assert.deepEqual(h.calls.map(c=>c.method),['GET']);
  await h.click('history-save-db');
  assert(h.html().includes('아직 저장할 독서 활동이 없어요'));
  assert.deepEqual(h.calls.map(c=>c.method),['GET']);
  h.logout();assert(!h.connected());
});

test('명시적 저장·삭제는 선택한 기록만 처리하고 나머지 임시 기록을 유지한다',async()=>{
  const h=harness([record('local-only')],[],{book:{title:'새 책'},session:{recentMessages:[{role:'user',content:'독서 질문'}]}});
  await flush();await h.click('history-save-db');
  assert.equal(h.calls.filter(c=>c.method==='PUT').length,1);
  assert.equal(h.remote()[0]!.id,'current-record');assert.equal(h.local()[0]!.id,'local-only');
  await h.click('history-delete-db');
  assert.equal(h.calls.filter(c=>c.method==='DELETE').length,1);
  assert.deepEqual(h.remote(),[]);assert.equal(h.local()[0]!.id,'local-only');
});

test('독서노트에서 누른 기록 저장은 현재 활동만 저장하며 기존 목록 자동 이전을 하지 않는다',async()=>{
  const h=harness([record('old-reading')],[],{book:{title:'오늘 읽은 책'},session:{readingNote:'오늘의 생각'}},true);
  await flush();await flush();
  const writes=h.calls.filter(c=>c.method==='PUT');assert.equal(writes.length,1);
  assert.equal(writes[0]!.body.title,'오늘 읽은 책');
  assert.equal(writes[0]!.body.snapshot.session.readingNote,'오늘의 생각');
  assert.equal(h.local()[0]!.id,'old-reading');assert(h.html().includes('기록을 저장했어요'));
});
