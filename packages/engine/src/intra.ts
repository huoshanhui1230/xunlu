/**
 * A. 组间提示（训练中）
 *
 * 每组保存反馈后，按刚完成的这一组给下一组一个提示，只影响本次训练；下次目标由训练后规则另算。
 *
 * RIR：本组没填就沿用本次该动作上一组填过的值；每个动作第 1 组没有可沿用的值时，
 * 先提示用户填写（A0）。关闭 RIR 记录时不提示，只按次数判断。
 *
 * 从上往下判断，取第一条命中的：
 *   A1 能完成的次数 ≥ ceil(次数上限 × 1.5)
 *        一档在加重上限内 → 加一档，给具体重量，次数目标回到下限（点"应用"才改预填）
 *        一档超过上限、无法确认幅度或增量为 0 → 只提醒可以加重或多做几次，不给数值
 *   A2 次数 < 上限，且 RIR ≥ 3                     → 重量不变，多做 1–2 次
 *   A3 次数 < 下限，且 RIR 为 0（RIR 未知视同 0）   → 减一档
 *   A4 其余                                         → 保持
 * 不提示加重的情况：减载周、本次该动作已经加过重、同一重量已有 2 组力竭且次数在下限。
 * 减载周只会减重或保持。
 */
import { DEFAULT_PARAMS, type EngineParams } from './params';
import type { ExerciseConfig, IntraBlock, NudgeReason, RepRange, RirSource, SetHint, SetRecord } from './types';
import { canMeasurePct, isHarder, isRepsOnly, stepEasier, stepHarder, weightChange } from './load';
import { EPS, sameWeight } from './math';
import { checkSetHint } from './guardrails';

export interface IntraInput {
  readonly exercise: ExerciseConfig;
  /** 刚完成的这一组 */
  readonly set: SetRecord;
  /** 本次生效的次数区间；默认用动作配置的区间 */
  readonly repRange?: RepRange;
  /** 本次该动作在这组之前完成的组，按完成顺序 */
  readonly earlierSets?: readonly SetRecord[];
  readonly inDeload?: boolean;
  /** 是否显示 RIR（设置里可以关闭"RIR 显示"），默认 true */
  readonly rirEnabled?: boolean;
  readonly params?: EngineParams;
}

/** 提示加重的门槛：ceil(次数上限 × 1.5)，例如 6–8 次 → 12 次 */
export function increaseThreshold(range: RepRange, p: EngineParams = DEFAULT_PARAMS): number {
  return Math.ceil(range.max * p.intra.capacityFactor - EPS);
}

/** 组间提示用的 RIR：本组填了用本组；没填沿用本次该动作上一组填过的值；都没有为 null */
export function resolveRir(
  input: Pick<IntraInput, 'set' | 'earlierSets' | 'rirEnabled'>,
): { readonly rir: number | null; readonly source: RirSource } {
  const own = input.set.rir;
  if (own !== null && own !== undefined) return { rir: own, source: 'entered' };
  if (input.rirEnabled === false) return { rir: null, source: 'none' };
  const earlier = input.earlierSets ?? [];
  for (let i = earlier.length - 1; i >= 0; i--) {
    const r = (earlier[i] as SetRecord).rir;
    if (r !== null && r !== undefined) return { rir: r, source: 'previous' };
  }
  return { rir: null, source: 'none' };
}

/** 本次该动作已经加过几次重：按完成顺序，比此前最重的一组更重算一次（带标签的组不算） */
export function increasesInSession(ex: ExerciseConfig, sets: readonly SetRecord[]): number {
  let count = 0;
  let hardest: number | null = null;
  for (const s of sets) {
    if (s.tag) continue;
    if (hardest === null) hardest = s.weight;
    else if (isHarder(ex, s.weight, hardest)) {
      count += 1;
      hardest = s.weight;
    }
  }
  return count;
}

export function suggestNextSet(input: IntraInput): SetHint {
  const p = input.params ?? DEFAULT_PARAMS;
  const hint = decide(input, p);
  if (checkSetHint(input, hint, p).length === 0) return hint;
  // 护栏兜底：正常不会走到这里
  const range = input.repRange ?? input.exercise.repRange;
  const w = input.set.weight;
  return {
    ruleId: 'A4',
    kind: 'hold',
    weight: w,
    reps: { low: range.min, high: range.max },
    capacity: hint.capacity,
    threshold: hint.threshold,
    rirSource: hint.rirSource,
    change: weightChange(input.exercise, w, w),
    increaseBlockedBy: 'guardrail',
    basis: ['product'],
    ruleVersion: p.ruleVersion,
  };
}

