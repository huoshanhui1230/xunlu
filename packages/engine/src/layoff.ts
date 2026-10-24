/**
 * 回归：很久没练后，开始训练时（预填之前）先给出减重建议，并提示用户减重或重新测试。
 *
 * 减重只是建议，记录时用户可以自己改重量。训练后不再减重：
 * 回归后的第一次以这次实际练的表现为新基准（见 post.ts 的 B2）。
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
  /** 建议的目标：长时间没练时减了重量（只是建议，记录时可以改） */
  readonly target: Target;
  /** 原来的目标：用户选"重新测试"时用 */
  readonly previous: Target;
  readonly adjusted: boolean;
  readonly gapDays: number;
  readonly cut: number;
  /** 需要提示用户：建议减重，或按原重量重新测试 */
  readonly notice?: 'reduce_or_retest';
}

export function adjustForLayoff(input: LayoffInput): LayoffResult {
  const p = input.params ?? DEFAULT_PARAMS;
  const gapDays = daysBetween(input.lastSessionDate, input.today);
  const cut = layoffCut(gapDays, p);
  const t = input.target;
  if (cut === 0 || t.layoffAdjusted === true) {
    return { target: t, previous: t, adjusted: false, gapDays, cut };
  }

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
  return { target, previous: t, adjusted: true, gapDays, cut, notice: 'reduce_or_retest' };
}
