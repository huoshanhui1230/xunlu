/**
 * 挑一个存储实现并开库。
 *
 * App 端有 plus.sqlite 就用 SQLite，H5 下退回内存实现。两边都实现同一个 Store 接口，
 * 页面不需要知道自己跑在哪儿。
 */
import { SEED_DEMO_HISTORY, demoHistory } from '@/data/demo-history';
import { MemoryStore } from './memory';
import { SqliteStore, hasSqlite } from './sqlite';
import type { Store } from './types';

let opening: Promise<Store> | null = null;
let opened: Store | null = null;

export function createStore(): Store {
  return hasSqlite() ? new SqliteStore() : new MemoryStore();
}

/** 建表、补动作库，必要时灌一次演示数据。重复调用只开一次 */
export function openStore(): Promise<Store> {
  if (opening === null) {
    opening = (async () => {
      const store = createStore();
      await store.init();
      if (SEED_DEMO_HISTORY && !(await store.hasAnySession())) {
        await store.importHistory(demoHistory());
      }
      opened = store;
      return store;
    })();
  }
  return opening;
}

/** 已经开好的库；没开过就先开 */
export async function useStore(): Promise<Store> {
  return opened ?? (await openStore());
}

export { applyEvents } from './events';
export type { ExerciseRow, HistorySession, LastSets, SetTiming, Store } from './types';
