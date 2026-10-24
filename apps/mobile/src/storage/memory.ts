/**
 * 内存实现：H5 预览用。
 *
 * 刷新页面就清空 —— 浏览器里只用来走流程和核对设计稿，真机那套是 sqlite.ts。
 * 恢复进行中训练的逻辑由 @xunlu/session 的单元测试覆盖，不依赖这里。
 */
import { RULE_VERSION } from '@xunlu/engine';
import type {
  ActiveExercise,
  ActiveSession,
  LoggedSet,
  PendingSet,
  RestoreInput,
  ShownSuggestion,
  SuggestionDecision,
} from '@xunlu/session';
import { PUSH_DAY } from '@/data/push-day';
import {
  exerciseFromRow,
  exerciseToRow,
  pendingFromRow,
  pendingToRow,
  sessionExerciseFromRow,
  sessionExerciseToRow,
  sessionToRow,
  setFromRow,
  setToRow,
  suggestionToRow,
  type ExerciseDbRow,
  type PendingDbRow,
  type SessionDbRow,
  type SessionExerciseDbRow,
  type SetDbRow,
  type SuggestionDbRow,
} from './rows';
import type { ExerciseRow, HistorySession, LastSets, SetTiming, Store } from './types';

export class MemoryStore implements Store {
  private exercises: ExerciseDbRow[] = [];
  private sessions: SessionDbRow[] = [];
  private sessionExercises: SessionExerciseDbRow[] = [];
  private pendingRows = new Map<string, PendingDbRow>();
  private setRows: SetDbRow[] = [];
  private suggestionRows: SuggestionDbRow[] = [];

  async init(): Promise<void> {
    const known = new Set(this.exercises.map((e) => e.id));
    for (const meta of PUSH_DAY) {
      if (!known.has(meta.config.id)) this.exercises.push(exerciseToRow(meta));
    }
  }

  async listExercises(): Promise<ExerciseRow[]> {
    return this.exercises.map(exerciseFromRow);
  }

  async startSession(session: ActiveSession): Promise<void> {
    this.sessions = this.sessions.filter((s) => s.id !== session.id);
    this.sessions.push(sessionToRow(session, RULE_VERSION));
    this.sessionExercises = this.sessionExercises.filter((e) => e.session_id !== session.id);
    for (const exercise of session.exercises) {
      this.sessionExercises.push(sessionExerciseToRow(session.id, exercise));
    }
  }

  async setCurrentExercise(sessionId: string, exerciseId: string): Promise<void> {
    this.sessions = this.sessions.map((s) =>
      s.id === sessionId ? { ...s, current_exercise_id: exerciseId } : s,
    );
  }

  async saveExerciseState(sessionId: string, exercise: ActiveExercise): Promise<void> {
    const row = sessionExerciseToRow(sessionId, exercise);
    const index = this.sessionExercises.findIndex(
      (e) => e.session_id === sessionId && e.exercise_id === exercise.exerciseId,
    );
    if (index >= 0) this.sessionExercises[index] = row;
    else this.sessionExercises.push(row);
  }

  async endSession(sessionId: string, endedAt: number): Promise<void> {
    this.sessions = this.sessions.map((s) =>
      s.id === sessionId ? { ...s, ended_at: endedAt, status: 'ended' } : s,
    );
    this.pendingRows.delete(sessionId);
  }

  async loadActiveSession(): Promise<RestoreInput | null> {
    const active = this.sessions
      .filter((s) => s.status === 'active')
      .sort((a, b) => b.started_at - a.started_at)[0];
    if (active === undefined) return null;

    const exercises: ActiveExercise[] = this.sessionExercises
      .filter((e) => e.session_id === active.id)
      .map(sessionExerciseFromRow);
    const sets: LoggedSet[] = this.setRows
      .filter((s) => s.session_id === active.id && s.undone === 0)
      .sort((a, b) => a.saved_at - b.saved_at)
      .map(setFromRow);
    const pendingRow = this.pendingRows.get(active.id);

    return {
      id: active.id,
      planId: active.plan_id,
      date: active.date,
      startedAt: active.started_at,
      unit: active.unit === 'lb' ? 'lb' : 'kg',
      deload: active.deload === 1,
      currentExerciseId: active.current_exercise_id,
      exercises,
      sets,
      pending: pendingRow === undefined ? null : pendingFromRow(pendingRow),
      endedAt: active.ended_at,
    };
  }

