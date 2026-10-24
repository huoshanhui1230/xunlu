/**
 * B. 训练后规则：为每个动作定出下次目标。
 *
 * 按顺序判断，命中即停：
 *   B1 基线：第一次记录该动作 → 维持重量，先重复本次表现
 *   B2 回归：距上次超过 14 天 → 以这次表现为新基准，保持重量、不加重（没做到下限按 B3 处理）
 *   B3 失败：任一组低于下限且 RIR 为 0 或没填 → 第 1 次维持重量，先做到下限；连续第 2 次减 5–10%
 *   B4 加重：达标，且"上一次在同样或更重的重量下也达标"或"本次每组 RIR ≥ 2" → 加一档，次数回到下限
 *   B5 推进：其余 → 维持重量，未到上限的组 +1 次
 *   B6 平台期（叠加）：重量连续不变、最近 3 次平均估算 1RM 都没超过此前最佳 → 改为平台期建议
 * 引擎只给建议，不限制用户：用户自己换了重量，就以实际练的重量为新基准。
 * 所有结果再经过 guardrails 复核。
 */
import { DEFAULT_PARAMS, type EngineParams } from './params';
import type {
  CitationKey,
  ExerciseConfig,
  ExerciseSession,
  NoteCode,
  PlateauOption,
  PostReason,
  PostRuleId,
  RepRange,
  Suggestion,
  SuggestionKind,
  Target,
} from './types';
import {
  activeHistory,
  allRirAtLeast,
  evaluateSession,
  extendRange,
  gapFor,
  plannedSetsFor,
  type SessionEval,
} from './evaluate';
import { countedSets, meanE1rmOf, workingWeightOf } from './sets';
import { canMeasurePct, isHarder, isRepsOnly, reduceLoad, stepHarder, weightChange } from './load';
import { EPS, round2, sameWeight } from './math';
import { checkSuggestion } from './guardrails';

export interface PostInput {
  readonly exercise: ExerciseConfig;
  /** 该动作此前的训练（含减载周），不含本次；建议传最近 8 周 */
  readonly history: readonly ExerciseSession[];
  /** 刚结束的这次 */
  readonly session: ExerciseSession;
  /** 本次在用的目标（上次采纳的建议）：本次按这个重量练时，延续"上限 +3" */
  readonly currentTarget?: Target;
  /** 用户已选择进入减载周 */
  readonly inDeload?: boolean;
  /** 减载前的目标：减载期间原样返回 */
  readonly preDeloadTarget?: Target;
  readonly params?: EngineParams;
}

interface Ctx {
  readonly input: PostInput;
  readonly p: EngineParams;
  readonly ex: ExerciseConfig;
  readonly base: RepRange;
  /** 生效区间：延长过就是 base.max + 3 */
  readonly eff: RepRange;
  readonly extended: boolean;
  readonly cur: SessionEval;
  readonly planned: number;
  /** 本次工作重量 */
  readonly w: number;
  readonly repsDone: readonly number[];
  readonly prior: readonly ExerciseSession[];
  readonly active: readonly ExerciseSession[];
  readonly gapDays: number | null;
}

interface Draft {
  readonly ruleId: PostRuleId;
  readonly kind: SuggestionKind;
  readonly reason: PostReason;
  readonly target: Target;
  readonly basis: readonly CitationKey[];
  readonly detail?: Readonly<Record<string, number>>;
  readonly notes?: readonly NoteCode[];
  readonly plateauOptions?: readonly PlateauOption[];
}

