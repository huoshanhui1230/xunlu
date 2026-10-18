/**
 * 减载周方案：组数减约 1/3 到 1/2、每组多留 2–3 次余力、重量不变，频率和动作不变，持续约 1 周
 * （Bell 2023 的定义；Rogerson 2024 调查中的常见做法）。
 */
import { DEFAULT_PARAMS, type EngineParams } from './params';
import type { Target } from './types';
import { addDays, EPS } from './math';

export interface DeloadItem {
  readonly exerciseId: string;
  readonly target: Target;
}

export interface DeloadInput {
  /** 减载第一天 */
  readonly start: string;
  /** 各动作减载前的目标 */
  readonly items: readonly DeloadItem[];
  readonly params?: EngineParams;
}

export interface DeloadPlan {
  readonly start: string;
  /** 减载最后一天（含） */
  readonly end: string;
  readonly items: readonly DeloadItem[];
  readonly ruleVersion: string;
}

export function planDeload(input: DeloadInput): DeloadPlan {
  const p = input.params ?? DEFAULT_PARAMS;
  return {
    start: input.start,
    end: addDays(input.start, p.deload.days - 1),
    items: input.items.map(({ exerciseId, target }) => {
      const sets = Math.max(1, Math.ceil(target.sets * p.deload.setFactor - EPS));
      return {
        exerciseId,
        target: {
          ...target,
          sets,
          reps: Array.from({ length: sets }, () => target.repRange.min),
          targetRir: target.targetRir + p.deload.extraRir,
        },
      };
    }),
    ruleVersion: p.ruleVersion,
  };
}

export function isInDeload(
  active: { readonly start: string; readonly end: string } | null | undefined,
  today: string,
): boolean {
  return active !== null && active !== undefined && active.start <= today && today <= active.end;
}
