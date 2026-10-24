/**
 * 随机输入检验硬性护栏。这里的判断是独立写的，不调用 src/guardrails.ts，
 * 用来保证"超出加重上限的建议"始终为 0。
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  evaluateStatus,
  suggestNextSet,
  suggestNextTarget,
  type ExerciseConfig,
  type ExerciseSession,
  type IntraInput,
  type LoadType,
  type PostInput,
  type SetRecord,
  type Suggestion,
  type Target,
} from '../src';
import { bench, inclineDb, lateralRaise, squat } from './helpers';

const LOAD_TYPES: LoadType[] = ['total', 'perSide', 'bodyweightPlus', 'assisted'];

const exerciseArb: fc.Arbitrary<ExerciseConfig> = fc
  .record({
    loadType: fc.constantFrom(...LOAD_TYPES),
    increment: fc.constantFrom(0, 1, 1.25, 2, 2.5, 5),
    min: fc.integer({ min: 1, max: 15 }),
    width: fc.integer({ min: 0, max: 10 }),
    cap: fc.constantFrom(0.05, 0.1),
    planned: fc.option(fc.integer({ min: 1, max: 8 }), { nil: undefined }),
    compound: fc.boolean(),
  })
  .map((r) => ({
    id: 'x',
    loadType: r.loadType,
    increment: r.increment,
    repRange: { min: r.min, max: r.min + r.width },
    maxIncreasePct: r.cap,
    compound: r.compound,
    ...(r.planned === undefined ? {} : { plannedSets: r.planned }),
  }));

const rirArb = fc.option(fc.integer({ min: 0, max: 5 }), { nil: null });

// ---- 独立的判断 ----

const harder = (ex: ExerciseConfig, a: number, b: number): boolean =>
  ex.loadType === 'assisted' ? a < b - 0.0049 : a > b + 0.0049;
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.005;
const measurable = (ex: ExerciseConfig): boolean => ex.loadType === 'total' || ex.loadType === 'perSide';

/** 达标：最后两个工作组做到上限或"力竭且到下限"；其余工作组到上限且不力竭；其他重量的组只有排在最后两组才能力竭 */
function judge(ex: ExerciseConfig, s: ExerciseSession, min: number, max: number) {
  const counted = s.sets.filter((x) => !x.tag);
  const counts = new Map<number, number>();
  for (const x of counted) counts.set(Math.round(x.weight * 100), (counts.get(Math.round(x.weight * 100)) ?? 0) + 1);
  let w = Number.NaN;
  let best = 0;
  for (const [k, c] of counts) {
    if (Number.isNaN(w) || c > best || (c === best && harder(ex, k / 100, w))) {
      w = k / 100;
      best = c;
    }
  }
  const ws = counted.filter((x) => near(x.weight, w));
  const lastW = ws.length - 2;
  const lastC = counted.length - 2;
  const metAll = ws.every((x, i) =>
    i >= lastW ? x.reps >= max || (x.rir === 0 && x.reps >= min) : x.reps >= max && x.rir !== 0,
  );
  const badFailure = counted.some((x, i) => {
    if (x.rir !== 0) return false;
    const wi = ws.indexOf(x);
    return !((wi >= 0 && wi >= lastW) || i >= lastC);
  });
  return { w, sets: ws, ok: metAll && !badFailure, badFailure };
}

/** 当前训练段：两次训练间隔超过 14 天就从后一次重新算 */
function window(history: readonly ExerciseSession[], date: string) {
  const trained = history
    .filter((h) => h.date <= date && h.sets.some((x) => !x.tag))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const prior = trained.filter((h) => !h.deload);
  const last = trained[trained.length - 1];
  if (!last || daysBetween(last.date, date) > 14) return { prior, active: [] as ExerciseSession[] };
  let start = last.date;
  for (let i = trained.length - 2; i >= 0; i--) {
    if (daysBetween(trained[i]!.date, trained[i + 1]!.date) > 14) break;
    start = trained[i]!.date;
  }
  return { prior, active: prior.filter((h) => h.date >= start) };
}

