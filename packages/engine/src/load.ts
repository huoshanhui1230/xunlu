/**
 * 负重方式相关的规则：怎样算"加一档""减一档"，加重幅度能不能算。
 */
import type { EngineParams } from './params';
import type { ExerciseConfig, Settings, WeightChange } from './types';
import { EPS, gridFloor, round2 } from './math';

/** 增量为 0：只加次数，不出加重建议 */
export function isRepsOnly(ex: ExerciseConfig): boolean {
  return !(ex.increment > 0);
}

/**
 * 能否计算加重幅度。
 * 自重加负重、助力动作需要体重才能算真实负荷，而个人档案不参与计算，所以无法确认幅度。
 */
export function canMeasurePct(ex: ExerciseConfig): boolean {
  return ex.loadType === 'total' || ex.loadType === 'perSide';
}

/** a 是否比 b 更难（助力动作：助力越小越难） */
export function isHarder(ex: ExerciseConfig, a: number, b: number): boolean {
  return ex.loadType === 'assisted' ? a < b - 0.0049 : a > b + 0.0049;
}

/** 加一档；不能加时返回 null */
export function stepHarder(ex: ExerciseConfig, weight: number): number | null {
  if (isRepsOnly(ex)) return null;
  if (ex.loadType === 'assisted') {
    if (!(weight > 0)) return null;
    return round2(Math.max(0, weight - ex.increment));
  }
  return round2(weight + ex.increment);
}

/** 减一档；不能减时返回 null */
export function stepEasier(ex: ExerciseConfig, weight: number): number | null {
  if (isRepsOnly(ex)) return null;
  if (ex.loadType === 'assisted') return round2(weight + ex.increment);
  if (!(weight > 0)) return null;
  return round2(Math.max(0, weight - ex.increment));
}

/**
 * 按比例减轻负荷，向下取整到增量格，保证减得不少于标称比例。
 * 助力动作无法按比例算，改为加助力：减 20% 及以上加两档，否则加一档。
 * 不能减时返回 null（增量为 0，或额外负重已经是 0）。
 */
export function reduceLoad(ex: ExerciseConfig, weight: number, cut: number): number | null {
  if (isRepsOnly(ex)) return null;
  if (ex.loadType === 'assisted') {
    const steps = cut >= 0.2 - EPS ? 2 : 1;
    return round2(weight + steps * ex.increment);
  }
  if (!(weight > 0)) return null;
  return gridFloor(weight * (1 - cut), ex.increment);
}

/** 本次可用的加重上限 */
export function increaseCap(ex: ExerciseConfig, settings: Settings, p: EngineParams): number {
  return settings.conservative ? Math.min(ex.maxIncreasePct, p.conservativeMaxIncreasePct) : ex.maxIncreasePct;
}

export function weightChange(ex: ExerciseConfig, from: number, to: number): WeightChange {
  return { from, to, pct: canMeasurePct(ex) && from > 0 ? (to - from) / from : null };
}
