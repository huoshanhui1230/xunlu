/**
 * 训练过程的状态机。
 *
 * 每个动作都是纯函数：收下当前状态和一个时间戳，返回「新状态 + 要写库的事件」。
 * 存储层只管照着事件写表，所以这一整套逻辑可以脱离 uni 和 SQLite 单独测。
 *
 * 一组记录的生命周期：
 *   beginSet   点「完成本组」，面板打开，doneAt 记下来并立刻落库
 *   saveSet    点确认 / 关闭面板 / 再点一次完成本组，都按当前值保存，不丢组
 *   undoLastSet 保存后 5 秒内可撤，连带退掉这一组引出的加重提示
 */
import { round2, type ExerciseConfig, type SetTag } from '@xunlu/engine';
import { prefillFor } from './prefill';
import { canUndo } from './undo';
import type {
  ActiveExercise,
  ActiveSession,
  AppliedHint,
  HintState,
  LoggedSet,
  PendingSet,
  SaveTrigger,
  StoreEvent,
  SuggestionDecision,
  Transition,
  WheelValues,
} from './types';

const WEIGHT_EPS = 0.005;

function sameWeight(a: number, b: number): boolean {
  return Math.abs(a - b) < WEIGHT_EPS;
}

// ---------------------------------------------------------------------------
// 读状态
// ---------------------------------------------------------------------------

export function findExercise(session: ActiveSession, exerciseId: string): ActiveExercise | undefined {
  return session.exercises.find((e) => e.exerciseId === exerciseId);
}

/** 本次该动作已保存的组，按保存顺序 */
export function setsOf(session: ActiveSession, exerciseId: string): LoggedSet[] {
  return session.sets.filter((s) => s.exerciseId === exerciseId);
}

export function lastSetOf(session: ActiveSession, exerciseId: string): LoggedSet | undefined {
  const own = setsOf(session, exerciseId);
  return own.length > 0 ? own[own.length - 1] : undefined;
}

/** 下一组是第几组 */
export function nextSetNo(session: ActiveSession, exerciseId: string): number {
  return setsOf(session, exerciseId).length + 1;
}

/** 引擎要的「本次已出过几次加重提示」 */
export function increaseHintsUsed(exercise: ActiveExercise): number {
  return exercise.increaseHintSetIds.length;
}

/** 预填要用的「已应用的提示」；没点过「应用」就是 null */
export function appliedHintOf(exercise: ActiveExercise): AppliedHint | null {
  const hint = exercise.hint;
  if (hint === null || !hint.applied) return null;
  return { setNo: hint.setNo, weight: hint.weight, reps: hint.reps };
}

function replaceExercise(session: ActiveSession, next: ActiveExercise): ActiveSession {
  return {
    ...session,
    exercises: session.exercises.map((e) => (e.exerciseId === next.exerciseId ? next : e)),
  };
}

function unchanged(session: ActiveSession): Transition {
  return { session, events: [] };
}

// ---------------------------------------------------------------------------
// 开始训练
// ---------------------------------------------------------------------------

export interface StartSessionInput {
  readonly id: string;
  readonly planId: string | null;
  /** 训练日期 YYYY-MM-DD，由 App 按用户时区生成 */
  readonly date: string;
  readonly startedAt: number;
  /** 本次的动作与目标，目标须已经过 adjustForLayoff */
  readonly exercises: readonly ActiveExercise[];
  readonly unit?: 'kg' | 'lb';
  readonly deload?: boolean;
}

export function startSession(input: StartSessionInput): Transition {
  const exercises = [...input.exercises].sort((a, b) => a.position - b.position);
  const first = exercises[0];
  if (first === undefined) throw new RangeError('开始训练至少要有一个动作');

  const session: ActiveSession = {
    id: input.id,
    planId: input.planId,
    date: input.date,
    startedAt: input.startedAt,
    unit: input.unit ?? 'kg',
    deload: input.deload ?? false,
    currentExerciseId: first.exerciseId,
    exercises,
    sets: [],
    pending: null,
    endedAt: null,
  };
  return { session, events: [{ kind: 'session_started', session }] };
}

// ---------------------------------------------------------------------------
// 完成本组 → 保存
// ---------------------------------------------------------------------------

export interface BeginSetInput {
  /** 当前动作的配置，用来算预填的重量格 */
  readonly exercise: ExerciseConfig;
  /** 点「完成本组」的时间戳 */
  readonly doneAt: number;
}

