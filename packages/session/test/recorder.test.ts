import { describe, expect, it } from 'vitest';
import {
  appliedHintOf,
  applyHint,
  beginSet,
  clearHint,
  decideHint,
  endSession,
  nextSetNo,
  recordHintShown,
  saveSet,
  setsOf,
  startSession,
  switchExercise,
  undoLastSet,
  updateSet,
  type ActiveSession,
  type HintState,
  type LoggedSet,
  type StoreEvent,
} from '../src';
import { activeExercise, bench, inclineDb, target, wheel } from './helpers';

const T0 = 1_700_000_000_000;

function fresh(): ActiveSession {
  return startSession({
    id: 'session-1',
    planId: 'push',
    date: '2026-10-17',
    startedAt: T0,
    exercises: [
      activeExercise({ exerciseId: bench.id, position: 0 }),
      activeExercise({
        exerciseId: inclineDb.id,
        position: 1,
        target: target({ weight: 24, reps: [12, 12, 12], repRange: { min: 8, max: 12 } }),
      }),
    ],
  }).session;
}

function kinds(events: readonly StoreEvent[]): string[] {
  return events.map((e) => e.kind);
}

/** 记一组：点完成本组 → 保存 */
function logSet(
  session: ActiveSession,
  options: { id: string; doneAt: number; savedAt: number; weight: number; reps: number; rir: number | null },
): { session: ActiveSession; set: LoggedSet } {
  const begun = beginSet(session, { exercise: bench, doneAt: options.doneAt });
  const saved = saveSet(begun.session, {
    id: options.id,
    values: wheel(options.weight, options.reps, options.rir),
    savedAt: options.savedAt,
    closedBy: 'confirm',
  });
  const event = saved.events.find((e) => e.kind === 'set_saved');
  if (event === undefined || event.kind !== 'set_saved') throw new Error('没有保存事件');
  return { session: saved.session, set: event.set };
}

const hintOf = (session: ActiveSession, exerciseId = bench.id) =>
  session.exercises.find((e) => e.exerciseId === exerciseId)?.hint ?? null;

describe('startSession', () => {
  it('按顺序排动作，当前动作是第一个', () => {
    const { session, events } = startSession({
      id: 's',
      planId: 'push',
      date: '2026-10-17',
      startedAt: T0,
      exercises: [activeExercise({ exerciseId: inclineDb.id, position: 1 }), activeExercise({ position: 0 })],
    });
    expect(session.exercises.map((e) => e.exerciseId)).toEqual([bench.id, inclineDb.id]);
    expect(session.currentExerciseId).toBe(bench.id);
    expect(kinds(events)).toEqual(['session_started']);
  });

  it('一个动作都没有就报错', () => {
    expect(() =>
      startSession({ id: 's', planId: null, date: '2026-10-17', startedAt: T0, exercises: [] }),
    ).toThrow(RangeError);
  });
});

describe('beginSet', () => {
  it('点完成本组立刻落库；第 1 组不预填 RIR', () => {
    const { session, events } = beginSet(fresh(), { exercise: bench, doneAt: T0 + 60_000 });
    expect(kinds(events)).toEqual(['set_begun']);
    expect(session.pending).toEqual({
      exerciseId: bench.id,
      setNo: 1,
      doneAt: T0 + 60_000,
      prefill: { weight: 80, reps: 8, rir: null },
    });
  });

  it('第 2 组沿用上一组填过的 RIR', () => {
    const { session } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: 2 });
    const begun = beginSet(session, { exercise: bench, doneAt: T0 + 180_000 });
    expect(begun.session.pending?.prefill).toEqual({ weight: 80, reps: 8, rir: 2 });
  });

  it('面板已经开着就不再开一次', () => {
    const once = beginSet(fresh(), { exercise: bench, doneAt: T0 + 60_000 });
    const twice = beginSet(once.session, { exercise: bench, doneAt: T0 + 61_000 });
    expect(twice.events).toEqual([]);
    expect(twice.session.pending?.doneAt).toBe(T0 + 60_000);
  });

  it('训练结束后不再开面板', () => {
    const ended = endSession(fresh(), T0 + 100).session;
    expect(beginSet(ended, { exercise: bench, doneAt: T0 + 200 }).events).toEqual([]);
  });
});

