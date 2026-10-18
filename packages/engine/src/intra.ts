/**
 * A. 组间提示（训练中）
 *
 * 每组保存反馈后，按刚完成的这一组给下一组一个提示：只建议一档、可以忽略，
 * 点"应用"才改下一组的预填。只影响本次训练，下次目标由训练后规则另算。
 *
 * 从上往下判断，取第一条命中的：
 *   A1 能完成的次数 ≥ ceil(次数上限 × 1.5)        → 加一档，次数目标回到下限
 *   A2 次数 < 上限，且 RIR ≥ 3                     → 重量不变，多做 1–2 次
 *   A3 次数 < 下限，且 RIR 为 0（没填视同 0）       → 减一档
 *   A4 其余                                         → 保持
 * A1 被护栏挡住时（保守模式、减载、本次已提示过加重、力竭组过多、一档超过上限等）继续往下判断。
 */
import { DEFAULT_PARAMS, type EngineParams } from './params';
import type { ExerciseConfig, IntraBlock, RepRange, SetHint, SetRecord, Settings } from './types';
import { canMeasurePct, isRepsOnly, stepEasier, stepHarder, weightChange } from './load';
import { EPS, sameWeight } from './math';
import { checkSetHint } from './guardrails';

export interface IntraInput {
  readonly exercise: ExerciseConfig;
  /** 刚完成的这一组 */
  readonly set: SetRecord;
  readonly settings: Settings;
  /** 本次生效的次数区间；默认用动作配置的区间 */
  readonly repRange?: RepRange;
  /** 本次该动作在这组之前完成的组 */
  readonly earlierSets?: readonly SetRecord[];
  /** 本次该动作已出过几次加重提示（建议按已显示计，忽略了也算） */
  readonly increaseHintsUsed?: number;
  readonly inDeload?: boolean;
  readonly params?: EngineParams;
}

/** 提示加重的门槛：ceil(次数上限 × 1.5)，例如 6–8 次 → 12 次 */
export function increaseThreshold(range: RepRange, p: EngineParams = DEFAULT_PARAMS): number {
  return Math.ceil(range.max * p.intra.capacityFactor - EPS);
}

export function suggestNextSet(input: IntraInput): SetHint {
  const p = input.params ?? DEFAULT_PARAMS;
  const hint = decide(input, p);
  if (checkSetHint(input, hint, p).length === 0) return hint;
  // 护栏兜底：正常不会走到这里
  const range = input.repRange ?? input.exercise.repRange;
  const w = input.set.weight;
  return {
    ...hint,
    ruleId: 'A4',
    kind: 'hold',
    weight: w,
    reps: { low: range.min, high: range.max },
    change: weightChange(input.exercise, w, w),
    increaseBlockedBy: 'guardrail',
    basis: ['product'],
  };
}

function decide(input: IntraInput, p: EngineParams): SetHint {
  const ex = input.exercise;
  const range = input.repRange ?? ex.repRange;
  const set = input.set;
  const w = set.weight;
  const rirKnown = set.rir !== null && set.rir !== undefined;
  const rir = rirKnown ? (set.rir as number) : 0;
  const capacity = set.reps + rir;
  const threshold = increaseThreshold(range, p);
  const common = { capacity, threshold, rirKnown, ruleVersion: p.ruleVersion };

  let blocked: IntraBlock | undefined;
  if (capacity >= threshold) {
    blocked = increaseBlock(input, p);
    if (blocked === undefined) {
      const next = stepHarder(ex, w) as number;
      return {
        ...common,
        ruleId: 'A1',
        kind: 'increase',
        weight: next,
        reps: { low: range.min, high: range.min },
        change: weightChange(ex, w, next),
        basis: ['Helms2016', 'product'],
      };
    }
  }
  const blockedInfo = blocked === undefined ? {} : { increaseBlockedBy: blocked };

  if (rirKnown && set.reps < range.max && rir >= p.intra.moreRepsMinRir) {
    return {
      ...common,
      ...blockedInfo,
      ruleId: 'A2',
      kind: 'add_reps',
      weight: w,
      reps: { low: set.reps + 1, high: Math.min(set.reps + 2, range.max) },
      change: weightChange(ex, w, w),
      basis: ['Helms2016'],
    };
  }

  if (set.reps < range.min && (!rirKnown || rir === 0)) {
    const next = stepEasier(ex, w);
    if (next !== null) {
      return {
        ...common,
        ...blockedInfo,
        ruleId: 'A3',
        kind: 'decrease',
        weight: next,
        reps: { low: range.min, high: range.max },
        change: weightChange(ex, w, next),
        basis: ['Helms2016'],
      };
    }
  }

  return {
    ...common,
    ...blockedInfo,
    ruleId: 'A4',
    kind: 'hold',
    weight: w,
    reps: { low: range.min, high: range.max },
    change: weightChange(ex, w, w),
    basis: ['product'],
  };
}

function increaseBlock(input: IntraInput, p: EngineParams): IntraBlock | undefined {
  const ex = input.exercise;
  const set = input.set;
  if (input.settings.conservative) return 'conservative';
  if (input.inDeload === true) return 'deload';
  if ((input.increaseHintsUsed ?? 0) >= p.intra.maxIncreaseHints) return 'limit_reached';
  const failureSets = [...(input.earlierSets ?? []), set].filter(
    (s) => !s.tag && sameWeight(s.weight, set.weight) && s.rir === 0,
  ).length;
  if (failureSets >= p.maxFailureSets) return 'to_failure';
  if (isRepsOnly(ex)) return 'reps_only';
  const next = stepHarder(ex, set.weight);
  if (next === null) return 'assistance_done';
  if (!canMeasurePct(ex) || !(set.weight > 0)) return 'cap_unverifiable';
  if ((next - set.weight) / set.weight > ex.maxIncreasePct + EPS) return 'step_exceeds_cap';
  return undefined;
}
