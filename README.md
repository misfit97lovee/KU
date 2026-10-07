# Reading Agent (AI 독서 이해 도우미)

중학생 눈높이에 맞추어 책의 어려운 문장과 표현을 함께 생각하며 이해하도록 돕는 소크라테스식 독서 보조 웹 애플리케이션입니다.

## 주요 기능
- **책 사진 업로드 & 멀티모달 분석**: 책 본문 사진을 직접 찍어 업로드하여 질문
- **소크라테스식 대화**: 일방적인 정답 주입 대신 힌트와 비유를 통해 스스로 생각하도록 유도
- **이해 확인 퀴즈**: 설명 후 이해도를 확인할 수 있는 짧은 질문과 3단계 피드백(✅, 🟡, 🔄)
- **책에서 본 근거**: AI 설명 시 실제 본문/사진 속 확인된 표현 1~2개 인용
- **AI 추천 질문**: 책 내용 기반으로 중학생이 궁금해할 만한 핵심 질문 3개 자동 제안
- **오늘의 독서노트 & 요약**: 대화 내용에 근거한 독서노트 및 핵심 요약 자동 생성 및 로컬 저장

## 실행 방법
```bash
# 의존성 설치
npm install

# 환경 변수 설정 (.env)
# .env 파일 생성 후 GEMINI_API 입력
GEMINI_API=your_gemini_api_key_here
VITE_GOOGLE_CLIENT_ID=your_web_client_id.apps.googleusercontent.com

# 개발 서버 실행
npm run dev
```

Google 로그인은 Google Cloud에서 만든 **웹 애플리케이션 OAuth 클라이언트 ID**를 사용합니다. 개발용 승인된 JavaScript 원본에 `http://localhost:5173`을 추가하세요. 같은 ID를 브라우저와 Express 서버가 사용하며 Client Secret은 필요하지 않습니다. 로그인한 사용자의 이름·이메일·프로필 이미지와 30일 세션은 서버의 `server/data/auth.json`에 저장됩니다. 이 파일은 Git에서 제외됩니다. 운영 환경에서는 서버 저장 파일을 지속 저장소에 두고 HTTPS로 서비스하세요.

헤더의 Google 버튼으로 로그인하고, 프로필 옆 **로그아웃** 버튼으로 세션을 종료할 수 있습니다. 새로고침 시 서버가 HttpOnly 쿠키로 로그인 상태를 복원합니다. 독서 상태·저장기록·책 추천 상태는 검증된 Google `sub`별 localStorage 키에 저장됩니다. 로그아웃하면 화면과 메모리만 비우고 계정 기록은 보존합니다. 소유자를 확인할 수 없는 예전 공통 키 기록은 삭제하지 않으며, 어느 계정에도 자동으로 보여주지 않습니다.

독서 API는 최근 대화 6개와 이전 대화의 압축 기록, 현재 책/필요한 상태만 받습니다. 사진은 새로 업로드할 때만 전송하고 OCR 본문은 후속 텍스트 대화에 재사용합니다. Gemini 호출은 요청당 1회이며 503/429 재시도 없이 텍스트 12초, 사진 20초로 제한합니다. 기본 모델은 `gemini-flash-lite-latest`이며 `GEMINI_READING_MODEL`로 별도 지정할 수 있습니다. Gemini 2.5 Flash를 지정한 경우 thinking budget은 [공식 문서](https://ai.google.dev/gemini-api/docs/generate-content/thinking)에 따라 0으로 설정합니다. 서버 실행 후 `node --import tsx tests/readingChat.live.ts`로 텍스트 대화 3회의 실제 응답시간을 측정합니다.

## 페이지온 저장기록
- 두 화면의 **새 세션**은 현재 기록을 먼저 저장기록에 보관한 후 시작합니다.
- 읽기 도우미의 대화·사진·근거·요약·독서노트·이해도 상태를 함께 보관합니다. 책 추천 대화와 추천 도서도 보관합니다.
- 공통 헤더의 **저장기록**에서 지난 세션을 읽을 수 있습니다. 보관함을 열어도 현재 세션은 바뀌지 않습니다.
- 기록은 로그인한 계정별로 이 브라우저의 localStorage에 저장됩니다. 저장 공간 부족이나 저장 오류가 나면 현재 세션을 초기화하지 않습니다.

## 책 추천 검증
- 요청을 구조화한 뒤 도서관정보나루 후보의 주제·난이도 적합성을 검증합니다. 75점 이상만 최대 3권 표시하며 빈자리를 임의로 채우지 않습니다.
- 특정 제목은 `srchBooks` 제목 검색을 우선합니다. 적합 후보가 없으면 Gemini의 `google_search` grounding을 사용합니다.
- 검색 실행 기록, 출처에 연결된 제목·저자, 소개 근거가 확인되지 않은 웹 도서는 반환하지 않습니다. 추가 서지는 근거가 있을 때만 사용합니다.
- `GEMINI_SEARCH_MODEL`로 검색 모델을 별도 지정할 수 있습니다. 검색 쿼터/네트워크 오류 시 내장 책 목록으로 대체하지 않습니다.
- [Google Search grounding 공식 문서](https://ai.google.dev/gemini-api/docs/generate-content/google-search), [도서관정보나루 API 안내](https://data4library.kr/apiUtilization)

```bash
npm test
# 별도 서버를 띄운 뒤 실제 네트워크/API 테스트 (API 사용량 발생)
SERVER_PORT=3012 npm run server
node tests/recommendations.live.js
npm run build
```
