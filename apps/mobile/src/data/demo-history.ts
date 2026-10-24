/**
 * 演示用的「上次推日」。
 *
 * 设计稿的记录页有一张「上次同组对照」卡，第一次装上 App 时库里什么都没有，这张卡就是空的。
 * 为了第一道放行时能照着设计稿走一遍，首次启动灌一次 5 天前的推日记录。
 *
 * 不想要就把 SEED_DEMO_HISTORY 改成 false，或者在「我的」里清库（本轮还没有这个入口）。
 */
import { addDays } from '@xunlu/engine';
import type { LoggedSet } from '@xunlu/session';
import type { HistorySession } from '@/storage/types';
import { DAY_MS, todayLocal } from '@/utils/date';
import { PUSH_DAY, PUSH_DAY_ID } from './push-day';

/** 首次启动是否灌演示数据 */
export const SEED_DEMO_HISTORY = true;

/** 演示数据是几天前的：和设计稿的「距上次 5 天」对齐 */
const DAYS_AGO = 5;

export function demoHistory(now: number = Date.now()): HistorySession[] {
  const startedAt = now - DAYS_AGO * DAY_MS;
  const date = addDays(todayLocal(now), -DAYS_AGO);
  const sets: LoggedSet[] = [];
  let at = startedAt;

  PUSH_DAY.forEach((meta, exerciseIndex) => {
    const target = meta.startTarget;
    for (let setNo = 1; setNo <= target.sets; setNo += 1) {
      // 最后一组稍微吃力一点，和设计稿的「还能做 1 次」对上
      const rir = setNo === target.sets ? 1 : 2;
      const reps = target.reps[setNo - 1] ?? target.repRange.max;
      const doneAt = at + meta.rest.minSec * 1000;
      const savedAt = doneAt + 2_400;
      sets.push({
        id: `demo-${exerciseIndex}-${setNo}`,
        exerciseId: meta.config.id,
        setNo,
        weight: target.weight,
        reps,
        rir,
        tag: null,
        note: null,
        prevSetAt: setNo === 1 ? null : at,
        doneAt,
        savedAt,
        logMs: savedAt - doneAt,
        prefill: { weight: target.weight, reps, rir: 2 },
        closedBy: 'confirm',
      });
      at = savedAt;
    }
  });

  return [
    {
      id: 'demo-push-session',
      planId: PUSH_DAY_ID,
      date,
      startedAt,
      endedAt: at,
      sets,
    },
  ];
}
