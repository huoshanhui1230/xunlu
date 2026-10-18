/**
 * 硬性护栏：任何规则都不能越过（方案第八节"硬性护栏"）。
 *
 * 规则模块算出结果后再用这里独立复核一遍；不通过就退回"保持"，并带上 violations。
 * 正常情况下不会触发，测试里用随机输入保证这一点。
 */
import { DEFAULT_PARAMS, type EngineParams } from './params';
import type { IntraInput } from './intra';
import type { PostInput } from './post';
import type { ExerciseConfig, SetHint, Suggestion } from './types';
import { allRirAtLeast, evaluateSession, extendRange, plannedSetsFor, priorSessions } from './evaluate';
import { canMeasurePct, isHarder, isRepsOnly, stepHarder } from './load';
import { EPS, sameWeight } from './math';

/** 复核组间提示 */
export function checkSetHint(input: IntraInput, h: SetHint, p: EngineParams = DEFAULT_PARAMS): string[] {
  const v: string[] = [];
  const ex = input.exercise;
  const w = input.set.weight;
  const range = input.repRange ?? ex.repRange;
  if (!Number.isFinite(h.weight) || h.weight < 0) v.push('invalid_weight');
  if (h.kind === 'increase' || isHarder(ex, h.weight, w)) {
    if (input.settings.conservative) v.push('conservative');
    if (input.inDeload === true) v.push('deload');
    if ((input.increaseHintsUsed ?? 0) >= p.intra.maxIncreaseHints) v.push('hint_limit');
    const capacity = input.set.reps + (input.set.rir ?? 0);
    if (capacity < Math.ceil(range.max * p.intra.capacityFactor - EPS)) v.push('capacity');
    const failureSets = [...(input.earlierSets ?? []), input.set].filter(
      (s) => !s.tag && sameWeight(s.weight, w) && s.rir === 0,
    ).length;
    if (failureSets >= p.maxFailureSets) v.push('failure_sets');
    const expected = stepHarder(ex, w);
    if (expected === null || !sameWeight(expected, h.weight)) v.push('not_one_step');
    const pct = canMeasurePct(ex) && w > 0 ? (h.weight - w) / w : null;
    if (pct === null || pct > ex.maxIncreasePct + EPS) v.push('cap');
    if (h.reps.low !== range.min || h.reps.high !== range.min) v.push('reps_not_reset');
  }
  return v;
}

/** 复核训练后的下次目标 */
export function checkSuggestion(input: PostInput, s: Suggestion, p: EngineParams = DEFAULT_PARAMS): string[] {
  const v: string[] = [];
  const ex = input.exercise;
  const t = s.target;
  if (!Number.isFinite(t.weight) || t.weight < 0) v.push('invalid_weight');
  if (!Number.isInteger(t.sets) || t.sets < 1 || t.sets > p.maxSetsPerExercise) v.push('sets_out_of_range');
  if (t.reps.length !== t.sets || t.reps.some((r) => !Number.isInteger(r) || r < 1)) v.push('invalid_reps');

  if (s.ruleId === 'DL') {
    if (input.inDeload !== true) v.push('deload_without_flag');
    return v;
  }
  if (input.inDeload === true) v.push('deload_ignored');

  const base = ex.repRange;
  const extended = input.currentTarget?.extended === true;
  const eff = extended ? extendRange(base, p) : base;
  const cur = evaluateSession(ex, input.session, eff, p);
  if (!cur) {
    v.push('empty_session');
    return v;
  }
  const w = cur.workingWeight;
  if (s.kind === 'reduce' && isHarder(ex, t.weight, w)) v.push('reduce_not_easier');

  if (s.kind === 'increase' || isHarder(ex, t.weight, w)) {
    if (isRepsOnly(ex)) v.push('reps_only_exercise');
    const expected = stepHarder(ex, w);
    if (expected === null || !sameWeight(expected, t.weight)) v.push('not_one_step');
    if (!cur.achieved) v.push('not_achieved');
    if (cur.rirZeroAtWorking >= p.maxFailureSets) v.push('failure_sets');

    const prior = priorSessions(input.history);
    let consecutive = true;
    for (let i = 1; i < p.progression.consecutiveHits; i++) {
      const prev = prior[prior.length - i];
      const e = prev ? evaluateSession(ex, prev, eff, p) : null;
      if (!e || !e.achieved || !sameWeight(e.workingWeight, w)) {
        consecutive = false;
        break;
      }
    }
    const rirOk = !input.settings.conservative && allRirAtLeast(cur.workingSets, p.progression.singleHitMinRir);
    if (!consecutive && !rirOk) v.push('timing');

    const pct = canMeasurePct(ex) && w > 0 ? (t.weight - w) / w : null;
    if (input.settings.conservative && (pct === null || pct > p.conservativeMaxIncreasePct + EPS)) {
      v.push('conservative_cap');
    }
    const afterExtension = s.reason === 'increase_after_extension';
    if (afterExtension && !extended) v.push('extension_missing');
    if (!afterExtension && (pct === null || pct > ex.maxIncreasePct + EPS)) v.push('cap');
    if (t.reps.some((r) => r !== base.min)) v.push('reps_raised_with_weight');
    if (t.sets > plannedSetsFor(ex, cur.workingSets.length, p)) v.push('sets_added_with_weight');
  }
  return v;
}

/** 主项目标 RIR ≤ 1 时提醒使用保护杠或保护者 */
export function needsSpotterReminder(ex: ExerciseConfig, targetRir: number): boolean {
  return ex.compound === true && targetRir <= 1;
}

/** 检查动作配置（自定义动作保存前用） */
export function validateExercise(ex: ExerciseConfig): string[] {
  const v: string[] = [];
  if (!ex.id) v.push('id_missing');
  if (!Number.isFinite(ex.increment) || ex.increment < 0) v.push('increment_invalid');
  const { min, max } = ex.repRange;
  if (!Number.isInteger(min) || min < 1) v.push('rep_min_invalid');
  if (!Number.isInteger(max) || max < min) v.push('rep_max_invalid');
  if (!(ex.maxIncreasePct > 0) || ex.maxIncreasePct > 0.1 + EPS) v.push('max_increase_invalid');
  if (ex.plannedSets !== undefined && (!Number.isInteger(ex.plannedSets) || ex.plannedSets < 1)) {
    v.push('planned_sets_invalid');
  }
  return v;
}
