/**
 * 日期：引擎只认 YYYY-MM-DD，而且说明白了由 App 按用户时区生成。
 * 所以这里一律用本机时区算，不要用 toISOString（那是 UTC）。
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 本机时区的今天，YYYY-MM-DD */
export function todayLocal(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 一天的毫秒数，用来把时间戳往前挪 */
export const DAY_MS = 86_400_000;

/** 取月和日，给「10/12」「10 月 12 日」这类显示用 */
export function monthDay(date: string): { month: number; day: number } {
  const parts = date.split('-');
  return { month: Number(parts[1] ?? 0), day: Number(parts[2] ?? 0) };
}
