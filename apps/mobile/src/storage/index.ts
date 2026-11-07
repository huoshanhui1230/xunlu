/**
 * 挑一个存储实现并开库。
 *
 * App 端用 SQLite，其余平台用内存，靠条件编译定，不在运行时猜：
 * 运行时判断的话，App 端一旦判断错就会悄悄退回内存，数据一杀就没，而且看不出来。
 */
import { SEED_DEMO_HISTORY, demoHistory } from '@/data/demo-history';
import { t } from '@/locale';
import { MemoryStore } from './memory';
import { SqliteStore } from './sqlite';
import type { Store } from './types';

let opening: Promise<Store> | null = null;
let opened: Store | null = null;

export function createStore(): Store {
  // #ifdef APP-PLUS
  return new SqliteStore();
  // #endif
  // #ifndef APP-PLUS
  return new MemoryStore();
  // #endif
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : JSON.stringify(error);
}

/** 写库失败要让人看见：真机上没有控制台，而且用户以为记下了 */
export function reportStoreError(error: unknown): void {
  console.error('[训录] 存储出错', error);
  uni.showModal({
    title: t('storage.failedTitle'),
    content: t('storage.failedBody', { detail: errorText(error) }),
    showCancel: false,
  });
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
    })().catch((error: unknown) => {
      reportStoreError(error);
      throw error;
    });
  }
  return opening;
}

/** 已经开好的库；没开过就先开 */
export async function useStore(): Promise<Store> {
  return opened ?? (await openStore());
}

export { applyEvents } from './events';
export type { ExerciseRow, HistorySession, LastSets, SetTiming, Store } from './types';
