/**
 * App 被系统杀掉后重开，把库里读回来的行拼成进行中的训练。
 *
 * 要应付的情况：
 *   - 组的顺序乱了（按保存时间重排，组号按实际顺序重编）
 *   - 当前动作不在本次计划里（退回最后记过的那个动作，再退回第一个）
 *   - 面板开着时被杀掉（待保存的那一组还在，重开后接着记）
 *   - 那一组其实已经存过了（待保存的记录是残留，丢掉）
 */
import type { ActiveExercise, ActiveSession, LoggedSet, PendingSet } from './types';

export interface RestoreInput {
  readonly id: string;
  readonly planId: string | null;
  readonly date: string;
  readonly startedAt: number;
  readonly unit: 'kg' | 'lb';
  readonly deload: boolean;
  readonly currentExerciseId: string | null;
  readonly exercises: readonly ActiveExercise[];
  /** 没被撤销的组 */
  readonly sets: readonly LoggedSet[];
  readonly pending: PendingSet | null;
  readonly endedAt: number | null;
}

export function restoreSession(input: RestoreInput): ActiveSession {
  const exercises = [...input.exercises].sort((a, b) => a.position - b.position);
  const first = exercises[0];
  if (first === undefined) throw new RangeError('这次训练一个动作都没有，无法恢复');

  const known = new Set(exercises.map((e) => e.exerciseId));
  const sets = renumber(
    [...input.sets].filter((s) => known.has(s.exerciseId)).sort((a, b) => a.savedAt - b.savedAt),
  );

  const lastSet = sets.length > 0 ? sets[sets.length - 1] : undefined;
  const currentExerciseId =
    input.currentExerciseId !== null && known.has(input.currentExerciseId)
      ? input.currentExerciseId
      : (lastSet?.exerciseId ?? first.exerciseId);

  return {
    id: input.id,
    planId: input.planId,
    date: input.date,
    startedAt: input.startedAt,
    unit: input.unit,
    deload: input.deload,
    currentExerciseId,
    exercises,
    sets,
    pending: restorePending(input.pending, sets, known),
    endedAt: input.endedAt,
  };
}

/** 组号按每个动作的实际顺序重编，中间撤销过也不留空号 */
function renumber(sets: readonly LoggedSet[]): LoggedSet[] {
  const counts = new Map<string, number>();
  const lastSavedAt = new Map<string, number>();
  return sets.map((set) => {
    const setNo = (counts.get(set.exerciseId) ?? 0) + 1;
    counts.set(set.exerciseId, setNo);
    const prevSetAt = lastSavedAt.get(set.exerciseId) ?? null;
    lastSavedAt.set(set.exerciseId, set.savedAt);
    return setNo === set.setNo && prevSetAt === set.prevSetAt ? set : { ...set, setNo, prevSetAt };
  });
}

/**
 * 待保存的那一组还算不算数：动作要在本次计划里，而且这一组确实还没存过。
 * 组号顺延到当前实际的下一组，免得被杀掉前后差了一组。
 */
function restorePending(
  pending: PendingSet | null,
  sets: readonly LoggedSet[],
  known: ReadonlySet<string>,
): PendingSet | null {
  if (pending === null || !known.has(pending.exerciseId)) return null;
  const done = sets.filter((s) => s.exerciseId === pending.exerciseId).length;
  if (pending.setNo <= done) return null;
  return pending.setNo === done + 1 ? pending : { ...pending, setNo: done + 1 };
}
