import { describe, expect, it } from 'vitest';
import { hintForSet, type ActiveSession, type LoggedSet } from '../src';
import { activeExercise, bench, inclineDb, loggedSet, pushUp, target } from './helpers';

/** 本次该动作已记的组（含刚存的这一组） */
function sessionWith(sets: readonly LoggedSet[], overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    id: 's',
    planId: 'push',
    date: '2026-10-17',
    startedAt: 0,
    unit: 'kg',
    deload: false,
    currentExerciseId: bench.id,
    exercises: [activeExercise()],
    sets,
    pending: null,
    endedAt: null,
    ...overrides,
  };
}

function benchSet(setNo: number, reps: number, rir: number | null, weight = 80): LoggedSet {
  return loggedSet({ id: `set-${setNo}`, exerciseId: bench.id, setNo, weight, reps, rir });
}

describe('RIR 从哪来', () => {
  it('第 1 组没填 RIR 就提示补填，不给其他建议', () => {
    const set = benchSet(1, 8, null);
    const hint = hintForSet({ session: sessionWith([set]), exercise: bench, set });
    expect(hint.ruleId).toBe('A0');
    expect(hint.kind).toBe('need_rir');
    expect(hint.rirSource).toBe('none');
    expect(hint.reps).toBeUndefined();
  });

  it('本组没填就沿用本次该动作上一组填过的值', () => {
    const set = benchSet(2, 8, null);
    const hint = hintForSet({ session: sessionWith([benchSet(1, 8, 2), set]), exercise: bench, set });
    expect(hint.rirSource).toBe('previous');
    expect(hint.capacity).toBe(10);
    expect(hint.ruleId).toBe('A4');
  });

  it('关掉 RIR 记录就不提示补填，只按次数判断', () => {
    const set = benchSet(1, 8, null);
    const hint = hintForSet({ session: sessionWith([set]), exercise: bench, set, rirEnabled: false });
    expect(hint.ruleId).toBe('A4');
    expect(hint.rirSource).toBe('none');
    expect(hint.capacity).toBe(8);
  });
});

describe('hintForSet', () => {
  it('余力不够门槛就保持（MF05 画的就是这一条）', () => {
    const set = benchSet(3, 8, 2);
    const hint = hintForSet({
      session: sessionWith([benchSet(1, 8, 2), benchSet(2, 8, 2), set]),
      exercise: bench,
      set,
    });
    expect(hint.ruleId).toBe('A4');
    expect(hint.kind).toBe('hold');
    expect(hint.weight).toBe(80);
    expect(hint.reps).toEqual({ low: 6, high: 8 });
    expect(hint.threshold).toBe(12);
    expect(hint.capacity).toBe(10);
  });

  it('余力充足且一档在上限内就加一档，给具体重量', () => {
    const set = benchSet(1, 8, 4);
    const hint = hintForSet({ session: sessionWith([set]), exercise: bench, set });
    expect(hint.ruleId).toBe('A1');
    expect(hint.kind).toBe('increase');
    expect(hint.weight).toBe(82.5);
    expect(hint.reps).toEqual({ low: 6, high: 6 });
  });

  it('一档超过加重上限就只提醒方向，不给数值（设计稿 S06）', () => {
    const set = loggedSet({ id: 'db-1', exerciseId: inclineDb.id, setNo: 1, weight: 24, reps: 12, rir: 6 });
    const hint = hintForSet({
      session: sessionWith([set], {
        currentExerciseId: inclineDb.id,
        exercises: [activeExercise({ exerciseId: inclineDb.id, target: target({ weight: 24, repRange: { min: 8, max: 12 } }) })],
      }),
      exercise: inclineDb,
      set,
    });
    expect(hint.ruleId).toBe('A1');
    expect(hint.kind).toBe('nudge');
    expect(hint.nudgeReason).toBe('step_exceeds_cap');
    expect(hint.nudge).toEqual(['weight', 'reps']);
    // 不改预填：重量还是本组的重量
    expect(hint.weight).toBe(24);
  });

  it('增量为 0 的动作只提醒多做几次', () => {
    const set = loggedSet({ id: 'pu-1', exerciseId: pushUp.id, setNo: 1, weight: 0, reps: 20, rir: 10 });
    const hint = hintForSet({
      session: sessionWith([set], {
        currentExerciseId: pushUp.id,
        exercises: [
          activeExercise({
            exerciseId: pushUp.id,
            target: target({ weight: 0, repRange: { min: 10, max: 20 } }),
          }),
        ],
      }),
      exercise: pushUp,
      set,
    });
    expect(hint.kind).toBe('nudge');
    expect(hint.nudgeReason).toBe('reps_only');
    expect(hint.nudge).toEqual(['reps']);
  });

  it('本次该动作已经加过一次重就不再提示加重', () => {
    const set = benchSet(3, 8, 4, 82.5);
    const session = sessionWith([benchSet(1, 8, 4), benchSet(2, 8, 4, 82.5), set]);
    const hint = hintForSet({ session, exercise: bench, set });
    expect(hint.ruleId).not.toBe('A1');
    expect(hint.increaseBlockedBy).toBe('already_increased');
  });

  it('同一重量已有两组力竭且次数在下限就不加重：说明本次的前几组传对了', () => {
    const set = benchSet(3, 8, 4);
    const session = sessionWith([benchSet(1, 6, 0), benchSet(2, 6, 0), set]);
    const hint = hintForSet({ session, exercise: bench, set });
    expect(hint.increaseBlockedBy).toBe('to_failure');
  });

  it('没做到下限又力竭就减一档', () => {
    const set = benchSet(2, 5, 0);
    const hint = hintForSet({ session: sessionWith([benchSet(1, 8, 2), set]), exercise: bench, set });
    expect(hint.ruleId).toBe('A3');
    expect(hint.kind).toBe('decrease');
    expect(hint.weight).toBe(77.5);
  });

  it('次数没到上限且余力够就多做 1–2 次', () => {
    const set = benchSet(1, 6, 3);
    const hint = hintForSet({ session: sessionWith([set]), exercise: bench, set });
    expect(hint.ruleId).toBe('A2');
    expect(hint.reps).toEqual({ low: 7, high: 8 });
  });

  it('用的是本次生效的次数区间，不是动作本身的区间', () => {
    const set = benchSet(1, 8, 4);
    const session = sessionWith([set], {
      // 「上限 +3」延长过的目标：门槛跟着抬到 ceil(11 × 1.5) = 17
      exercises: [activeExercise({ target: target({ repRange: { min: 6, max: 11 }, extended: true }) })],
    });
    const hint = hintForSet({ session, exercise: bench, set });
    expect(hint.threshold).toBe(17);
    expect(hint.ruleId).toBe('A2');
    expect(hint.reps).toEqual({ low: 9, high: 10 });
  });

  it('减载周里不出加重提示', () => {
    const set = benchSet(1, 8, 4);
    const hint = hintForSet({ session: sessionWith([set], { deload: true }), exercise: bench, set });
    expect(hint.increaseBlockedBy).toBe('deload');
    expect(hint.kind).toBe('hold');
  });

  it('每条提示都带着规则版本，便于回溯', () => {
    const set = benchSet(1, 8, 2);
    const hint = hintForSet({ session: sessionWith([set]), exercise: bench, set });
    expect(hint.ruleVersion).toBe('2.0.0');
    expect(hint.basis.length).toBeGreaterThan(0);
  });
});