function decide(input: IntraInput, p: EngineParams): SetHint {
  const ex = input.exercise;
  const range = input.repRange ?? ex.repRange;
  const set = input.set;
  const w = set.weight;
  const threshold = increaseThreshold(range, p);
  const { rir, source } = resolveRir(input);
  const same = weightChange(ex, w, w);

  if (rir === null && input.rirEnabled !== false) {
    return {
      ruleId: 'A0',
      kind: 'need_rir',
      weight: w,
      capacity: set.reps,
      threshold,
      rirSource: 'none',
      change: same,
      basis: ['product'],
      ruleVersion: p.ruleVersion,
    };
  }

  const capacity = set.reps + (rir ?? 0);
  const common = { capacity, threshold, rirSource: source, ruleVersion: p.ruleVersion };
  const failing = set.reps < range.min && (rir === null || rir === 0);
  const decrease = (): SetHint | null => {
    const next = stepEasier(ex, w);
    if (next === null) return null;
    return {
      ...common,
      ruleId: 'A3',
      kind: 'decrease',
      weight: next,
      reps: { low: range.min, high: range.max },
      change: weightChange(ex, w, next),
      basis: ['Helms2016'],
    };
  };
  const hold = (blocked: IntraBlock | undefined, basis: SetHint['basis']): SetHint => ({
    ...common,
    ...(blocked === undefined ? {} : { increaseBlockedBy: blocked }),
    ruleId: 'A4',
    kind: 'hold',
    weight: w,
    reps: { low: range.min, high: range.max },
    change: same,
    basis,
  });

  // 减载周：只会减重或保持
  if (input.inDeload === true) {
    return (failing ? decrease() : null) ?? hold(capacity >= threshold ? 'deload' : undefined, ['Bell2023']);
  }

  let blocked: IntraBlock | undefined;
  if (capacity >= threshold) {
    blocked = increaseBlock(input, range, p);
    if (blocked === undefined) {
      const reason = nudgeReasonFor(ex, w);
      if (reason === undefined) {
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
      const directions: ReadonlyArray<'weight' | 'reps'> =
        reason === 'reps_only' || reason === 'assistance_done' ? ['reps'] : ['weight', 'reps'];
      return {
        ...common,
        ruleId: 'A1',
        kind: 'nudge',
        weight: w,
        nudge: directions,
        nudgeReason: reason,
        change: same,
        basis: ['Helms2016', 'product'],
      };
    }
  }

  if (rir !== null && set.reps < range.max && rir >= p.intra.moreRepsMinRir) {
    return {
      ...common,
      ...(blocked === undefined ? {} : { increaseBlockedBy: blocked }),
      ruleId: 'A2',
      kind: 'add_reps',
      weight: w,
      reps: { low: set.reps + 1, high: Math.min(set.reps + 2, range.max) },
      change: same,
      basis: ['Helms2016'],
    };
  }

  return (failing ? decrease() : null) ?? hold(blocked, ['product']);
}

/** 本次已经加过重，或同一重量已有 2 组力竭且次数在下限：不提示加重 */
function increaseBlock(input: IntraInput, range: RepRange, p: EngineParams): IntraBlock | undefined {
  const all = [...(input.earlierSets ?? []), input.set].filter((s) => !s.tag);
  if (increasesInSession(input.exercise, all) >= p.intra.maxIncreasesPerSession) return 'already_increased';
  const atMinFailures = all.filter(
    (s) => sameWeight(s.weight, input.set.weight) && s.rir === 0 && s.reps <= range.min,
  ).length;
  if (atMinFailures >= p.intra.failureSetsAtMin) return 'to_failure';
  return undefined;
}

/** 一档超过上限、无法确认幅度、增量为 0 或助力已是 0：只提醒方向 */
function nudgeReasonFor(ex: ExerciseConfig, w: number): NudgeReason | undefined {
  if (isRepsOnly(ex)) return 'reps_only';
  const next = stepHarder(ex, w);
  if (next === null) return 'assistance_done';
  if (!canMeasurePct(ex) || !(w > 0)) return 'cap_unverifiable';
  if ((next - w) / w > ex.maxIncreasePct + EPS) return 'step_exceeds_cap';
  return undefined;
}
