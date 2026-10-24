/**
 * 排版小工具。界面上出现的文字一律从词典取，这里只负责把数字填进词条。
 */
import { t } from '@/locale';
import { monthDay } from './date';

export type Unit = 'kg' | 'lb';

/** 82.5 → 82.5，80.0 → 80；重量不要显示多余的零 */
export function trimNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

/** 80 kg */
export function formatWeight(value: number, unit: Unit): string {
  return t('format.weight', { value: trimNumber(value), unit: t(`unit.${unit}`) });
}

/** 8 次 / 6–8 次 */
export function formatReps(low: number, high: number = low): string {
  return low === high ? t('format.reps', { reps: low }) : t('format.repsRange', { low, high });
}

/** 还能做 2 次 / 未填余力 */
export function formatRir(rir: number | null): string {
  return rir === null ? t('format.rirUnknown') : t('format.rir', { rir });
}

/** 80 kg × 8 次 */
export function formatSet(weight: number, reps: number, unit: Unit): string {
  return t('format.weightByReps', { weight: formatWeight(weight, unit), reps: formatReps(reps) });
}

/** 2–3 分钟 */
export function formatRestRange(minSec: number, maxSec: number): string {
  return t('format.minutesRange', { low: Math.round(minSec / 60), high: Math.round(maxSec / 60) });
}

/** 10/12 */
export function formatMonthDay(date: string): string {
  const { month, day } = monthDay(date);
  return t('format.monthDay', { month, day });
}

/** 10 月 12 日 */
export function formatMonthDayCn(date: string): string {
  const { month, day } = monthDay(date);
  return t('format.monthDayCn', { month, day });
}

/** 1,920 kg：容量带千分位 */
export function formatVolume(value: number, unit: Unit): string {
  const rounded = Math.round(value);
  const grouped = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return t('format.weight', { value: grouped, unit: t(`unit.${unit}`) });
}

/** 2.4：记一组用了多久，只打控制台 */
export function formatSeconds(ms: number): string {
  return (Math.round(ms / 100) / 10).toFixed(1);
}
