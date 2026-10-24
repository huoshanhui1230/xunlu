import { describe, expect, it } from 'vitest';
import {
  differsFromPrefill,
  optionIndex,
  prefillFor,
  repOptions,
  rirOptions,
  targetRepsFor,
  weightOptions,
} from '../src';
import { assistedPullUp, bench, inclineDb, loggedSet, pushUp, target, wheel } from './helpers';

describe('prefillFor', () => {
  it('第一组用本次目标', () => {
    expect(prefillFor({ exercise: bench, target: target(), setNo: 1, previousSets: [], appliedHint: null })).toEqual({
      weight: 80,
      reps: 8,
      rir: 2,
    });
  });

  it('之后的组沿用上一组的值', () => {
    const previous = [loggedSet({ weight: 80, reps: 8, rir: 2 }), loggedSet({ weight: 80, reps: 7, rir: 1 })];
    expect(
      prefillFor({ exercise: bench, target: target(), setNo: 3, previousSets: previous, appliedHint: null }),
    ).toEqual({ weight: 80, reps: 7, rir: 1 });
  });

  it('点过「应用」且提示是给这一组的，就用提示的值', () => {
    const previous = [loggedSet({ weight: 80, reps: 8, rir: 4 })];
    expect(
      prefillFor({
        exercise: bench,
        target: target(),
        setNo: 2,
        previousSets: previous,
        appliedHint: { setNo: 2, weight: 82.5, reps: 6 },
      }),
    ).toEqual({ weight: 82.5, reps: 6, rir: 4 });
  });

  it('提示是给别的组的就不用它', () => {
    const previous = [loggedSet({ weight: 80, reps: 8, rir: 2 })];
    expect(
      prefillFor({
        exercise: bench,
        target: target(),
        setNo: 3,
        previousSets: previous,
        appliedHint: { setNo: 2, weight: 82.5, reps: 6 },
      }),
    ).toEqual({ weight: 80, reps: 8, rir: 2 });
  });

  it('上一组没填 RIR 就继续不填，不拿目标余力顶上', () => {
    const previous = [loggedSet({ weight: 80, reps: 8, rir: null })];
    expect(
      prefillFor({ exercise: bench, target: target(), setNo: 2, previousSets: previous, appliedHint: null }).rir,
    ).toBeNull();
  });

  it('组数超过计划时沿用目标的最后一组次数', () => {
    expect(
      prefillFor({
        exercise: bench,
        target: target({ reps: [6, 7, 8] }),
        setNo: 5,
        previousSets: [],
        appliedHint: null,
      }).reps,
    ).toBe(8);
  });
});

describe('targetRepsFor', () => {
  it('按组取目标次数', () => {
    const t = target({ reps: [6, 7, 8] });
    expect(targetRepsFor(t, 1)).toBe(6);
    expect(targetRepsFor(t, 2)).toBe(7);
    expect(targetRepsFor(t, 3)).toBe(8);
    expect(targetRepsFor(t, 4)).toBe(8);
  });

  it('目标没写次数时退回区间上限', () => {
    expect(targetRepsFor(target({ reps: [] }), 1)).toBe(8);
  });
});

describe('weightOptions', () => {
  it('以当前值为中心按增量排，含当前值', () => {
    const options = weightOptions(bench, 80, 2);
    expect(options).toEqual([75, 77.5, 80, 82.5, 85]);
  });

  it('不出现负重量', () => {
    expect(weightOptions(inclineDb, 2, 3)).toEqual([0, 2, 4, 6, 8]);
  });

  it('助力动作同样按增量取值（滚轮本身只是一列数）', () => {
    expect(weightOptions(assistedPullUp, 10, 2)).toEqual([0, 5, 10, 15, 20]);
  });

  it('增量为 0 的动作只有一个重量可选', () => {
    expect(weightOptions(pushUp, 0)).toEqual([0]);
  });

  it('小数相加不漂移', () => {
    for (const value of weightOptions(bench, 77.5, 20)) {
      expect(Number.isInteger(Math.round(value * 100))).toBe(true);
      expect(value).toBe(Number(value.toFixed(2)));
    }
  });
});

describe('repOptions / rirOptions', () => {
  it('次数从 1 起', () => {
    const options = repOptions();
    expect(options[0]).toBe(1);
    expect(options).toContain(8);
  });

  it('还能再做从 0 起', () => {
    const options = rirOptions();
    expect(options[0]).toBe(0);
    expect(options).toContain(4);
  });
});

describe('optionIndex', () => {
  it('找到对应行', () => {
    expect(optionIndex([75, 77.5, 80, 82.5], 80)).toBe(2);
  });

  it('值不在列里时取最接近的', () => {
    expect(optionIndex([75, 77.5, 80], 79)).toBe(2);
    expect(optionIndex([75, 77.5, 80], 76)).toBe(0);
  });

  it('没填时停在第一行', () => {
    expect(optionIndex([0, 1, 2], null)).toBe(0);
  });
});

describe('differsFromPrefill', () => {
  it('一个字段都没动就是没改', () => {
    expect(differsFromPrefill(wheel(80, 8, 2), wheel(80, 8, 2))).toBe(false);
  });

  it('改了任何一个滚轮都算改过', () => {
    expect(differsFromPrefill(wheel(80, 8, 2), wheel(82.5, 8, 2))).toBe(true);
    expect(differsFromPrefill(wheel(80, 8, 2), wheel(80, 7, 2))).toBe(true);
    expect(differsFromPrefill(wheel(80, 8, 2), wheel(80, 8, null))).toBe(true);
  });
});
