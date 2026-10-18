import { describe, expect, it } from 'vitest';
import {
  checkSuggestion,
  evaluateSession,
  needsSpotterReminder,
  suggestNextTarget,
  type PostInput,
  type Suggestion,
  type Target,
} from '../src';
import {
  assistedPullUp,
  bench,
  conservative,
  inclineDb,
  lateralRaise,
  normal,
  pullUp,
  pushUp,
  same,
  session,
  squat,
} from './helpers';

const run = (input: PostInput): Suggestion => suggestNextTarget(input) as Suggestion;

describe('B4 加重', () => {
  it('一次达标且每组 RIR ≥ 2 → 加一档', () => {
    const s = run({
      exercise: bench,
      history: [session('2026-10-01', [[80, 8, 2], [80, 7, 1], [80, 7, 1]])],
      session: same('2026-10-04', 80, [8, 8, 8], 2),
      settings: normal,
    });
    expect(s.reason).toBe('increase_rir');
    expect(s.target.weight).toBe(82.5);
    expect(s.target.reps).toEqual([6, 6, 6]);
    expect(s.basis).toContain('Zourdos2016');
  });

  it('保守模式只认连续 2 次达标', () => {
    const input: PostInput = {
      exercise: bench,
      history: [session('2026-10-01', [[80, 8, 2], [80, 7, 1], [80, 7, 1]])],
      session: same('2026-10-04', 80, [8, 8, 8], 2),
      settings: conservative,
    };
    expect(run(input).reason).toBe('confirm_once_more');
    const twice = run({ ...input, history: [same('2026-10-01', 80, [8, 8, 8], 1)] });
    expect(twice.reason).toBe('increase_consecutive');
    expect(twice.target.weight).toBe(82.5);
  });

  it('连续达标必须是同一重量', () => {
    const s = run({
      exercise: bench,
      history: [same('2026-10-01', 77.5, [8, 8, 8], 1)],
      session: same('2026-10-04', 80, [8, 8, 8], 1),
      settings: normal,
    });
    expect(s.reason).toBe('confirm_once_more');
  });

  it('下肢复合动作一档超过 10%：先把次数上限提高 3 次', () => {
    const s = run({
      exercise: squat,
      history: [same('2026-10-01', 40, [8, 8, 8], 2)],
      session: same('2026-10-04', 40, [8, 8, 8], 2),
      settings: normal,
    });
    expect(s.reason).toBe('extend_reps');
    expect(s.kind).toBe('add_reps');
    expect(s.target.weight).toBe(40);
    expect(s.target.repRange).toEqual({ min: 5, max: 11 });
    expect(s.target.extended).toBe(true);
    expect(s.target.reps).toEqual([9, 9, 9]);
    expect(s.detail.stepPct).toBeCloseTo(0.125, 6);
  });

  describe('一档超过上限：8 kg 哑铃 → 10 kg（+25%）', () => {
    const h1 = same('2026-10-01', 8, [12, 12, 12], 2);
    const s1 = same('2026-10-04', 8, [12, 12, 12], 2);
    const first = run({ exercise: inclineDb, history: [h1], session: s1, settings: normal });

    it('先把上限从 12 提到 15，每组 +1 次', () => {
      expect(first.reason).toBe('extend_reps');
      expect(first.target.repRange).toEqual({ min: 8, max: 15 });
      expect(first.target.reps).toEqual([13, 13, 13]);
      expect(first.gapToIncrease).toBe(9);
    });

    it('做满 15 次后再换 10 kg，次数回到 8', () => {
      const s = run({
        exercise: inclineDb,
        history: [h1, s1],
        session: same('2026-10-08', 8, [15, 15, 15], 2),
        settings: normal,
        currentTarget: first.target,
      });
      expect(s.reason).toBe('increase_after_extension');
      expect(s.target.weight).toBe(10);
      expect(s.change.pct).toBeCloseTo(0.25, 6);
      expect(s.target.repRange).toEqual({ min: 8, max: 12 });
      expect(s.target.reps).toEqual([8, 8, 8]);
      expect(s.target.extended).toBe(false);
    });

    it('保守模式一律不超过 5%：做满后也保持', () => {
      const s = run({
        exercise: inclineDb,
        history: [same('2026-10-04', 8, [15, 15, 15], 1)],
        session: same('2026-10-08', 8, [15, 15, 15], 1),
        settings: conservative,
        currentTarget: first.target,
      });
      expect(s.reason).toBe('step_exceeds_conservative_cap');
      expect(s.target.weight).toBe(8);
    });
  });

  it('增量为 0 的自重动作只加次数', () => {
    const s = run({
      exercise: pushUp,
      history: [same('2026-10-01', 0, [20, 20, 20], 2)],
      session: same('2026-10-04', 0, [20, 20, 20], 2),
      settings: normal,
    });
    expect(s.reason).toBe('reps_only');
    expect(s.target.weight).toBe(0);
    expect(s.target.reps).toEqual([21, 21, 21]);
  });

  it('自重加负重无法确认幅度：先上限 +3，做满后加 2.5 kg', () => {
    const h = same('2026-10-01', 0, [10, 10, 10], 2);
    const s1 = same('2026-10-04', 0, [10, 10, 10], 2);
    const first = run({ exercise: pullUp, history: [h], session: s1, settings: normal });
    expect(first.reason).toBe('extend_reps');
    expect(first.target.repRange).toEqual({ min: 6, max: 13 });
    const second = run({
      exercise: pullUp,
      history: [h, s1],
      session: same('2026-10-08', 0, [13, 13, 13], 2),
      settings: normal,
      currentTarget: first.target,
    });
    expect(second.reason).toBe('increase_after_extension');
    expect(second.target.weight).toBe(2.5);
    expect(second.change.pct).toBeNull();
  });

  it('助力动作：加重 = 减一档助力；助力减到 0 后只加次数', () => {
    const h = same('2026-10-01', 20, [12, 12, 12], 2);
    const s1 = same('2026-10-04', 20, [12, 12, 12], 2);
    const first = run({ exercise: assistedPullUp, history: [h], session: s1, settings: normal });
    expect(first.reason).toBe('extend_reps');
    const second = run({
      exercise: assistedPullUp,
      history: [h, s1],
      session: same('2026-10-08', 20, [15, 15, 15], 2),
      settings: normal,
      currentTarget: first.target,
    });
    expect(second.kind).toBe('increase');
    expect(second.target.weight).toBe(15);

    const done = run({
      exercise: assistedPullUp,
      history: [same('2026-10-01', 0, [12, 12, 12], 2)],
      session: same('2026-10-04', 0, [12, 12, 12], 2),
      settings: normal,
    });
    expect(done.reason).toBe('assistance_done');
    expect(done.notes).toContain('switch_to_bodyweight');
  });
});

