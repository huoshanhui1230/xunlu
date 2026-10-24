import { describe, expect, it } from 'vitest';
import { suggestNextTarget, type Suggestion } from '../src';
import { bench, session } from './helpers';

/** 方案第八节"算例"：杠铃卧推，计划 3 组 × 6–8 次，默认增量 2.5 kg，加重上限 5% */
describe('方案算例：杠铃卧推 3 × 6–8', () => {
  const sessions = [
    session('2026-10-01', [[80, 8, 2], [80, 7, 1], [80, 6, 1]]),
    session('2026-10-04', [[80, 8, 2], [80, 7, 1], [80, 7, 1]]),
    session('2026-10-08', [[80, 8, 2], [80, 8, 1], [80, 8, 1]]),
    session('2026-10-11', [[80, 8, 2], [80, 8, 2], [80, 8, 1]]),
    session('2026-10-15', [[82.5, 7, 1], [82.5, 6, 1], [82.5, 5, 0]]),
  ];
  const run = (i: number): Suggestion =>
    suggestNextTarget({ exercise: bench, history: sessions.slice(0, i), session: sessions[i]! }) as Suggestion;

  it('第 1 次：基线，80 kg，先重复本次表现', () => {
    const s = run(0);
    expect(s.ruleId).toBe('B1');
    expect(s.kind).toBe('hold');
    expect(s.target.weight).toBe(80);
    expect(s.target.reps).toEqual([8, 7, 6]);
    expect(s.notes).toContain('leave_2_rir');
  });

  it('第 2 次：推进，第 2、3 组各争取 8 次，离加重还差 2 次', () => {
    const s = run(1);
    expect(s.ruleId).toBe('B5');
    expect(s.reason).toBe('progress_reps');
    expect(s.target.weight).toBe(80);
    expect(s.target.reps).toEqual([8, 8, 8]);
    expect(s.gapToIncrease).toBe(2);
  });

  it('第 3 次：首次达标，但有组 RIR 只有 1，再达标一次就加重', () => {
    const s = run(2);
    expect(s.ruleId).toBe('B5');
    expect(s.reason).toBe('confirm_once_more');
    expect(s.target.weight).toBe(80);
    expect(s.gapToIncrease).toBe(0);
  });

  it('第 4 次：连续 2 次达标，82.5 kg（+3.1%），每组从 6 次起', () => {
    const s = run(3);
    expect(s.ruleId).toBe('B4');
    expect(s.kind).toBe('increase');
    expect(s.reason).toBe('increase_consecutive');
    expect(s.target.weight).toBe(82.5);
    expect(s.change.pct).toBeCloseTo(0.03125, 6);
    expect(s.target.reps).toEqual([6, 6, 6]);
    expect(s.basis).toContain('ACSM2009');
  });

  it('第 5 次：第 3 组只做到 5 次且力竭，第 1 次失败，82.5 kg 先让每组都做到 6 次', () => {
    const s = run(4);
    expect(s.ruleId).toBe('B3');
    expect(s.reason).toBe('failure_first');
    expect(s.target.weight).toBe(82.5);
    expect(s.target.reps).toEqual([6, 6, 6]);
  });
});
