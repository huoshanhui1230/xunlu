/**
 * SQLite 实现：App 端（plus.sqlite）。
 *
 * MVP 没有账号和服务器，数据全部存在手机本地。每次「完成本组」、保存反馈都立刻写库，
 * 所以 App 被系统杀掉后重开能接着记。
 *
 * plus.sqlite 只收 SQL 字符串、没有参数绑定，值一律经 sql.ts 的 lit() 转义后再拼。
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
} from './rows';
import { DDL, SCHEMA_VERSION } from './schema';
import { deleteSql, insertSql, lit, updateSql, type Row } from './sql';
import type { ExerciseRow, HistorySession, LastSets, SetTiming, Store } from './types';

const DB_NAME = 'xunlu';
const DB_PATH = '_doc/xunlu.db';

type PlusSqlite = {
  openDatabase(options: { name: string; path: string; success?: () => void; fail?: (e: unknown) => void }): void;
  isOpenDatabase(options: { name: string; path: string }): boolean;
  executeSql(options: { name: string; sql: string | string[]; success?: () => void; fail?: (e: unknown) => void }): void;
  selectSql(options: {
    name: string;
    sql: string;
    success?: (data: unknown[]) => void;
    fail?: (e: unknown) => void;
  }): void;
};

function sqlite(): PlusSqlite {
  const api = (globalThis as { plus?: { sqlite?: PlusSqlite } }).plus?.sqlite;
  if (api === undefined) throw new Error('plus.sqlite 不可用：manifest.json 里要打开 SQLite 模块');
  return api;
}

/** plus.sqlite 在 App 端可用就用它，H5 下没有这个全局 */
export function hasSqlite(): boolean {
  return typeof (globalThis as { plus?: { sqlite?: unknown } }).plus?.sqlite === 'object';
}

export class SqliteStore implements Store {
  async init(): Promise<void> {
    await this.open();
    await this.exec(DDL as string[]);
    await this.exec(insertSql('meta', { key: 'schema_version', value: String(SCHEMA_VERSION) }));
    await this.seedExercises();
  }

  async listExercises(): Promise<ExerciseRow[]> {
    const rows = await this.select<ExerciseDbRow>('SELECT * FROM exercises');
    return rows.map(exerciseFromRow);
  }

  async startSession(session: ActiveSession): Promise<void> {
    const statements = [
      insertSql('sessions', sessionToRow(session, RULE_VERSION) as unknown as Row),
      deleteSql('session_exercises', { session_id: session.id }),
      ...session.exercises.map((e) => insertSql('session_exercises', sessionExerciseToRow(session.id, e) as unknown as Row)),
      deleteSql('pending_sets', { session_id: session.id }),
    ];
    await this.exec(statements);
  }

  async setCurrentExercise(sessionId: string, exerciseId: string): Promise<void> {
    await this.exec(updateSql('sessions', { current_exercise_id: exerciseId }, { id: sessionId }));
  }

  async saveExerciseState(sessionId: string, exercise: ActiveExercise): Promise<void> {
    await this.exec(insertSql('session_exercises', sessionExerciseToRow(sessionId, exercise) as unknown as Row));
  }

  async endSession(sessionId: string, endedAt: number): Promise<void> {
    await this.exec([
      updateSql('sessions', { ended_at: endedAt, status: 'ended' }, { id: sessionId }),
      deleteSql('pending_sets', { session_id: sessionId }),
    ]);
  }

  async loadActiveSession(): Promise<RestoreInput | null> {
    const sessions = await this.select<SessionDbRow>(
      `SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`,
    );
    const active = sessions[0];
    if (active === undefined) return null;

    const [exerciseRows, setRows, pendingRows] = await Promise.all([
      this.select<SessionExerciseDbRow>(
        `SELECT * FROM session_exercises WHERE session_id = ${lit(active.id)} ORDER BY position ASC`,
      ),
      this.select<SetDbRow>(
        `SELECT * FROM sets WHERE session_id = ${lit(active.id)} AND undone = 0 ORDER BY saved_at ASC`,
      ),
      this.select<PendingDbRow>(`SELECT * FROM pending_sets WHERE session_id = ${lit(active.id)}`),
    ]);

    const pendingRow = pendingRows[0];
    return {
      id: active.id,
      planId: active.plan_id,
      date: active.date,
      startedAt: active.started_at,
      unit: active.unit === 'lb' ? 'lb' : 'kg',
      deload: active.deload === 1,
      currentExerciseId: active.current_exercise_id,
      exercises: exerciseRows.map(sessionExerciseFromRow),
      sets: setRows.map(setFromRow),
      pending: pendingRow === undefined ? null : pendingFromRow(pendingRow),
      endedAt: active.ended_at,
    };
  }

