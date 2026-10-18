/**
 * 对照次数区间评估一次训练：达标、失败、离加重还差几次。
 */
import { DEFAULT_PARAMS, type EngineParams } from './params';
import type { ExerciseConfig, ExerciseSession, RepRange, SetRecord } from './types';
import { bestE1rmOf, countedSets, workingWeightOf } from './sets';
import { clamp, sameWeight } from './math';

export interface SessionEval {
  readonly workingWeight: number;
  /** 工作重量下的组，按完成顺序 */
  readonly workingSets: readonly SetRecord[];
  /** 本次全部参与判断的组 */
  readonly countedSets: readonly SetRecord[];
  readonly range: RepRange;
  /** 每个工作组都做到了上限 */
  readonly hitAll: boolean;
  /** 本次任一组 RIR 为 0 */
  readonly anyRirZero: boolean;
  /** 工作重量下 RIR 为 0 的组数 */
  readonly rirZeroAtWorking: number;
  /** 达标 = 每个工作组都到上限，且本次没有 RIR 为 0 的组 */
  readonly achieved: boolean;
  /** 失败 = 任一组低于下限，且该组 RIR 为 0 或没填 */
  readonly failure: boolean;
  /** 离加重还差 = 各工作组距上限的差之和 */
  readonly gapToIncrease: number;
  readonly bestE1rm: number | null;
}

export function evaluateSession(
  ex: ExerciseConfig,
  session: ExerciseSession,
  range: RepRange,
  p: EngineParams = DEFAULT_PARAMS,
): SessionEval | null {
  const counted = countedSets(session);
  const ww = workingWeightOf(ex, counted);
  if (ww === null) return null;
  const working = counted.filter((s) => sameWeight(s.weight, ww));
  const hitAll = working.every((s) => s.reps >= range.max);
  const anyRirZero = counted.some((s) => s.rir === 0);
  return {
    workingWeight: ww,
    workingSets: working,
    countedSets: counted,
    range,
    hitAll,
    anyRirZero,
    rirZeroAtWorking: working.filter((s) => s.rir === 0).length,
    achieved: hitAll && !anyRirZero,
    failure: counted.some((s) => s.reps < range.min && (s.rir === null || s.rir === undefined || s.rir === 0)),
    gapToIncrease: working.reduce((acc, s) => acc + Math.max(0, range.max - s.reps), 0),
    bestE1rm: bestE1rmOf(ex, counted, p.e1rmMaxReps),
  };
}

/** 每组都填了 RIR 且不低于 n */
export function allRirAtLeast(sets: readonly SetRecord[], n: number): boolean {
  return sets.length > 0 && sets.every((s) => s.rir !== null && s.rir !== undefined && s.rir >= n);
}

/** 次数上限 +3 后的区间 */
export function extendRange(base: RepRange, p: EngineParams = DEFAULT_PARAMS): RepRange {
  return { min: base.min, max: base.max + p.progression.extendRepsBy };
}

/** 此前参与进阶判断的训练：去掉减载周和没有有效组的 */
export function priorSessions(history: readonly ExerciseSession[]): ExerciseSession[] {
  return history.filter((s) => !s.deload && countedSets(s).length > 0);
}

/** 下次目标的组数：计划组数，没有计划时按本次工作组数，限制在 1 到上限之间 */
export function plannedSetsFor(ex: ExerciseConfig, workingSetCount: number, p: EngineParams = DEFAULT_PARAMS): number {
  return clamp(Math.round(ex.plannedSets ?? workingSetCount), 1, p.maxSetsPerExercise);
}
