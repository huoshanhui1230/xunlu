import { describe, expect, it } from 'vitest';
import { increaseThreshold, suggestNextSet } from '../src';
import { assistedPullUp, bench, inclineDb, pullUp, pushUp, squat } from './helpers';

describe('A 组间提示', () => {
  it('方案示例：80 kg × 8 次、还能再做 4 次 → 第 2 组试试 82.5 kg × 6', () => {
    const h = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 8, rir: 4 } });
    expect(h.ruleId).toBe('A1');
    expect(h.kind).toBe('increase');
    expect(h.weight).toBe(82.5);
    expect(h.reps).toEqual({ low: 6, high: 6 });
    expect(h.capacity).toBe(12);
    expect(h.threshold).toBe(12);
    expect(h.rirSource).toBe('entered');
    expect(h.change.pct).toBeCloseTo(0.03125, 6);
  });

  it('门槛是次数上限 × 1.5 向上取整', () => {
    expect(increaseThreshold({ min: 6, max: 8 })).toBe(12);
    expect(increaseThreshold({ min: 5, max: 7 })).toBe(11);
    expect(increaseThreshold({ min: 12, max: 15 })).toBe(23);
  });

  it('能完成 11 次（不到 12）且已到上限 → 保持', () => {
    const h = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 8, rir: 3 } });
    expect(h.ruleId).toBe('A4');
    expect(h.weight).toBe(80);
    expect(h.increaseBlockedBy).toBeUndefined();
  });

  it('次数未到上限且 RIR ≥ 3 → 重量不变，多做 1–2 次，不超过上限', () => {
    const a = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 7, rir: 3 } });
    expect(a.ruleId).toBe('A2');
    expect(a.reps).toEqual({ low: 8, high: 8 });
    const b = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 6, rir: 3 } });
    expect(b.reps).toEqual({ low: 7, high: 8 });
  });

  it('低于下限且力竭 → 减一档', () => {
    const h = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 5, rir: 0 } });
    expect(h.ruleId).toBe('A3');
    expect(h.weight).toBe(77.5);
    expect(h.reps).toEqual({ low: 6, high: 8 });
  });

  describe('RIR 没填', () => {
    it('第 1 组没填：提示填写，不给其他建议', () => {
      const h = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 8, rir: null } });
      expect(h.ruleId).toBe('A0');
      expect(h.kind).toBe('need_rir');
      expect(h.weight).toBe(80);
      expect(h.reps).toBeUndefined();
      expect(h.rirSource).toBe('none');
    });

    it('之后的组没填：沿用上一组的 RIR', () => {
      const h = suggestNextSet({
        exercise: bench,
        set: { weight: 80, reps: 8, rir: null },
        earlierSets: [{ weight: 80, reps: 8, rir: 4 }],
      });
      expect(h.rirSource).toBe('previous');
      expect(h.capacity).toBe(12);
      expect(h.kind).toBe('increase');
    });

    it('沿用最近一组填过的值', () => {
      const h = suggestNextSet({
        exercise: bench,
        set: { weight: 80, reps: 6, rir: null },
        earlierSets: [
          { weight: 80, reps: 8, rir: 3 },
          { weight: 80, reps: 7, rir: null },
        ],
      });
      expect(h.rirSource).toBe('previous');
      expect(h.ruleId).toBe('A2');
      expect(h.reps).toEqual({ low: 7, high: 8 });
    });

    it('沿用的 RIR 不是 0 时，低于下限也不减重', () => {
      const h = suggestNextSet({
        exercise: bench,
        set: { weight: 80, reps: 5, rir: null },
        earlierSets: [{ weight: 80, reps: 8, rir: 2 }],
      });
      expect(h.ruleId).toBe('A4');
    });

    it('关闭 RIR 记录时不提示填写，只按次数判断', () => {
      const a = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 12 }, rirEnabled: false });
      expect(a.kind).toBe('increase');
      expect(a.rirSource).toBe('none');
      const b = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 5 }, rirEnabled: false });
      expect(b.ruleId).toBe('A3');
    });
  });

  describe('一档超过上限或无法确认幅度：只提醒方向，不给数值', () => {
    it('8 kg 哑铃换 10 kg 是 +25%：提醒可以加重或多做几次', () => {
      const h = suggestNextSet({ exercise: inclineDb, set: { weight: 8, reps: 12, rir: 6 } });
      expect(h.ruleId).toBe('A1');
      expect(h.kind).toBe('nudge');
      expect(h.nudge).toEqual(['weight', 'reps']);
      expect(h.nudgeReason).toBe('step_exceeds_cap');
      expect(h.weight).toBe(8);
      expect(h.reps).toBeUndefined();
    });

    it('自重加负重、助力动作无法确认幅度', () => {
      const a = suggestNextSet({ exercise: pullUp, set: { weight: 0, reps: 10, rir: 5 } });
      expect(a.kind).toBe('nudge');
      expect(a.nudgeReason).toBe('cap_unverifiable');
      expect(a.nudge).toEqual(['weight', 'reps']);
      const b = suggestNextSet({ exercise: assistedPullUp, set: { weight: 20, reps: 12, rir: 6 } });
      expect(b.kind).toBe('nudge');
      expect(b.weight).toBe(20);
    });

    it('增量为 0、助力已是 0：只提醒多做几次', () => {
      const a = suggestNextSet({ exercise: pushUp, set: { weight: 0, reps: 20, rir: 10 } });
      expect(a.nudge).toEqual(['reps']);
      expect(a.nudgeReason).toBe('reps_only');
      const b = suggestNextSet({ exercise: assistedPullUp, set: { weight: 0, reps: 12, rir: 6 } });
      expect(b.nudge).toEqual(['reps']);
      expect(b.nudgeReason).toBe('assistance_done');
    });
  });

  it('下肢复合动作上限 10%：50 kg 深蹲可以提示加到 55 kg', () => {
    const h = suggestNextSet({ exercise: squat, set: { weight: 50, reps: 8, rir: 4 } });
    expect(h.ruleId).toBe('A1');
    expect(h.kind).toBe('increase');
    expect(h.weight).toBe(55);
    expect(h.reps).toEqual({ low: 5, high: 5 });
  });

  describe('什么时候不提示加重', () => {
    it('本次这个动作已经加过一次重（不管是否点了应用）', () => {
      const h = suggestNextSet({
        exercise: bench,
        set: { weight: 82.5, reps: 8, rir: 4 },
        earlierSets: [{ weight: 80, reps: 8, rir: 4 }],
      });
      expect(h.increaseBlockedBy).toBe('already_increased');
      expect(h.ruleId).toBe('A4');
      expect(h.weight).toBe(82.5);
    });

    it('提示过但没加重：还可以再提示', () => {
      const h = suggestNextSet({
        exercise: bench,
        set: { weight: 80, reps: 8, rir: 4 },
        earlierSets: [{ weight: 80, reps: 8, rir: 4 }],
      });
      expect(h.kind).toBe('increase');
    });

    it('递减组不算加过重', () => {
      const h = suggestNextSet({
        exercise: bench,
        set: { weight: 80, reps: 8, rir: 4 },
        earlierSets: [
          { weight: 80, reps: 8, rir: 4 },
          { weight: 70, reps: 10, rir: 2, tag: 'drop' },
        ],
      });
      expect(h.kind).toBe('increase');
    });

    it('同一重量已有 2 组力竭且次数在下限：不提示加重', () => {
      const h = suggestNextSet({
        exercise: bench,
        set: { weight: 80, reps: 8, rir: 4 },
        earlierSets: [
          { weight: 80, reps: 6, rir: 0 },
          { weight: 80, reps: 6, rir: 0 },
        ],
      });
      expect(h.increaseBlockedBy).toBe('to_failure');
      expect(h.kind).not.toBe('increase');
    });

    it('力竭但次数高于下限：仍可提示加重', () => {
      const h = suggestNextSet({
        exercise: bench,
        set: { weight: 80, reps: 8, rir: 4 },
        earlierSets: [
          { weight: 80, reps: 8, rir: 0 },
          { weight: 80, reps: 7, rir: 0 },
        ],
      });
      expect(h.kind).toBe('increase');
    });

    it('减载周只会减重或保持，不提示加重或多做', () => {
      const a = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 8, rir: 4 }, inDeload: true });
      expect(a.ruleId).toBe('A4');
      expect(a.increaseBlockedBy).toBe('deload');
      const b = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 6, rir: 4 }, inDeload: true });
      expect(b.ruleId).toBe('A4');
      const c = suggestNextSet({ exercise: bench, set: { weight: 80, reps: 5, rir: 0 }, inDeload: true });
      expect(c.ruleId).toBe('A3');
      expect(c.weight).toBe(77.5);
    });
  });

  it('助力动作减一档 = 加一档助力', () => {
    const h = suggestNextSet({ exercise: assistedPullUp, set: { weight: 20, reps: 6, rir: 0 } });
    expect(h.ruleId).toBe('A3');
    expect(h.weight).toBe(25);
  });

  it('额外负重已是 0 时无法再减 → 保持', () => {
    const h = suggestNextSet({ exercise: pullUp, set: { weight: 0, reps: 4, rir: 0 } });
    expect(h.ruleId).toBe('A4');
    expect(h.weight).toBe(0);
  });
});
