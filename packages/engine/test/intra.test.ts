import { describe, expect, it } from 'vitest';
import { increaseThreshold, suggestNextSet } from '../src';
import { assistedPullUp, bench, conservative, inclineDb, normal, pullUp, pushUp, squat } from './helpers';

describe('A 组间提示', () => {
  it('方案示例：80 kg × 8 次、还能再做 4 次 → 第 2 组试试 82.5 kg × 6', () => {
    const h = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 8, rir: 4 }, settings: normal });
    expect(h.ruleId).toBe('A1');
    expect(h.kind).toBe('increase');
    expect(h.weight).toBe(82.5);
    expect(h.reps).toEqual({ low: 6, high: 6 });
    expect(h.capacity).toBe(12);
    expect(h.threshold).toBe(12);
    expect(h.change.pct).toBeCloseTo(0.03125, 6);
  });

  it('门槛是次数上限 × 1.5 向上取整', () => {
    expect(increaseThreshold({ min: 6, max: 8 })).toBe(12);
    expect(increaseThreshold({ min: 5, max: 7 })).toBe(11);
    expect(increaseThreshold({ min: 12, max: 15 })).toBe(23);
  });

  it('能完成 11 次（不到 12）且已到上限 → 保持', () => {
    const h = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 8, rir: 3 }, settings: normal });
    expect(h.ruleId).toBe('A4');
    expect(h.weight).toBe(80);
    expect(h.increaseBlockedBy).toBeUndefined();
  });

  it('次数未到上限且 RIR ≥ 3 → 重量不变，多做 1–2 次，不超过上限', () => {
    const a = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 7, rir: 3 }, settings: normal });
    expect(a.ruleId).toBe('A2');
    expect(a.reps).toEqual({ low: 8, high: 8 });
    const b = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 6, rir: 3 }, settings: normal });
    expect(b.reps).toEqual({ low: 7, high: 8 });
  });

  it('低于下限且力竭 → 减一档', () => {
    const h = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 5, rir: 0 }, settings: normal });
    expect(h.ruleId).toBe('A3');
    expect(h.weight).toBe(77.5);
    expect(h.reps).toEqual({ low: 6, high: 8 });
  });

  it('低于下限且没填 RIR → 视同力竭，减一档', () => {
    const h = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 5, rir: null }, settings: normal });
    expect(h.ruleId).toBe('A3');
    expect(h.rirKnown).toBe(false);
  });

  it('没填 RIR 时只按次数算：做了 12 次也提示加重', () => {
    const h = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 12 }, settings: normal });
    expect(h.ruleId).toBe('A1');
    expect(h.weight).toBe(82.5);
  });

  it('保守模式、减载期间、本次已提示过加重：都不出加重提示', () => {
    const set = { weight: 80, reps: 8, rir: 4 };
    expect(suggestNextSet({ exercise: bench, set, settings: conservative }).increaseBlockedBy).toBe('conservative');
    expect(suggestNextSet({ exercise: bench, set, settings: normal, inDeload: true }).increaseBlockedBy).toBe('deload');
    const limited = suggestNextSet({ exercise: bench, set, settings: normal, increaseHintsUsed: 1 });
    expect(limited.increaseBlockedBy).toBe('limit_reached');
    expect(limited.weight).toBe(80);
  });

  it('同一重量已有 2 组力竭 → 不出加重提示', () => {
    const h = suggestNextSet({
      exercise: bench,
      set: { weight: 80, reps: 12, rir: 0 },
      earlierSets: [{ weight: 80, reps: 8, rir: 0 }],
      settings: normal,
    });
    expect(h.kind).not.toBe('increase');
    expect(h.increaseBlockedBy).toBe('to_failure');
  });

  it('一档超过上限不提示加重：8 kg 哑铃换 10 kg 是 +25%', () => {
    const h = suggestNextSet({ exercise: inclineDb, set: { weight: 8, reps: 12, rir: 6 }, settings: normal });
    expect(h.kind).not.toBe('increase');
    expect(h.increaseBlockedBy).toBe('step_exceeds_cap');
  });

  it('下肢复合动作上限 10%：50 kg 深蹲可以提示加到 55 kg', () => {
    const h = suggestNextSet({ exercise: squat, set: { weight: 50, reps: 8, rir: 4 }, settings: normal });
    expect(h.ruleId).toBe('A1');
    expect(h.weight).toBe(55);
    expect(h.reps).toEqual({ low: 5, high: 5 });
  });

  it('自重加负重、助力动作无法确认幅度，不提示加重', () => {
    expect(suggestNextSet({ exercise: pullUp, set: { weight: 0, reps: 10, rir: 5 }, settings: normal }).increaseBlockedBy).toBe(
      'cap_unverifiable',
    );
    expect(
      suggestNextSet({ exercise: assistedPullUp, set: { weight: 20, reps: 12, rir: 6 }, settings: normal }).increaseBlockedBy,
    ).toBe('cap_unverifiable');
  });

  it('增量为 0 的动作不提示加重', () => {
    const h = suggestNextSet({ exercise: pushUp, set: { weight: 0, reps: 20, rir: 10 }, settings: normal });
    expect(h.increaseBlockedBy).toBe('reps_only');
    expect(h.weight).toBe(0);
  });

  it('助力动作减一档 = 加一档助力', () => {
    const h = suggestNextSet({ exercise: assistedPullUp, set: { weight: 20, reps: 6, rir: 0 }, settings: normal });
    expect(h.ruleId).toBe('A3');
    expect(h.weight).toBe(25);
  });

  it('额外负重已是 0 时无法再减 → 保持', () => {
    const h = suggestNextSet({ exercise: pullUp, set: { weight: 0, reps: 4, rir: 0 }, settings: normal });
    expect(h.ruleId).toBe('A4');
    expect(h.weight).toBe(0);
  });
});