describe('saveSet', () => {
  it('记下从完成本组到保存用了多久', () => {
    const { set } = logSet(fresh(), { id: 'a', doneAt: T0 + 60_000, savedAt: T0 + 62_400, weight: 80, reps: 8, rir: 2 });
    expect(set.logMs).toBe(2_400);
    expect(set.doneAt).toBe(T0 + 60_000);
    expect(set.savedAt).toBe(T0 + 62_400);
  });

  it('时钟回拨时用时按 0 算，不出负数', () => {
    const { set } = logSet(fresh(), { id: 'a', doneAt: T0 + 60_000, savedAt: T0 + 50_000, weight: 80, reps: 8, rir: 2 });
    expect(set.logMs).toBe(0);
    expect(set.savedAt).toBe(T0 + 60_000);
  });

  it('第二组记下上一组的保存时间，用来算距上一组', () => {
    const one = logSet(fresh(), { id: 'a', doneAt: T0 + 10_000, savedAt: T0 + 12_000, weight: 80, reps: 8, rir: 2 });
    const two = logSet(one.session, { id: 'b', doneAt: T0 + 180_000, savedAt: T0 + 182_000, weight: 80, reps: 8, rir: 2 });
    expect(two.set.prevSetAt).toBe(T0 + 12_000);
    expect(two.set.setNo).toBe(2);
    expect(setsOf(two.session, bench.id)).toHaveLength(2);
  });

  it('关闭面板和再点一次完成本组都照样存，只是来源不同', () => {
    for (const closedBy of ['confirm', 'dismiss', 'done_again'] as const) {
      const begun = beginSet(fresh(), { exercise: bench, doneAt: T0 }).session;
      const { session } = saveSet(begun, { id: 'a', values: wheel(80, 8, 2), savedAt: T0 + 1_000, closedBy });
      expect(session.sets).toHaveLength(1);
      expect(session.sets[0]?.closedBy).toBe(closedBy);
    }
  });

  it('面板没开时什么也不做', () => {
    expect(saveSet(fresh(), { id: 'a', values: wheel(80, 8, 2), savedAt: T0, closedBy: 'confirm' }).events).toEqual([]);
  });

  it('预填原样存下来，方便看用户改了多少', () => {
    const begun = beginSet(fresh(), { exercise: bench, doneAt: T0 }).session;
    const { session } = saveSet(begun, { id: 'a', values: wheel(85, 6, 0), savedAt: T0 + 5_000, closedBy: 'confirm' });
    expect(session.sets[0]?.prefill).toEqual({ weight: 80, reps: 8, rir: null });
    expect(session.sets[0]?.weight).toBe(85);
  });
});

describe('updateSet', () => {
  it('补填 RIR 改的是同一条记录，不新增一组', () => {
    const { session, set } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: null });
    const { session: after, events } = updateSet(session, { setId: set.id, values: wheel(80, 8, 2) });
    expect(kinds(events)).toEqual(['set_saved']);
    expect(after.sets).toHaveLength(1);
    expect(after.sets[0]?.rir).toBe(2);
  });

  it('补填不改记这一组用了多久', () => {
    const { session, set } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_400, weight: 80, reps: 8, rir: null });
    const after = updateSet(session, { setId: set.id, values: wheel(80, 8, 2) }).session;
    expect(after.sets[0]?.logMs).toBe(2_400);
    expect(after.sets[0]?.doneAt).toBe(T0);
  });

  it('找不到那一组就什么也不做', () => {
    const { session } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: 2 });
    expect(updateSet(session, { setId: 'nope', values: wheel(80, 8, 2) }).events).toEqual([]);
  });
});

describe('nextSetNo', () => {
  it('从 1 起，按已记的组数顺延', () => {
    const session = fresh();
    expect(nextSetNo(session, bench.id)).toBe(1);
    const { session: after } = logSet(session, { id: 'a', doneAt: T0, savedAt: T0 + 1_000, weight: 80, reps: 8, rir: 2 });
    expect(nextSetNo(after, bench.id)).toBe(2);
    expect(nextSetNo(after, inclineDb.id)).toBe(1);
  });
});

