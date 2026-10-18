import { describe, expect, it } from 'vitest';
import {
  addDays,
  bestSet,
  daysBetween,
  detectRecords,
  estimate1RM,
  exerciseVolume,
  gridFloor,
  muscleSetCounts,
  round2,
  setVolume,
  validateExercise,
  withParams,
  DEFAULT_PARAMS,
} from '../src';
import { assistedPullUp, bench, inclineDb, lateralRaise, pullUp, same, session, sets } from './helpers';

describe('估算 1RM', () => {
  it('Epley：80 kg × 8 次约 101 kg', () => {
    expect(estimate1RM(80, 8)).toBeCloseTo(101.333, 3);
  });
  it('只算 1–10 次的组', () => {
    expect(estimate1RM(80, 10)).not.toBeNull();
    expect(estimate1RM(80, 11)).toBeNull();
    expect(estimate1RM(80, 0)).toBeNull();
    expect(estimate1RM(0, 5)).toBeNull();
  });
});

describe('容量与肌群组数', () => {
  it('哑铃按两侧合计；自重加负重只算额外负重；助力不计', () => {
    expect(setVolume(bench, { weight: 80, reps: 8 })).toBe(640);
    expect(setVolume(inclineDb, { weight: 10, reps: 10 })).toBe(200);
    expect(setVolume(pullUp, { weight: 10, reps: 5 })).toBe(50);
    expect(setVolume(assistedPullUp, { weight: 20, reps: 10 })).toBe(0);
  });

  it('3 组 80 kg × 8 次 = 1,920 kg', () => {
    expect(exerciseVolume(bench, same('2026-10-01', 80, [8, 8, 8]))).toBe(1920);
  });

  it('主动肌计 1 组，协同肌计 0.5 组', () => {
    expect(muscleSetCounts([{ exercise: bench, sets: 3 }, { exercise: inclineDb, sets: 3 }])).toEqual({
      chest: 6,
      triceps: 3,
      'front-delts': 3,
    });
  });
});

describe('最佳组与新纪录', () => {
  it('最佳组按估算 1RM；超过 10 次的组按重量、次数', () => {
    expect(bestSet(bench, sets([[80, 8], [82.5, 6], [85, 3]]))).toMatchObject({ weight: 80, reps: 8 });
    expect(bestSet(lateralRaise, sets([[10, 15], [12, 12]]))).toMatchObject({ weight: 12, reps: 12 });
  });

  it('第一次做这个动作不算纪录', () => {
    expect(detectRecords(bench, [], same('2026-10-01', 80, [8, 8, 8]))).toEqual({ weight: null, reps: [], e1rm: null });
  });

  it('重量纪录与估算 1RM 纪录', () => {
    const r = detectRecords(bench, [same('2026-10-01', 80, [8, 7, 6])], session('2026-10-04', [[82.5, 7, 1], [80, 8, 1]]));
    expect(r.weight).toEqual({ weight: 82.5, reps: 7, previous: 80 });
    expect(r.e1rm?.value).toBeCloseTo(101.75, 2);
    expect(r.e1rm?.previous).toBeCloseTo(101.333, 3);
    expect(r.reps).toEqual([]);
  });

  it('同重量次数纪录', () => {
    const r = detectRecords(bench, [same('2026-10-01', 80, [7, 7, 6])], same('2026-10-04', 80, [8, 7, 7]));
    expect(r.reps).toEqual([{ weight: 80, reps: 8, previous: 7 }]);
    expect(r.weight).toBeNull();
  });
});

describe('工具函数', () => {
  it('向下取整到增量格', () => {
    expect(gridFloor(78.375, 2.5)).toBe(77.5);
    expect(gridFloor(76.00000001, 2.5)).toBe(75);
    expect(gridFloor(22.8, 2)).toBe(22);
    expect(gridFloor(7.3, 0)).toBe(7.3);
  });

  it('保留两位小数', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-0.0001)).toBe(0);
  });

  it('日期计算', () => {
    expect(daysBetween('2026-10-01', '2026-10-16')).toBe(15);
    expect(addDays('2026-10-18', 6)).toBe('2026-10-24');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(() => daysBetween('2026-13-01', '2026-10-01')).toThrow(RangeError);
    expect(() => daysBetween('10/01/2026', '2026-10-01')).toThrow(RangeError);
  });

  it('覆盖部分阈值', () => {
    const p = withParams({ intra: { capacityFactor: 2 } });
    expect(p.intra.capacityFactor).toBe(2);
    expect(p.intra.moreRepsMinRir).toBe(DEFAULT_PARAMS.intra.moreRepsMinRir);
    expect(p.layoff).toEqual(DEFAULT_PARAMS.layoff);
  });

  it('检查动作配置', () => {
    expect(validateExercise(bench)).toEqual([]);
    expect(validateExercise({ ...bench, repRange: { min: 8, max: 6 }, maxIncreasePct: 0.2 })).toEqual(
      expect.arrayContaining(['rep_max_invalid', 'max_increase_invalid']),
    );
  });
});
