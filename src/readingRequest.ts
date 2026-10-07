import type { ReadingState } from './types/index.ts';

// An extractive digest avoids a second model call solely to summarize history.
export function buildReadingRequest(state: ReadingState, explanationLevel?: string) {
  const history = state.session.recentMessages;
  const older = history.slice(0, -6);
  const digest = older.slice(-12).map(message =>
    `${message.role === 'user' ? '학생' : '도우미'}: ${message.content.replace(/\s+/g, ' ').slice(0, 180)}`
  ).join('\n');
  return {
    messages: history.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })),
    conversationSummary: [state.session.summary?.slice(0, 1000), digest].filter(Boolean).join('\n').slice(0, 3000),
    sourceText: (state.session.sourceText || older.filter(message => message.role === 'user')
      .slice(-3).map(message => message.content).join('\n')).slice(0, 6000),
    readingState: {
      student: state.student,
      book: state.book,
      session: {
        difficultPoints: state.session.difficultPoints.slice(-3),
        understoodPoints: state.session.understoodPoints.slice(-3),
        comprehensionChecks: state.session.comprehensionChecks.slice(-2).map(({ topic, result, difficultPart, timestamp }) => ({ topic, result, difficultPart, timestamp }))
      }
    },
    ...(explanationLevel ? { explanationLevel } : {})
  };
}
