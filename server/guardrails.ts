/**
 * 서버 가드레일 유틸리티 모듈
 * AI 생성물의 검증, 근거 검증, 민감 정보 마스킹을 담당합니다.
 */

export function normalizeText(str: string): string {
  return str.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * 에러 메시지 및 로그에서 민감한 인증 키 및 내부 경로 제거
 */
export function sanitizeError(error: unknown, extraKeys: string[] = []): string {
  let msg = error instanceof Error ? error.message : String(error);

  const keysToMask = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API,
    process.env.DATA4LIBRARY_AUTH_KEY,
    process.env.YES24_API,
    ...extraKeys
  ].filter((k): k is string => Boolean(k && k.trim()));

  for (const k of keysToMask) {
    msg = msg.split(k).join('[REDACTED]');
  }

  // URL 쿼리 파라미터의 인증키 마스킹 (?key=..., &authKey=..., &apiKey=...)
  msg = msg.replace(/([?&](?:key|authKey|apiKey)=)[^&\s]+/gi, '$1[REDACTED]');

  // 내부 파일 시스템 경로 마스킹
  msg = msg.replace(/\/[a-zA-Z0-9_\-./]+\/(server|src|node_modules|tests)\/[a-zA-Z0-9_\-./]+/g, '[INTERNAL_PATH]');

  return msg;
}

/**
 * 사용자가 입력한 본문이나 OCR/Vision 추출 텍스트에 실제 존재하는 문장만 근거로 검증
 * 허구의 AI 사전지식이나 기억으로 지어낸 문장을 차단합니다.
 */
export function validateEvidence(
  rawEvidence: unknown[],
  sessionContext: { userMessages: string[]; extractedText?: string | null }
): string[] {
  if (!Array.isArray(rawEvidence)) return [];

  const textPools = [
    ...sessionContext.userMessages,
    sessionContext.extractedText || ''
  ].filter(Boolean);

  if (textPools.length === 0) return [];

  const combinedNormalized = textPools.map(t => normalizeText(t)).join(' ');

  const validList: string[] = [];
  for (const item of rawEvidence) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || trimmed.length < 2) continue;

    const normItem = normalizeText(trimmed);
    if (!normItem) continue;

    // 책 본문 또는 추출 텍스트에 실제 존재하는 문자열만 근거로 허용
    if (combinedNormalized.includes(normItem)) {
      validList.push(trimmed);
    }
  }

  return validList;
}