/** 点「完成本组」：记下时间戳、算好预填、立刻落库。面板已经开着时什么也不做 */
export function beginSet(session: ActiveSession, input: BeginSetInput): Transition {
  if (session.pending !== null || session.endedAt !== null) return unchanged(session);
  const active = findExercise(session, input.exercise.id);
  if (active === undefined) return unchanged(session);

  const setNo = nextSetNo(session, active.exerciseId);
  const pending: PendingSet = {
    exerciseId: active.exerciseId,
    setNo,
    doneAt: input.doneAt,
    prefill: prefillFor({
      exercise: input.exercise,
      target: active.target,
      setNo,
      previousSets: setsOf(session, active.exerciseId),
      appliedHint: appliedHintOf(active),
    }),
  };
  return { session: { ...session, pending }, events: [{ kind: 'set_begun', pending }] };
}

export interface SaveSetInput {
  readonly id: string;
  readonly values: WheelValues;
  readonly savedAt: number;
  readonly closedBy: SaveTrigger;
  readonly note?: string | null;
  readonly tag?: SetTag | null;
}

/**
 * 保存这一组。点确认、关闭面板、再点一次完成本组走的都是这里，区别只记在 closedBy。
 * 顺手结算挂着的那条组间提示：照做了算采纳，点过「应用」又改了算修改，其余算忽略。
 */
export function saveSet(session: ActiveSession, input: SaveSetInput): Transition {
  const pending = session.pending;
  if (pending === null) return unchanged(session);

  const previous = setsOf(session, pending.exerciseId);
  const last = previous.length > 0 ? previous[previous.length - 1] : undefined;
  // 保存不可能早于「完成本组」；时钟回拨时至少把用时算成 0
  const savedAt = Math.max(input.savedAt, pending.doneAt);

  const set: LoggedSet = {
    id: input.id,
    exerciseId: pending.exerciseId,
    setNo: pending.setNo,
    weight: round2(input.values.weight),
    reps: input.values.reps,
    rir: input.values.rir,
    tag: input.tag ?? null,
    note: input.note ?? null,
    prevSetAt: last?.savedAt ?? null,
    doneAt: pending.doneAt,
    savedAt,
    logMs: savedAt - pending.doneAt,
    prefill: pending.prefill,
    closedBy: input.closedBy,
  };

  const events: StoreEvent[] = [{ kind: 'set_saved', set }, { kind: 'pending_cleared' }];
  let next: ActiveSession = { ...session, sets: [...session.sets, set], pending: null };

  // 这条提示是给刚存的这一组的：结算它，然后把卡片收起来，等下一条提示
  const active = findExercise(session, pending.exerciseId);
  const hint = active?.hint ?? null;
  if (active !== undefined && hint !== null && hint.setNo === set.setNo) {
    events.push({
      kind: 'suggestion_decided',
      suggestionId: hint.suggestionId,
      decision: decideHint(hint, input.values),
      decidedAt: savedAt,
    });
    const cleared: ActiveExercise = { ...active, hint: null };
    next = replaceExercise(next, cleared);
    events.push({ kind: 'exercise_state_changed', exercise: cleared });
  }

  return { session: next, events };
}

/**
 * 用户拿这条提示做了什么。只看重量 —— 「应用」改的就是下一组的预填重量。
 * 照着提示的重量练了就算采纳，哪怕没点过「应用」。
 */
export function decideHint(hint: HintState, saved: WheelValues): SuggestionDecision {
  if (sameWeight(saved.weight, hint.weight)) return 'applied';
  return hint.applied ? 'modified' : 'ignored';
}

// ---------------------------------------------------------------------------
// 撤销
// ---------------------------------------------------------------------------

/**
 * 撤回最后保存的一组。超过 5 秒窗口、或者面板又开着了就不撤。
 * 这一组引出过加重提示的话，一并把那次提示退掉，不然引擎会以为本次已经提示过了。
 */
