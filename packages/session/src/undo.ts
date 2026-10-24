/**
 * 保存后的 5 秒撤销窗口。
 *
 * 只管「还能不能撤」这件事；真正的回滚在 recorder.ts 的 undoLastSet。
 * 和计时一样按时间戳算：App 切后台再回来，窗口该过期就是过期了。
 */

/** 撤销窗口：保存后 5 秒内可撤 */
export const UNDO_WINDOW_MS = 5000;

/** 还剩多少毫秒可以撤销；过期为 0 */
export function undoRemainingMs(savedAt: number, now: number, windowMs: number = UNDO_WINDOW_MS): number {
  const left = savedAt + windowMs - now;
  return left > 0 ? left : 0;
}

export function canUndo(savedAt: number, now: number, windowMs: number = UNDO_WINDOW_MS): boolean {
  return undoRemainingMs(savedAt, now, windowMs) > 0;
}

/** 撤销条还剩几秒（向上取整，用来显示倒数） */
export function undoRemainingSeconds(savedAt: number, now: number, windowMs: number = UNDO_WINDOW_MS): number {
  return Math.ceil(undoRemainingMs(savedAt, now, windowMs) / 1000);
}
