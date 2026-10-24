/**
 * 把状态机吐出来的事件写进库。
 *
 * 顺序执行：点「完成本组」先落 pending，保存时先写 sets 再清 pending，
 * 这样任何一步之后被杀掉，重开时恢复出来的状态都是自洽的。
 */
import type { StoreEvent } from '@xunlu/session';
import type { Store } from './types';

export async function applyEvents(
  store: Store,
  sessionId: string,
  events: readonly StoreEvent[],
): Promise<void> {
  for (const event of events) {
    switch (event.kind) {
      case 'session_started':
        await store.startSession(event.session);
        break;
      case 'set_begun':
        await store.savePending(sessionId, event.pending);
        break;
      case 'set_saved':
        await store.insertSet(sessionId, event.set);
        break;
      case 'pending_cleared':
        await store.clearPending(sessionId);
        break;
      case 'set_undone':
        await store.markSetUndone(event.setId);
        break;
      case 'exercise_state_changed':
        await store.saveExerciseState(sessionId, event.exercise);
        break;
      case 'current_exercise_changed':
        await store.setCurrentExercise(sessionId, event.exerciseId);
        break;
      case 'suggestion_shown':
        await store.insertSuggestion(sessionId, event.suggestion);
        break;
      case 'suggestion_decided':
        await store.decideSuggestion(event.suggestionId, event.decision, event.decidedAt);
        break;
      case 'session_ended':
        await store.endSession(sessionId, event.endedAt);
        break;
    }
  }
}