describe('组间提示', () => {
  const shown = (
    session: ActiveSession,
    set: LoggedSet,
    kind: string,
    weight: number,
    reps: number | null = 6,
  ) =>
    recordHintShown(session, {
      exerciseId: bench.id,
      fromSet: set,
      suggestionId: 'sug-1',
      ruleId: kind === 'increase' || kind === 'nudge' ? 'A1' : kind === 'need_rir' ? 'A0' : 'A4',
      kind,
      weight,
      reps,
      ruleVersion: '2.0.0',
      blockedBy: null,
      payload: '{}',
      createdAt: set.savedAt,
    });

  it('显示即写库，并记下是看着哪一组给的', () => {
    const { session, set } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: 4 });
    const { session: withHint, events } = shown(session, set, 'increase', 82.5);
    expect(kinds(events)).toEqual(['suggestion_shown', 'exercise_state_changed']);
    expect(hintOf(withHint)?.setNo).toBe(2);
    expect(hintOf(withHint)?.fromWeight).toBe(80);
    expect(hintOf(withHint)?.fromReps).toBe(8);
  });

  it('点应用只改下一组预填，已保存的组不动', () => {
    const { session, set } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: 4 });
    const withHint = shown(session, set, 'increase', 82.5).session;
    const { session: applied, events } = applyHint(withHint, bench.id, T0 + 3_000);

    expect(events[0]).toEqual({
      kind: 'suggestion_decided',
      suggestionId: 'sug-1',
      decision: 'applied',
      decidedAt: T0 + 3_000,
    });
    expect(appliedHintOf(applied.exercises[0]!)).toEqual({ setNo: 2, weight: 82.5, reps: 6 });
    expect(applied.sets).toEqual(session.sets);

    const begun = beginSet(applied, { exercise: bench, doneAt: T0 + 180_000 });
    expect(begun.session.pending?.prefill).toEqual({ weight: 82.5, reps: 6, rir: 4 });
  });

  it('只提醒方向的提示没法应用，也不改预填', () => {
    const { session, set } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: 6 });
    const withHint = shown(session, set, 'nudge', 80, null).session;
    expect(applyHint(withHint, bench.id, T0 + 3_000).events).toEqual([]);
    expect(appliedHintOf(withHint.exercises[0]!)).toBeNull();
  });

  it('应用过一次就不重复记', () => {
    const { session, set } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: 4 });
    const withHint = shown(session, set, 'increase', 82.5).session;
    const once = applyHint(withHint, bench.id, T0 + 3_000).session;
    expect(applyHint(once, bench.id, T0 + 4_000).events).toEqual([]);
  });

  it('补填完把卡片收起来', () => {
    const { session, set } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: null });
    const withHint = shown(session, set, 'need_rir', 80, null).session;
    const { session: after, events } = clearHint(withHint, bench.id);
    expect(kinds(events)).toEqual(['exercise_state_changed']);
    expect(hintOf(after)).toBeNull();
  });

  it('存下一组时结算提示的去向，并把卡片收起来', () => {
    const { session, set } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: 4 });
    const withHint = applyHint(shown(session, set, 'increase', 82.5).session, bench.id, T0 + 3_000).session;
    const begun = beginSet(withHint, { exercise: bench, doneAt: T0 + 180_000 }).session;
    const { session: after, events } = saveSet(begun, {
      id: 'b',
      values: wheel(82.5, 6, 2),
      savedAt: T0 + 182_000,
      closedBy: 'confirm',
    });

    expect(events.find((e) => e.kind === 'suggestion_decided')).toEqual({
      kind: 'suggestion_decided',
      suggestionId: 'sug-1',
      decision: 'applied',
      decidedAt: T0 + 182_000,
    });
    expect(hintOf(after)).toBeNull();
  });
});

