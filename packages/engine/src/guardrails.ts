/**
 * 硬性护栏：任何规则都不能越过。
 *
 * 规则模块算出结果后再用这里独立复核一遍；不通过就退回"保持"，并带上 violations。
 * 正常情况下不会触发，测试里用随机输入保证这一点。
 */
import { DEFAULT_PARAMS, type EngineParams } from './params';
import type { IntraInput } from './intra';
import type { PostInput } from './post';
import type { ExerciseConfig, SetHint, SetRecord, Suggestion } from './types';
import {
  activeHistory,
  allRirAtLeast,
  evaluateSession,
  extendRange,
  plannedSetsFor,
  type SessionEval,
} from './evaluate';
import { countedSets, workingWeightOf } from './sets';
import { canMeasurePct, isHarder, isRepsOnly, stepHarder } from './load';
import { EPS, sameWeight } from './math';

/** 复核组间提示 */
export function checkSetHint(input: IntraInput, h: SetHint, p: EngineParams = DEFAULT_PARAMS): string[] {
  const v: string[] = [];
  const ex = input.exercise;
  const set = input.set;
  const w = set.weight;
  const range = input.repRange ?? ex.repRange;
  const earlier = input.earlierSets ?? [];
  if (!Number.isFinite(h.weight) || h.weight < 0) v.push('invalid_weight');
  if (isHarder(ex, h.weight, w) && h.kind !== 'increase') v.push('unexpected_increase');

  // 组间用的 RIR：本组填了用本组，没填沿用上一组填过的值
  let rir: number | null = set.rir ?? null;
  if (rir === null && input.rirEnabled !== false) {
    const prev = [...earlier].reverse().find((s) => s.rir !== null && s.rir !== undefined);
    rir = prev ? (prev.rir as number) : null;
  }

  if (h.kind === 'need_rir') {
    if (rir !== null) v.push('rir_available');
    if (input.rirEnabled === false) v.push('rir_disabled');
    if (!sameWeight(h.weight, w)) v.push('weight_changed');
  } else if (rir === null && input.rirEnabled !== false) {
    v.push('rir_missing');
  }

  if (h.kind === 'increase' || h.kind === 'nudge') {
    if (input.inDeload === true) v.push('deload');
    if (set.reps + (rir ?? 0) < Math.ceil(range.max * p.intra.capacityFactor - EPS)) v.push('capacity');
    const all = [...earlier, set].filter((s) => !s.tag);
    if (countIncreases(ex, all) >= p.intra.maxIncreasesPerSession) v.push('already_increased');
    const atMin = all.filter((s) => sameWeight(s.weight, w) && s.rir === 0 && s.reps <= range.min).length;
    if (atMin >= p.intra.failureSetsAtMin) v.push('failure_sets');
  }
  if (h.kind === 'increase') {
    const expected = stepHarder(ex, w);
    if (expected === null || !sameWeight(expected, h.weight)) v.push('not_one_step');
    const pct = canMeasurePct(ex) && w > 0 ? (h.weight - w) / w : null;
    if (pct === null || pct > ex.maxIncreasePct + EPS) v.push('cap');
    if (!h.reps || h.reps.low !== range.min || h.reps.high !== range.min) v.push('reps_not_reset');
  }
  if (h.kind === 'nudge') {
    if (!sameWeight(h.weight, w)) v.push('nudge_changed_weight');
    if (h.reps !== undefined) v.push('nudge_has_numbers');
  }
  return v;
}

function countIncreases(ex: ExerciseConfig, sets: readonly SetRecord[]): number {
  let count = 0;
  let hardest: number | null = null;
  for (const s of sets) {
    if (hardest === null) hardest = s.weight;
    else if (isHarder(ex, s.weight, hardest)) {
      count += 1;
      hardest = s.weight;
    }
  }
  return count;
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
  const ww = workingWeightOf(ex, countedSets(input.session));
  if (ww === null) {
    v.push('empty_session');
    return v;
  }
  const ct = input.currentTarget;
  const extended = ct !== undefined && ct.extended && sameWeight(ct.weight, ww);
  const eff = extended ? extendRange(base, p) : base;
  const cur = evaluateSession(ex, input.session, eff, p) as SessionEval;
  const w = cur.workingWeight;
  const win = activeHistory(input.history, input.session, p);

  if (s.kind === 'reduce' && isHarder(ex, t.weight, w)) v.push('reduce_not_easier');
  // 第一次和回归后的第一次：只保持，不改重量
  if (win.active.length === 0 && !sameWeight(t.weight, w)) v.push('baseline_changed_weight');

  if (s.kind === 'increase' || isHarder(ex, t.weight, w)) {
    if (isRepsOnly(ex)) v.push('reps_only_exercise');
    const expected = stepHarder(ex, w);
    if (expected === null || !sameWeight(expected, t.weight)) v.push('not_one_step');
    if (!cur.achieved) v.push('not_achieved');
    if (cur.disallowedRirZero > 0) v.push('failure_sets');

    // 时机：此前 (N − 1) 次都达标且重量不比这次轻，或本次每组 RIR ≥ 2
    let consecutive = win.active.length >= p.progression.consecutiveHits - 1;
    for (let i = 1; consecutive && i < p.progression.consecutiveHits; i++) {
      const prev = win.active[win.active.length - i];
      const e = prev ? evaluateSession(ex, prev, eff, p) : null;
      if (!e || !e.achieved || isHarder(ex, w, e.workingWeight)) consecutive = false;
    }
    const rirOk = allRirAtLeast(cur.workingSets, p.progression.singleHitMinRir);
    if (!consecutive && !rirOk) v.push('timing');

    // 幅度：不超过上限；只有做满"上限 +3"后才可以超过
    const pct = canMeasurePct(ex) && w > 0 ? (t.weight - w) / w : null;
    const afterExtension = s.reason === 'increase_after_extension';
    if (afterExtension && !extended) v.push('extension_missing');
    if (!afterExtension && (pct === null || pct > ex.maxIncreasePct + EPS)) v.push('cap');
    // 一次只改一个变量
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
