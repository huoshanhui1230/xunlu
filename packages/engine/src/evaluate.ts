/**
 * 对照次数区间评估一次训练（达标、失败、离加重还差几次），以及长时间没练后重新起算的历史。
 */
import { DEFAULT_PARAMS, type EngineParams } from './params';
import type { ExerciseConfig, ExerciseSession, RepRange, SetRecord } from './types';
import { bestE1rmOf, countedSets, workingWeightOf } from './sets';
import { clamp, daysBetween, sameWeight } from './math';

export interface SessionEval {
  readonly workingWeight: number;
  /** 工作重量下的组，按完成顺序 */
  readonly workingSets: readonly SetRecord[];
  /** 本次全部参与判断的组 */
  readonly countedSets: readonly SetRecord[];
  readonly range: RepRange;
  /** 每个工作组都做到了上限 */
  readonly hitAll: boolean;
  /** 不允许的力竭组数：最后两组以外 RIR 为 0 的组 */
  readonly disallowedRirZero: number;
  /**
   * 达标：最后两个工作组做到上限，或力竭（RIR 0）且做到下限；
   * 其余工作组做到上限且没有力竭；工作重量以外的组只有排在最后两组时允许力竭。
   */
  readonly achieved: boolean;
  /** 失败 = 任一组低于下限，且该组 RIR 为 0 或没填 */
  readonly failure: boolean;
  /** 离加重还差：各工作组的差距之和（最后两组力竭时按下限算） */
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
  const relaxedFrom = working.length - p.relaxedLastSets;
  const tailFrom = counted.length - p.relaxedLastSets;

  let disallowed = 0;
  counted.forEach((s, i) => {
    if (s.rir !== 0) return;
    const wi = working.indexOf(s);
    if ((wi >= 0 && wi >= relaxedFrom) || i >= tailFrom) return;
    disallowed += 1;
  });
  const met = working.every((s, i) =>
    i >= relaxedFrom
      ? s.reps >= range.max || (s.rir === 0 && s.reps >= range.min)
      : s.reps >= range.max && s.rir !== 0,
  );

  return {
    workingWeight: ww,
    workingSets: working,
    countedSets: counted,
    range,
    hitAll: working.every((s) => s.reps >= range.max),
    disallowedRirZero: disallowed,
    achieved: met && disallowed === 0,
    failure: counted.some((s) => s.reps < range.min && (s.rir === null || s.rir === undefined || s.rir === 0)),
    gapToIncrease: gapFor(working, range, p),
    bestE1rm: bestE1rmOf(ex, counted, p.e1rmMaxReps),
  };
}

/** 离加重还差：最后两组力竭时按下限算，其余按上限算 */
export function gapFor(working: readonly SetRecord[], range: RepRange, p: EngineParams = DEFAULT_PARAMS): number {
  const relaxedFrom = working.length - p.relaxedLastSets;
  return working.reduce((acc, s, i) => {
    const need = i >= relaxedFrom && s.rir === 0 ? range.min : range.max;
    return acc + Math.max(0, need - s.reps);
  }, 0);
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

export interface HistoryWindow {
  /** 此前参与进阶判断的训练（不含减载周），按日期从旧到新 */
  readonly prior: readonly ExerciseSession[];
  /** 最近一次长时间没练之后的训练：连续达标、失败、平台期只看这些 */
  readonly active: readonly ExerciseSession[];
  /** 距上次练这个动作的天数（减载周也算练过）；没练过为 null */
  readonly gapDays: number | null;
}

/**
 * 把历史切成"当前训练段"：两次训练之间超过 layoff.days1 天就从后一次重新起算。
 * 本次距上次已超过这个天数时，当前训练段为空（本次是回归后的第一次）。
 */
export function activeHistory(
  history: readonly ExerciseSession[],
  session: ExerciseSession,
  p: EngineParams = DEFAULT_PARAMS,
): HistoryWindow {
  const trained = history
    .filter((s) => s.date <= session.date && countedSets(s).length > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const prior = trained.filter((s) => s.deload !== true);
  const last = trained[trained.length - 1];
  if (!last) return { prior, active: [], gapDays: null };
  const gapDays = daysBetween(last.date, session.date);
  if (gapDays > p.layoff.days1) return { prior, active: [], gapDays };
  let start = last.date;
  for (let i = trained.length - 2; i >= 0; i--) {
    const a = trained[i] as ExerciseSession;
    const b = trained[i + 1] as ExerciseSession;
    if (daysBetween(a.date, b.date) > p.layoff.days1) break;
    start = a.date;
  }
  return { prior, active: prior.filter((s) => s.date >= start), gapDays };
}

/** 下次目标的组数：计划组数，没有计划时按本次工作组数，限制在 1 到上限之间 */
export function plannedSetsFor(ex: ExerciseConfig, workingSetCount: number, p: EngineParams = DEFAULT_PARAMS): number {
  return clamp(Math.round(ex.plannedSets ?? workingSetCount), 1, p.maxSetsPerExercise);
}
