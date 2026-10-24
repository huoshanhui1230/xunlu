/**
 * 反馈面板的预填与滚轮选项。
 *
 * 预填的规矩（从上往下取第一条命中的）：
 *   1. 刚点过「应用」，且提示就是给这一组的 → 用提示的重量和次数
 *   2. 本次该动作已经记过组 → 用上一组的值（最省事：练法没变就直接确认）
 *   3. 本动作的第一组 → 用本次目标
 *
 * 还能再做几次（RIR）跟着上一组走，上一组没填就保持没填。
 * **每个动作第 1 组不预填 RIR** —— 要用户自己填一次，之后的组才有值可沿用；
 * 没填时引擎会返回 A0，提示补填（见 docs/engine-spec.md 的 A 节）。
 *
 * 重量按动作的默认增量取值，所以滚轮转一格就是加一片。增量为 0 的动作（俯卧撑、卷腹）
 * 只有一个重量可选，只改次数。
 */
import { round2, type ExerciseConfig } from '@xunlu/engine';
import type { Target } from '@xunlu/engine';
import type { AppliedHint, LoggedSet, WheelValues } from './types';

/** 重量滚轮上下各留几格 */
const WEIGHT_SPAN = 20;

/** 次数滚轮的范围 */
const REPS_MIN = 1;
const REPS_MAX = 50;

/** 还能再做几次的范围 */
const RIR_MIN = 0;
const RIR_MAX = 10;

export interface PrefillInput {
  readonly exercise: ExerciseConfig;
  /** 本次目标（开始训练时已经过 adjustForLayoff） */
  readonly target: Target;
  /** 要记的是该动作的第几组，从 1 起 */
  readonly setNo: number;
  /** 本次该动作已保存的组，按顺序 */
  readonly previousSets: readonly LoggedSet[];
  /** 点过「应用」的提示；没点过为 null */
  readonly appliedHint: AppliedHint | null;
}

/** 本次目标里第 n 组该做几次；超过计划组数就沿用最后一组 */
export function targetRepsFor(target: Target, setNo: number): number {
  if (target.reps.length === 0) return target.repRange.max;
  const index = Math.min(Math.max(setNo, 1), target.reps.length) - 1;
  return target.reps[index] ?? target.repRange.max;
}

export function prefillFor(input: PrefillInput): WheelValues {
  const { target, setNo, previousSets, appliedHint } = input;
  const applied = appliedHint !== null && appliedHint.setNo === setNo ? appliedHint : null;
  const last = previousSets.length > 0 ? previousSets[previousSets.length - 1] : undefined;

  const weight = applied?.weight ?? last?.weight ?? target.weight;
  const reps = applied?.reps ?? last?.reps ?? targetRepsFor(target, setNo);
  // 第 1 组不预填 RIR；之后沿用上一组，上一组没填就继续不填
  const rir = last !== undefined ? last.rir : null;

  return { weight: round2(weight), reps, rir };
}

/**
 * 重量滚轮的选项：以当前值为中心，按增量上下各排 WEIGHT_SPAN 格，不低于 0。
 * 增量为 0 的动作只有当前这一个值。
 */
export function weightOptions(exercise: ExerciseConfig, center: number, span: number = WEIGHT_SPAN): number[] {
  const base = round2(Number.isFinite(center) && center > 0 ? center : 0);
  const step = exercise.increment;
  if (!(step > 0)) return [base];

  const out: number[] = [];
  for (let k = -span; k <= span; k += 1) {
    const value = round2(base + k * step);
    if (value >= 0) out.push(value);
  }
  return out;
}

export function repOptions(): number[] {
  const out: number[] = [];
  for (let r = REPS_MIN; r <= REPS_MAX; r += 1) out.push(r);
  return out;
}

export function rirOptions(): number[] {
  const out: number[] = [];
  for (let r = RIR_MIN; r <= RIR_MAX; r += 1) out.push(r);
  return out;
}

/** 滚轮该停在第几行：找最接近的那个值，找不到就停在第一行 */
export function optionIndex(options: readonly number[], value: number | null): number {
  if (value === null || options.length === 0) return 0;
  let best = 0;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let i = 0; i < options.length; i += 1) {
    const option = options[i];
    if (option === undefined) continue;
    const gap = Math.abs(option - value);
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  }
  return best;
}

/** 用户有没有改过预填值：改过的要在 suggestions 里记成「修改」而不是「采纳」 */
export function differsFromPrefill(prefill: WheelValues, saved: WheelValues): boolean {
  return prefill.weight !== saved.weight || prefill.reps !== saved.reps || prefill.rir !== saved.rir;
}