export function undoLastSet(session: ActiveSession, now: number): Transition {
  const last = session.sets.length > 0 ? session.sets[session.sets.length - 1] : undefined;
  if (last === undefined || session.pending !== null) return unchanged(session);
  if (!canUndo(last.savedAt, now)) return unchanged(session);

  const events: StoreEvent[] = [{ kind: 'set_undone', setId: last.id }];
  let next: ActiveSession = { ...session, sets: session.sets.slice(0, -1) };

  const active = findExercise(session, last.exerciseId);
  if (active !== undefined) {
    const increaseHintSetIds = active.increaseHintSetIds.filter((id) => id !== last.id);
    // 挂着的提示要么是这一组引出来的，要么是给这一组的，两种都该收起来
    const hint = active.hint !== null && (active.hint.fromSetNo === last.setNo || active.hint.setNo === last.setNo)
      ? null
      : active.hint;
    if (increaseHintSetIds.length !== active.increaseHintSetIds.length || hint !== active.hint) {
      const rolled: ActiveExercise = { ...active, increaseHintSetIds, hint };
      next = replaceExercise(next, rolled);
      events.push({ kind: 'exercise_state_changed', exercise: rolled });
    }
  }

  return { session: next, events };
}

// ---------------------------------------------------------------------------
// 组间提示
// ---------------------------------------------------------------------------

export interface RecordHintInput {
  readonly exerciseId: string;
  /** 这条提示是看着哪一组给的 */
  readonly fromSet: LoggedSet;
  readonly suggestionId: string;
  readonly ruleId: string;
  readonly kind: string;
  readonly weight: number;
  readonly reps: number;
  readonly ruleVersion: string;
  readonly blockedBy: string | null;
  /** 完整的 SetHint，序列化后原样存下来 */
  readonly payload: string;
  readonly createdAt: number;
}

/**
 * 记下一条刚显示出来的组间提示。
 * 加重提示显示即计数（用户忽略了也算），这是 docs/engine-spec.md 里说好的数法。
 */
export function recordHintShown(session: ActiveSession, input: RecordHintInput): Transition {
  const active = findExercise(session, input.exerciseId);
  if (active === undefined) return unchanged(session);

  const hint: HintState = {
    suggestionId: input.suggestionId,
    fromSetNo: input.fromSet.setNo,
    setNo: input.fromSet.setNo + 1,
    ruleId: input.ruleId,
    kind: input.kind,
    weight: round2(input.weight),
    reps: input.reps,
    applied: false,
  };
  const counted = input.kind === 'increase' && !active.increaseHintSetIds.includes(input.fromSet.id);
  const updated: ActiveExercise = {
    ...active,
    hint,
    increaseHintSetIds: counted ? [...active.increaseHintSetIds, input.fromSet.id] : active.increaseHintSetIds,
  };

  return {
    session: replaceExercise(session, updated),
    events: [
      {
        kind: 'suggestion_shown',
        suggestion: {
          id: input.suggestionId,
          exerciseId: input.exerciseId,
          scope: 'intra',
          setId: input.fromSet.id,
          ruleVersion: input.ruleVersion,
          ruleId: input.ruleId,
          kind: input.kind,
          reason: null,
          blockedBy: input.blockedBy,
          payload: input.payload,
          decision: 'shown',
          createdAt: input.createdAt,
        },
      },
      { kind: 'exercise_state_changed', exercise: updated },
    ],
  };
}

/** 点「应用」：只改下一组的预填，已保存的组一个都不动 */
export function applyHint(session: ActiveSession, exerciseId: string, decidedAt: number): Transition {
  const active = findExercise(session, exerciseId);
  if (active === undefined || active.hint === null || active.hint.applied) return unchanged(session);

  const updated: ActiveExercise = { ...active, hint: { ...active.hint, applied: true } };
  return {
    session: replaceExercise(session, updated),
    events: [
      { kind: 'suggestion_decided', suggestionId: active.hint.suggestionId, decision: 'applied', decidedAt },
      { kind: 'exercise_state_changed', exercise: updated },
    ],
  };
}

// ---------------------------------------------------------------------------
// 切换动作 / 结束
// ---------------------------------------------------------------------------

/** 切换动作：已练的组保留，计时继续 */
export function switchExercise(session: ActiveSession, exerciseId: string): Transition {
  if (session.currentExerciseId === exerciseId) return unchanged(session);
  if (findExercise(session, exerciseId) === undefined) return unchanged(session);
  return {
    session: { ...session, currentExerciseId: exerciseId },
    events: [{ kind: 'current_exercise_changed', exerciseId }],
  };
}

export function endSession(session: ActiveSession, endedAt: number): Transition {
  if (session.endedAt !== null) return unchanged(session);
  const events: StoreEvent[] = [];
  if (session.pending !== null) events.push({ kind: 'pending_cleared' });
  events.push({ kind: 'session_ended', endedAt });
  return { session: { ...session, pending: null, endedAt }, events };
}
