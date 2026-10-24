/**
 * 库里的行与内存里的对象之间的转换。
 * SQLite 和内存两套实现共用这一份，免得两边各写一遍、各错一处。
 */
import type { LoadType, SetTag, Target } from '@xunlu/engine';
import type {
  ActiveExercise,
  ActiveSession,
  HintState,
  LoggedSet,
  PendingSet,
  ShownSuggestion,
} from '@xunlu/session';
import type { ExerciseMeta } from '@/data/push-day';
import type { ExerciseRow } from './types';
import { parseJson } from './sql';

// --- 动作库 ---------------------------------------------------------------

export interface ExerciseDbRow {
  readonly id: string;
  readonly load_type: string;
  readonly increment: number;
  readonly rep_min: number;
  readonly rep_max: number;
  readonly max_increase_pct: number;
  readonly compound: number;
  readonly planned_sets: number | null;
  readonly primary_muscles: string | null;
  readonly secondary_muscles: string | null;
  readonly rest_min_sec: number;
  readonly rest_max_sec: number;
  readonly thumb: string | null;
}

export function exerciseToRow(meta: ExerciseMeta): ExerciseDbRow {
  const c = meta.config;
  return {
    id: c.id,
    load_type: c.loadType,
    increment: c.increment,
    rep_min: c.repRange.min,
    rep_max: c.repRange.max,
    max_increase_pct: c.maxIncreasePct,
    compound: c.compound === true ? 1 : 0,
    planned_sets: c.plannedSets ?? null,
    primary_muscles: JSON.stringify(c.primaryMuscles ?? []),
    secondary_muscles: JSON.stringify(c.secondaryMuscles ?? []),
    rest_min_sec: meta.rest.minSec,
    rest_max_sec: meta.rest.maxSec,
    thumb: meta.thumb,
  };
}

export function exerciseFromRow(row: ExerciseDbRow): ExerciseRow {
  return {
    id: row.id,
    loadType: row.load_type as LoadType,
    increment: row.increment,
    repMin: row.rep_min,
    repMax: row.rep_max,
    maxIncreasePct: row.max_increase_pct,
    compound: row.compound === 1,
    plannedSets: row.planned_sets,
    primaryMuscles: parseJson<string[]>(row.primary_muscles, []),
    secondaryMuscles: parseJson<string[]>(row.secondary_muscles, []),
    restMinSec: row.rest_min_sec,
    restMaxSec: row.rest_max_sec,
    thumb: row.thumb,
  };
}

// --- 一次训练 -------------------------------------------------------------

export type SessionStatus = 'active' | 'ended';

export interface SessionDbRow {
  readonly id: string;
  readonly plan_id: string | null;
  readonly date: string;
  readonly started_at: number;
  readonly ended_at: number | null;
  readonly status: string;
  readonly current_exercise_id: string | null;
  readonly unit: string;
  readonly deload: number;
  readonly rule_version: string;
}

export function sessionToRow(session: ActiveSession, ruleVersion: string): SessionDbRow {
  return {
    id: session.id,
    plan_id: session.planId,
    date: session.date,
    started_at: session.startedAt,
    ended_at: session.endedAt,
    status: session.endedAt === null ? 'active' : 'ended',
    current_exercise_id: session.currentExerciseId,
    unit: session.unit,
    deload: session.deload ? 1 : 0,
    rule_version: ruleVersion,
  };
}

// --- 本次每个动作的目标与状态 ---------------------------------------------

export interface SessionExerciseDbRow {
  readonly session_id: string;
  readonly exercise_id: string;
  readonly position: number;
  readonly target_weight: number;
  readonly target_sets: number;
  readonly target_reps: string;
  readonly rep_min: number;
  readonly rep_max: number;
  readonly extended: number;
  readonly target_rir: number;
  readonly layoff_adjusted: number;
  /** 当前挂着的提示，JSON；没有为 NULL */
  readonly hint: string | null;
}

export function sessionExerciseToRow(sessionId: string, exercise: ActiveExercise): SessionExerciseDbRow {
  const t = exercise.target;
  return {
    session_id: sessionId,
    exercise_id: exercise.exerciseId,
    position: exercise.position,
    target_weight: t.weight,
    target_sets: t.sets,
    target_reps: JSON.stringify(t.reps),
    rep_min: t.repRange.min,
    rep_max: t.repRange.max,
    extended: t.extended ? 1 : 0,
    target_rir: t.targetRir,
    layoff_adjusted: t.layoffAdjusted === true ? 1 : 0,
    hint: exercise.hint === null ? null : JSON.stringify(exercise.hint),
  };
}

