import { describe, expect, it } from 'vitest';
import { addDays, evaluateStatus, type ExerciseSession, type StatusInput } from '../src';
import { bench, inclineDb, normal, same, session, squat } from './helpers';

/** 从 start 起每隔 step 天一次，直到 end（含） */
function dates(start: string, end: string, step: number): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, step)) out.push(d);
  return out;
}

function steady(ds: readonly string[], weight: number, reps: readonly number[]): ExerciseSession[] {
  return ds.map((d) => same(d, weight, reps, 1));
}

const today = '2026-10-18';

function input(partial: Partial<StatusInput>): StatusInput {
  return { today, exercises: [], settings: normal, firstUseDate: '2026-09-01', ...partial };
}

describe('C 状态与减载提醒', () => {
  it('还没训练：正常', () => {
    const r = evaluateStatus(input({ exercises: [{ exercise: bench, sessions: [] }] }));
    expect(r.level).toBe('normal');
    expect(r.blockStart).toBe(today);
  });

  it('只有"连续训练满 5 周"：关注', () => {
    const r = evaluateStatus(input({ exercises: [{ exercise: bench, sessions: steady(dates('2026-09-01', '2026-10-17', 3), 80, [8, 7, 7]) }] }));
    expect(r.signals.map((s) => s.id)).toEqual(['S4']);
    expect(r.signals[0]?.days).toBe(47);
    expect(r.level).toBe('watch');
  });

  it('中途连续 7 天以上没练，连续训练时间重新算', () => {
    const ds = [...dates('2026-09-01', '2026-09-19', 3), ...dates('2026-09-30', '2026-10-17', 3)];
    const r = evaluateStatus(input({ exercises: [{ exercise: bench, sessions: steady(ds, 80, [8, 7, 7]) }] }));
    expect(r.blockStart).toBe('2026-09-30');
    expect(r.level).toBe('normal');
  });

  it('最近一次训练已是 7 天以前：连续训练已中断', () => {
    const r = evaluateStatus(input({ exercises: [{ exercise: bench, sessions: steady(dates('2026-09-01', '2026-10-09', 3), 80, [8, 7, 7]) }] }));
    expect(r.blockStart).toBe(today);
    expect(r.signals).toEqual([]);
  });

  it('记录顺序打乱也能正确判断', () => {
    const shuffled = steady(dates('2026-09-01', '2026-10-17', 3), 80, [8, 7, 7]).reverse();
    const r = evaluateStatus(input({ exercises: [{ exercise: bench, sessions: shuffled }] }));
    expect(r.signals.map((s) => s.id)).toEqual(['S4']);
  });

  it('上次减载结束后重新算', () => {
    const r = evaluateStatus(
      input({
        lastDeloadEnd: '2026-10-02',
        exercises: [{ exercise: bench, sessions: steady(dates('2026-09-01', '2026-10-17', 3), 80, [8, 7, 7]) }],
      }),
    );
    expect(r.signals.find((s) => s.id === 'S4')).toBeUndefined();
  });

  const weekly = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'];
  const dropping: StatusInput = input({
    exercises: [
      {
        exercise: bench,
        sessions: [...steady(weekly, 80, [8, 8, 8]), same('2026-10-13', 75, [6, 6, 6], 2), same('2026-10-16', 75, [6, 6, 6], 2)],
      },
      {
        exercise: squat,
        sessions: [...steady(weekly, 100, [5, 5, 5]), same('2026-10-13', 90, [5, 5, 5], 2), same('2026-10-16', 90, [5, 5, 5], 2)],
      },
    ],
  });

  it('两个动作连续 2 次估算 1RM 低 5% 以上，加上满 5 周：建议减载', () => {
    const r = evaluateStatus(dropping);
    expect(r.signals.map((s) => s.id)).toEqual(['S1', 'S4']);
    expect(r.signals[0]?.exerciseIds).toEqual([bench.id, squat.id]);
    expect(r.level).toBe('deload_suggested');
  });

  it('推迟一周：期间降为关注', () => {
    const r = evaluateStatus({ ...dropping, snoozedUntil: '2026-10-20' });
    expect(r.level).toBe('watch');
    expect(r.snoozed).toBe(true);
  });

  it('同重量同次数，RIR 平均低 2 或更多：S2', () => {
    const r = evaluateStatus(
      input({
        firstUseDate: '2026-10-01',
        exercises: [bench, inclineDb].map((exercise) => ({
          exercise,
          sessions: [same('2026-10-01', 20, [8, 8, 8], 3), same('2026-10-08', 20, [8, 8, 8], 3), same('2026-10-15', 20, [8, 8, 8], 1)],
        })),
      }),
    );
    expect(r.signals.map((s) => s.id)).toEqual(['S2']);
    expect(r.level).toBe('watch');
  });

  it('一周内 3 个动作命中失败：S3', () => {
    const fail = (date: string, w: number) => session(date, [[w, 8, 1], [w, 7, 1], [w, 4, 0]]);
    const r = evaluateStatus(
      input({
        firstUseDate: '2026-10-01',
        exercises: [bench, squat, inclineDb].map((exercise) => ({
          exercise,
          sessions: [same('2026-10-10', 20, [8, 8, 8], 1), fail('2026-10-15', 20)],
        })),
      }),
    );
    expect(r.signals.map((s) => s.id)).toEqual(['S3']);
    expect(r.signals[0]?.exerciseIds).toHaveLength(3);
  });

  it('减载周内不计算信号', () => {
    const r = evaluateStatus({ ...dropping, activeDeload: { start: '2026-10-14', end: '2026-10-20' } });
    expect(r.inDeload).toBe(true);
    expect(r.level).toBe('normal');
    expect(r.signals).toEqual([]);
  });
});