function checkPost(input: PostInput, s: Suggestion): void {
  const ex = input.exercise;
  expect(s.reason).not.toBe('guardrail_blocked');
  expect(s.violations).toBeUndefined();
  const t = s.target;
  expect(Number.isInteger(t.sets) && t.sets >= 1 && t.sets <= 6).toBe(true);
  expect(t.reps).toHaveLength(t.sets);
  for (const r of t.reps) expect(Number.isInteger(r) && r >= 1).toBe(true);
  expect(Number.isFinite(t.weight) && t.weight >= 0).toBe(true);

  if (s.ruleId === 'DL') {
    expect(input.inDeload).toBe(true);
    return;
  }
  expect(input.inDeload).not.toBe(true);

  const { min, max: baseMax } = ex.repRange;
  const first = judge(ex, input.session, min, baseMax);
  const ct = input.currentTarget;
  const extended = ct !== undefined && ct.extended && near(ct.weight, first.w);
  const max = baseMax + (extended ? 3 : 0);
  const cur = judge(ex, input.session, min, max);
  const win = window(input.history, input.session.date);

  // 第一次、回归后的第一次：只保持
  if (win.active.length === 0) expect(near(t.weight, cur.w)).toBe(true);

  const isIncrease = harder(ex, t.weight, cur.w);
  expect(isIncrease).toBe(s.kind === 'increase');
  if (!isIncrease) return;

  // 加一档、只加一档
  expect(ex.increment).toBeGreaterThan(0);
  const step = ex.loadType === 'assisted' ? cur.w - t.weight : t.weight - cur.w;
  expect(step).toBeCloseTo(ex.loadType === 'assisted' ? Math.min(ex.increment, cur.w) : ex.increment, 6);
  // 达标，且没有不允许的力竭组
  expect(cur.ok).toBe(true);
  expect(cur.badFailure).toBe(false);
  // 时机：上一次在同样或更重的重量下达标，或本次每组 RIR ≥ 2
  const prev = win.active[win.active.length - 1];
  const prevJudge = prev ? judge(ex, prev, min, max) : null;
  const consecutive = prevJudge !== null && prevJudge.ok && !harder(ex, cur.w, prevJudge.w);
  const rirOk = cur.sets.every((x) => x.rir !== null && x.rir !== undefined && x.rir >= 2);
  expect(consecutive || rirOk).toBe(true);
  // 幅度：不超过上限；只有做满"上限 +3"后才允许超过
  if (!extended) {
    expect(measurable(ex) && cur.w > 0).toBe(true);
    expect((t.weight - cur.w) / cur.w).toBeLessThanOrEqual(ex.maxIncreasePct + 1e-9);
  }
  // 一次只改一个变量
  for (const r of t.reps) expect(r).toBe(min);
  const planned = Math.min(6, Math.max(1, Math.round(ex.plannedSets ?? cur.sets.length)));
  expect(t.sets).toBeLessThanOrEqual(planned);
}

