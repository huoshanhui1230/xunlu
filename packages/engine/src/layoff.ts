/**
 * B2 回归：很久没练后先减重。
 *
 * 开始训练时（预填之前）调用 adjustForLayoff，让回归后的第一次训练就变轻；
 * 训练后的第 2 条规则只在本次没按减过的重量练时才触发，不会重复减。
 */
import { DEFAULT_PARAMS, type EngineParams } from './params';
import type { ExerciseConfig, Target } from './types';
import { reduceLoad } from './load';
import { daysBetween } from './math';

/** 按距上次训练的天数给出减重比例：超过 28 天减 20%，超过 14 天减 10%，否则不减 */
export function layoffCut(gapDays: number, p: EngineParams = DEFAULT_PARAMS): number {
  if (gapDays > p.layoff.days2) return p.layoff.cut2;
  if (gapDays > p.layoff.days1) return p.layoff.cut1;
  return 0;
}

export interface LayoffInput {
  readonly exercise: ExerciseConfig;
  /** 存着的下次目标 */
  readonly target: Target;
  /** 上次做这个动作的日期 */
  readonly lastSessionDate: string;
  readonly today: string;
  readonly params?: EngineParams;
}

export interface LayoffResult {
  readonly target: Target;
  readonly adjusted: boolean;
  readonly gapDays: number;
  readonly cut: number;
}

export function adjustForLayoff(input: LayoffInput): LayoffResult {
  const p = input.params ?? DEFAULT_PARAMS;
  const gapDays = daysBetween(input.lastSessionDate, input.today);
  const cut = layoffCut(gapDays, p);
  const t = input.target;
  if (cut === 0 || t.layoffAdjusted === true) return { target: t, adjusted: false, gapDays, cut };

  const ex = input.exercise;
  const base = ex.repRange;
  const next = reduceLoad(ex, t.weight, cut);
  const target: Target =
    next === null
      ? {
          ...t,
          reps: t.reps.map((r) => Math.max(1, Math.floor(r * (1 - cut)))),
          repRange: base,
          extended: false,
          layoffAdjusted: true,
        }
      : {
          ...t,
          weight: next,
          reps: t.reps.map((r) => Math.max(1, Math.min(r, base.max))),
          repRange: base,
          extended: false,
          layoffAdjusted: true,
        };
  return { target, adjusted: true, gapDays, cut };
}