export function sessionExerciseFromRow(row: SessionExerciseDbRow): ActiveExercise {
  const target: Target = {
    weight: row.target_weight,
    sets: row.target_sets,
    reps: parseJson<number[]>(row.target_reps, []),
    repRange: { min: row.rep_min, max: row.rep_max },
    extended: row.extended === 1,
    targetRir: row.target_rir,
    layoffAdjusted: row.layoff_adjusted === 1,
  };
  return {
    exerciseId: row.exercise_id,
    position: row.position,
    target,
    hint: parseJson<HintState | null>(row.hint, null),
  };
}

// --- 记录组 ---------------------------------------------------------------

export interface SetDbRow {
  readonly id: string;
  readonly session_id: string;
  readonly exercise_id: string;
  readonly set_no: number;
  readonly weight: number;
  readonly reps: number;
  readonly rir: number | null;
  readonly tag: string | null;
  readonly note: string | null;
  readonly prev_set_at: number | null;
  readonly done_at: number;
  readonly saved_at: number;
  /** saved_at − done_at：记一组用了多久，第一道放行看这个 */
  readonly log_ms: number;
  readonly prefill_weight: number;
  readonly prefill_reps: number;
  readonly prefill_rir: number | null;
  readonly closed_by: string;
  readonly undone: number;
  readonly rule_version: string;
}

export function setToRow(sessionId: string, set: LoggedSet, ruleVersion: string): SetDbRow {
  return {
    id: set.id,
    session_id: sessionId,
    exercise_id: set.exerciseId,
    set_no: set.setNo,
    weight: set.weight,
    reps: set.reps,
    rir: set.rir,
    tag: set.tag,
    note: set.note,
    prev_set_at: set.prevSetAt,
    done_at: set.doneAt,
    saved_at: set.savedAt,
    log_ms: set.logMs,
    prefill_weight: set.prefill.weight,
    prefill_reps: set.prefill.reps,
    prefill_rir: set.prefill.rir,
    closed_by: set.closedBy,
    undone: 0,
    rule_version: ruleVersion,
  };
}

export function setFromRow(row: SetDbRow): LoggedSet {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    setNo: row.set_no,
    weight: row.weight,
    reps: row.reps,
    rir: row.rir,
    tag: (row.tag as SetTag | null) ?? null,
    note: row.note,
    prevSetAt: row.prev_set_at,
    doneAt: row.done_at,
    savedAt: row.saved_at,
    logMs: row.log_ms,
    prefill: { weight: row.prefill_weight, reps: row.prefill_reps, rir: row.prefill_rir },
    closedBy: row.closed_by as LoggedSet['closedBy'],
  };
}

// --- 待保存的组 -----------------------------------------------------------

export interface PendingDbRow {
  readonly session_id: string;
  readonly exercise_id: string;
  readonly set_no: number;
  readonly done_at: number;
  readonly prefill_weight: number;
  readonly prefill_reps: number;
  readonly prefill_rir: number | null;
}

export function pendingToRow(sessionId: string, pending: PendingSet): PendingDbRow {
  return {
    session_id: sessionId,
    exercise_id: pending.exerciseId,
    set_no: pending.setNo,
    done_at: pending.doneAt,
    prefill_weight: pending.prefill.weight,
    prefill_reps: pending.prefill.reps,
    prefill_rir: pending.prefill.rir,
  };
}

export function pendingFromRow(row: PendingDbRow): PendingSet {
  return {
    exerciseId: row.exercise_id,
    setNo: row.set_no,
    doneAt: row.done_at,
    prefill: { weight: row.prefill_weight, reps: row.prefill_reps, rir: row.prefill_rir },
  };
}

// --- 建议 -----------------------------------------------------------------

export interface SuggestionDbRow {
  readonly id: string;
  readonly session_id: string;
  readonly exercise_id: string;
  readonly scope: string;
  readonly set_id: string | null;
  readonly rule_version: string;
  readonly rule_id: string;
  readonly kind: string;
  readonly reason: string | null;
  readonly blocked_by: string | null;
  readonly payload: string;
  readonly decision: string;
  readonly decided_at: number | null;
  readonly created_at: number;
}

export function suggestionToRow(sessionId: string, s: ShownSuggestion): SuggestionDbRow {
  return {
    id: s.id,
    session_id: sessionId,
    exercise_id: s.exerciseId,
    scope: s.scope,
    set_id: s.setId,
    rule_version: s.ruleVersion,
    rule_id: s.ruleId,
    kind: s.kind,
    reason: s.reason,
    blocked_by: s.blockedBy,
    payload: s.payload,
    decision: s.decision,
    decided_at: null,
    created_at: s.createdAt,
  };
}
