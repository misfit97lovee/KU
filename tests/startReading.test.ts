import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

test('제목 없이 시작한 문장·사진 입력은 독서 화면으로 전달되며 이전 입력 폼으로 덮어쓰지 않는다', async()=>{
  const source=fs.readFileSync(new URL('../src/components/BookInputPanel.ts',import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'');
  let html='',revision=0;const nodes=new Map<string,any>();const sent:any[]=[];
  const node=(key:string)=>{
    if(!nodes.has(key))nodes.set(key,{value:'',dataset:{},listeners:{} as Record<string,Function>,focus(){},click(){this.listeners.click?.({});},addEventListener(type:string,fn:Function){this.listeners[type]=fn;}});
    return nodes.get(key);
  };
  const container={get innerHTML(){return html;},set innerHTML(value:string){html=value;nodes.clear();},
    querySelector(selector:string){return html.includes(`id="${selector.slice(1)}"`)?node(selector):null;},
    querySelectorAll(selector:string){if(selector!=='[data-tab]')return[];return [...html.matchAll(/data-tab="([^"]+)"/g)].map(m=>{const element=node('tab-'+m[1]);element.getAttribute=()=>m[1];return element;});}
  };
  const runtime=vm.createContext({module:{exports:{}},exports:{},subscribeAccount:()=>{},getAccountRevision:()=>revision,
    URL:{createObjectURL:()=> 'blob:synthetic-page',revokeObjectURL:()=>{}},alert:()=>{},
    FileReader:class{result='data:image/png;base64,cGFnZQ==';onload?:()=>void;readAsDataURL(){this.onload?.();}},
    openCameraModal:()=>()=>{},container,
    options:{introductory:true,onSendToChat:(text:string)=>{sent.push(text);container.innerHTML='reading-workspace';},
      onSendImage:(payload:unknown)=>{sent.push(payload);container.innerHTML='reading-workspace';}}
  });
  vm.runInContext(transformSync(source,{loader:'ts',format:'cjs'}).code,runtime);
  vm.runInContext('renderBookInputPanel(container,options)',runtime);
  assert(html.includes('책 사진 찍기'));assert(!html.includes('book-context-summary'));
  node('tab-direct').click();node('#book-text-input').value='궁금한 문장';node('#btn-submit-book-text').click();
  assert.equal(html,'reading-workspace');assert(String(sent[0]).includes('궁금한 문장'));
  vm.runInContext('renderBookInputPanel(container,options)',runtime);
  node('#book-photo-input').listeners.change({target:{files:[{type:'image/png',size:10,name:'page.png'}]}});
  assert(html.includes('책 사진 미리보기'));assert(html.includes('btn-gaze-read'));
  await node('#btn-submit-book-photo').listeners.click();
  assert.equal(html,'reading-workspace');assert.equal(sent[1].image.data,'cGFnZQ==');
  // A late file callback from the previous account cannot reveal its preview.
  vm.runInContext('renderBookInputPanel(container,options)',runtime);
  const oldChange=node('#book-photo-input').listeners.change;revision++;
  oldChange({target:{files:[{type:'image/png',size:10,name:'private-page.png'}]}});
  assert(!html.includes('private-page.png'));
});
