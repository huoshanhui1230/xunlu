/**
 * SqliteStore 的 SQL 在真正的 SQLite 上跑一遍。
 *
 * plus.sqlite 只有 App 里才有，这里用 Node 自带的 node:sqlite 照它的接口垫一层：
 * 建表、写入、查询、转义都是真的执行，「杀掉重开」用同一个库再开一个 SqliteStore 来模拟。
 * 垫层本身和 plus.sqlite 的差异（回调时机、返回值类型）只有真机能验证。
 */
import { DatabaseSync } from 'node:sqlite';
import { RULE_VERSION } from '@xunlu/engine';
import {
  applyHint,
  beginSet,
  endSession,
  hintForSet,
  recordHintShown,
  restoreSession,
  saveSet,
  startSession,
  undoLastSet,
  updateSet,
  type ActiveExercise,
  type ActiveSession,
} from '@xunlu/session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoHistory } from '@/data/demo-history';
import { PUSH_DAY } from '@/data/push-day';
import { applyEvents } from '@/storage/events';
import { SqliteStore } from '@/storage/sqlite';

const T0 = 1_700_000_000_000;
const bench = PUSH_DAY[0]!.config;

type Options = { name: string; sql: string | string[]; success?: (data?: unknown) => void; fail?: (e: unknown) => void };

/** 照 plus.sqlite 的接口垫一层：异步回调，execute 收字符串或数组 */
function fakeSqlite(): { db: () => DatabaseSync; api: Record<string, unknown> } {
  let database: DatabaseSync | null = null;
  const run = (options: Options, body: (db: DatabaseSync) => unknown) => {
    queueMicrotask(() => {
      try {
        options.success?.(body(database as DatabaseSync));
      } catch (error) {
        options.fail?.(error);
      }
    });
  };
  return {
    db: () => database as DatabaseSync,
    api: {
      isOpenDatabase: () => database !== null,
      openDatabase: (options: { success?: () => void }) => {
        database = new DatabaseSync(':memory:');
        queueMicrotask(() => options.success?.());
      },
      executeSql: (options: Options) =>
        run(options, (db) => {
          for (const statement of [options.sql].flat()) db.exec(statement);
        }),
      selectSql: (options: Options) => run(options, (db) => db.prepare(options.sql as string).all()),
    },
  };
}

function exercises(): ActiveExercise[] {
  return PUSH_DAY.map((meta, position) => ({
    exerciseId: meta.config.id,
    position,
    target: meta.startTarget,
    hint: null,
  }));
}

