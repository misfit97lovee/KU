# 아이트래킹 통합 검증

기준 main: `b61272b`. 작업 브랜치: `codex/gaze-integration`.
멘토 zip의 gaze 분석/모달/CSS 및 WebGazer 리소스만 선택적으로 이식했다.

## 변경 파일

- `src/gaze/gazeAnalysis.ts`, `src/gaze/gazeEngine.ts`, `src/gaze/renderReport.ts`
- `src/components/GazeReaderModal.ts`, `src/gaze.css`
- `public/vendor/webgazer/` (WebGazer 및 로컬 MediaPipe 리소스)
- `src/components/BookInputPanel.ts`, `src/components/ReadingRecordPanel.ts`, `src/components/HistoryDialog.ts`
- `src/main.ts`, `src/state.ts`, `src/sessionHistory.ts`, `src/types/index.ts`
- `tests/gaze.test.ts`, `tests/gazeIntegration.test.ts`, `tests/gazeHarness.html`
- `GAZE_INTEGRATION.md`

## 저장 및 카메라

- 웹캠 영상과 얼굴 특징은 서버에 전송하거나 영속 저장하지 않는다.
- 420×840 이내 히트맵 JPEG에는 책 사진이 합성된다. 개인정보 안내에 이를 명시했다.
- 결과는 현재 Google sub의 기존 저장 공간에 저장하고, 계정 전환 시 모달을 종료한다.
- 시선 기록만 있는 세션도 새 세션에서 보관하며 저장기록의 이해도 탭에서 복원된다.
- 최근 결과 3개만 현재 세션에 유지한다. 시선 결과/사진은 일반 AI 채팅 요청에 추가하지 않는다.
- 질문을 선택하면 해당 책 사진 영역만 기존 사진 질문 경로로 전달한다.
- 이 WebGazer 빌드의 `end()`는 영상 UI만 제거하므로, 어댑터가 직접 소유한 MediaStream의 모든 트랙을 정지한다.
- WebGazer 보정 데이터의 세션간 저장을 끄고 종료 시 회귀 데이터를 초기화한다.
- 모달 취소, 초기화 중 취소, 계정 전환, 페이지 이탈에서 카메라를 해제한다.

## 검증 기록

- 전체 테스트 65개, typecheck, production build, diff 공백 검사 통과.
- 히트맵 책 사진 합성과 영역 질문 JPEG 페이로드는 자동 테스트로 확인했다.

- 변경 전 일반 텍스트 AI 응답: 1.927 / 1.785 / 1.773초, 평균 1.828초.
- 변경 후: 1.993 / 1.595 / 1.827초, 평균 1.805초. 모두 HTTP 200.
- 실제 Chrome 웹캠: 로컬 MediaPipe 모델 로딩 → 보정 9점 → 시선 샘플 → 결과 생성 확인.
- 실제 시선 샘플 결과: 읽은 시간 101.6초, 페이지를 본 비율 37%. 정확도 수치가 아니다.
- 실제 웹캠 재시작 및 보정 중 취소: 트랙 `live` → `ended` 확인.
- 개발 테스트 계정 A 저장 → B 비노출 → 로그아웃 비움 → A 복원 및 새로고침 유지 확인.
- 시선 기록만 있는 세션의 보관 및 저장기록 히트맵 복원 확인.
- 웹캠 권한 거부, 늦게 도착한 스트림, 모델 준비 중 취소는 자동 테스트로 검증한다.
- 보호 대상: server 전체, 추천, Google 로그인, 계정 저장 유틸, AI 요청 축약/timeout/fallback, 기존 UI CSS는 main과 동일하다.

`tests/gazeHarness.html`은 개발 서버 전용 UI 검증 화면이다. 합성 책 사진과 별도 테스트 계정 공간만 사용하며, 배포 빌드에는 포함되지 않는다. 질문 연결은 이미지 페이로드를 검사하고 서버로 전송하지 않는다.

## 주의사항

- 실제 시선 정확도는 사용자가 각 점을 바라보며 보정해야 확인할 수 있고, 조명·자세·안경 등에 영향을 받는다. 자동 클릭은 보정 절차 연결만 검증한다.
- 오래 머문 위치와 페이지를 본 비율은 이해도 진단이 아니다.
- 기존 기록과 마찬가지로 동일 브라우저의 localStorage에 저장한다. 공유 기기는 별도 브라우저 프로필 사용이 적절하다.
- WebGazer 원본 헤더의 GPLv3/LGPLv3 안내와 MediaPipe 패키지의 Apache-2.0 메타데이터를 보존했다. 배포 시 해당 라이선스 조건을 확인해야 한다.