/** 训练结束后为一个动作定出下次目标；本次没有有效组时返回 null */
export function suggestNextTarget(input: PostInput): Suggestion | null {
  const p = input.params ?? DEFAULT_PARAMS;
  const ex = input.exercise;
  const base = ex.repRange;
  const ww = workingWeightOf(ex, countedSets(input.session));
  if (ww === null) return null;
  const ct = input.currentTarget;
  const extended = ct !== undefined && ct.extended && sameWeight(ct.weight, ww);
  const eff = extended ? extendRange(base, p) : base;
  const cur = evaluateSession(ex, input.session, eff, p) as SessionEval;
  const win = activeHistory(input.history, input.session, p);
  const c: Ctx = {
    input,
    p,
    ex,
    base,
    eff,
    extended,
    cur,
    planned: plannedSetsFor(ex, cur.workingSets.length, p),
    w: cur.workingWeight,
    repsDone: cur.workingSets.map((s) => s.reps),
    prior: win.prior,
    active: win.active,
    gapDays: win.gapDays,
  };
  return finish(c, decide(c));
}

function decide(c: Ctx): Draft {
  const { input, p, ex, base, eff, cur, planned, w, repsDone } = c;

  // 减载期间：暂停所有加重建议，沿用减载前的目标
  if (input.inDeload === true) {
    return {
      ruleId: 'DL',
      kind: 'deload',
      reason: 'deload_pause',
      target:
        input.preDeloadTarget ??
        makeTarget(c, w, fill(planned, repsDone, (r) => Math.min(r, eff.max)), eff, c.extended),
      basis: ['Bell2023'],
    };
  }

  // B1 基线
  if (c.prior.length === 0) {
    return {
      ruleId: 'B1',
      kind: 'hold',
      reason: 'baseline',
      target: makeTarget(c, w, fill(planned, repsDone, (r) => r), base, false),
      basis: ['engineering'],
      notes: ['leave_2_rir'],
    };
  }

  // B2 回归后的第一次：以这次表现为新基准
  if (c.active.length === 0) {
    const gapDays = c.gapDays ?? 0;
    if (cur.failure) {
      return {
        ruleId: 'B3',
        kind: 'hold',
        reason: 'failure_first',
        target: makeTarget(c, w, fill(planned, [], () => base.min), base, false),
        basis: ['engineering'],
        detail: { min: base.min, gapDays },
      };
    }
    return {
      ruleId: 'B2',
      kind: 'hold',
      reason: 'return_baseline',
      target: makeTarget(c, w, fill(planned, repsDone, (r) => Math.min(r, base.max)), base, false),
      basis: ['engineering'],
      detail: { gapDays },
    };
  }

  const prev = c.active[c.active.length - 1] as ExerciseSession;
  const prevEval = evaluateSession(ex, prev, eff, p) as SessionEval;

  // B3 失败
  if (cur.failure) {
    if (prevEval.failure) return failureRepeatDraft(c);
    return withPlateau(c, {
      ruleId: 'B3',
      kind: 'hold',
      reason: 'failure_first',
      target: makeTarget(c, w, fill(planned, [], () => base.min), eff, c.extended),
      basis: ['engineering'],
      detail: { min: base.min },
    });
  }

  // B4 加重
  if (cur.achieved) {
    const consecutive = isConsecutive(c);
    const rirOk = allRirAtLeast(cur.workingSets, p.progression.singleHitMinRir);
    if (consecutive || rirOk) return increaseDraft(c, consecutive);
    return {
      ruleId: 'B5',
      kind: 'hold',
      reason: 'confirm_once_more',
      target: makeTarget(c, w, fill(planned, repsDone, () => eff.max), eff, c.extended),
      basis: ['ACSM2009'],
      detail: { max: eff.max },
    };
  }

  // B5 推进
  if (cur.hitAll) {
    return withPlateau(c, {
      ruleId: 'B5',
      kind: 'hold',
      reason: 'at_max_with_failure',
      target: makeTarget(c, w, fill(planned, repsDone, () => eff.max), eff, c.extended),
      basis: ['ACSM2026', 'Refalo2023'],
      detail: { max: eff.max },
    });
  }
  return withPlateau(c, {
    ruleId: 'B5',
    kind: 'add_reps',
    reason: 'progress_reps',
    target: makeTarget(c, w, fill(planned, repsDone, (r) => (r < eff.max ? r + 1 : eff.max)), eff, c.extended),
    basis: ['ACSM2009'],
    detail: { max: eff.max },
  });
}

