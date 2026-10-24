/**
 * 组间提示卡的文案。
 *
 * 按引擎给的 ruleId 和 kind 从词典取，页面不判断加重减重。
 * A4（保持）、A0（补填 RIR）、A1 nudge（只提醒方向）第 11 页画过，用设计稿原文；
 * A1 increase、A2、A3 没画，用 docs/engine-spec.md 的文案。
 */
import type { SetHint } from '@xunlu/engine';
import { t } from '@/locale';
import { formatReps, formatWeight, type Unit } from './format';

export interface HintCopy {
  readonly title: string;
  readonly sub: string;
  /** 卡片上的按钮；没有按钮时为 null（只提醒方向的那种） */
  readonly action: string | null;
  /** 按钮点下去做什么 */
  readonly act: 'apply' | 'fill_rir' | null;
}

export interface HintCopyInput {
  readonly hint: SetHint;
  readonly unit: Unit;
  /** 给出这条提示的那一组做了几次，用来反推余力 */
  readonly fromReps: number;
  /** 本动作的计划组数与已完成组数 */
  readonly plannedSets: number;
  readonly doneSets: number;
  /** 用户点过「应用」没有 */
  readonly applied: boolean;
}

export function hintCopy(input: HintCopyInput): HintCopy {
  const { hint, unit, fromReps, plannedSets, doneSets, applied } = input;
  const weight = formatWeight(hint.weight, unit);
  const reps = hint.reps === undefined ? '' : formatReps(hint.reps.low, hint.reps.high);
  // 引擎只给 capacity（次数 + 余力），余力反推出来
  const rir = hint.rirSource === 'none' ? null : hint.capacity - fromReps;

  if (hint.kind === 'need_rir') {
    return { title: t('hint.A0.title'), sub: t('hint.A0.sub'), action: t('hint.A0.action'), act: 'fill_rir' };
  }

  if (hint.kind === 'nudge') {
    const onlyReps = hint.nudge !== undefined && !hint.nudge.includes('weight');
    return {
      title: onlyReps ? t('hint.nudge.titleReps') : t('hint.nudge.titleBoth'),
      sub: t(`hint.nudge.${hint.nudgeReason ?? 'step_exceeds_cap'}`),
      action: null,
      act: null,
    };
  }

  if (applied) {
    return {
      title: t('hint.appliedTitle', { weight, reps }),
      sub: t('hint.appliedSub', { count: doneSets }),
      action: t('hint.applied'),
      act: null,
    };
  }

  switch (hint.ruleId) {
    case 'A1':
      return {
        title: t('hint.A1.title', { weight, reps }),
        sub: t('hint.A1.sub', { capacity: hint.capacity, threshold: hint.threshold }),
        action: t('hint.apply'),
        act: 'apply',
      };
    case 'A2':
      return {
        title: t('hint.A2.title', { reps }),
        sub: t('hint.A2.sub', { rir: rir ?? 0 }),
        action: t('hint.apply'),
        act: 'apply',
      };
    case 'A3':
      return {
        title: t('hint.A3.title', { weight }),
        sub: t('hint.A3.sub', { reps }),
        action: t('hint.apply'),
        act: 'apply',
      };
    case 'A4':
    default:
      return {
        title: t('hint.A4.title', { weight, reps }),
        sub: holdSub(rir, plannedSets, doneSets),
        action: t('hint.apply'),
        act: 'apply',
      };
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
