import { describe, expect, it } from 'vitest';
import { isInDeload, planDeload, type Target } from '../src';

const t = (weight: number, sets: number, min: number, max: number): Target => ({
  weight,
  sets,
  reps: Array.from({ length: sets }, () => max),
  repRange: { min, max },
  extended: false,
  targetRir: 2,
});

describe('减载周方案', () => {
  const plan = planDeload({
    start: '2026-10-19',
    items: [
      { exerciseId: 'bench', target: t(80, 3, 6, 8) },
      { exerciseId: 'squat', target: t(100, 4, 5, 8) },
      { exerciseId: 'raise', target: t(10, 5, 12, 15) },
      { exerciseId: 'curl', target: t(12, 1, 10, 12) },
    ],
  });

  it('持续 7 天', () => {
    expect(plan.start).toBe('2026-10-19');
    expect(plan.end).toBe('2026-10-25');
  });

  it('组数减约一半（向上取整），重量不变，次数取下限，余力 +2', () => {
    const [bench, squat, raise, curl] = plan.items.map((i) => i.target);
    expect(bench).toMatchObject({ weight: 80, sets: 2, reps: [6, 6], targetRir: 4 });
    expect(squat?.sets).toBe(2);
    expect(raise?.sets).toBe(3);
    expect(curl?.sets).toBe(1);
  });

  it('判断是否在减载周内', () => {
    const active = { start: '2026-10-19', end: '2026-10-25' };
    expect(isInDeload(active, '2026-10-19')).toBe(true);
    expect(isInDeload(active, '2026-10-25')).toBe(true);
    expect(isInDeload(active, '2026-10-26')).toBe(false);
    expect(isInDeload(null, '2026-10-20')).toBe(false);
  });
});