function failureRepeatDraft(c: Ctx): Draft {
  const { ex, p, w, planned, base } = c;
  const next = reduceLoad(ex, w, p.failure.cut);
  const reps = fill(planned, [], () => base.min);
  if (next === null) {
    return {
      ruleId: 'B3',
      kind: 'hold',
      reason: 'cannot_reduce',
      target: makeTarget(c, w, reps, base, false),
      basis: ['engineering'],
      notes: ['try_easier_variation'],
      detail: { min: base.min },
    };
  }
  return {
    ruleId: 'B3',
    kind: 'reduce',
    reason: 'failure_repeat',
    target: makeTarget(c, next, reps, base, false),
    basis: ['engineering'],
    detail: { min: base.min },
  };
}

/**
 * 连续达标以较低的重量为基准：此前 (N − 1) 次都达标，且重量都不比这次轻。
 * 上一次更轻时（用户自己加了重），按较低的重量加一档正好是这次的重量，所以先保持。
 */
function isConsecutive(c: Ctx): boolean {
  for (let i = 1; i < c.p.progression.consecutiveHits; i++) {
    const s = c.active[c.active.length - i];
    const e = s ? evaluateSession(c.ex, s, c.eff, c.p) : null;
    if (!e || !e.achieved || isHarder(c.ex, c.w, e.workingWeight)) return false;
  }
  return true;
}

function increaseDraft(c: Ctx, consecutive: boolean): Draft {
  const { ex, p, w, base, planned, repsDone } = c;
  if (isRepsOnly(ex)) {
    return {
      ruleId: 'B4',
      kind: 'add_reps',
      reason: 'reps_only',
      target: makeTarget(c, w, fill(planned, repsDone, (r) => r + 1), base, false),
      basis: ['engineering'],
    };
  }
  const next = stepHarder(ex, w);
  if (next === null) {
    return {
      ruleId: 'B4',
      kind: 'add_reps',
      reason: 'assistance_done',
      target: makeTarget(c, w, fill(planned, repsDone, (r) => r + 1), base, false),
      basis: ['engineering'],
      notes: ['switch_to_bodyweight'],
    };
  }

  const reason: PostReason = consecutive ? 'increase_consecutive' : 'increase_rir';
  const basis: readonly CitationKey[] = consecutive ? ['ACSM2009'] : ['ACSM2009', 'Zourdos2016'];
  const pct = canMeasurePct(ex) && w > 0 ? (next - w) / w : null;
  const cap = ex.maxIncreasePct;
  const resetReps = fill(planned, [], () => base.min);
  if (pct !== null && pct <= cap + EPS) {
    return {
      ruleId: 'B4',
      kind: 'increase',
      reason,
      target: makeTarget(c, next, resetReps, base, false),
      basis,
      detail: { step: ex.increment },
    };
  }

  // 一档超过上限，或负重方式无法确认幅度：先把次数上限提高 3 次，做满再换重
  const stepInfo: Record<string, number> = { step: ex.increment, cap };
  if (pct !== null) stepInfo.stepPct = pct;
  if (!c.extended) {
    const ext = extendRange(base, p);
    return {
      ruleId: 'B4',
      kind: 'add_reps',
      reason: 'extend_reps',
      target: makeTarget(c, w, fill(planned, repsDone, (r) => Math.min(r + 1, ext.max)), ext, true),
      basis: ['ACSM2009', 'engineering'],
      detail: { ...stepInfo, newMax: ext.max },
    };
  }
  return {
    ruleId: 'B4',
    kind: 'increase',
    reason: 'increase_after_extension',
    target: makeTarget(c, next, resetReps, base, false),
    basis: ['ACSM2009', 'engineering'],
    detail: stepInfo,
  };
}

