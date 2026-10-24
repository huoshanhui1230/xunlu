/**
 * 计时：只存时间戳，显示时现算。
 *
 * 界面每秒重绘一次，回到前台立刻用 Date.now() 重算，不靠累加计数器 —— 这样
 * App 被切到后台、屏幕锁上再回来，数字也是对的。不倒计时，也不限制组间歇。
 */
import type { RestRange } from './types';

/** 距推荐组间歇的位置：之前 / 之中 / 之后。之中和之后都算「已进入推荐区间」 */
export type RestPhase = 'before' | 'in' | 'after';

/** 负数一律当 0；别让时钟回拨把计时变成负的 */
function clampMs(ms: number): number {
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

export function elapsedSince(startedAt: number, now: number): number {
  return clampMs(now - startedAt);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 毫秒转显示文字：不到一小时是 MM:SS，超过一小时是 H:MM:SS。
 * 向下取整到秒，这样 00:59.9 还显示 00:59，不会跳着走。
 */
export function formatElapsed(ms: number): string {
  const total = Math.floor(clampMs(ms) / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${pad2(minutes)}:${pad2(seconds)}`;
}

/** 组间歇走到哪了。到达下限的那一秒就算进入区间（计时随即变绿） */
export function restPhase(ms: number, range: RestRange): RestPhase {
  const seconds = clampMs(ms) / 1000;
  if (seconds < range.minSec) return 'before';
  return seconds <= range.maxSec ? 'in' : 'after';
}

/** 进入推荐区间了没有：界面据此在 --color-timer 和 --color-success 之间切 */
export function inRestRange(ms: number, range: RestRange): boolean {
  return restPhase(ms, range) !== 'before';
}