describe('B3 失败', () => {
  const failed = session('2026-10-15', [[82.5, 7, 1], [82.5, 6, 1], [82.5, 5, 0]]);

  it('连续第 2 次失败：减 5–10%，取整到 2.5 kg → 77.5 kg', () => {
    const s = run({
      exercise: bench,
      history: [same('2026-10-11', 80, [8, 8, 8], 2), failed],
      session: session('2026-10-18', [[82.5, 7, 1], [82.5, 6, 0], [82.5, 5, 0]]),
      settings: normal,
    });
    expect(s.reason).toBe('failure_repeat');
    expect(s.kind).toBe('reduce');
    expect(s.target.weight).toBe(77.5);
    expect(s.change.pct).toBeCloseTo(-0.0606, 3);
    expect(s.target.reps).toEqual([6, 6, 6]);
  });

  it('工作重量以外的组力竭也算失败（更保守）', () => {
    const s = run({
      exercise: bench,
      history: [same('2026-10-01', 80, [8, 8, 7], 1)],
      session: session('2026-10-04', [[80, 8, 1], [80, 7, 1], [72.5, 5, 0]]),
      settings: normal,
    });
    expect(s.reason).toBe('failure_first');
    expect(s.target.weight).toBe(80);
  });

  it('没填 RIR 的组低于下限也算失败', () => {
    const s = run({
      exercise: bench,
      history: [same('2026-10-01', 80, [6, 6, 6], 1)],
      session: same('2026-10-04', 80, [5, 5, 5], null),
      settings: normal,
    });
    expect(s.reason).toBe('failure_first');
  });

  it('额外负重已是 0、无法再减：保持并提示换更容易的变式', () => {
    const s = run({
      exercise: pullUp,
      history: [same('2026-10-01', 0, [5, 5, 4], 0)],
      session: same('2026-10-04', 0, [5, 4, 4], 0),
      settings: normal,
    });
    expect(s.reason).toBe('cannot_reduce');
    expect(s.notes).toContain('try_easier_variation');
  });
});

