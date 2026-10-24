import { describe, expect, it } from 'vitest';
import { UNDO_WINDOW_MS, canUndo, undoRemainingMs, undoRemainingSeconds } from '../src';

const savedAt = 1_000_000;

describe('撤销窗口', () => {
  it('默认 5 秒', () => {
    expect(UNDO_WINDOW_MS).toBe(5000);
  });

  it('窗口内可撤，到点即止', () => {
    expect(canUndo(savedAt, savedAt)).toBe(true);
    expect(canUndo(savedAt, savedAt + 4_999)).toBe(true);
    expect(canUndo(savedAt, savedAt + 5_000)).toBe(false);
    expect(canUndo(savedAt, savedAt + 60_000)).toBe(false);
  });

  it('按时间戳算，切后台再回来该过期就过期', () => {
    expect(undoRemainingMs(savedAt, savedAt + 1_200)).toBe(3_800);
    expect(undoRemainingMs(savedAt, savedAt + 30_000)).toBe(0);
  });

  it('剩余秒数向上取整，便于显示倒数', () => {
    expect(undoRemainingSeconds(savedAt, savedAt)).toBe(5);
    expect(undoRemainingSeconds(savedAt, savedAt + 1)).toBe(5);
    expect(undoRemainingSeconds(savedAt, savedAt + 4_001)).toBe(1);
    expect(undoRemainingSeconds(savedAt, savedAt + 5_000)).toBe(0);
  });
});
