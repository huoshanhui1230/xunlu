export const EPS = 1e-9;

const DAY_MS = 86400000;

/** 保留两位小数（重量统一按两位小数存） */
export function round2(x: number): number {
  const r = Math.round(x * 100 + (x >= 0 ? 1e-6 : -1e-6)) / 100;
  return r === 0 ? 0 : r;
}

/** 向下取整到增量格（以 0 为起点）；增量 ≤ 0 时只保留两位小数 */
export function gridFloor(x: number, step: number): number {
  const stepCents = Math.round(step * 100);
  if (!(stepCents > 0)) return round2(x);
  const xCents = Math.round(x * 100);
  const r = (Math.floor(xCents / stepCents) * stepCents) / 100;
  return r === 0 ? 0 : r;
}

export function sameWeight(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function mean(xs: readonly number[]): number {
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** 解析 YYYY-MM-DD，返回 UTC 零点的毫秒数 */
export function parseDate(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`日期应为 YYYY-MM-DD：${date}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    throw new RangeError(`无效日期：${date}`);
  }
  return t;
}

/** 两个日期相差的天数（to − from） */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to) - parseDate(from)) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(parseDate(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function laterDate(a: string, b: string): string {
  return a >= b ? a : b;
}