describe('B2 回归', () => {
  const before = same('2026-10-01', 80, [8, 8, 7], 1);

  it('超过 14 天：减 10%，向下取整到 2.5 kg → 70 kg', () => {
    const s = run({ exercise: bench, history: [before], session: same('2026-10-16', 80, [8, 8, 7], 1), settings: normal });
    expect(s.ruleId).toBe('B2');
    expect(s.kind).toBe('reduce');
    expect(s.target.weight).toBe(70);
    expect(s.target.reps).toEqual([8, 8, 7]);
    expect(s.detail).toEqual({ gapDays: 15, cut: 0.1 });
  });

  it('超过 28 天：减 20% → 62.5 kg', () => {
    const s = run({ exercise: bench, history: [before], session: same('2026-10-30', 80, [8, 8, 7], 1), settings: normal });
    expect(s.target.weight).toBe(62.5);
    expect(s.detail.cut).toBe(0.2);
  });

  it('正好 14 天不算回归', () => {
    const s = run({ exercise: bench, history: [before], session: same('2026-10-15', 80, [8, 8, 7], 1), settings: normal });
    expect(s.ruleId).not.toBe('B2');
  });

  it('开始训练时已按回归减过，训练后不再重复减', () => {
    const adjusted: Target = {
      weight: 70,
      sets: 3,
      reps: [8, 8, 7],
      repRange: { min: 6, max: 8 },
      extended: false,
      targetRir: 2,
      layoffAdjusted: true,
    };
    const s = run({
      exercise: bench,
      history: [before],
      session: same('2026-10-16', 70, [8, 8, 8], 2),
      settings: normal,
      currentTarget: adjusted,
    });
    expect(s.ruleId).toBe('B4');
    expect(s.target.weight).toBe(72.5);
  });

  it('用户自己减到 70 kg 也不再重复减', () => {
    const s = run({ exercise: bench, history: [before], session: same('2026-10-16', 70, [8, 8, 7], 1), settings: normal });
    expect(s.ruleId).not.toBe('B2');
  });
});

describe('B5 推进与 B6 平台期', () => {
  it('每组都到上限但有组力竭：保持，先留出余力', () => {
    const s = run({
      exercise: bench,
      history: [same('2026-10-01', 80, [8, 7, 7], 1)],
      session: session('2026-10-04', [[80, 8, 0], [80, 8, 1], [80, 8, 1]]),
      settings: normal,
    });
    expect(s.reason).toBe('at_max_with_failure');
    expect(s.target.reps).toEqual([8, 8, 8]);
  });

  it('同一重量 4 次、最近 3 次平均估算 1RM 都没超过此前最佳 → 平台期', () => {
    const all = [
      same('2026-10-01', 80, [8, 8, 7]),
      same('2026-10-04', 80, [8, 7, 7]),
      same('2026-10-08', 80, [8, 7, 7]),
      same('2026-10-11', 80, [8, 7, 7]),
    ];
    const s = run({ exercise: bench, history: all.slice(0, 3), session: all[3]!, settings: normal });
    expect(s.ruleId).toBe('B6');
    expect(s.kind).toBe('plateau');
    expect(s.target.weight).toBe(80);
    expect(s.plateauOptions?.map((o) => o.kind)).toEqual(['change_rep_range', 'change_variation', 'reduce_once']);
    const reduceOnce = s.plateauOptions?.[2]?.target;
    expect(reduceOnce?.sets).toBe(2);
    expect(reduceOnce?.weight).toBe(80);
  });

  it('后几组还在加次数时不算平台期', () => {
    const all = [
      same('2026-10-01', 80, [8, 6, 6]),
      same('2026-10-04', 80, [8, 7, 6]),
      same('2026-10-08', 80, [8, 7, 7]),
      same('2026-10-11', 80, [8, 8, 7]),
    ];
    const s = run({ exercise: bench, history: all.slice(0, 3), session: all[3]!, settings: normal });
    expect(s.reason).toBe('progress_reps');
  });

  it('减重后重新爬升不算平台期', () => {
    const all = [
      same('2026-10-01', 85, [8, 8, 7]),
      same('2026-10-04', 80, [7, 7, 6]),
      same('2026-10-08', 80, [7, 7, 7]),
      same('2026-10-11', 80, [8, 7, 7]),
    ];
    const s = run({ exercise: bench, history: all.slice(0, 3), session: all[3]!, settings: normal });
    expect(s.ruleId).not.toBe('B6');
  });

  it('次数都超过 10 次的动作算不出估算 1RM，不判断平台期', () => {
    const all = [
      same('2026-10-01', 10, [15, 14, 13]),
      same('2026-10-04', 10, [14, 13, 13]),
      same('2026-10-08', 10, [14, 13, 13]),
      same('2026-10-11', 10, [14, 13, 13]),
    ];
    const s = run({ exercise: lateralRaise, history: all.slice(0, 3), session: all[3]!, settings: normal });
    expect(s.ruleId).toBe('B5');
  });
});

