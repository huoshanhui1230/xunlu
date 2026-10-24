import { describe, expect, it } from 'vitest';
import { restoreSession, type LoggedSet, type PendingSet, type RestoreInput } from '../src';
import { activeExercise, bench, inclineDb, loggedSet, target } from './helpers';

const T0 = 1_700_000_000_000;

function input(overrides: Partial<RestoreInput> = {}): RestoreInput {
  return {
    id: 'session-1',
    planId: 'push',
    date: '2026-10-17',
    startedAt: T0,
    unit: 'kg',
    deload: false,
    currentExerciseId: bench.id,
    exercises: [
      activeExercise({ exerciseId: bench.id, position: 0 }),
      activeExercise({ exerciseId: inclineDb.id, position: 1, target: target({ weight: 24 }) }),
    ],
    sets: [],
    pending: null,
    endedAt: null,
    ...overrides,
  };
}

function row(exerciseId: string, setNo: number, savedAt: number): LoggedSet {
  return loggedSet({ id: `${exerciseId}-${setNo}`, exerciseId, setNo, savedAt, doneAt: savedAt - 2_000 });
}

function pending(exerciseId: string, setNo: number): PendingSet {
  return { exerciseId, setNo, doneAt: T0 + 500_000, prefill: { weight: 80, reps: 8, rir: 2 } };
}

describe('restoreSession', () => {
  it('动作按顺序排好', () => {
    const session = restoreSession(
      input({
        exercises: [
          activeExercise({ exerciseId: inclineDb.id, position: 1 }),
          activeExercise({ exerciseId: bench.id, position: 0 }),
        ],
      }),
    );
    expect(session.exercises.map((e) => e.exerciseId)).toEqual([bench.id, inclineDb.id]);
  });

  it('组按保存时间排，组号和「上一组时间」重算', () => {
    const session = restoreSession(
      input({
        sets: [row(bench.id, 3, T0 + 300_000), row(bench.id, 1, T0 + 100_000), row(bench.id, 2, T0 + 200_000)],
      }),
    );
    expect(session.sets.map((s) => s.savedAt)).toEqual([T0 + 100_000, T0 + 200_000, T0 + 300_000]);
    expect(session.sets.map((s) => s.setNo)).toEqual([1, 2, 3]);
    expect(session.sets.map((s) => s.prevSetAt)).toEqual([null, T0 + 100_000, T0 + 200_000]);
  });

  it('两个动作交替记的组各自编号', () => {
    const session = restoreSession(
      input({
        sets: [
          row(bench.id, 1, T0 + 100_000),
          row(inclineDb.id, 1, T0 + 200_000),
          row(bench.id, 2, T0 + 300_000),
          row(inclineDb.id, 2, T0 + 400_000),
        ],
      }),
    );
    expect(session.sets.map((s) => [s.exerciseId, s.setNo])).toEqual([
      [bench.id, 1],
      [inclineDb.id, 1],
      [bench.id, 2],
      [inclineDb.id, 2],
    ]);
  });

  it('撤销留下的空号会被补上', () => {
    // 第 2 组被撤销，库里只剩 1 和 3
    const session = restoreSession(
      input({ sets: [row(bench.id, 1, T0 + 100_000), row(bench.id, 3, T0 + 300_000)] }),
    );
    expect(session.sets.map((s) => s.setNo)).toEqual([1, 2]);
  });

  it('不在本次计划里的组丢掉', () => {
    const session = restoreSession(input({ sets: [row('squat', 1, T0 + 100_000), row(bench.id, 1, T0 + 200_000)] }));
    expect(session.sets).toHaveLength(1);
    expect(session.sets[0]?.exerciseId).toBe(bench.id);
  });

  it('当前动作不认识就退回最后记过的那个', () => {
    const session = restoreSession(
      input({ currentExerciseId: 'squat', sets: [row(inclineDb.id, 1, T0 + 100_000)] }),
    );
    expect(session.currentExerciseId).toBe(inclineDb.id);
  });

  it('一组都没记过就退回第一个动作', () => {
    expect(restoreSession(input({ currentExerciseId: null })).currentExerciseId).toBe(bench.id);
  });

  it('面板开着时被杀掉，重开后接着记这一组', () => {
    const session = restoreSession(
      input({ sets: [row(bench.id, 1, T0 + 100_000)], pending: pending(bench.id, 2) }),
    );
    expect(session.pending).toEqual(pending(bench.id, 2));
  });

  it('待保存的那一组其实已经存过了，就丢掉残留', () => {
    const session = restoreSession(
      input({ sets: [row(bench.id, 1, T0 + 100_000), row(bench.id, 2, T0 + 200_000)], pending: pending(bench.id, 2) }),
    );
    expect(session.pending).toBeNull();
  });

  it('组号对不上时顺延到实际的下一组', () => {
    const session = restoreSession(input({ sets: [row(bench.id, 1, T0 + 100_000)], pending: pending(bench.id, 5) }));
    expect(session.pending?.setNo).toBe(2);
    expect(session.pending?.doneAt).toBe(T0 + 500_000);
  });

  it('待保存的动作不在计划里就丢掉', () => {
    expect(restoreSession(input({ pending: pending('squat', 1) })).pending).toBeNull();
  });

  it('一个动作都没有就报错', () => {
    expect(() => restoreSession(input({ exercises: [] }))).toThrow(RangeError);
  });
});
