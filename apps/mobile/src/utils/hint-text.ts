/**
 * 组间提示卡的文案。
 *
 * 按引擎给的 ruleId 从词典取，页面不判断加重减重。
 * A4（保持）第 11 页画过，用设计稿原文；A1、A2、A3 没画，用 docs/engine-spec.md 的文案。
 */
import type { SetHint } from '@xunlu/engine';
import { t } from '@/locale';
import { formatReps, formatWeight, type Unit } from './format';

export interface HintCopy {
  readonly title: string;
  readonly sub: string;
}

export interface HintCopyInput {
  readonly hint: SetHint;
  readonly unit: Unit;
  /** 刚保存那一组的还能再做几次 */
  readonly rir: number | null;
  /** 本动作的计划组数与已完成组数 */
  readonly plannedSets: number;
  readonly doneSets: number;
  /** 用户点过「应用」没有 */
  readonly applied: boolean;
}

export function hintCopy(input: HintCopyInput): HintCopy {
  const { hint, unit, rir, plannedSets, doneSets, applied } = input;
  const weight = formatWeight(hint.weight, unit);
  const reps = formatReps(hint.reps.low, hint.reps.high);

  if (applied) {
    return {
      title: t('hint.appliedTitle', { weight, reps }),
      sub: t('hint.appliedSub', { count: doneSets }),
    };
  }

  switch (hint.ruleId) {
    case 'A1':
      return {
        title: t('hint.A1.title', { weight, reps }),
        sub: t('hint.A1.sub', { capacity: hint.capacity, threshold: hint.threshold }),
      };
    case 'A2':
      return {
        title: t('hint.A2.title', { reps }),
        sub: t('hint.A2.sub', { rir: rir ?? 0 }),
      };
    case 'A3':
      return {
        title: t('hint.A3.title', { weight }),
        sub: t('hint.A3.sub', { reps }),
      };
    case 'A4':
    default:
      return { title: t('hint.A4.title', { weight, reps }), sub: holdSub(rir, plannedSets, doneSets) };
  }
}

function holdSub(rir: number | null, plannedSets: number, doneSets: number): string {
  const left = Math.max(0, plannedSets - doneSets);
  if (rir === null) {
    return left === 0
      ? t('hint.A4.subDoneNoRir', { planned: plannedSets })
      : t('hint.A4.subLeftNoRir', { planned: plannedSets, left });
  }
  return left === 0
    ? t('hint.A4.subDone', { rir, planned: plannedSets })
    : t('hint.A4.subLeft', { rir, planned: plannedSets, left });
}