describe('其他', () => {
  it('工作重量取组数最多的重量，组数相同取更难的', () => {
    const ev = evaluateSession(bench, session('2026-10-01', [[80, 8, 4], [82.5, 7, 2], [82.5, 6, 1]]), bench.repRange);
    expect(ev?.workingWeight).toBe(82.5);
    expect(ev?.workingSets).toHaveLength(2);
    expect(evaluateSession(bench, session('2026-10-01', [[80, 8], [82.5, 6]]), bench.repRange)?.workingWeight).toBe(82.5);
    expect(
      evaluateSession(assistedPullUp, session('2026-10-01', [[20, 10], [15, 8]]), assistedPullUp.repRange)?.workingWeight,
    ).toBe(15);
  });

  it('减载期间沿用减载前的目标', () => {
    const pre: Target = { weight: 82.5, sets: 3, reps: [6, 6, 6], repRange: { min: 6, max: 8 }, extended: false, targetRir: 2 };
    const s = run({
      exercise: bench,
      history: [same('2026-10-11', 80, [8, 8, 8], 2)],
      session: same('2026-10-15', 82.5, [6, 6], 4),
      settings: normal,
      inDeload: true,
      preDeloadTarget: pre,
    });
    expect(s.ruleId).toBe('DL');
    expect(s.target).toBe(pre);
  });

  it('减载期间没传减载前目标：保持本次工作重量', () => {
    const s = run({
      exercise: bench,
      history: [same('2026-10-11', 80, [8, 8, 8], 2)],
      session: same('2026-10-15', 80, [6, 6], 4),
      settings: normal,
      inDeload: true,
    });
    expect(s.ruleId).toBe('DL');
    expect(s.kind).toBe('deload');
    expect(s.target.weight).toBe(80);
  });

  it('减载周的训练不算进阶历史', () => {
    const s = run({
      exercise: bench,
      history: [{ ...same('2026-10-04', 80, [6, 6], 4), deload: true }],
      session: same('2026-10-08', 80, [8, 8, 8], 2),
      settings: normal,
    });
    expect(s.ruleId).toBe('B1');
  });

  it('计划组数多于本次组数时，用最后一组补齐；最多 6 组', () => {
    const four = run({
      exercise: { ...bench, plannedSets: 4 },
      history: [],
      session: session('2026-10-01', [[80, 8, 2], [80, 7, 1], [80, 6, 1]]),
      settings: normal,
    });
    expect(four.target.reps).toEqual([8, 7, 6, 6]);
    const eight = run({ exercise: { ...bench, plannedSets: 8 }, history: [], session: same('2026-10-01', 80, [8]), settings: normal });
    expect(eight.target.sets).toBe(6);
  });

  it('本次没有有效组时返回 null', () => {
    expect(suggestNextTarget({ exercise: bench, history: [], session: { date: '2026-10-01', sets: [] }, settings: normal })).toBeNull();
  });

  it('主项目标 RIR ≤ 1 时提醒保护', () => {
    expect(needsSpotterReminder(bench, 1)).toBe(true);
    expect(needsSpotterReminder(bench, 2)).toBe(false);
    expect(needsSpotterReminder(lateralRaise, 0)).toBe(false);
  });

  it('护栏能识别越界的建议', () => {
    const input: PostInput = {
      exercise: bench,
      history: [same('2026-10-08', 80, [8, 8, 8], 1)],
      session: same('2026-10-11', 80, [8, 8, 8], 1),
      settings: normal,
    };
    const ok = run(input);
    expect(checkSuggestion(input, ok)).toEqual([]);
    const forged: Suggestion = { ...ok, target: { ...ok.target, weight: 85, reps: [7, 7, 7] } };
    expect(checkSuggestion(input, forged)).toEqual(expect.arrayContaining(['not_one_step', 'cap', 'reps_raised_with_weight']));
  });
});