  async savePending(sessionId: string, pending: PendingSet): Promise<void> {
    this.pendingRows.set(sessionId, pendingToRow(sessionId, pending));
  }

  async clearPending(sessionId: string): Promise<void> {
    this.pendingRows.delete(sessionId);
  }

  async insertSet(sessionId: string, set: LoggedSet): Promise<void> {
    this.setRows = this.setRows.filter((s) => s.id !== set.id);
    this.setRows.push(setToRow(sessionId, set, RULE_VERSION));
  }

  async markSetUndone(setId: string): Promise<void> {
    this.setRows = this.setRows.map((s) => (s.id === setId ? { ...s, undone: 1 } : s));
  }

  async insertSuggestion(sessionId: string, suggestion: ShownSuggestion): Promise<void> {
    this.suggestionRows = this.suggestionRows.filter((s) => s.id !== suggestion.id);
    this.suggestionRows.push(suggestionToRow(sessionId, suggestion));
  }

  async decideSuggestion(id: string, decision: SuggestionDecision, decidedAt: number): Promise<void> {
    this.suggestionRows = this.suggestionRows.map((s) =>
      s.id === id ? { ...s, decision, decided_at: decidedAt } : s,
    );
  }

  async lastSessionDate(exerciseId: string, exceptSessionId: string | null): Promise<string | null> {
    return this.lastSessionFor(exerciseId, exceptSessionId)?.date ?? null;
  }

  async lastSets(exerciseId: string, exceptSessionId: string | null): Promise<LastSets | null> {
    const session = this.lastSessionFor(exerciseId, exceptSessionId);
    if (session === undefined) return null;
    const sets = this.setRows
      .filter((s) => s.session_id === session.id && s.exercise_id === exerciseId && s.undone === 0)
      .sort((a, b) => a.saved_at - b.saved_at)
      .map(setFromRow);
    return { date: session.date, sets };
  }

  async setTimings(sessionId: string): Promise<SetTiming[]> {
    return this.setRows
      .filter((s) => s.session_id === sessionId && s.undone === 0)
      .sort((a, b) => a.saved_at - b.saved_at)
      .map((s) => ({
        exerciseId: s.exercise_id,
        setNo: s.set_no,
        logMs: s.log_ms,
        closedBy: s.closed_by,
        changedPrefill:
          s.weight !== s.prefill_weight || s.reps !== s.prefill_reps || s.rir !== s.prefill_rir,
      }));
  }

  async importHistory(sessions: readonly HistorySession[]): Promise<void> {
    for (const history of sessions) {
      this.sessions.push({
        id: history.id,
        plan_id: history.planId,
        date: history.date,
        started_at: history.startedAt,
        ended_at: history.endedAt,
        status: 'ended',
        current_exercise_id: null,
        unit: 'kg',
        deload: 0,
        rule_version: RULE_VERSION,
      });
      for (const set of history.sets) this.setRows.push(setToRow(history.id, set, RULE_VERSION));
    }
  }

  async hasAnySession(): Promise<boolean> {
    return this.sessions.length > 0;
  }

  /** 这个动作最近练过的那次训练（不含指定的那次） */
  private lastSessionFor(exerciseId: string, exceptSessionId: string | null): SessionDbRow | undefined {
    const ids = new Set(
      this.setRows
        .filter((s) => s.exercise_id === exerciseId && s.undone === 0 && s.session_id !== exceptSessionId)
        .map((s) => s.session_id),
    );
    return this.sessions
      .filter((s) => ids.has(s.id))
      .sort((a, b) => (a.date === b.date ? b.started_at - a.started_at : a.date < b.date ? 1 : -1))[0];
  }
}
