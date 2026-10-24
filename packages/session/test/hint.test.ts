import type { Settings } from '@xunlu/engine';
import { describe, expect, it } from 'vitest';
import { hintForSet, type ActiveSession, type LoggedSet } from '../src';
import { activeExercise, bench, loggedSet, target } from './helpers';

const normal: Settings = { conservative: false };
const conservative: Settings = { conservative: true };

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

describe('hintForSet', () => {
  it('余力不够门槛就保持（MF05 画的就是这一条）', () => {
    const set = benchSet(3, 8, 2);
    const hint = hintForSet({ session: sessionWith([benchSet(1, 8, 2), benchSet(2, 8, 2), set]), exercise: bench, set, settings: normal });
    expect(hint.ruleId).toBe('A4');
    expect(hint.kind).toBe('hold');
    expect(hint.weight).toBe(80);
    expect(hint.reps).toEqual({ low: 6, high: 8 });
    expect(hint.threshold).toBe(12);
    expect(hint.capacity).toBe(10);
  });

  it('余力充足就加一档', () => {
    const set = benchSet(1, 8, 4);
    const hint = hintForSet({ session: sessionWith([set]), exercise: bench, set, settings: normal });
    expect(hint.ruleId).toBe('A1');
    expect(hint.kind).toBe('increase');
    expect(hint.weight).toBe(82.5);
    expect(hint.reps).toEqual({ low: 6, high: 6 });
  });

  it('本次已经提示过一次加重就不再提示', () => {
    const set = benchSet(2, 8, 4);
    const session = sessionWith([benchSet(1, 8, 4), set], {
      exercises: [activeExercise({ increaseHintSetIds: ['set-1'] })],
    });
    const hint = hintForSet({ session, exercise: bench, set, settings: normal });
    expect(hint.ruleId).not.toBe('A1');
    expect(hint.increaseBlockedBy).toBe('limit_reached');
  });

  it('同一重量已有两组力竭就不加重：说明本次的前几组传对了', () => {
    const set = benchSet(3, 8, 4);
    const session = sessionWith([benchSet(1, 8, 0), benchSet(2, 8, 0), set]);
    const hint = hintForSet({ session, exercise: bench, set, settings: normal });
    expect(hint.increaseBlockedBy).toBe('to_failure');
  });

  it('没做到下限又力竭就减一档', () => {
    const set = benchSet(1, 5, 0);
    const hint = hintForSet({ session: sessionWith([set]), exercise: bench, set, settings: normal });
    expect(hint.ruleId).toBe('A3');
    expect(hint.kind).toBe('decrease');
    expect(hint.weight).toBe(77.5);
  });

  it('次数没到上限且余力够就多做 1–2 次', () => {
    const set = benchSet(1, 6, 3);
    const hint = hintForSet({ session: sessionWith([set]), exercise: bench, set, settings: normal });
    expect(hint.ruleId).toBe('A2');
    expect(hint.reps).toEqual({ low: 7, high: 8 });
  });

  it('用的是本次生效的次数区间，不是动作本身的区间', () => {
    const set = benchSet(1, 8, 4);
    const session = sessionWith([set], {
      // 「上限 +3」延长过的目标：门槛跟着抬到 ceil(11 × 1.5) = 17
      exercises: [activeExercise({ target: target({ repRange: { min: 6, max: 11 }, extended: true }) })],
    });
    const hint = hintForSet({ session, exercise: bench, set, settings: normal });
    expect(hint.threshold).toBe(17);
    expect(hint.ruleId).toBe('A2');
    expect(hint.reps).toEqual({ low: 9, high: 10 });
  });

  it('减载周里不出加重提示', () => {
    const set = benchSet(1, 8, 4);
    const hint = hintForSet({ session: sessionWith([set], { deload: true }), exercise: bench, set, settings: normal });
    expect(hint.increaseBlockedBy).toBe('deload');
  });

  it('保守模式不出加重提示', () => {
    const set = benchSet(1, 8, 4);
    const hint = hintForSet({ session: sessionWith([set]), exercise: bench, set, settings: conservative });
    expect(hint.increaseBlockedBy).toBe('conservative');
  });

  it('每条提示都带着规则版本，便于回溯', () => {
    const set = benchSet(1, 8, 2);
    const hint = hintForSet({ session: sessionWith([set]), exercise: bench, set, settings: normal });
    expect(hint.ruleVersion).toBe('1.0.0');
    expect(hint.basis.length).toBeGreaterThan(0);
  });
});