  async savePending(sessionId: string, pending: PendingSet): Promise<void> {
    await this.exec(insertSql('pending_sets', pendingToRow(sessionId, pending) as unknown as Row));
  }

  async clearPending(sessionId: string): Promise<void> {
    await this.exec(deleteSql('pending_sets', { session_id: sessionId }));
  }

  async insertSet(sessionId: string, set: LoggedSet): Promise<void> {
    await this.exec(insertSql('sets', setToRow(sessionId, set, RULE_VERSION) as unknown as Row));
  }

  async markSetUndone(setId: string): Promise<void> {
    await this.exec(updateSql('sets', { undone: 1 }, { id: setId }));
  }

  async insertSuggestion(sessionId: string, suggestion: ShownSuggestion): Promise<void> {
    await this.exec(insertSql('suggestions', suggestionToRow(sessionId, suggestion) as unknown as Row));
  }

  async decideSuggestion(id: string, decision: SuggestionDecision, decidedAt: number): Promise<void> {
    await this.exec(updateSql('suggestions', { decision, decided_at: decidedAt }, { id }));
  }

  async lastSessionDate(exerciseId: string, exceptSessionId: string | null): Promise<string | null> {
    const rows = await this.select<{ date: string }>(
      `SELECT s.date AS date FROM sessions s
         JOIN sets t ON t.session_id = s.id
        WHERE t.exercise_id = ${lit(exerciseId)} AND t.undone = 0
          AND s.id <> ${lit(exceptSessionId ?? '')}
        ORDER BY s.date DESC, s.started_at DESC LIMIT 1`,
    );
    return rows[0]?.date ?? null;
  }

  async lastSets(exerciseId: string, exceptSessionId: string | null): Promise<LastSets | null> {
    const found = await this.select<{ id: string; date: string }>(
      `SELECT s.id AS id, s.date AS date FROM sessions s
         JOIN sets t ON t.session_id = s.id
        WHERE t.exercise_id = ${lit(exerciseId)} AND t.undone = 0
          AND s.id <> ${lit(exceptSessionId ?? '')}
        ORDER BY s.date DESC, s.started_at DESC LIMIT 1`,
    );
    const session = found[0];
    if (session === undefined) return null;
    const rows = await this.select<SetDbRow>(
      `SELECT * FROM sets WHERE session_id = ${lit(session.id)} AND exercise_id = ${lit(exerciseId)}
         AND undone = 0 ORDER BY saved_at ASC`,
    );
    return { date: session.date, sets: rows.map(setFromRow) };
  }

  async setTimings(sessionId: string): Promise<SetTiming[]> {
    const rows = await this.select<SetDbRow>(
      `SELECT * FROM sets WHERE session_id = ${lit(sessionId)} AND undone = 0 ORDER BY saved_at ASC`,
    );
    return rows.map((s) => ({
      exerciseId: s.exercise_id,
      setNo: s.set_no,
      logMs: s.log_ms,
      closedBy: s.closed_by,
      changedPrefill: s.weight !== s.prefill_weight || s.reps !== s.prefill_reps || s.rir !== s.prefill_rir,
    }));
  }

  async importHistory(sessions: readonly HistorySession[]): Promise<void> {
    const statements: string[] = [];
    for (const history of sessions) {
      statements.push(
        insertSql('sessions', {
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
        }),
      );
      for (const set of history.sets) {
        statements.push(insertSql('sets', setToRow(history.id, set, RULE_VERSION) as unknown as Row));
      }
    }
    if (statements.length > 0) await this.exec(statements);
  }

  async hasAnySession(): Promise<boolean> {
    const rows = await this.select<{ n: number }>('SELECT COUNT(*) AS n FROM sessions');
    return (rows[0]?.n ?? 0) > 0;
  }

  // --- plus.sqlite 的回调包成 Promise -------------------------------------

  private open(): Promise<void> {
    const api = sqlite();
    if (api.isOpenDatabase({ name: DB_NAME, path: DB_PATH })) return Promise.resolve();
    return new Promise((resolve, reject) => {
      api.openDatabase({ name: DB_NAME, path: DB_PATH, success: () => resolve(), fail: reject });
    });
  }

  private exec(sql: string | string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      sqlite().executeSql({ name: DB_NAME, sql, success: () => resolve(), fail: reject });
    });
  }

  private select<T>(sql: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      sqlite().selectSql({ name: DB_NAME, sql, success: (data) => resolve((data ?? []) as T[]), fail: reject });
    });
  }

  private async seedExercises(): Promise<void> {
    const existing = await this.select<{ id: string }>('SELECT id FROM exercises');
    const known = new Set(existing.map((row) => row.id));
    const missing = PUSH_DAY.filter((meta) => !known.has(meta.config.id));
    if (missing.length === 0) return;
    await this.exec(missing.map((meta) => insertSql('exercises', exerciseToRow(meta) as unknown as Row)));
  }
}