describe('SqliteStore', () => {
  let fake: ReturnType<typeof fakeSqlite>;
  let store: SqliteStore;

  /** App 被杀掉后重开：内存里的东西全没了，库还在 */
  async function relaunch(): Promise<ActiveSession> {
    store = new SqliteStore();
    await store.init();
    const restored = await store.loadActiveSession();
    if (restored === null) throw new Error('没有进行中的训练');
    return restoreSession(restored);
  }

  async function started(): Promise<ActiveSession> {
    const { session, events } = startSession({
      id: 'session-1',
      planId: 'push',
      date: '2026-10-17',
      startedAt: T0,
      exercises: exercises(),
    });
    await applyEvents(store, session.id, events);
    return session;
  }

  /** 记一组：点完成本组 → 保存，都落库 */
  async function logSet(session: ActiveSession, id: string, at: number, rir: number | null): Promise<ActiveSession> {
    const begun = beginSet(session, { exercise: bench, doneAt: at });
    await applyEvents(store, session.id, begun.events);
    const saved = saveSet(begun.session, {
      id,
      values: { weight: 80, reps: 8, rir },
      savedAt: at + 2_400,
      closedBy: 'confirm',
    });
    await applyEvents(store, session.id, saved.events);
    return saved.session;
  }

  const rows = (sql: string) => fake.db().prepare(sql).all() as Array<Record<string, unknown>>;

  beforeEach(async () => {
    fake = fakeSqlite();
    vi.stubGlobal('plus', { sqlite: fake.api });
    store = new SqliteStore();
    await store.init();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('建表和补动作库重复执行也没事', async () => {
    await store.init();
    await store.init();
    expect(await store.listExercises()).toHaveLength(6);
    expect(rows('SELECT value FROM meta WHERE key = \'schema_version\'')[0]?.value).toBe('2');
  });

  it('动作库读回来和写进去一样', async () => {
    const list = await store.listExercises();
    const row = list.find((e) => e.id === bench.id);
    expect(row).toMatchObject({
      loadType: 'total',
      increment: 2.5,
      repMin: 6,
      repMax: 8,
      maxIncreasePct: 0.05,
      compound: true,
      primaryMuscles: ['chest'],
      restMinSec: 120,
    });
  });

  it('没有进行中的训练时返回 null', async () => {
    expect(await store.loadActiveSession()).toBeNull();
  });

  it('开始训练后杀掉重开，目标原样回来', async () => {
    const session = await started();
    const back = await relaunch();
    expect(back.id).toBe(session.id);
    expect(back.startedAt).toBe(T0);
    expect(back.currentExerciseId).toBe(bench.id);
    expect(back.exercises.map((e) => e.exerciseId)).toEqual(PUSH_DAY.map((m) => m.config.id));
    expect(back.exercises[0]?.target).toMatchObject({ weight: 80, reps: [8, 8, 8], repRange: { min: 6, max: 8 } });
  });

  it('面板开着时杀掉，重开后接着记这一组，用时从当时算起', async () => {
    const session = await started();
    const begun = beginSet(session, { exercise: bench, doneAt: T0 + 60_000 });
    await applyEvents(store, session.id, begun.events);

    const back = await relaunch();
    expect(back.pending).toEqual(begun.session.pending);

    const { session: after, events } = saveSet(back, {
      id: 'a',
      values: { weight: 80, reps: 8, rir: 2 },
      savedAt: T0 + 64_000,
      closedBy: 'confirm',
    });
    await applyEvents(store, session.id, events);

    const again = await relaunch();
    expect(again.pending).toBeNull();
    expect(again.sets).toEqual(after.sets);
    expect(again.sets[0]?.logMs).toBe(4_000);
  });

  it('保存的每个字段都回得来，备注里的单引号不会弄坏 SQL', async () => {
    const session = await started();
    const begun = beginSet(session, { exercise: bench, doneAt: T0 });
    await applyEvents(store, session.id, begun.events);
    const { events } = saveSet(begun.session, {
      id: 'a',
      values: { weight: 81.25, reps: 7, rir: null },
      savedAt: T0 + 3_000,
      closedBy: 'dismiss',
      note: `节奏放慢'; DROP TABLE sets; --`,
    });
    await applyEvents(store, session.id, events);

    const set = (await relaunch()).sets[0];
    expect(set).toMatchObject({
      weight: 81.25,
      reps: 7,
      rir: null,
      note: `节奏放慢'; DROP TABLE sets; --`,
      closedBy: 'dismiss',
      logMs: 3_000,
      prefill: { weight: 80, reps: 8, rir: null },
    });
  });

  it('撤销不物理删除，重开后也不回来', async () => {
    let session = await started();
    session = await logSet(session, 'a', T0, 2);
    const { events } = undoLastSet(session, T0 + 3_000);
    await applyEvents(store, session.id, events);

    expect((await relaunch()).sets).toHaveLength(0);
    expect(rows('SELECT id, undone FROM sets')).toEqual([{ id: 'a', undone: 1 }]);
  });

  it('提示写进 suggestions，带规则版本和决定；挂着的提示重开后还在', async () => {
    let session = await started();
    session = await logSet(session, 'a', T0, 4);
    const set = session.sets[0]!;
    const hint = hintForSet({ session, exercise: bench, set });
    const shown = recordHintShown(session, { fromSet: set, hint, suggestionId: 'sug-1', createdAt: T0 + 3_000 });
    await applyEvents(store, session.id, shown.events);
    const applied = applyHint(shown.session, bench.id, T0 + 4_000);
    await applyEvents(store, session.id, applied.events);

    expect(rows('SELECT rule_id, rule_version, kind, decision, decided_at FROM suggestions')).toEqual([
      { rule_id: 'A1', rule_version: RULE_VERSION, kind: 'increase', decision: 'applied', decided_at: T0 + 4_000 },
    ]);
    const payload = JSON.parse(String(rows('SELECT payload FROM suggestions')[0]?.payload));
    expect(payload.weight).toBe(82.5);

    const back = await relaunch();
    expect(back.exercises[0]?.hint).toMatchObject({ suggestionId: 'sug-1', weight: 82.5, reps: 6, applied: true });
    expect(beginSet(back, { exercise: bench, doneAt: T0 + 200_000 }).session.pending?.prefill).toEqual({
      weight: 82.5,
      reps: 6,
      rir: 4,
    });
  });

  it('补填改同一行，不多出一组，提示结算成采纳', async () => {
    let session = await started();
    session = await logSet(session, 'a', T0, null);
    const set = session.sets[0]!;
    const hint = hintForSet({ session, exercise: bench, set });
    const shown = recordHintShown(session, { fromSet: set, hint, suggestionId: 'sug-1', createdAt: T0 + 3_000 });
    await applyEvents(store, session.id, shown.events);

    const updated = updateSet(shown.session, {
      setId: set.id,
      values: { weight: 80, reps: 8, rir: 2 },
      updatedAt: T0 + 9_000,
    });
    await applyEvents(store, session.id, updated.events);

    expect(rows('SELECT COUNT(*) AS n FROM sets')[0]?.n).toBe(1);
    expect(rows('SELECT rir, log_ms FROM sets')).toEqual([{ rir: 2, log_ms: 2_400 }]);
    expect(rows('SELECT kind, decision FROM suggestions')).toEqual([{ kind: 'need_rir', decision: 'applied' }]);
    expect((await relaunch()).exercises[0]?.hint).toBeNull();
  });

  it('结束后不再算进行中，下一次能查到它的组', async () => {
    let session = await started();
    session = await logSet(session, 'a', T0, 2);
    const { events } = endSession(session, T0 + 10_000);
    await applyEvents(store, session.id, events);

    expect(await store.loadActiveSession()).toBeNull();
    expect(await store.lastSessionDate(bench.id, null)).toBe('2026-10-17');
    expect(await store.lastSessionDate(bench.id, 'session-1')).toBeNull();
    const last = await store.lastSets(bench.id, null);
    expect(last?.date).toBe('2026-10-17');
    expect(last?.sets.map((s) => s.id)).toEqual(['a']);
  });

  it('每组用时能查出来，第一道放行要看这个', async () => {
    let session = await started();
    session = await logSet(session, 'a', T0, 2);
    expect(await store.setTimings(session.id)).toEqual([
      { exerciseId: bench.id, setNo: 1, logMs: 2_400, closedBy: 'confirm', changedPrefill: true },
    ]);
  });

  it('演示数据灌得进去，只灌一次的判断也成立', async () => {
    expect(await store.hasAnySession()).toBe(false);
    await store.importHistory(demoHistory(T0));
    expect(await store.hasAnySession()).toBe(true);
    const last = await store.lastSets(bench.id, null);
    expect(last?.sets.map((s) => [s.weight, s.reps, s.rir])).toEqual([
      [80, 8, 2],
      [80, 8, 2],
      [80, 8, 1],
    ]);
    expect(await store.loadActiveSession()).toBeNull();
  });
});