function withPlateau(c: Ctx, d: Draft): Draft {
  if (!plateauDetected(c)) return d;
  const reducedSets = Math.max(1, Math.ceil(c.planned / 2));
  return {
    ...d,
    ruleId: 'B6',
    kind: 'plateau',
    reason: 'plateau',
    basis: ['engineering'],
    detail: { ...(d.detail ?? {}), sessions: c.p.plateau.sessions },
    plateauOptions: [
      { kind: 'change_rep_range' },
      { kind: 'change_variation' },
      {
        kind: 'reduce_once',
        target: makeTarget(c, c.w, fill(reducedSets, c.repsDone, (r) => Math.min(r, c.eff.max)), c.eff, c.extended),
      },
    ],
  };
}

/**
 * 平台期：当前训练段里最近 n+1 次工作重量都没变，且最近 n 次的平均估算 1RM 都没超过同重量下此前的最佳。
 * 用平均值而不是最佳组：后几组还在加次数时不算停滞；要求重量不变：减重后重新爬升不算停滞。
 */
function plateauDetected(c: Ctx): boolean {
  const { ex, p, w } = c;
  if (!canMeasurePct(ex)) return false;
  const n = p.plateau.sessions;
  const all = [...c.active, c.input.session];
  if (all.length < n + 1) return false;
  const scored = all.map((s) => {
    const sets = countedSets(s);
    const ww = workingWeightOf(ex, sets);
    if (ww === null || !sameWeight(ww, w)) return { same: false, score: null as number | null };
    return { same: true, score: meanE1rmOf(ex, sets.filter((x) => sameWeight(x.weight, ww)), p.e1rmMaxReps) };
  });
  if (!scored.slice(-(n + 1)).every((x) => x.same)) return false;
  const recent = scored.slice(-n).map((x) => x.score);
  if (recent.some((x) => x === null)) return false;
  const earlier = scored
    .slice(0, -n)
    .filter((x) => x.same && x.score !== null)
    .map((x) => x.score as number);
  if (earlier.length === 0) return false;
  const best = Math.max(...earlier);
  return recent.every((x) => (x as number) <= best + EPS);
}

/** 生成 n 组的目标次数：第 i 组按本次第 i 个工作组，不够时用最后一组 */
function fill(n: number, reps: readonly number[], f: (r: number) => number): number[] {
  const last = reps.length > 0 ? (reps[reps.length - 1] as number) : 0;
  return Array.from({ length: n }, (_, i) => f(reps[i] ?? last));
}

function makeTarget(c: Ctx, weight: number, reps: readonly number[], range: RepRange, extended: boolean): Target {
  return {
    weight: round2(weight),
    sets: reps.length,
    reps: reps.map((r) => Math.max(1, Math.round(r))),
    repRange: range,
    extended,
    targetRir: c.p.defaultTargetRir,
  };
}

function finish(c: Ctx, d: Draft): Suggestion {
  const notes = new Set<NoteCode>(d.notes ?? []);
  if (c.ex.compound === true && d.target.targetRir <= 1) notes.add('use_spotter');
  const gap = sameWeight(d.target.weight, c.w) ? gapFor(c.cur.workingSets, d.target.repRange, c.p) : null;
  const s: Suggestion = {
    ruleId: d.ruleId,
    kind: d.kind,
    reason: d.reason,
    target: d.target,
    change: weightChange(c.ex, c.w, d.target.weight),
    gapToIncrease: d.kind === 'increase' ? 0 : gap,
    basis: d.basis,
    notes: Array.from(notes),
    detail: d.detail ?? {},
    ...(d.plateauOptions ? { plateauOptions: d.plateauOptions } : {}),
    ruleVersion: c.p.ruleVersion,
  };
  const violations = checkSuggestion(c.input, s, c.p);
  if (violations.length === 0) return s;
  // 护栏兜底：正常不会走到这里
  return {
    ...s,
    ruleId: 'B5',
    kind: 'hold',
    reason: 'guardrail_blocked',
    target: makeTarget(c, c.w, fill(c.planned, c.repsDone, (r) => Math.min(r, c.eff.max)), c.eff, c.extended),
    change: weightChange(c.ex, c.w, c.w),
    gapToIncrease: c.cur.gapToIncrease,
    basis: ['product'],
    violations,
  };
}
