import { describe, expect, it } from 'vitest';
import { adjustForLayoff, layoffCut, type Target } from '../src';
import { assistedPullUp, bench, pushUp } from './helpers';

const target: Target = { weight: 82.5, sets: 3, reps: [6, 6, 6], repRange: { min: 6, max: 8 }, extended: false, targetRir: 2 };

describe('回归：开始训练时给出减重建议，并提示减重或重新测试', () => {
  it('超过 14 天减 10%，超过 28 天减 20%', () => {
    expect(layoffCut(14)).toBe(0);
    expect(layoffCut(15)).toBe(0.1);
    expect(layoffCut(28)).toBe(0.1);
    expect(layoffCut(29)).toBe(0.2);
  });

  it('14 天以内不调整，也不提示', () => {
    const r = adjustForLayoff({ exercise: bench, target, lastSessionDate: '2026-10-01', today: '2026-10-15' });
    expect(r.adjusted).toBe(false);
    expect(r.target).toBe(target);
    expect(r.notice).toBeUndefined();
  });

  it('15 天：建议 82.5 × 0.9 = 74.25 向下取整到 72.5 kg，提示减重或重新测试，原目标一并返回', () => {
    const r = adjustForLayoff({ exercise: bench, target, lastSessionDate: '2026-10-01', today: '2026-10-16' });
    expect(r.adjusted).toBe(true);
    expect(r.notice).toBe('reduce_or_retest');
    expect(r.gapDays).toBe(15);
    expect(r.target.weight).toBe(72.5);
    expect(r.target.layoffAdjusted).toBe(true);
    expect(r.previous).toBe(target);
  });

  it('30 天：82.5 × 0.8 = 66 向下取整到 65 kg', () => {
    const r = adjustForLayoff({ exercise: bench, target, lastSessionDate: '2026-10-01', today: '2026-10-31' });
    expect(r.target.weight).toBe(65);
    expect(r.cut).toBe(0.2);
  });

  it('已经调整过的目标不再重复减，也不再提示', () => {
    const once = adjustForLayoff({ exercise: bench, target, lastSessionDate: '2026-10-01', today: '2026-10-16' }).target;
    const twice = adjustForLayoff({ exercise: bench, target: once, lastSessionDate: '2026-10-01', today: '2026-10-16' });
    expect(twice.adjusted).toBe(false);
    expect(twice.notice).toBeUndefined();
    expect(twice.target.weight).toBe(72.5);
  });

  it('"上限 +3"的状态清掉，次数回到原区间内', () => {
    const extended: Target = { ...target, weight: 80, repRange: { min: 6, max: 11 }, extended: true, reps: [10, 10, 10] };
    const r = adjustForLayoff({ exercise: bench, target: extended, lastSessionDate: '2026-10-01', today: '2026-10-20' });
    expect(r.target.extended).toBe(false);
    expect(r.target.repRange).toEqual({ min: 6, max: 8 });
    expect(r.target.reps).toEqual([8, 8, 8]);
  });

  it('增量为 0 的自重动作改为减次数', () => {
    const t: Target = { weight: 0, sets: 3, reps: [20, 20, 20], repRange: { min: 10, max: 20 }, extended: false, targetRir: 2 };
    const r = adjustForLayoff({ exercise: pushUp, target: t, lastSessionDate: '2026-10-01', today: '2026-10-21' });
    expect(r.target.weight).toBe(0);
    expect(r.target.reps).toEqual([18, 18, 18]);
    expect(r.notice).toBe('reduce_or_retest');
  });

  it('助力动作改为加助力：一档或两档', () => {
    const t: Target = { weight: 20, sets: 3, reps: [10, 10, 10], repRange: { min: 8, max: 12 }, extended: false, targetRir: 2 };
    expect(adjustForLayoff({ exercise: assistedPullUp, target: t, lastSessionDate: '2026-10-01', today: '2026-10-16' }).target.weight).toBe(25);
    expect(adjustForLayoff({ exercise: assistedPullUp, target: t, lastSessionDate: '2026-10-01', today: '2026-10-31' }).target.weight).toBe(30);
  });
});
