// Shared by local archiving, the record dialog and the authenticated API.
// A title or the assistant's initial greeting alone is not reading activity.
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): boolean => typeof value === 'string' && Boolean(value.trim());
const list = (value: unknown): boolean => Array.isArray(value) && value.length > 0;
const userActivity = (value: unknown): boolean => Array.isArray(value) && value.some(item => {
  const message = object(item);
  return message.role === 'user' && (text(message.content) || text(object(message.image).data));
});

export function hasReadingActivity(kind: 'reading' | 'recommendation', value: unknown): boolean {
  const snapshot = object(value);
  if (kind === 'recommendation') return userActivity(snapshot.chatHistory) || list(snapshot.recommendedBooks) || text(object(snapshot.currentDocument).markdown);
  const session = object(snapshot.session);
  return userActivity(session.recentMessages) || text(session.summary) || text(session.readingNote)
    || list(session.comprehensionChecks) || list(session.difficultPoints) || list(session.understoodPoints) || list(session.gazeReports);
}
