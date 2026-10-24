import { describe, expect, it } from 'vitest';
import { elapsedSince, formatElapsed, inRestRange, restPhase } from '../src';
import { benchRest } from './helpers';

describe('formatElapsed', () => {
  it('不到一小时显示 MM:SS', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(78_000)).toBe('01:18');
    expect(formatElapsed(7 * 60_000 + 24_000)).toBe('07:24');
    expect(formatElapsed(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('超过一小时显示 H:MM:SS', () => {
    expect(formatElapsed(3_600_000)).toBe('1:00:00');
    expect(formatElapsed(3_600_000 + 5 * 60_000 + 9_000)).toBe('1:05:09');
  });

  it('不满一秒的零头向下取整，数字不跳着走', () => {
    expect(formatElapsed(59_999)).toBe('00:59');
    expect(formatElapsed(60_000)).toBe('01:00');
  });

  it('时钟回拨不出现负数', () => {
    expect(formatElapsed(-5_000)).toBe('00:00');
    expect(elapsedSince(1_000, 500)).toBe(0);
  });
});

describe('elapsedSince', () => {
  it('按时间戳现算，不累加', () => {
    expect(elapsedSince(1_000_000, 1_078_000)).toBe(78_000);
  });
});

describe('restPhase', () => {
  it('到达下限那一秒就算进入推荐区间', () => {
    expect(restPhase(119_000, benchRest)).toBe('before');
    expect(restPhase(119_999, benchRest)).toBe('before');
    expect(restPhase(120_000, benchRest)).toBe('in');
  });

  it('超过上限仍算已进入区间，不催促', () => {
    expect(restPhase(180_000, benchRest)).toBe('in');
    expect(restPhase(180_001, benchRest)).toBe('after');
    expect(inRestRange(600_000, benchRest)).toBe(true);
  });

  it('inRestRange 决定计时用 timer 还是 success 色', () => {
    expect(inRestRange(0, benchRest)).toBe(false);
    expect(inRestRange(119_999, benchRest)).toBe(false);
    expect(inRestRange(120_000, benchRest)).toBe(true);
  });
});
