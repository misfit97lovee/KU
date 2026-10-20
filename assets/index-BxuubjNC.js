import{s as J,b as Y,a as R,c as x,d as z,g as C,e as Q,f as V}from"./sessionHistory-BdnGGKuK.js";const d=t=>document.getElementById(t),o={goal:"중학생 관심사 탐색 및 도서 추천 · 독서 노트 완성",userGrade:"중학교 1학년",userInterests:[],recommendedBooks:[],currentDocument:null,chatHistory:[],turnCount:0},H={askUser:function(t){return{status:"SUCCESS",action:"askUser",question:t.question,hint:t.hint||"사용자와 깊이 있는 대화를 이어갑니다."}},makeStudyMarkdown:function(t){const e=o.recommendedBooks.find(c=>c.id&&c.id===t.bookId)||o.recommendedBooks.at(-1);if(!e)return{status:"FAIL",message:"먼저 책을 선택해 주세요."};const n={...e,synopsis:e.description||e.synopsis||"확인된 책 소개가 없습니다.",coreConcepts:e.coreConcepts||[],questions:e.questions||[],callNo:e.callNo||"확인되지 않음",targetGrade:e.targetGrade||"확인되지 않음"},r=new Date().toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric"}),i=`
# 📖 국립중앙도서관 청소년 심화 독서 탐구 노트
**문서등록번호**: NLK-STUDY-${new Date().getFullYear()}-${n.id}  
**작성일자**: ${r}  
**대상자**: ${o.userGrade} 학생  

---

## 1. 도서 기본 서지 정보
- **도서명**: ${n.title}
- **저자 / 출판사**: ${n.author} / ${n.publisher}
- **국립중앙도서관 청구기호**: \`${n.callNo}\`
- **권장 학년**: ${n.targetGrade}
- **핵심 분류**: ${n.category}

---

## 2. 수석 사서의 핵심 줄거리 및 개념 요약
${n.synopsis}

### 💡 핵심 키워드 & 개념
${n.coreConcepts.map(c=>`- **${c}**`).join(`
`)}

---

## 3. 심화 사유를 위한 수석 사서의 탐구 질문 3선
${n.questions.map((c,m)=>`### Q${m+1}. ${c}
*(나의 생각)*: `).join(`

`)}

---

## 4. 학생 자율 독서 성찰 기록
> **"책을 읽기 전의 나와 책을 읽고 난 후의 나는 결코 같지 않다."**
- **가장 인상 깊었던 구절이나 장면**: ____________________
- **이 책을 통해 새롭게 깨달은 호기심**: ____________________
- **다음으로 연계하여 읽고 싶은 주제**: ${o.userInterests.join(", ")||"과학, 문학 등"}

---
*국립중앙도서관 청소년열람실 수석사서실 인증*
    `.trim();return o.currentDocument={book:n,markdown:i,createdAt:r},E(),w(),{status:"SUCCESS",bookTitle:n.title,documentCreated:!0,previewSnippet:i.substring(0,150)+"..."}},exportPDF:function(){return o.currentDocument?(K(),{status:"SUCCESS",action:"exportPDF",message:"독서 노트 인쇄 및 PDF 미리보기 창을 호출했습니다."}):{status:"FAIL",message:"작성된 독서 노트가 없습니다."}}},W={forbiddenKeywords:["성인물","야동","포르노","잔혹","살인청부","칼부림","폭력","자해","자살","마약","성관계","비속어","시발","존나","혐오"],jailbreakKeywords:["이전 지침 무시","지침 무시","탈옥","역할극 하자","시스템 프롬프트","가드레일 해제","dan 모드","jailbreak"],check:function(t){const e=t.toLowerCase();for(const n of this.jailbreakKeywords)if(e.includes(n))return{isSafe:!1,reason:"우회/탈옥 시도 감지",type:"JAILBREAK",fallbackMessage:"학생, 도서관에서는 기존의 규칙과 예절을 지키며 대화해야 해요. 이전 지침을 변경할 수는 없답니다. 대신 오늘 우리 함께 지혜를 넓힐 수 있는 멋진 책을 찾아보지 않을래요?"};for(const n of this.forbiddenKeywords)if(e.includes(n))return{isSafe:!1,reason:`부적합 키워드 [${n}] 감지`,type:"HARMFUL",fallbackMessage:"해당 내용은 중학생 학생의 학습과 정서에 적절하지 않아요. 우리 도서관은 건강하고 깊이 있는 지적 성장을 응원한답니다. 대신 흥미진진한 과학 미스터리나 감동적인 성장 소설을 함께 찾아볼까요?"};return{isSafe:!0}}},X=window.location.origin.includes(":3002")?"":window.location.origin.includes(":5173")?"http://localhost:3002":"";async function Z(t,e){const n=`${X}/api/recommend-books`,r={userMessage:t,userGrade:o.userGrade,userInterests:o.userInterests,recommendedBooks:o.recommendedBooks,chatHistory:o.chatHistory},i=await V(n,{body:JSON.stringify(r)});if(!i.ok)throw new Error(`Server API HTTP Error: ${i.status}`);return await i.json()}let p=!1,k=null;function I(){const t=document.querySelector("[data-reset-recommendation]"),e=document.getElementById("sendBtn");t&&(t.disabled=p),e&&(e.disabled=!1,e.textContent=p?"중지":o.chatHistory.length?"보내기":"책 찾아보기",e.classList.toggle("stop-btn",p),e.setAttribute("aria-label",p?"답변 생성 중지":"메시지 보내기"))}function D(t){return k===t&&!t.controller.signal.aborted&&t.revision===C()}function ee(t=!0){const e=k;if(e){if(k=null,p=!1,e.controller.abort(),t&&e.revision===C()){const n="답변 생성을 중지했어요.";o.chatHistory.push({role:"librarian",content:n}),h(n),E()}I()}}async function te(t){if(p)return;const e={controller:new AbortController,revision:C()};k=e,p=!0,I();try{await ne(t,e)}finally{k===e&&(k=null,p=!1,e.revision===C()&&E(),I())}}async function ne(t,e){var m,T,f;o.turnCount++;const n=o.turnCount;o.chatHistory.push({role:"user",content:t});const r=W.check(t);if(!r.isSafe){$({turn:n,thought:`[가드레일 감지] 사용자 입력에서 안전 규칙 위반 또는 탈옥 시도 확인 (${r.reason}).
규칙에 따라 기존 사서 페르소나 및 안전 가이드라인을 엄격히 유지하며 '좋은 반려(Fallback)' 원칙을 적용합니다.`,actionName:"guardrailFallback",actionParams:{reason:r.reason,type:r.type},observation:"유해 요청 차단 완료. 사용자에게 정중한 거절 사유 안내 및 건전한 독서 주제로의 전환 유도.",isSafe:!1}),h(r.fallbackMessage),o.chatHistory.push({role:"librarian",content:r.fallbackMessage});return}oe(t);const i=/독서\s*노트|정리해|요약본|pdf|프린트|인쇄|마크다운|노트\s*작성/i.test(t),c=o.recommendedBooks.at(-1);if(i){c?(H.makeStudyMarkdown({bookId:c.id}),h("확인된 책 정보로 독서노트를 정리했어.",null,!0)):h("먼저 읽고 싶은 책을 찾아보자. 책을 고른 뒤 독서노트를 만들 수 있어.");return}try{const l=await Z(t,e.controller.signal);if(!D(e))return;if(!l.success||!Array.isArray(l.books))throw new Error("Invalid recommendation response");if((m=l.clarification)!=null&&m.question){const u=l.clarification.question;o.chatHistory.push({role:"librarian",content:u,isClarification:!0,originalRequest:t}),$({turn:n,thought:"추천 결과가 크게 달라지는 핵심 조건 확인",actionName:"askClarification",actionParams:{searchMode:(T=l.request)==null?void 0:T.searchMode},observation:"추가 질문 1개 표시",isSafe:!0}),h(u,null,!1,null,l.clarification);return}const v=l.books.filter(u=>u.sourceType&&["yes24","library","web"].includes(u.sourceType)),S=v.length?l.response:`조건에 딱 맞는 책을 찾지 못했어요.
비슷한 분야까지 범위를 조금 넓혀볼까요?`;for(const u of v)o.recommendedBooks.some(y=>y.isbn13&&u.isbn13&&y.isbn13===u.isbn13||y.title===u.title&&y.author===u.author)||o.recommendedBooks.push(u);w(),o.chatHistory.push({role:"librarian",content:S}),$({turn:n,thought:"요청과 실제 검색 근거 확인",actionName:v.some(u=>u.sourceType==="yes24")?"searchYes24Books":(f=l.search)!=null&&f.fallbackUsed?"searchWebBooks":"searchLibraryBooks",actionParams:{count:v.length},observation:v.length?"확인된 도서 표시":"조건에 맞는 도서 미확인",isSafe:!0}),h(S,v,!1,l.searchSuggestionsHtml,null,l.moreBooks||[])}catch{if(!D(e))return;const l="지금은 책 정보를 확인할 수 없어. 잠시 후 다시 찾아볼까?";o.chatHistory.push({role:"librarian",content:l}),h(l)}}function j(){var e;try{const n=JSON.parse(R("reading-agent-profile")||"{}");if(n.grade){n.grade==="중1"?o.userGrade="중학교 1학년":n.grade==="중2"?o.userGrade="중학교 2학년":n.grade==="중3"?o.userGrade="중학교 3학년":o.userGrade=n.grade;const r=document.getElementById("gradeSelect");r&&(r.value=o.userGrade)}}catch(n){console.warn("프로필 로드 실패:",n)}d("hudGrade").innerText=o.userGrade,h("좋아하는 주제나 이야기 하나만 들려줘. 너에게 어울리는 책을 함께 찾아볼게."),(e=document.querySelector("#chatMessages .msg-group:last-child"))==null||e.classList.add("initial-greeting"),$({turn:0,thought:`국립중앙도서관 독서 큐레이터 세션 초기화 완료.
사용자 기본 프로필(${o.userGrade}) 확인 및 친절하고 지적인 수석 사서 페르소나 가동. 가드레일 감시 모듈 ON. Express 백엔드 연동 완료.`,actionName:"askUser",actionParams:{question:"어떤 호기심을 찾아 도서관에 오셨나요?",grade:o.userGrade},observation:"사용자의 첫 번째 발화 대기 중. 관심사 키워드 수집 준비 완료.",isSafe:!0})}function oe(t){["우주","천문학","블랙홀","과학","물리","화학","소설","문학","추리","미스터리","모험","판타지","인공지능","ai","로봇","코딩","미래","역사","조선","한국사","철학","사회"].forEach(n=>{t.toLowerCase().includes(n)&&!o.userInterests.includes(n)&&o.userInterests.push(n)}),w()}function w(){d("hudGrade").innerText=o.userGrade;const t=d("hudInterests");o.userInterests.length===0?t.innerHTML='<span style="color: var(--text-muted); font-size: 0.78rem;">대화를 통해 탐색 중...</span>':t.innerHTML=o.userInterests.map(r=>`<span class="tag-badge">#${r}</span>`).join(""),d("hudBooksCount").innerHTML=`
    <span style="color: #fef08a; font-weight: bold;">${o.recommendedBooks.length}권 추천됨</span>
  `;const e=d("hudDocStatus"),n=d("headerNoteBtn");o.currentDocument?(e.innerHTML=`
      <span class="doc-preview-badge" onclick="openNoteModal()">
         작성 완료 [열람하기]
      </span>
    `,n.style.display="inline-flex"):(e.innerHTML='<span style="color: var(--text-muted); font-size: 0.78rem;">미작성 (대기)</span>',n.style.display="none")}function $(t){const e=d("taoTimeline"),n=document.createElement("div");n.className="tao-turn-card";const r=t.turn===0?"Initial Session Start":`Turn #${t.turn} 추론 사이클`,i=t.isSafe?'<span class="guardrail-tag"> 가드레일 통과</span>':'<span class="guardrail-tag warn"> 가드레일 경고</span>';n.innerHTML=`
    <div class="tao-turn-header">
      <span> ${r}</span>
      <div>${i}</div>
    </div>
    <div class="tao-turn-body">
      <!-- T: Thought -->
      <div class="tao-step-block tao-thought-block">
        <div class="tao-step-label">
           T (Thought / 추론)
        </div>
        <div>${a(t.thought).replace(/\n/g,"<br>")}</div>
      </div>

      <!-- A: Action -->
      <div class="tao-step-block tao-action-block">
        <div class="tao-step-label">
           A (Action / 도구 호출)
        </div>
        <div class="tao-code-pill">${a(t.actionName)}(${JSON.stringify(t.actionParams,null,2)})</div>
      </div>

      <!-- O: Observation -->
      <div class="tao-step-block tao-obs-block">
        <div class="tao-step-label">
           O (Observation / 관찰)
        </div>
        <div>${a(t.observation).replace(/\n/g,"<br>")}</div>
      </div>
    </div>
  `,e.appendChild(n),e.scrollTop=e.scrollHeight}function P(t){if(!t)return"";let e=a(Q(t));return e=e.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>"),e=e.replace(/(^|[^\*])\*([^\*]+)\*([^\*]|$)/g,"$1<em>$2</em>$3"),e=e.replace(/`([^`]+)`/g,'<code style="background: var(--bg-subtle); padding: 2px 5px; border-radius: 4px; color: var(--text-primary); font-size: 0.85em;">$1</code>'),e=e.replace(/\n/g,"<br>"),e}function O(t){const e=d("chatMessages"),n=document.querySelector(".recommendation-chat");n==null||n.classList.add("has-messages");const r=document.getElementById("chatInput");r&&(r.placeholder="메시지를 입력하세요",r.setAttribute("aria-label","메시지 입력"));const i=document.getElementById("sendBtn");i&&(i.textContent="보내기");const c=new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}),m=document.createElement("div");m.className="msg-group user",m.innerHTML=`
    <div style="display: flex; flex-direction: column;">
      <div class="msg-bubble">${P(t)}</div>
      <div class="msg-time">${c}</div>
    </div>
  `,e.appendChild(m),e.scrollTop=e.scrollHeight}function G(t){return t?t.replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/"/g,'\\"').replace(/\n/g," "):""}function F(t,e){const n=e&&e!=="저자 미상"?`${t} (${e})`:t;try{const i="reading-agent-current-session",c=JSON.parse(R(i)||"{}");c.bookTitle=n,x(i,JSON.stringify(c))}catch(i){console.error("세션 저장 실패:",i)}const r="/KU/?title="+encodeURIComponent(n);window.location.href=r}function h(t,e=null,n=!1,r=null,i=null,c=[]){var M;const m=d("chatMessages"),T=new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}),f=document.createElement("div");f.className="msg-group librarian";let l="";e&&e.length>0&&(l=`
      <div class="book-cards-container">
        ${e.slice(0,3).map(s=>{const g=s.cover?`<div class="book-cover-wrap">
                 <img src="${a(s.cover)}" alt="${a(s.title)} 표지" class="book-cover-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                 <div class="book-cover-fallback" style="display: none;"><span>표지 준비 중</span></div>
               </div>`:`<div class="book-cover-wrap">
                 <div class="book-cover-fallback"><span>표지 준비 중</span></div>
               </div>`,b=s.author||s.authors||"저자 미상",_=s.publisher||"",L=q(s.sourceUrl),A=s.category||s.classNm||"",N=s.reason||s.synopsis||"";return`
            <div class="book-card">
              ${g}
              <div class="book-card-content">
                <div class="book-card-header">
                  <div class="book-title">
                     ${a(s.title)}
                  </div>
                  ${A?`<span class="book-badge">${a(A)}</span>`:""}
                </div>
                <div class="book-meta">
                  <span> ${a(b)}</span>
                  ${_?`<span>${a(_)}</span>`:""}
                  ${s.sourceType==="yes24"?`<span class="book-source">YES24${L?` · <a href="${a(L)}" target="_blank" rel="noopener noreferrer">YES24에서 보기</a>`:""}</span>`:s.sourceType==="library"?'<span class="book-source">도서관 소장 도서</span>':s.sourceType==="web"?`<span class="book-source">웹에서 찾은 도서${L?` · <a href="${a(L)}" target="_blank" rel="noopener noreferrer">출처 확인</a>`:""}</span>`:""}
                </div>
                ${N?`
                  <div class="book-reason">
                    
                    <span class="reason-text">${a(N)}</span>
                  </div>
                `:""}
                <div class="book-actions">
                  ${c.length?'<button type="button" class="more-books-toggle" data-more-books-toggle aria-expanded="false">책 추천 더 받기</button>':""}
                  <button class="book-btn primary" onclick="readThisBook('${a(G(s.title))}', '${a(G(b))}')">
                     이 책 읽기
                  </button>
                </div>
              </div>
            </div>
          `}).join("")}
      </div>
    `);const v=c.length?`
    <div class="more-books-section" data-more-books-list hidden>
      <p class="more-books-heading">추천에 선택되지 않은 검색 후보 ${c.length}권</p>
      <div class="more-books-list">
        ${c.map(s=>{const g=s.author||s.authors||"저자 미상",b=q(s.sourceUrl);return`<article class="more-book-item">
            <div class="more-book-info">
              <strong>${a(s.title)}</strong>
              <span>${a(g)}${s.publisher?` · ${a(s.publisher)}`:""}</span>
            </div>
            <div class="more-book-actions">
              ${b?`<a href="${a(b)}" target="_blank" rel="noopener noreferrer">상세 보기</a>`:""}
              <button type="button" class="more-book-read" data-book-title="${a(s.title)}" data-book-author="${a(g)}">읽기</button>
            </div>
          </article>`}).join("")}
      </div>
    </div>
  `:"";let S="";n&&o.currentDocument&&(S=`
      <div style="margin-top: 10px;">
        <button class="header-btn primary" onclick="openNoteModal()" style="font-size: 0.82rem; padding: 6px 14px;">
           독서노트 보기
        </button>
      </div>
    `);const u=(M=i==null?void 0:i.options)!=null&&M.length?`
    <div class="quick-chips-list" style="margin-top: 10px;">
      ${i.options.map(s=>`<button type="button" class="chip-btn clarification-option" data-clarification-answer="${a(s)}">${a(s)}</button>`).join("")}
      <button type="button" class="chip-btn clarification-option" data-clarification-answer="바로 추천해줘">바로 추천</button>
    </div>
  `:"";if(f.innerHTML=`

    <div style="display: flex; flex-direction: column; max-width: 100%;">
      <div class="msg-bubble">${P(t)}</div>
      ${u}
      ${l}
      ${v}
      ${S}
      <div class="msg-time">
        <span>${T}</span>
      </div>
    </div>
  `,r&&(e!=null&&e.some(s=>s.sourceType==="web"))){const s=document.createElement("iframe");s.className="search-suggestions",s.title="Google 검색 제안",s.setAttribute("sandbox","allow-popups allow-popups-to-escape-sandbox"),s.srcdoc=r,f.appendChild(s)}m.appendChild(f);const y=f.querySelectorAll("[data-more-books-toggle]");y.forEach(s=>s.addEventListener("click",()=>{const g=f.querySelector("[data-more-books-list]");if(!g)return;const b=g.hidden!==!1;g.hidden=!b,y.forEach(_=>_.setAttribute("aria-expanded",String(b))),b&&g.scrollIntoView({behavior:"smooth",block:"start"})})),f.querySelectorAll(".more-book-read").forEach(s=>{s.addEventListener("click",()=>F(s.dataset.bookTitle||"",s.dataset.bookAuthor||""))}),f.querySelectorAll(".clarification-option").forEach(s=>{s.addEventListener("click",()=>{const g=document.getElementById("chatInput");!g||p||(g.value=s.getAttribute("data-clarification-answer")||"",B())})}),m.scrollTop=m.scrollHeight}function q(t){if(!t)return null;try{const e=new URL(t);return["https:","http:"].includes(e.protocol)?e.href:null}catch{return null}}function B(){if(p){ee();return}const t=document.getElementById("chatInput"),e=t.value.trim();e&&(O(e),t.value="",t.style.height="auto",te(e))}function se(t){t.isComposing||t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),p||B())}function re(t){p||(document.getElementById("chatInput").value=t,B())}function ae(t){O("이 책으로 독서 노트 작성해줘."),setTimeout(()=>{const e=H.makeStudyMarkdown({bookId:t});o.turnCount++,$({turn:o.turnCount,thought:`사용자가 특정 도서(ID: ${t})에 대한 맞춤형 독서 노트를 명시적으로 요청함.
'makeStudyMarkdown' 도구로 핵심 요약과 청소년 사유 질문 3선을 생성함.`,actionName:"makeStudyMarkdown",actionParams:{bookId:t},observation:"독서 노트 작성 완료. 서지 등록 번호 발급됨.",isSafe:!0}),h(`요청하신 도서 **《${e.bookTitle}》**에 대해 핵심 요약과 사유 질문 3선이 포함된 독서 노트를 완성했어요!
지금 바로 열람하시거나 PDF로 인쇄해 보세요.`,null,!0)},400)}function ie(t){o.userGrade=t,w();try{let e="중1";t.includes("2")?e="중2":t.includes("3")&&(e="중3"),x("reading-agent-profile",JSON.stringify({grade:e}))}catch(e){console.warn("프로필 저장 실패:",e)}o.turnCount++,$({turn:o.turnCount,thought:`사용자 학년이 [${t}]로 갱신됨. 이후 도서 큐레이션 및 추천 난이도 기준을 해당 학년 수준에 맞추어 조정함.`,actionName:"updateGradeState",actionParams:{newGrade:t},observation:`AgentState.userGrade 동기화 완료: ${t}`,isSafe:!0}),h(`대상 학년을 **${t}**으로 변경하여 기억해두었어요. 앞으로 이 수준에 딱 맞는 유익한 도서를 권해드릴게요!`)}function K(){if(!o.currentDocument){const r=o.recommendedBooks.at(-1);if(!r)return;H.makeStudyMarkdown({bookId:r.id})}const t=o.currentDocument,e=t.book,n=d("noteModalBody");n.innerHTML=`
    <div class="note-sheet" id="printableNote">
      <div class="note-official-seal">국립중앙도서관<br>사서인증</div>
      <h1>청소년 심화 독서 탐구 노트</h1>
      
      <table class="note-meta-table">
        <tr>
          <td class="th">도서명</td>
          <td><strong>${a(e.title)}</strong></td>
          <td class="th">청구기호</td>
          <td><code>${a(e.callNo)}</code></td>
        </tr>
        <tr>
          <td class="th">저자/출판사</td>
          <td>${a(e.author)} / ${a(e.publisher)}</td>
          <td class="th">작성일자</td>
          <td>${t.createdAt}</td>
        </tr>
        <tr>
          <td class="th">작성자</td>
          <td>${o.userGrade} 학생</td>
          <td class="th">담당 사서</td>
          <td>수석 사서 정서원</td>
        </tr>
      </table>

      <div class="note-section-title">
         1. 핵심 내용 및 줄거리 요약
      </div>
      <div class="note-content-box">
        ${a(e.synopsis)}
      </div>

      <div class="note-section-title">
         2. 핵심 사유 개념
      </div>
      <div class="note-content-box">
        ${e.coreConcepts.map(r=>`• <strong>${a(r)}</strong>`).join(" &nbsp;|&nbsp; ")}
      </div>

      <div class="note-section-title">
         3. 사서 선생님의 생각할 거리 (탐구 질문 3선)
      </div>
      <div class="note-content-box">
        ${e.questions.map((r,i)=>`
          <div class="note-question-item">
            <strong>질문 ${i+1}:</strong> ${a(r)}
          </div>
        `).join("")}
      </div>

      <div class="note-section-title">
         4. 학생 자율 독서 감상 및 느낀 점
      </div>
      <div class="student-write-area">
        여기에 책을 읽은 후 나의 생각과 느낀 점을 자유롭게 적어보세요.
      </div>
    </div>
  `,d("noteModal").classList.add("active")}function ce(){d("noteModal").classList.remove("active")}function le(){window.print()}function de(){o.currentDocument&&navigator.clipboard.writeText(o.currentDocument.markdown).then(()=>{alert("독서 노트 마크다운이 클립보드에 복사되었습니다!")})}function ue(){if(!o.currentDocument)return;const t=new Blob([o.currentDocument.markdown],{type:"text/markdown;charset=utf-8"}),e=URL.createObjectURL(t),n=document.createElement("a");n.href=e,n.download=`독서노트_${o.currentDocument.book.title.replace(/\s+/g,"_")}.md`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(e)}function pe(){if(!p&&confirm("현재 대화와 추천 도서를 저장기록에 보관하고 새 세션을 시작할까요?")){try{z("recommendation",o)}catch{alert("기록을 저장하지 못해 새 세션을 시작하지 않았어요. 현재 대화는 그대로 유지됩니다.");return}o.turnCount=0,o.userGrade="중학교 1학년",o.userInterests=[],o.recommendedBooks=[],o.currentDocument=null,o.chatHistory=[];const t=document.getElementById("gradeSelect");t&&(t.value="중학교 1학년"),d("chatMessages").innerHTML="",d("taoTimeline").innerHTML="";const e=document.getElementById("chatInput");e&&(e.value="",e.style.height="auto"),j(),w(),E()}}function E(){try{x("pageon-current-recommendation",JSON.stringify(o))}catch{console.warn("책 추천 기록을 저장하지 못했습니다.")}}function a(t){return t?String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"):""}d("header-container").innerHTML=J("recommend",`<select id="gradeSelect" class="grade-control" aria-label="학년 변경" onchange="handleGradeChange(this.value)">
    <option value="중학교 1학년">중1</option><option value="중학교 2학년">중2</option><option value="중학교 3학년">중3</option>
  </select>`,'<button class="btn-secondary-sm" data-reset-recommendation onclick="resetSession()">새 세션</button>');Y(d("header-container"));d("header-container");Object.assign(window,{handleGradeChange:ie,resetSession:pe,sendQuickPrompt:re,handleInputKeydown:se,handleSendMessage:B,readThisBook:F,requestNoteForBook:ae,openNoteModal:K,closeNoteModal:ce,copyMarkdownContent:de,downloadMarkdownFile:ue,printStudyNote:le});const U=document.getElementById("chatInput");U&&U.addEventListener("input",function(){this.style.height="auto",this.style.height=this.scrollHeight+"px"});window.addEventListener("click",function(t){const e=t.target;e instanceof HTMLElement&&e.classList.contains("modal-overlay")&&e.classList.remove("active")});window.addEventListener("DOMContentLoaded",j);