describe('decideHint', () => {
  const base: HintState = {
    suggestionId: 'sug-1',
    fromSetNo: 1,
    setNo: 2,
    ruleId: 'A1',
    kind: 'increase',
    weight: 82.5,
    reps: 6,
    fromWeight: 80,
    fromReps: 8,
    applied: false,
  };

  it('照着提示的重量练了就算采纳，哪怕没点应用', () => {
    expect(decideHint(base, wheel(82.5, 6, 2))).toBe('applied');
  });

  it('点过应用又改了重量算修改', () => {
    expect(decideHint({ ...base, applied: true }, wheel(80, 8, 2))).toBe('modified');
  });

  it('没点应用也没照做算忽略', () => {
    expect(decideHint(base, wheel(80, 8, 2))).toBe('ignored');
  });

  it('只提醒方向：真的加了重或多做了就算照做', () => {
    const nudge: HintState = { ...base, kind: 'nudge', ruleId: 'A1', weight: 80, reps: null };
    expect(decideHint(nudge, wheel(82.5, 8, 2))).toBe('applied');
    expect(decideHint(nudge, wheel(80, 9, 2))).toBe('applied');
    expect(decideHint(nudge, wheel(80, 8, 2))).toBe('ignored');
  });

  it('提示补填：这次填上了就算照做', () => {
    const needRir: HintState = { ...base, kind: 'need_rir', ruleId: 'A0', weight: 80, reps: null };
    expect(decideHint(needRir, wheel(80, 8, 2))).toBe('applied');
    expect(decideHint(needRir, wheel(80, 8, null))).toBe('ignored');
  });
});

describe('undoLastSet', () => {
  it('5 秒内撤得掉', () => {
    const { session, set } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: 2 });
    const { session: after, events } = undoLastSet(session, set.savedAt + 4_000);
    expect(kinds(events)).toEqual(['set_undone']);
    expect(after.sets).toHaveLength(0);
    expect(nextSetNo(after, bench.id)).toBe(1);
  });

  it('过了 5 秒就撤不掉', () => {
    const { session, set } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: 2 });
    expect(undoLastSet(session, set.savedAt + 5_000).events).toEqual([]);
  });

  it('撤销连带把这一组引出的提示收起来', () => {
    const { session, set } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: 4 });
    const withHint = recordHintShown(session, {
      exerciseId: bench.id,
      fromSet: set,
      suggestionId: 'sug-1',
      ruleId: 'A1',
      kind: 'increase',
      weight: 82.5,
      reps: 6,
      ruleVersion: '2.0.0',
      blockedBy: null,
      payload: '{}',
      createdAt: set.savedAt,
    }).session;

    const { session: after, events } = undoLastSet(withHint, set.savedAt + 1_000);
    expect(kinds(events)).toEqual(['set_undone', 'exercise_state_changed']);
    expect(hintOf(after)).toBeNull();
  });

  it('面板开着时不撤', () => {
    const { session, set } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: 2 });
    const begun = beginSet(session, { exercise: bench, doneAt: set.savedAt + 1_000 }).session;
    expect(undoLastSet(begun, set.savedAt + 2_000).events).toEqual([]);
  });

  it('一组都没有时不撤', () => {
    expect(undoLastSet(fresh(), T0).events).toEqual([]);
  });
});

describe('switchExercise / endSession', () => {
  it('切换动作，已练的组保留', () => {
    const { session } = logSet(fresh(), { id: 'a', doneAt: T0, savedAt: T0 + 2_000, weight: 80, reps: 8, rir: 2 });
    const { session: after, events } = switchExercise(session, inclineDb.id);
    expect(kinds(events)).toEqual(['current_exercise_changed']);
    expect(after.currentExerciseId).toBe(inclineDb.id);
    expect(after.sets).toHaveLength(1);
  });

  it('切到不存在的动作不动', () => {
    expect(switchExercise(fresh(), 'nope').events).toEqual([]);
  });

  it('结束训练顺手清掉没保存的面板', () => {
    const begun = beginSet(fresh(), { exercise: bench, doneAt: T0 }).session;
    const { session, events } = endSession(begun, T0 + 10_000);
    expect(kinds(events)).toEqual(['pending_cleared', 'session_ended']);
    expect(session.endedAt).toBe(T0 + 10_000);
    expect(session.pending).toBeNull();
  });

  it('结束过就不再结束一次', () => {
    const ended = endSession(fresh(), T0 + 10_000).session;
    expect(endSession(ended, T0 + 20_000).events).toEqual([]);
  });
});
