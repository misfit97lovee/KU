const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/GazeReaderModal-BPipQe8V.js","assets/sessionHistory-BdnGGKuK.js"])))=>i.map(i=>d[i]);
var re=Object.defineProperty;var oe=(t,e,s)=>e in t?re(t,e,{enumerable:!0,configurable:!0,writable:!0,value:s}):t[e]=s;var _=(t,e,s)=>oe(t,typeof e!="symbol"?e+"":e,s);import{a as Y,c as X,d as le,h as T,r as ce,o as de,i as ue,f as z,e as pe}from"./sessionHistory-BdnGGKuK.js";const H=t=>t&&typeof t=="object"&&!Array.isArray(t)?t:{},J=t=>typeof t=="string"&&!!t.trim(),N=t=>Array.isArray(t)&&t.length>0,fe=t=>Array.isArray(t)&&t.some(e=>{const s=H(e);return s.role==="user"&&(J(s.content)||J(H(s.image).data))});function me(t,e){const s=H(e),n=H(s.session);return fe(n.recentMessages)||J(n.summary)||J(n.readingNote)||N(n.comprehensionChecks)||N(n.difficultPoints)||N(n.understoodPoints)||N(n.gazeReports)}const B={PROFILE:"reading-agent-profile",SESSION:"reading-agent-current-session"},ve={student:{grade:null,readingLevel:"중급",readingLevelSelected:!1},book:{title:""},session:{recentMessages:[],difficultPoints:[],understoodPoints:[],summary:null,readingNote:null,comprehensionChecks:[],suggestedQuestions:[],isQuizActive:!1},taoLogs:[]},ee=()=>JSON.parse(JSON.stringify(ve));class ge{constructor(){_(this,"state");_(this,"listeners");this.state=this.loadState(),this.listeners=[]}loadState(){try{const e=JSON.parse(Y(B.PROFILE)||"{}"),s=JSON.parse(Y(B.SESSION)||"{}");return{student:{grade:e.grade||null,readingLevel:e.readingLevel==="입문"||e.readingLevel==="심화"?e.readingLevel:"중급",readingLevelSelected:e.readingLevelSelected===!0},book:{title:s.bookTitle||""},session:{recentMessages:s.recentMessages||[],difficultPoints:s.difficultPoints||[],understoodPoints:s.understoodPoints||[],summary:s.summary||null,readingNote:s.readingNote||null,comprehensionChecks:s.comprehensionChecks||[],suggestedQuestions:s.suggestedQuestions||[],isQuizActive:!!s.isQuizActive,sourceText:s.sourceText||"",gazeReports:s.gazeReports||[]},taoLogs:s.taoLogs||[]}}catch(e){return console.error("로컬스토리지 복원 실패:",e),ee()}}saveState(){try{X(B.PROFILE,JSON.stringify({grade:this.state.student.grade,readingLevel:this.state.student.readingLevel||"중급",readingLevelSelected:this.state.student.readingLevelSelected===!0})),X(B.SESSION,JSON.stringify({bookTitle:this.state.book.title,recentMessages:this.state.session.recentMessages,difficultPoints:this.state.session.difficultPoints,understoodPoints:this.state.session.understoodPoints,summary:this.state.session.summary,readingNote:this.state.session.readingNote,comprehensionChecks:this.state.session.comprehensionChecks,suggestedQuestions:this.state.session.suggestedQuestions,isQuizActive:!!this.state.session.isQuizActive,taoLogs:this.state.taoLogs,sourceText:this.state.session.sourceText||"",gazeReports:this.state.session.gazeReports||[]}))}catch(e){console.error("로컬스토리지 저장 실패:",e)}}subscribe(e){return this.listeners.push(e),()=>{this.listeners=this.listeners.filter(s=>s!==e)}}notify(){this.saveState(),this.listeners.forEach(e=>e(this.state))}getState(){return this.state}setGrade(e){this.state.student.grade=e,this.notify()}setReadingLevel(e){this.state.student.readingLevel=e,this.state.student.readingLevelSelected=!0,this.notify()}setBookTitle(e){this.state.book.title=e,this.notify()}addMessage(e,s,n={}){const a={role:e,content:s,image:n.image||null,evidence:Array.isArray(n.evidence)?n.evidence:[],isExplanation:n.isExplanation!==void 0?n.isExplanation:!0,isQuizQuestion:!!n.isQuizQuestion,timestamp:Date.now()};return this.state.session.recentMessages.push(a),this.notify(),a}setSummary(e){this.state.session.summary=e,this.notify()}setSourceText(e){this.state.session.sourceText=e,this.notify()}addGazeReport(e){this.state.session.gazeReports=[{...e,id:crypto.randomUUID(),createdAt:Date.now()},...this.state.session.gazeReports||[]].slice(0,3),this.notify()}setReadingNote(e){this.state.session.readingNote=e,this.notify()}addComprehensionCheck(e){if(!e)return;this.state.session.comprehensionChecks||(this.state.session.comprehensionChecks=[]);const s={topic:e.topic||"핵심 내용 이해",result:e.result||"확인 완료",difficultPart:e.difficultPart||null,timestamp:Date.now()};this.state.session.comprehensionChecks.push(s),e.difficultPart&&!this.state.session.difficultPoints.includes(e.difficultPart)&&this.state.session.difficultPoints.push(e.difficultPart),this.notify()}addTaoLog(e){if(!e)return;const s={id:Date.now().toString(),thoughtSummary:e.thoughtSummary||"사용자 의도 분석",action:e.action||"askUser",observation:e.observation||"응답 완료",timestamp:Date.now()};this.state.taoLogs.unshift(s),this.state.taoLogs.length>10&&(this.state.taoLogs=this.state.taoLogs.slice(0,10)),this.notify()}setQuizActive(e){this.state.session.isQuizActive=!!e,this.notify()}setSuggestedQuestions(e){this.state.session.suggestedQuestions=Array.isArray(e)?e.filter(s=>typeof s=="string"&&s.trim().length>0).slice(0,3):[],this.notify()}resetSession(){le("reading",this.state),this.state.book.title="",this.state.session=ee().session,this.state.taoLogs=[],this.notify()}}const p=new ge;async function be(t,e,s){var u;if(!((u=t.headers.get("content-type"))!=null&&u.includes("text/event-stream"))){e.throwIfAborted();const l=await t.json();return e.throwIfAborted(),l}if(!t.body)throw new Error("답변을 받지 못했어요.");const n=t.body.getReader(),a=new TextDecoder;let i="",o;const c=()=>{n.cancel()};e.addEventListener("abort",c,{once:!0});try{for(;;){e.throwIfAborted();const{value:l,done:r}=await n.read();e.throwIfAborted(),i=(i+a.decode(l,{stream:!r})).replace(/\r\n/g,`
`);let f;for(;(f=i.indexOf(`

`))>=0;){const d=i.slice(0,f);i=i.slice(f+2);const m=d.split(`
`).filter(y=>y.startsWith("data:")).map(y=>y.slice(5)).join(`
`);if(!m)continue;const v=JSON.parse(m);if(v.type==="message"&&typeof v.message=="string"&&s(v.message),v.type==="done"&&(o=v.data),v.type==="error")throw new Error("설명을 만드는 중 문제가 생겼어요. 다시 시도해 주세요.")}if(r)break}if(!(o!=null&&o.message))throw new Error("답변이 완료되지 않았어요. 다시 시도해 주세요.");return o}finally{e.removeEventListener("abort",c),await n.cancel().catch(()=>{}),n.releaseLock()}}function q(t,e){var i;const s=t.session.recentMessages,n=s.slice(0,-6),a=n.slice(-12).map(o=>`${o.role==="user"?"학생":"도우미"}: ${o.content.replace(/\s+/g," ").slice(0,180)}`).join(`
`);return{messages:s.slice(-6).map(({role:o,content:c})=>({role:o,content:c.slice(0,4e3)})),conversationSummary:[(i=t.session.summary)==null?void 0:i.slice(0,1e3),a].filter(Boolean).join(`
`).slice(0,3e3),sourceText:(t.session.sourceText||n.filter(o=>o.role==="user").slice(-3).map(o=>o.content).join(`
`)).slice(0,6e3),readingState:{student:{grade:t.student.grade,readingLevel:t.student.readingLevel||"중급"},book:t.book,session:{difficultPoints:t.session.difficultPoints.slice(-3),understoodPoints:t.session.understoodPoints.slice(-3),comprehensionChecks:t.session.comprehensionChecks.slice(-2).map(({topic:o,result:c,difficultPart:u,timestamp:l})=>({topic:o,result:c,difficultPart:u,timestamp:l}))}},...e?{explanationLevel:e}:{}}}function he(t,{currentGrade:e,onSelectGrade:s,onClose:n,onOpenReadingLevel:a}){var u;const i=[{value:"중1",title:"중학교 1학년",desc:"기초 어휘와 흥미 중심의 쉬운 대화"},{value:"중2",title:"중학교 2학년",desc:"문맥과 인물 심리를 탐색하는 대화"},{value:"중3",title:"중학교 3학년",desc:"상징과 주제 의식을 연결하는 깊이 있는 대화"}];t.innerHTML=`
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="grade-modal-title">
        <h2 class="modal-title" id="grade-modal-title">독서 설정</h2>
        <p class="modal-subtitle">학년과 독서 수준에 맞춰 설명해요. 선택하지 않으면 중2·중급으로 시작해요.</p>

        <div class="grade-options">
          ${i.map(l=>`
            <button class="grade-card-btn ${e===l.value?"selected":""}" data-grade="${l.value}">
              <div style="text-align: left;">
                <div style="font-weight: 600; color: var(--text-primary);">${l.title}</div>
                <div style="font-size: 12px; color: var(--text-secondary); font-weight: normal; margin-top: 2px;">${l.desc}</div>
              </div>
            </button>
          `).join("")}
        </div>

        ${e?`
          <button id="btn-reading-settings" class="btn-secondary-sm" style="width: 100%;">독서 수준 변경</button>
        `:""}
        <button id="btn-close-modal" class="btn-secondary-sm" style="width: 100%;">${e?"닫기":"선택 없이 시작"}</button>
      </div>
    </div>
  `,t.querySelectorAll(".grade-card-btn").forEach(l=>{l.addEventListener("click",()=>{const r=l.getAttribute("data-grade");r&&s(r)})});const o=t.querySelector("#btn-close-modal");(u=t.querySelector("#btn-reading-settings"))==null||u.addEventListener("click",()=>a==null?void 0:a()),o&&o.addEventListener("click",n);const c=t.querySelector("#modal-backdrop");c.addEventListener("click",l=>{l.target===c&&n()})}function ye(t,e){var n;const s=[{value:"입문",description:"쉬운 단어와 단계별 설명으로 차근차근 읽어요."},{value:"중급",description:"문맥과 인물의 마음을 함께 살펴봐요."},{value:"심화",description:"상징과 주제, 다양한 해석을 깊이 생각해요."}];t.innerHTML=`
    <div class="modal-backdrop">
      <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="reading-level-title">
        <h2 class="modal-title" id="reading-level-title">어떤 설명이 편한가요?</h2>
        <p class="modal-subtitle">독서 수준에 맞춰 설명과 이해 확인 질문을 조절해요. 기본값은 중급이며, 독서 설정에서 언제든 바꿀 수 있어요.</p>
        <div class="grade-options">
          ${s.map(a=>`
            <button class="grade-card-btn ${e.currentLevel===a.value?"selected":""}" data-reading-level="${a.value}" aria-pressed="${e.currentLevel===a.value}">
              <div style="text-align: left;">
                <div style="font-weight: 600;">${a.value}</div>
                <div style="font-size: 12px; margin-top: 2px;">${a.description}</div>
              </div>
            </button>`).join("")}
        </div>
        <button id="btn-skip-reading-level" class="btn-secondary-sm" style="width: 100%;">선택 생략 · ${e.currentLevel} 유지</button>
      </div>
    </div>`,t.querySelectorAll("[data-reading-level]").forEach(a=>{a.addEventListener("click",()=>e.onSelect(a.dataset.readingLevel))}),(n=t.querySelector("#btn-skip-reading-level"))==null||n.addEventListener("click",e.onSkip)}const xe="modulepreload",ke=function(t){return"/KU/"+t},te={},Ee=function(e,s,n){let a=Promise.resolve();if(s&&s.length>0){let o=function(l){return Promise.all(l.map(r=>Promise.resolve(r).then(f=>({status:"fulfilled",value:f}),f=>({status:"rejected",reason:f}))))};document.getElementsByTagName("link");const c=document.querySelector("meta[property=csp-nonce]"),u=(c==null?void 0:c.nonce)||(c==null?void 0:c.getAttribute("nonce"));a=o(s.map(l=>{if(l=ke(l),l in te)return;te[l]=!0;const r=l.endsWith(".css"),f=r?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${l}"]${f}`))return;const d=document.createElement("link");if(d.rel=r?"stylesheet":xe,r||(d.as="script"),d.crossOrigin="",d.href=l,u&&d.setAttribute("nonce",u),document.head.appendChild(d),r)return new Promise((m,v)=>{d.addEventListener("load",m),d.addEventListener("error",()=>v(new Error(`Unable to preload CSS for ${l}`)))})}))}function i(o){const c=new Event("vite:preloadError",{cancelable:!0});if(c.payload=o,window.dispatchEvent(c),!c.defaultPrevented)throw o}return a.then(o=>{for(const c of o||[])c.status==="rejected"&&i(c.reason);return e().catch(i)})};function se(t){if(t)try{const e=t.getTracks();for(const s of e)try{s.stop()}catch{}}catch{}}function Se(t){if(typeof t=="object"&&t!==null&&"name"in t){const e=t.name;if(e==="NotAllowedError"||e==="PermissionDeniedError")return"카메라 사용이 허용되지 않았어요. 브라우저에서 카메라 권한을 허용하거나 파일에서 사진을 선택해 주세요.";if(e==="NotFoundError"||e==="DevicesNotFoundError")return"사용할 수 있는 카메라를 찾지 못했어요. 파일에서 사진을 선택할 수 있어요.";if(e==="NotReadableError"||e==="TrackStartError")return"카메라를 시작할 수 없어요. 다른 프로그램에서 카메라를 사용 중인지 확인하거나 파일에서 사진을 선택해 주세요.";if(e==="OverconstrainedError"||e==="ConstraintNotSatisfiedError")return"카메라 설정을 불러올 수 없어요. 파일에서 사진을 선택할 수 있어요."}return"카메라를 연결하는 중 문제가 발생했어요. 브라우저 권한을 확인하거나 파일에서 사진을 선택해 주세요."}function we(t){var h,w,Q,M,b,k,E;let e=null,s=null,n=null,a=!1;const i=document.createElement("div");i.className="camera-modal-backdrop",i.id="camera-modal-backdrop",i.setAttribute("role","dialog"),i.setAttribute("aria-modal","true"),i.setAttribute("aria-label","책 페이지 촬영"),i.innerHTML=`
    <div class="camera-modal-content">
      <div class="camera-modal-header">
        <h3 class="camera-modal-title">책 페이지 촬영</h3>
        <button type="button" class="camera-modal-close" id="btn-camera-close" aria-label="닫기">✕</button>
      </div>

      <div class="camera-modal-body">
        <!-- 1. 실시간 카메라 뷰 -->
        <div id="camera-live-section" class="camera-section">
          <p class="camera-guide-text">책 페이지를 화면 안에 맞춰 주세요</p>
          <div class="camera-viewport">
            <video id="camera-video-el" autoplay playsinline muted></video>
            <div class="camera-guide-frame" aria-hidden="true"></div>
          </div>
          <div class="camera-actions">
            <button type="button" id="btn-camera-cancel" class="btn-secondary-sm camera-btn">닫기</button>
            <button type="button" id="btn-camera-snap" class="btn-send-book camera-btn camera-btn-primary">촬영</button>
          </div>
        </div>

        <!-- 2. 촬영 후 미리보기 뷰 -->
        <div id="camera-review-section" class="camera-section" style="display: none;">
          <p class="camera-guide-text">촬영된 사진을 확인해 주세요</p>
          <div class="camera-viewport camera-preview-viewport">
            <img id="camera-preview-img" alt="촬영된 책 사진" />
          </div>
          <div class="camera-actions">
            <button type="button" id="btn-camera-retake" class="btn-secondary-sm camera-btn">다시 찍기</button>
            <button type="button" id="btn-camera-use" class="btn-send-book camera-btn camera-btn-primary">이 사진 사용하기</button>
          </div>
        </div>

        <!-- 3. 에러 안내 뷰 -->
        <div id="camera-error-section" class="camera-section" style="display: none;">
          <div class="camera-error-box">
            <p id="camera-error-message"></p>
          </div>
          <div class="camera-actions">
            <button type="button" id="btn-camera-error-fallback" class="btn-secondary-sm camera-btn">파일에서 선택</button>
            <button type="button" id="btn-camera-error-close" class="btn-secondary-sm camera-btn">닫기</button>
          </div>
        </div>
      </div>
    </div>
  `,document.body.appendChild(i);const o=i.querySelector("#camera-live-section"),c=i.querySelector("#camera-review-section"),u=i.querySelector("#camera-error-section"),l=i.querySelector("#camera-error-message"),r=i.querySelector("#camera-video-el"),f=i.querySelector("#camera-preview-img");function d(g){l&&(l.textContent=g),o.style.display="none",c.style.display="none",u.style.display="flex"}function m(){a||(a=!0,se(e),e=null,n&&(URL.revokeObjectURL(n),n=null),document.removeEventListener("keydown",v),i.parentNode&&i.parentNode.removeChild(i))}function v(g){g.key==="Escape"&&m()}document.addEventListener("keydown",v),i.addEventListener("click",g=>{g.target===i&&m()}),(h=i.querySelector("#btn-camera-close"))==null||h.addEventListener("click",()=>{m()}),(w=i.querySelector("#btn-camera-cancel"))==null||w.addEventListener("click",()=>{m()}),(Q=i.querySelector("#btn-camera-error-close"))==null||Q.addEventListener("click",()=>{m()}),(M=i.querySelector("#btn-camera-error-fallback"))==null||M.addEventListener("click",()=>{var g;m(),(g=t.onSelectFileFallback)==null||g.call(t)}),(b=i.querySelector("#btn-camera-snap"))==null||b.addEventListener("click",()=>{if(!r||r.videoWidth===0||r.videoHeight===0){d("카메라 영상을 아직 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");return}try{const g=document.createElement("canvas");g.width=r.videoWidth,g.height=r.videoHeight;const $=g.getContext("2d");if(!$){d("촬영 이미지를 처리하는 중 오류가 발생했어요. 다시 시도해 주세요.");return}$.drawImage(r,0,0,g.width,g.height),g.toBlob(C=>{if(!C){d("촬영된 사진을 변환하지 못했어요. 다시 시도해 주세요.");return}s=new File([C],"camera-capture.jpg",{type:"image/jpeg",lastModified:Date.now()}),n&&URL.revokeObjectURL(n),n=URL.createObjectURL(C),f&&(f.src=n),o.style.display="none",u.style.display="none",c.style.display="flex"},"image/jpeg",.9)}catch{d("촬영된 사진을 변환하지 못했어요. 다시 시도해 주세요.")}}),(k=i.querySelector("#btn-camera-retake"))==null||k.addEventListener("click",()=>{s=null,n&&(URL.revokeObjectURL(n),n=null),f&&(f.src=""),c.style.display="none",u.style.display="none",o.style.display="flex",r&&e&&r.paused&&r.play().catch(()=>{})}),(E=i.querySelector("#btn-camera-use"))==null||E.addEventListener("click",()=>{if(!s)return;const g=s;m(),t.onCapture(g)});async function y(){if(typeof navigator>"u"||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){d("현재 브라우저에서는 카메라 기능을 지원하지 않아요. 파일에서 사진을 선택해 주세요.");return}try{let g;try{g=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}})}catch($){if($ instanceof DOMException&&($.name==="OverconstrainedError"||$.name==="ConstraintNotSatisfiedError"))g=await navigator.mediaDevices.getUserMedia({video:!0});else throw $}if(a){se(g);return}e=g,r&&(r.srcObject=g,await r.play().catch(()=>{}))}catch(g){if(a)return;d(Se(g))}}return y(),m}let D=null;function $e(t,{introductory:e=!1,bookTitle:s="",onSendToChat:n,onSendImage:a,onGazeReport:i}){let o="image",c=null,u=null,l=null;function r(){var M;t.innerHTML=`
      ${e?`<div class="reading-intro">
        <p class="intro-label">독서 도우미</p>
        <h1>막힌 문장부터,<br>함께 읽어요.</h1>
        <p>책 사진을 찍거나 어려운 문장을 적어주세요.<br>책을 고르지 않아도 바로 시작할 수 있어요.</p>
      </div>`:`<div class="panel-header">
        <div class="panel-title">
          <span>책 내용</span>
        </div>
        <p class="panel-subtitle">궁금한 부분을 한 번에 한 장씩 보여주세요.</p>
      </div>`}

      <div class="panel-body">
        ${s?`<div class="book-context-summary">
          <span>읽고 있는 책</span>
          <strong>${ie(s)}</strong>
        </div>`:""}
        ${!e||o==="direct"?`<div class="book-tabs">
          <button class="book-tab-btn ${o==="image"?"active":""}" data-tab="image">
            ${e?"사진으로 시작":"사진"}
          </button>
          <button class="book-tab-btn ${o==="direct"?"active":""}" data-tab="direct">
            문장 입력하기
          </button>
        </div>`:""}

        ${o==="image"?Le(c,u,e):""}
        ${o==="direct"?Ae():""}
      </div>
    `,t.querySelectorAll("[data-tab]").forEach(b=>{b.addEventListener("click",()=>{var k;o=b.getAttribute("data-tab")==="direct"?"direct":"image",o==="direct"&&(l==null||l(),l=null),r(),o==="direct"&&((k=t.querySelector("#book-text-input"))==null||k.focus())})});const d=t.querySelector("#btn-submit-book-text");d&&d.addEventListener("click",()=>{const b=t.querySelector("#book-text-input"),k=b.value.trim();if(!k){alert("책 내용을 입력해 주세요.");return}b.value="",n(`[책 내용] "${k}"
이 부분이 잘 이해가 안 돼.`)});const m=t.querySelector("#book-photo-input"),v=t.querySelector("#btn-open-camera"),y=t.querySelector("#btn-select-file"),h=t.querySelector("#photo-dropzone"),w=t.querySelector("#btn-remove-photo"),Q=t.querySelector("#btn-submit-book-photo");(M=t.querySelector("#btn-gaze-read"))==null||M.addEventListener("click",async()=>{if(!u)return;const b=u,{openGazeReader:k}=await Ee(async()=>{const{openGazeReader:E}=await import("./GazeReaderModal-BPipQe8V.js");return{openGazeReader:E}},__vite__mapDeps([0,1]));b===u&&(l==null||l(),D==null||D(),D=k({imageUrl:b,onAskAbout:E=>{a(E)},onReport:E=>{i==null||i(E)}}))}),v&&v.addEventListener("click",()=>{l==null||l(),l=we({onCapture:b=>{l=null,f(b)},onSelectFileFallback:()=>{l=null,m==null||m.click()}})}),y&&y.addEventListener("click",()=>{m==null||m.click()}),m&&m.addEventListener("change",b=>{var E;const k=(E=b.target.files)==null?void 0:E[0];f(k)}),h&&(h.addEventListener("keydown",b=>{(b.key==="Enter"||b.key===" ")&&(b.preventDefault(),m==null||m.click())}),h.addEventListener("dragover",b=>{b.preventDefault(),h.style.borderColor="var(--primary)",h.style.background="var(--primary-light)"}),h.addEventListener("dragleave",()=>{h.style.borderColor="var(--border-color)",h.style.background="var(--bg-subtle)"}),h.addEventListener("drop",b=>{var E,g;b.preventDefault(),h.style.borderColor="var(--border-color)",h.style.background="var(--bg-subtle)";const k=(g=(E=b.dataTransfer)==null?void 0:E.files)==null?void 0:g[0];f(k)}),h.addEventListener("click",()=>{m==null||m.click()})),w&&w.addEventListener("click",b=>{b.stopPropagation(),c=null,u&&URL.revokeObjectURL(u),u=null,r()}),Q&&Q.addEventListener("click",async()=>{if(!c){alert("먼저 책 사진을 업로드해 주세요.");return}const b=c,k=t.querySelector("#photo-comment-input"),E=(k==null?void 0:k.value.trim())||"책 페이지 사진을 찍었어. 이해하기 어려운 부분이 있어.",g=await Te(b),$=b.type||"image/jpeg",C={text:`[책 사진 업로드]
${E}`,image:{data:g,mimeType:$},previewUrl:u};c=null,u=null,r(),a(C)})}function f(d){if(!d)return;if(!["image/jpeg","image/jpg","image/png"].includes(d.type)){alert("jpg, jpeg, png 형식의 이미지만 업로드할 수 있습니다.");return}if(d.size>10*1024*1024){alert("사진 용량이 너무 큽니다. 10MB 이하의 이미지를 올려주세요.");return}c=d,u&&URL.revokeObjectURL(u),u=URL.createObjectURL(d),r()}r()}function Le(t,e,s=!1){return`
    <div style="display: flex; flex-direction: column; gap: 14px; flex: 1;">
      <input
        type="file"
        id="book-photo-input"
        accept="image/jpeg, image/jpg, image/png"
        style="display: none;"
      />

      ${e?`
        <div style="position: relative; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-color); background: var(--bg-subtle); text-align: center;">
          <img
            src="${e}"
            alt="책 사진 미리보기"
            style="max-height: 220px; max-width: 100%; object-fit: contain; display: inline-block;"
          />
          <button
            id="btn-remove-photo"
            class="photo-remove"
            title="사진 제거"
          >사진 지우기</button>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary);">
          ${ie((t==null?void 0:t.name)||"")}
        </div>
      `:`
        <div class="photo-upload-actions">
          <button type="button" id="btn-open-camera" class="${s?"btn-send-book":"btn-secondary-sm"} photo-action-btn">
            책 사진 찍기
          </button>
          ${s?'<button type="button" data-tab="direct" class="btn-secondary-sm photo-action-btn">문장 입력하기</button>':""}
        </div>
        <button type="button" id="btn-select-file" class="file-select-link">이미 찍은 사진 선택</button>
        ${s?"":`<div
          id="photo-dropzone"
          class="phase-placeholder photo-dropzone"
          role="button" tabindex="0" aria-label="책 페이지 사진 올리기"
        >
          <div style="font-weight: 500; color: var(--text-primary); margin-top: 4px;">책 페이지를 올려주세요</div>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 2px;">
            JPG, PNG (드래그하거나 위 버튼을 눌러주세요)
          </p>
        </div>`}
      `}

      ${t?`<input
        type="text"
        id="photo-comment-input"
        aria-label="사진에 대해 궁금한 점 (선택)"
        class="book-title-input"
        style="width: 100%;"
        placeholder="궁금한 점이 있다면 적어주세요"
      />

      <button
        id="btn-submit-book-photo"
        class="btn-send-book"
        ${t?"":'disabled style="opacity: 0.5; cursor: not-allowed;"'}
      >
        이 부분 물어보기
      </button>`:""}
      ${e?`
      <button
        type="button"
        id="btn-gaze-read"
        class="gz-entry"
        ${e?"":'disabled aria-disabled="true" style="opacity: 0.55; cursor: not-allowed;"'}
      >
        <span>시선으로 읽기</span>
        <small>${e?"카메라로 읽는 위치를 기록해요":"책 페이지 사진을 올리면 시작할 수 있어요"}</small>
      </button>`:""}
    </div>
  `}function Ae(t){return`
    <textarea
      id="book-text-input"
      class="book-input-textarea"
      aria-label="책 내용 직접 입력" placeholder="어려운 문장이나 표현을 입력하거나 붙여넣어 주세요."
    ></textarea>

    <button id="btn-submit-book-text" class="btn-send-book">
      이 부분 물어보기
    </button>
  `}function Te(t){return new Promise((e,s)=>{const n=new FileReader;n.onload=()=>{const i=(typeof n.result=="string"?n.result:"").split(",")[1];e(i||"")},n.onerror=s,n.readAsDataURL(t)})}function ie(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function ze(t,{state:e,onSendMessage:s,onExplainLevel:n,onCheckUnderstanding:a,isLoading:i}){var l;const o=e.session.recentMessages;t.innerHTML=`
    <div class="chat-container">
      <div class="panel-header">
        <div class="panel-title">
          <span>${U(e.book.title||"함께 읽기")}</span>
        </div>
        <div class="panel-subtitle">책을 읽으며 궁금한 내용을 함께 살펴보세요.</div>
      </div>

      <div class="chat-messages" id="chat-messages-box" role="log" aria-live="polite">
        ${o.length===0?`
          <div style="color: var(--text-muted); font-size: 14px;">
            <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">어떤 부분이 궁금한가요?</div>
            <p>책 사진이나 어려운 문장을 보내주세요.<br/>함께 읽으며 하나씩 알아갈게요.</p>
          </div>
        `:""}

        ${o.map((r,f)=>{var m;const d=qe(r,f,o,i,e);return`
            <div class="chat-bubble ${r.role}">
              <div class="chat-content">
                ${(m=r.image)!=null&&m.data?`
                  <div style="margin-bottom: 8px;">
                    <img
                      src="data:${r.image.mimeType||"image/jpeg"};base64,${r.image.data}"
                      alt="첨부된 책 사진"
                      style="max-width: 220px; max-height: 180px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); display: block;"
                    />
                  </div>
                `:""}
                <div class="markdown-content">${T(r.content)}</div>

                ${r.role==="assistant"&&Array.isArray(r.evidence)&&r.evidence.length>0?`
                  <div class="evidence-box">
                    <div class="evidence-header">
                      <span>책에서 본 근거</span>
                    </div>
                    <div class="evidence-list">
                      ${r.evidence.map(v=>`
                        <div class="evidence-item">&ldquo;${U(v.replace(/^["'“”]+|["'“”]+$/g,"").trim())}&rdquo;</div>
                      `).join("")}
                    </div>
                  </div>
                `:""}

                ${d?`
                  <div class="explanation-btn-group" style="display: flex; gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-color); flex-wrap: wrap;">
                    <button class="btn-explain-level btn-level-simple" data-level="simple" title="핵심만 2~4문장으로 간단히 설명">
                      더 쉽게
                    </button>
                    <button class="btn-explain-level btn-level-detailed" data-level="detailed" title="앞뒤 문맥과 예시를 덧붙여 자세히 설명">
                      더 자세히
                    </button>
                    <button class="btn-explain-level btn-level-quiz" title="내가 제대로 이해했는지 확인 질문 받기">
                      이해 확인
                    </button>
                  </div>
                `:""}
              </div>
            </div>
          `}).join("")}

        ${i?`
          <div class="chat-bubble assistant">
            <div class="chat-content">
              <div class="typing-indicator" id="streaming-response" style="white-space: pre-wrap">
                답변을 쓰는 중…
              </div>
            </div>
          </div>
        `:""}
      </div>

      <!-- AI 추천 질문 및 빠른 응답 칩 영역 (채팅창 맨 아래) -->
      ${(l=e==null?void 0:e.session)!=null&&l.suggestedQuestions&&e.session.suggestedQuestions.length>0?`
        <div class="suggested-questions-area">
          <div class="suggested-header">
            <span>이런 것도 물어볼 수 있어요</span>
          </div>
          <div class="suggested-chips-list">
            ${e.session.suggestedQuestions.map(r=>`
              <button class="suggested-question-btn" data-text="${U(r)}" ${i?"disabled":""}>
                ${U(r)}
              </button>
            `).join("")}
          </div>
        </div>
      `:`
        <div class="quick-chips-area">
          <button class="quick-chip-btn" data-text="그냥 바로 설명해줘." ${i?"disabled":""}>
            바로 설명해줘
          </button>
          <button class="quick-chip-btn" data-text="단어 뜻이 잘 이해가 안 돼." ${i?"disabled":""}>
            단어 뜻이 궁금해
          </button>
          <button class="quick-chip-btn" data-text="인물이 왜 이렇게 행동했는지 모르겠어." ${i?"disabled":""}>
            인물은 왜 그랬을까?
          </button>
        </div>
      `}

      <form id="chat-form" class="chat-input-area">
        <input
          type="text"
          id="chat-input-text"
          aria-label="궁금한 점 입력"
          class="chat-input"
          placeholder="${i?"답변을 준비하고 있어요…":"궁금한 점을 적어주세요"}"
          autocomplete="off"
          ${i?"disabled":""}
        />
        <button type="submit" class="btn-chat-send" ${i?"disabled":""}>
          보내기
        </button>
      </form>
    </div>
  `;const c=t.querySelector("#chat-messages-box");c&&(c.scrollTop=c.scrollHeight),t.querySelector("#chat-form").addEventListener("submit",r=>{r.preventDefault();const f=t.querySelector("#chat-input-text"),d=f.value.trim();!d||i||(f.value="",s(d))}),t.querySelectorAll(".suggested-question-btn").forEach(r=>{r.addEventListener("click",()=>{const f=r.getAttribute("data-text");f&&!i&&s(f)})}),t.querySelectorAll(".quick-chip-btn").forEach(r=>{r.addEventListener("click",()=>{const f=r.getAttribute("data-text");f&&!i&&s(f)})}),t.querySelectorAll(".btn-explain-level[data-level]").forEach(r=>{r.addEventListener("click",()=>{const f=r.getAttribute("data-level");f&&!i&&n(f)})}),t.querySelectorAll(".btn-level-quiz").forEach(r=>{r.addEventListener("click",()=>{!i&&a&&a()})})}function U(t){return t?t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"):""}function qe(t,e,s,n,a=null){var l;if(t.role!=="assistant"||n)return!1;const i=s.reduce((r,f,d)=>f.role==="assistant"?d:r,-1);if(e!==i||t.content.startsWith("안녕!")&&t.content.includes("도우미야")||t.content.includes("어느 부분이 가장 이해하기 어려워")||t.content.includes("후보를 좁혀"))return!1;if(t.content.includes("✅ 잘 이해했어요")||t.content.includes("🟡 거의 이해했어요"))return!0;if(t.content.includes("🔄 조금 더 살펴볼까요?")||t.content.includes("🔄")||(l=a==null?void 0:a.session)!=null&&l.isQuizActive||t.isQuizQuestion||t.content.includes("물어볼게")||t.content.includes("가볍게 한 가지만")||t.content.includes("질문 하나")||t.content.includes("질문할게")||t.content.includes("생각해볼까?")||t.content.includes("처지 때문이었을까?")||t.content.includes("부담 때문이었을까?")||t.content.includes("이유는 무엇일까?"))return!1;const u=e>0?s[e-1]:null;return!(u&&u.role==="user"&&(u.content.includes("확인해 볼 수 있게 짧은 질문")||u.content.includes("이해했는지 확인")||u.content.includes("질문 하나만 내줘")||u.content.includes("퀴즈"))||t.isExplanation===!1)}const ae=t=>String(t??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[e]);function Qe(t=[]){return t.map(e=>`<article class="gz-record">
    <div class="gz-record-head"><strong>시선으로 읽은 기록</strong><span>${ae(new Date(e.createdAt).toLocaleString("ko-KR"))}${e.source==="mouse"?" · 마우스 체험":""}</span></div>
    ${/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(e.snapshot)?`<img src="${e.snapshot}" alt="책 사진을 포함한 시선 히트맵" />`:""}
    <p>읽은 시간 ${Number(e.durationSec).toFixed(1)}초 · 페이지를 본 비율 ${Number(e.focusPercent)}%</p>
    <ul>${e.hotspots.map(s=>`<li>${ae(s.position)} · ${Number(s.dwellSec)}초 · 다시 읽음 ${Number(s.revisits)}회</li>`).join("")}</ul>
    <p>책 사진이 포함된 기록입니다. 오래 본 위치는 이해도를 진단하는 결과가 아니에요.</p>
  </article>`).join("")}let I="map";function Me(t,{state:e,onGenerateSummary:s,isSummaryLoading:n,onGenerateReadingNote:a,isReadingNoteLoading:i,onRetryExplain:o,onSaveRecord:c}){let u=I;function l(){var d,m;t.innerHTML=`
      <div class="panel-header">
        <div class="panel-title">
          <span>읽은 내용 정리</span>
        </div>
      </div>

      <div class="panel-body">
        ${e.session.readingNote?'<div class="reading-next"><p>오늘 읽은 내용이 정리됐어요.</p><button class="btn-send-book" id="btn-save-record">기록 저장</button></div>':e.session.comprehensionChecks.some(v=>/잘 이해|거의 이해/u.test(v.result||""))&&u!=="reading-note"?'<div class="reading-next"><p>이해한 내용을 독서노트로 남겨볼까요?</p><button class="btn-send-book" id="btn-next-note">독서노트 만들기</button></div>':""}
        <div class="record-tabs">
          <button class="record-tab-btn ${u==="summary"?"active":""}" data-tab="summary">
            요약
          </button>
          <button class="record-tab-btn ${u==="reading-note"?"active":""}" data-tab="reading-note">
            독서노트
          </button>
          <button class="record-tab-btn ${u==="map"?"active":""}" data-tab="map">
            이해도
          </button>
        </div>

        ${u==="summary"?Ce(e.session.summary,n):""}
        ${u==="reading-note"?Pe(e.session.readingNote,i):""}
        ${u==="map"?Qe(e.session.gazeReports)+Oe(e.session):""}
      </div>
    `,t.querySelectorAll(".record-tab-btn").forEach(v=>{v.addEventListener("click",()=>{I=v.getAttribute("data-tab")||"summary",u=I,l()})}),(d=t.querySelector("#btn-save-record"))==null||d.addEventListener("click",()=>c==null?void 0:c()),(m=t.querySelector("#btn-next-note"))==null||m.addEventListener("click",()=>{I="reading-note",u="reading-note",l(),i||a==null||a()});const r=t.querySelector("#btn-generate-summary");r&&r.addEventListener("click",()=>{!n&&s&&s()});const f=t.querySelector("#btn-update-reading-note");f&&f.addEventListener("click",()=>{!i&&a&&a()}),t.querySelectorAll(".btn-retry-explain").forEach(v=>{v.addEventListener("click",y=>{y.stopPropagation();const h=v.getAttribute("data-topic");h&&o&&o(h)})}),t.querySelectorAll(".map-item-card").forEach(v=>{v.addEventListener("click",()=>{const y=v.classList.contains("selected");t.querySelectorAll(".map-item-card").forEach(h=>h.classList.remove("selected")),y||v.classList.add("selected")})})}l()}function Ce(t,e){return`
    <div style="display: flex; flex-direction: column; gap: 14px; flex: 1;">
      <button
        id="btn-generate-summary"
        class="btn-send-book"
        ${e?'disabled style="opacity: 0.6; cursor: not-allowed;"':""}

      >
        ${e?"요약하는 중…":"요약 만들기"}
      </button>

      ${e?`
        <div class="phase-placeholder" style="margin-top: 10px;">
          <div style="font-weight: 600; color: var(--text-primary); margin-top: 4px;">대화에서 확인된 내용을 정리하고 있어요</div>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 2px;">
            함께 읽고 이야기한 내용을 모으고 있어요.
          </p>
        </div>
      `:t?`
        <div class="summary-result-card markdown-content" style="background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; box-shadow: var(--shadow-sm); line-height: 1.7; font-size: 13.5px; white-space: pre-wrap; color: var(--text-primary);">
${T(t)}
        </div>
        <div style="font-size: 11px; color: var(--text-muted); text-align: right;">
          ‘기록 저장’을 누르면 나중에 다시 읽을 수 있어요.
        </div>
      `:`
        <div class="phase-placeholder" style="margin-top: 10px;">
          <div style="font-weight: 600; color: var(--text-primary);">함께 읽은 내용을 한눈에</div>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px;">
            책에 대해 대화를 나눈 뒤 요약을 만들어 보세요.
          </p>
        </div>
      `}
    </div>
  `}function Pe(t,e){return`
    <div style="display: flex; flex-direction: column; gap: 14px; flex: 1;">
      <button
        id="btn-update-reading-note"
        class="btn-send-book"
        ${e?'disabled style="opacity: 0.6; cursor: not-allowed;"':""}
        style="background: var(--primary);"
      >
        ${e?"독서노트 작성 중…":t?"독서노트 다시 정리":"독서노트 만들기"}
      </button>

      ${e?`
        <div class="phase-placeholder" style="margin-top: 10px;">
          <div style="font-weight: 600; color: var(--text-primary); margin-top: 4px;">오늘의 독서노트를 정리하고 있어요</div>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 2px;">
            나눈 이야기와 이해한 내용을 기록하고 있어요.
          </p>
        </div>
      `:t?`
        ${je(t)}
        <div style="font-size: 11px; color: var(--text-muted); text-align: right;">
          ‘기록 저장’을 누르면 나중에 다시 읽을 수 있어요.
        </div>
      `:`
        <div class="phase-placeholder" style="margin-top: 10px;">
          <div style="font-weight: 600; color: var(--text-primary);">오늘의 생각을 남겨보세요</div>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px;">
            함께 읽고 이해한 내용을 짧게 정리해요.
          </p>
        </div>
      `}
    </div>
  `}function je(t){if(!t)return"";const e=t.split(`
`);let s="오늘의 독서노트";const n=[];let a=null;for(let i of e){const o=i.trim();o.startsWith("📖")?s=o:o.startsWith("### ")?(a&&n.push(a),a={title:o.replace(/^###\s*/,""),content:[]}):a&&o&&a.content.push(o)}return a&&n.push(a),n.length===0?`
      <div class="summary-result-card markdown-content" style="background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; box-shadow: var(--shadow-sm); line-height: 1.7; font-size: 13.5px; white-space: pre-wrap; color: var(--text-primary);">
${T(t)}
      </div>
    `:`
    <div class="reading-note-card" style="background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 12px;">
      <div style="font-weight: 600; font-size: 15px; color: var(--text-primary); border-bottom: 2px solid var(--primary); padding-bottom: 8px;">
        ${T(s)}
      </div>
      ${n.map(i=>{const o=i.content.join(`
`),c=o.includes("아직 이야기하지 않았어요")||o.includes("현재 대화에서는 확인되지 않았어요");return`
          <div class="note-section-block" style="background: var(--bg-subtle); border-radius: var(--radius-sm); padding: 10px 12px; border: 1px solid rgba(0,0,0,0.05);">
            <div style="font-weight: 600; font-size: 12.5px; color: var(--primary); margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              <div class="markdown-content">${T(i.title)}</div>
            </div>
            <div class="markdown-content" style="font-size: 13px; color: ${c?"var(--text-muted)":"var(--text-primary)"}; line-height: 1.6; white-space: pre-wrap;">
${T(o||"아직 이야기하지 않았어요")}
            </div>
          </div>
        `}).join("")}
    </div>
  `}function Oe(t){const{difficult:e,almost:s,understood:n}=Re(t);return e.length+s.length+n.length===0?`
      <div class="phase-placeholder" style="margin-top: 20px;">
        <div style="font-weight: 600; color: var(--text-primary); margin-top: 8px; font-size: 14px;">
          아직 확인한 내용이 없어요
        </div>
        <p style="color: var(--text-secondary); font-size: 12px; margin-top: 6px; line-height: 1.6;">
          대화 아래 ‘이해 확인’을 눌러보세요.<br>
          이해한 내용과 더 살펴볼 내용을 정리해 드려요.
        </p>
      </div>
    `:`
    <div class="understanding-map-container">
      <div class="map-header">
        <div class="map-board-title">
          <span>나의 이해도</span>
        </div>
        <div class="map-board-desc">
          더 살펴보고 싶은 내용을 다시 물어보세요.
        </div>
      </div>

      <!-- 1. 아직 어려워요 (RED) -->
      <div class="map-section section-difficult">
        <div class="map-section-header">
          <div class="map-badge-title">
            <span class="status-dot dot-difficult"></span>
            <span class="status-label label-difficult">어려움</span>
          </div>
          <span class="status-count count-difficult">${e.length}</span>
        </div>
        ${e.length===0?`
          <div class="map-empty-sub">아직 기록된 내용이 없어요</div>
        `:`
          <div class="map-item-list">
            ${e.map(i=>W(i,"difficult")).join("")}
          </div>
        `}
      </div>

      <!-- 2. 거의 이해했어요 (AMBER) -->
      <div class="map-section section-almost">
        <div class="map-section-header">
          <div class="map-badge-title">
            <span class="status-dot dot-almost"></span>
            <span class="status-label label-almost">조금 더 보기</span>
          </div>
          <span class="status-count count-almost">${s.length}</span>
        </div>
        ${s.length===0?`
          <div class="map-empty-sub">이 단계에 머무른 내용이 없어요</div>
        `:`
          <div class="map-item-list">
            ${s.map(i=>W(i,"almost")).join("")}
          </div>
        `}
      </div>

      <!-- 3. 이해했어요 (GREEN) -->
      <div class="map-section section-understood">
        <div class="map-section-header">
          <div class="map-badge-title">
            <span class="status-dot dot-understood"></span>
            <span class="status-label label-understood">이해함</span>
          </div>
          <span class="status-count count-understood">${n.length}</span>
        </div>
        ${n.length===0?`
          <div class="map-empty-sub">퀴즈를 풀고 완전히 이해한 항목이 여기에 표시됩니다</div>
        `:`
          <div class="map-item-list">
            ${n.map(i=>W(i,"understood")).join("")}
          </div>
        `}
      </div>

      <div class="map-footer">
        이해한 내용은 독서노트에 함께 담겨요.
      </div>
    </div>
  `}function W(t,e){return`
    <div class="map-item-card card-${e}" data-topic="${K(t)}">
      <div class="map-card-main">
        <span class="item-dot dot-${e}"></span>
        <span class="item-text">${K(t)}</span>
      </div>
      <div class="map-card-actions">
        <button class="btn-retry-explain btn-retry-${e}" data-topic="${K(t)}">
          <span>다시 설명받기</span>
        </button>
      </div>
    </div>
  `}function Re(t){if(!t)return{difficult:[],almost:[],understood:[]};const e=Array.isArray(t.comprehensionChecks)?t.comprehensionChecks:[],s=Array.isArray(t.difficultPoints)?t.difficultPoints:[],n=Array.isArray(t.understoodPoints)?t.understoodPoints:[];function a(r){return!r||typeof r!="string"?"":r.replace(/['"“”‘’`]/g,"").replace(/[.,?!~:;]/g,"").replace(/\s+/g," ").trim().toLowerCase()}const i=new Map;function o(r){if(i.has(r))return r;for(const[f]of i.entries())if(f.length>=3&&r.length>=3&&(f.includes(r)||r.includes(f)))return f;return null}s.forEach((r,f)=>{if(!r||typeof r!="string")return;const d=a(r);if(!d)return;o(d)||i.set(d,{id:d,topic:r.trim(),status:"difficult",updatedAt:f})}),n.forEach((r,f)=>{if(!r||typeof r!="string")return;const d=a(r);if(!d)return;o(d)||i.set(d,{id:d,topic:r.trim(),status:"understood",updatedAt:100+f})}),e.forEach((r,f)=>{const d=r.topic||r.difficultPart;if(!d||typeof d!="string")return;const m=a(d);if(!m)return;let v="difficult";const y=r.result||"";y.includes("잘 이해")||y.includes("✅")?v="understood":y.includes("거의 이해")||y.includes("🟡")?v="almost":(y.includes("조금 더")||y.includes("🔄"))&&(v="difficult");const h=o(m);if(h){const w=i.get(h);w.status=v,w.updatedAt=1e3+f,d.trim().length>w.topic.length&&(w.topic=d.trim())}else i.set(m,{id:m,topic:d.trim(),status:v,updatedAt:1e3+f})});const c=[],u=[],l=[];return i.forEach(r=>{r.status==="difficult"?c.push(r.topic):r.status==="almost"?u.push(r.topic):r.status==="understood"&&l.push(r.topic)}),{difficult:c,almost:u,understood:l}}function K(t){return t?t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"):""}let S=!1,O=!1,R=!1,A=!1,P=!1;const Ne=document.getElementById("header-container"),Be=document.getElementById("panel-book"),V=document.getElementById("panel-chat"),De=document.getElementById("panel-record"),G=document.getElementById("onboarding-modal-container"),j=document.getElementById("alert-banner");function L(t){if(!j)return;j.innerHTML=`
    <span>${t}</span>
    <button id="btn-close-alert" style="background: none; border: none; cursor: pointer; font-size: 16px; color: inherit;">✕</button>
  `,j.classList.remove("hidden");const e=j.querySelector("#btn-close-alert");e&&e.addEventListener("click",()=>{j.classList.add("hidden")})}function x(){const t=p.getState(),e=me("reading",t);document.getElementById("app").classList.toggle("reading-start",!e);const s=document.getElementById("reading-progress");s.hidden=!e;const n=t.session.readingNote?3:t.session.isQuizActive?2:t.session.comprehensionChecks.some(a=>/잘 이해|거의 이해/u.test(a.result||""))?3:1;if(s.innerHTML=`<ol aria-label="독서 순서">${["함께 읽기","이해 확인","독서노트"].map((a,i)=>`<li ${n===i+1?'aria-current="step"':""}>${i+1}. ${a}</li>`).join("")}</ol>`,ce(Ne,t,{isBusy:S||O||R,onOpenGradeModal:()=>{P=!1,A=!0,x()},onResetSession:()=>{try{p.resetSession(),x()}catch{L("저장 공간이 부족하거나 저장기록에 접근할 수 없어 새 세션을 시작하지 않았어요. 현재 대화는 그대로 유지됩니다.")}},onTitleChange:a=>{p.setBookTitle(a)}}),$e(Be,{introductory:!e,bookTitle:t.book.title,onGazeReport:a=>p.addGazeReport(a),onSendToChat:a=>{Z(a),F("panel-chat")},onSendImage:({text:a,image:i})=>{Ue({text:a,image:i}),F("panel-chat")}}),ze(V,{state:t,isLoading:S,onSendMessage:a=>{Z(a)},onExplainLevel:a=>{Ie(a)},onCheckUnderstanding:()=>{Fe()}}),Me(De,{state:t,isSummaryLoading:O,onGenerateSummary:()=>{He()},isReadingNoteLoading:R,onGenerateReadingNote:()=>{Je()},onRetryExplain:a=>{Z(`이 부분 다시 설명해줘: ${a}`),F("panel-chat")},onSaveRecord:()=>de()}),P){const a=i=>{P=!1,A=!1,p.setReadingLevel(i)};ye(G,{currentLevel:t.student.readingLevel||"중급",onSelect:a,onSkip:()=>a(t.student.readingLevel||"중급")})}else A?he(G,{currentGrade:t.student.grade,onSelectGrade:a=>{A=!1,P=!0,p.setGrade(a),x()},onOpenReadingLevel:()=>{A=!1,P=!0,x()},onClose:()=>{A=!1,x()}}):G.innerHTML=""}async function Z(t){if(!S){p.addMessage("user",t),t.startsWith("[책 내용]")&&p.setSourceText(t.slice(0,6e3)),S=!0,x();try{const e=p.getState(),s=ue(),n=await z("/api/chat",{method:"POST",headers:{"Content-Type":"application/json",Accept:"text/event-stream"},body:JSON.stringify(q(e))}),a=await be(n,s,i=>{s.throwIfAborted();const o=V.querySelector("#streaming-response");o&&(o.textContent=pe(i),o.classList.remove("typing-indicator"));const c=V.querySelector("#chat-messages-box");c&&(c.scrollTop=c.scrollHeight)});if(!n.ok)throw new Error(a.details||a.error||"답변 요청에 실패했습니다.");if(a.message){const i=a.message,o=i.includes("✅ 잘 이해했어요")||i.includes("🟡 거의 이해했어요"),c=i.includes("🔄 조금 더 살펴볼까요?"),u=!!a.isQuizQuestion||(i.includes("물어볼게")||i.includes("질문 하나")||i.includes("가볍게 한 가지"))&&!o&&!c,l=Array.isArray(a.evidence)?a.evidence:[];o?(p.setQuizActive(!1),p.addMessage("assistant",i,{isExplanation:!0,isQuizQuestion:!1,evidence:l})):c||u?(p.setQuizActive(!0),p.addMessage("assistant",i,{isExplanation:!1,isQuizQuestion:!0,evidence:[]})):(p.setQuizActive(!1),p.addMessage("assistant",i,{isExplanation:!0,isQuizQuestion:!1,evidence:l})),Array.isArray(a.suggestedQuestions)&&a.suggestedQuestions.length>0?p.setSuggestedQuestions(a.suggestedQuestions):u&&p.setSuggestedQuestions([])}a.tao&&p.addTaoLog(a.tao),a.comprehensionCheck&&p.addComprehensionCheck(a.comprehensionCheck)}catch(e){if(e instanceof DOMException&&e.name==="AbortError")return;console.error("채팅 요청 에러:",e),L("화면 미리보기입니다. 로그인·기록 저장은 제외되어 있으며, 대화와 추천은 AI 서버 연결 후 사용할 수 있어요."),p.addMessage("assistant","화면 미리보기입니다. 로그인·기록 저장은 제외되어 있으며, 대화와 추천은 AI 서버 연결 후 사용할 수 있어요.")}finally{S=!1,x()}}}async function Ue({text:t,image:e}){if(!S){p.addMessage("user",t,{image:e}),S=!0,x();try{const s=p.getState(),n=await z("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...q(s),image:e})}),a=await n.json();if(!n.ok)throw new Error(a.details||a.error||"사진 분석 요청에 실패했습니다.");if(a.extractedText&&p.setSourceText(a.extractedText),a.message){p.setQuizActive(!1);const i=a.message.includes("어느 부분이")||a.message.includes("이해하기 어려워"),o=!i&&Array.isArray(a.evidence)?a.evidence:[];p.addMessage("assistant",a.message,{isExplanation:!i,isQuizQuestion:!1,evidence:o}),Array.isArray(a.suggestedQuestions)&&a.suggestedQuestions.length>0&&p.setSuggestedQuestions(a.suggestedQuestions)}a.tao&&p.addTaoLog(a.tao)}catch(s){if(s instanceof DOMException&&s.name==="AbortError")return;console.error("사진 분석 요청 에러:",s),L("책 사진을 분석하는 중 문제가 발생했습니다. 사진이 너무 크거나 흐리지 않은지 확인해 주세요."),p.addMessage("assistant","화면 미리보기입니다. 로그인·기록 저장은 제외되어 있으며, 대화와 추천은 AI 서버 연결 후 사용할 수 있어요.")}finally{S=!1,x()}}}async function Ie(t){if(S)return;const e=t==="simple"?"방금 설명해 준 내용을 2~4문장으로 핵심만 더 간단하게 설명해줘.":"방금 설명해 준 내용의 앞뒤 문맥과 인물 행동, 쉬운 예시를 덧붙여 조금 더 자세히 설명해줘.";p.addMessage("user",e),S=!0,x();try{const s=p.getState(),n=await z("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(q(s,t))}),a=await n.json();if(!n.ok)throw new Error(a.details||a.error||"설명 변경 요청에 실패했습니다.");if(a.message){p.setQuizActive(!1);const i=Array.isArray(a.evidence)?a.evidence:[];p.addMessage("assistant",a.message,{isExplanation:!0,isQuizQuestion:!1,evidence:i}),Array.isArray(a.suggestedQuestions)&&a.suggestedQuestions.length>0&&p.setSuggestedQuestions(a.suggestedQuestions)}a.tao&&p.addTaoLog(a.tao),a.comprehensionCheck&&p.addComprehensionCheck(a.comprehensionCheck)}catch(s){if(s instanceof DOMException&&s.name==="AbortError")return;console.error("설명 난이도 요청 에러:",s),L(`설명 변환 실패: ${ne(s)}`)}finally{S=!1,x()}}async function Fe(){if(S)return;p.addMessage("user","방금 설명해 준 내용을 내가 잘 이해했는지 확인해 볼 수 있게 짧은 질문 하나만 내줘."),p.setQuizActive(!0),p.setSuggestedQuestions([]),S=!0,x();try{const e=p.getState(),s=await z("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(q(e,"quiz_request"))}),n=await s.json();if(!s.ok)throw new Error(n.details||n.error||"이해 확인 질문 요청에 실패했습니다.");n.message&&(p.setQuizActive(!0),p.addMessage("assistant",n.message,{isExplanation:!1,isQuizQuestion:!0})),n.tao&&p.addTaoLog(n.tao),n.comprehensionCheck&&p.addComprehensionCheck(n.comprehensionCheck)}catch(e){if(e instanceof DOMException&&e.name==="AbortError")return;console.error("이해 확인 질문 에러:",e),L("이해 확인 질문을 생성하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.")}finally{S=!1,x()}}async function He(){if(O)return;const t=p.getState();if(t.session.recentMessages.length===0){alert("먼저 책 내용에 대해 대화를 나눈 뒤 요약을 생성해 주세요.");return}O=!0,x();try{const e=await z("/api/summary",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(q(t))}),s=await e.json();if(!e.ok)throw new Error(s.details||s.error||"요약 생성 요청에 실패했습니다.");s.summary&&p.setSummary(s.summary),s.tao&&p.addTaoLog(s.tao)}catch(e){if(e instanceof DOMException&&e.name==="AbortError")return;console.error("요약 생성 에러:",e),L("독서 요약을 생성하는 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")}finally{O=!1,x()}}async function Je(){if(R)return;const t=p.getState();if(!t.session.recentMessages||t.session.recentMessages.length===0){L("먼저 책 내용에 대해 질문하거나 대화를 나눈 뒤 독서노트를 업데이트해 주세요.");return}R=!0,x();try{const e=await z("/api/reading-note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(q(t))}),s=await e.json();if(!e.ok)throw new Error(s.details||s.error||"독서노트 생성 요청에 실패했습니다.");s.readingNote&&p.setReadingNote(s.readingNote),s.tao&&p.addTaoLog(s.tao)}catch(e){if(e instanceof DOMException&&e.name==="AbortError")return;console.error("독서노트 생성 에러:",e),L(`독서노트 생성 중 오류: ${ne(e)}`)}finally{R=!1,x()}}function F(t){const e=document.querySelectorAll(".mobile-tab-btn"),s=document.querySelectorAll(".panel-section");e.forEach(n=>{n.getAttribute("data-target")===t?n.classList.add("active"):n.classList.remove("active")}),s.forEach(n=>{n.id===t?n.classList.add("active"):n.classList.remove("active")})}function _e(){const t=document.getElementById("mobile-nav");t&&t.querySelectorAll(".mobile-tab-btn").forEach(e=>{e.addEventListener("click",()=>{const s=e.getAttribute("data-target");F(s)})})}window.addEventListener("DOMContentLoaded",()=>{const e=new URLSearchParams(window.location.search).get("title");e&&p.setBookTitle(decodeURIComponent(e)),_e(),x()});p.subscribe(()=>{x()});function ne(t){return t instanceof Error?t.message:String(t)}export{Se as g};