describe('护栏：训练后建议', () => {
  /** 每次训练的表现：大多数间隔几天，偶尔很久没练；次数在目标上下浮动 */
  const stepArb = (deltaMin: number, deltaMax: number, rir: fc.Arbitrary<number | null>) =>
    fc.record({
      gap: fc.oneof({ arbitrary: fc.integer({ min: 1, max: 7 }), weight: 6 }, { arbitrary: fc.integer({ min: 8, max: 35 }), weight: 1 }),
      deviate: fc.constantFrom(0, 0, 0, 0, 1, 2, -1),
      deltas: fc.array(fc.integer({ min: deltaMin, max: deltaMax }), { minLength: 6, maxLength: 6 }),
      rirs: fc.array(rir, { minLength: 6, maxLength: 6 }),
      backoff: fc.boolean(),
      deload: fc.constantFrom(false, false, false, false, false, true),
      setsIfNew: fc.integer({ min: 1, max: 6 }),
    });
  const anyLifter = stepArb(-4, 4, rirArb);
  /** 进步很快的人：经常做满上限、余力充足，用来反复触发加重和"上限 +3" */
  const strongLifter = stepArb(0, 4, fc.option(fc.integer({ min: 1, max: 4 }), { nil: null, freq: 10 }));
  /** 最后两组常练到力竭的人 */
  const grinder = stepArb(-2, 3, fc.constantFrom(0, 0, 1, 2, null));

  it.each([
    ['任意表现', anyLifter],
    ['进步很快', strongLifter],
    ['常练到力竭', grinder],
  ])('按建议连续练 25 次（%s，含自己换重量、递减组、减载、长时间没练），任何一步都不越过护栏', (_label, lifter) => {
    fc.assert(
      fc.property(
        exerciseArb,
        fc.constantFrom(0, 2.5, 5, 10, 20, 40, 60, 80, 100),
        fc.array(lifter, { minLength: 1, maxLength: 25 }),
        (ex, startWeight, steps) => {
          let history: ExerciseSession[] = [];
          let target: Target | undefined;
          let date = '2026-01-01';
          for (const st of steps) {
            date = addDays(date, st.gap);
            const planned = target ? target.weight : startWeight;
            const w =
              st.deviate === 0
                ? planned
                : Math.max(0, Math.round((planned + st.deviate * Math.max(ex.increment, 1)) * 100) / 100);
            const n = target ? target.sets : st.setsIfNew;
            const sets: SetRecord[] = Array.from({ length: n }, (_, i) => ({
              weight: w,
              reps: Math.max(0, (target?.reps[i] ?? ex.repRange.max) + (st.deltas[i] ?? 0)),
              rir: st.rirs[i] ?? null,
            }));
            if (st.backoff && w > 0) {
              sets.push({
                weight: Math.max(0, w - Math.max(ex.increment, 1)),
                reps: Math.max(0, ex.repRange.min + (st.deltas[5] ?? 0)),
                rir: st.rirs[5] ?? null,
              });
            }
            const session: ExerciseSession = { date, sets };
            const inDeload = st.deload && target !== undefined;
            const input: PostInput = {
              exercise: ex,
              history,
              session,
              ...(target ? { currentTarget: target } : {}),
              ...(inDeload ? { inDeload: true, preDeloadTarget: target } : {}),
            };
            const s = suggestNextTarget(input);
            expect(s).not.toBeNull();
            checkPost(input, s as Suggestion);
            expect(suggestNextTarget(input)).toEqual(s);
            history = [...history, inDeload ? { ...session, deload: true } : session];
            if (!inDeload) target = (s as Suggestion).target;
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('任意历史与本次记录，都不越过护栏', () => {
    const rawArb = fc.record({
      gap: fc.integer({ min: 1, max: 20 }),
      weight: fc.constantFrom(0, 5, 8, 10, 20, 40, 60, 80, 82.5, 85),
      reps: fc.array(fc.integer({ min: 0, max: 25 }), { minLength: 1, maxLength: 6 }),
      rirs: fc.array(rirArb, { minLength: 6, maxLength: 6 }),
      mixed: fc.boolean(),
    });
    fc.assert(
      fc.property(exerciseArb, fc.boolean(), fc.array(rawArb, { minLength: 1, maxLength: 7 }), (ex, ext, raws) => {
        let date = '2026-03-01';
        const sessions: ExerciseSession[] = raws.map((r) => {
          date = addDays(date, r.gap);
          return {
            date,
            sets: r.reps.map((reps, i) => ({
              weight: r.mixed && i === 1 ? r.weight + ex.increment : r.weight,
              reps,
              rir: r.rirs[i] ?? null,
            })),
          };
        });
        const session = sessions[sessions.length - 1] as ExerciseSession;
        const first = session.sets[0] as SetRecord;
        const currentTarget: Target | undefined = ext
          ? {
              weight: first.weight,
              sets: 3,
              reps: [ex.repRange.max, ex.repRange.max, ex.repRange.max],
              repRange: { min: ex.repRange.min, max: ex.repRange.max + 3 },
              extended: true,
              targetRir: 2,
            }
          : undefined;
        const input: PostInput = {
          exercise: ex,
          history: sessions.slice(0, -1),
          session,
          ...(currentTarget ? { currentTarget } : {}),
        };
        checkPost(input, suggestNextTarget(input) as Suggestion);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('护栏：组间提示', () => {
  const setArb = fc.record({
    weight: fc.constantFrom(0, 2, 5, 8, 10, 20, 40, 50, 80, 100),
    reps: fc.integer({ min: 0, max: 30 }),
    rir: fc.option(fc.integer({ min: 0, max: 10 }), { nil: null }),
  });

  it('只在全部条件满足时才提示加重，一档超过上限时不给数值', () => {
    fc.assert(
      fc.property(
        exerciseArb,
        setArb,
        fc.boolean(),
        fc.boolean(),
        fc.array(setArb, { maxLength: 4 }),
        (ex, set, deload, rirEnabled, earlier) => {
          const input: IntraInput = { exercise: ex, set, inDeload: deload, rirEnabled, earlierSets: earlier };
          const h = suggestNextSet(input);
          expect(h.increaseBlockedBy).not.toBe('guardrail');
          const { min, max } = ex.repRange;

          // RIR：本组没填沿用上一组；第 1 组没有可沿用的值就提示填写
          let rir: number | null = set.rir;
          if (rir === null && rirEnabled) rir = [...earlier].reverse().find((s) => s.rir !== null)?.rir ?? null;
          expect(h.kind === 'need_rir').toBe(rir === null && rirEnabled);
          if (h.kind === 'need_rir') {
            expect(h.weight).toBe(set.weight);
            return;
          }

          const inc = harder(ex, h.weight, set.weight);
          expect(inc).toBe(h.kind === 'increase');
          if (h.kind === 'increase' || h.kind === 'nudge') {
            expect(deload).toBe(false);
            expect(set.reps + (rir ?? 0)).toBeGreaterThanOrEqual(Math.ceil(max * 1.5 - 1e-9));
            const all = [...earlier, set];
            let hardest = all[0]!.weight;
            let increases = 0;
            for (const s of all.slice(1)) {
              if (harder(ex, s.weight, hardest)) {
                increases += 1;
                hardest = s.weight;
              }
            }
            expect(increases).toBe(0);
            const atMin = all.filter((s) => near(s.weight, set.weight) && s.rir === 0 && s.reps <= min).length;
            expect(atMin).toBeLessThan(2);
          }
          if (h.kind === 'increase') {
            expect(measurable(ex)).toBe(true);
            expect(set.weight).toBeGreaterThan(0);
            expect(h.weight - set.weight).toBeCloseTo(ex.increment, 6);
            expect((h.weight - set.weight) / set.weight).toBeLessThanOrEqual(ex.maxIncreasePct + 1e-9);
            expect(h.reps).toEqual({ low: min, high: min });
          }
          if (h.kind === 'nudge') {
            expect(h.weight).toBe(set.weight);
            expect(h.reps).toBeUndefined();
            const stepOk =
              measurable(ex) && ex.increment > 0 && set.weight > 0 && ex.increment / set.weight <= ex.maxIncreasePct + 1e-9;
            expect(stepOk).toBe(false);
          }
          if (h.kind === 'decrease') expect(harder(ex, set.weight, h.weight)).toBe(true);
          if (deload) expect(['decrease', 'hold']).toContain(h.kind);
          if (h.reps) {
            expect(h.reps.low).toBeGreaterThanOrEqual(1);
            expect(h.reps.high).toBeGreaterThanOrEqual(h.reps.low);
          }
        },
      ),
      { numRuns: 2000 },
    );
  });
});

describe('护栏：状态等级', () => {
  it('等级与信号个数一致；减载周内不出信号', () => {
    const fixtures = [bench, squat, inclineDb, lateralRaise];
    const sessArb = fc.record({
      gap: fc.integer({ min: 1, max: 10 }),
      weight: fc.constantFrom(10, 20, 40, 60, 80),
      reps: fc.array(fc.integer({ min: 0, max: 16 }), { minLength: 1, maxLength: 4 }),
      rir: rirArb,
    });
    fc.assert(
      fc.property(
        fc.array(fc.array(sessArb, { maxLength: 10 }), { minLength: 1, maxLength: 4 }),
        fc.boolean(),
        (perExercise, deloadNow) => {
          const today = '2026-10-18';
          const exercises = perExercise.map((raws, i) => {
            let date = '2026-08-20';
            const sessions: ExerciseSession[] = [];
            for (const r of raws) {
              date = addDays(date, r.gap);
              if (date > today) break;
              sessions.push({ date, sets: r.reps.map((reps) => ({ weight: r.weight, reps, rir: r.rir })) });
            }
            return { exercise: fixtures[i] as ExerciseConfig, sessions };
          });
          const r = evaluateStatus({
            today,
            exercises,
            firstUseDate: '2026-08-20',
            ...(deloadNow ? { activeDeload: { start: '2026-10-15', end: '2026-10-21' } } : {}),
          });
          if (deloadNow) {
            expect(r.inDeload).toBe(true);
            expect(r.signals).toEqual([]);
            expect(r.level).toBe('normal');
            return;
          }
          const n = r.signals.length;
          expect(r.level).toBe(n >= 2 ? 'deload_suggested' : n === 1 ? 'watch' : 'normal');
          expect(r.blockStart <= today).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});
