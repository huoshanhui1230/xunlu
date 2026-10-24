/**
 * 训录训练过程 · 类型
 *
 * 这个包管「一次训练正在进行时」的状态：记到第几组、面板开着没有、计时从哪个时间戳算、
 * 预填该填什么、还能不能撤销、App 被杀掉后怎么拼回来。
 *
 * 和引擎一样是纯函数：不读时钟、不读存储、不含界面文字，也不碰 uni / plus / DOM。
 * 时间一律用毫秒时间戳（由调用方传 Date.now()），日期用 YYYY-MM-DD（由 App 按用户时区生成）。
 * 加重、减重、下次目标一律交给 @xunlu/engine，这里不自己算。
 */
import type { SetTag, Target } from '@xunlu/engine';

/** 三个滚轮的值：重量、次数、还能再做几次 */
export interface WheelValues {
  readonly weight: number;
  readonly reps: number;
  /** null 表示没填（「我的」里关掉 RIR 时） */
  readonly rir: number | null;
}

/** 这一组是怎么保存的：点确认、关闭面板、或者直接再点一次「完成本组」 */
export type SaveTrigger = 'confirm' | 'dismiss' | 'done_again';

/** 一组已保存的记录 */
export interface LoggedSet {
  readonly id: string;
  readonly exerciseId: string;
  /** 该动作在本次训练里的第几组，从 1 起 */
  readonly setNo: number;
  readonly weight: number;
  readonly reps: number;
  readonly rir: number | null;
  readonly tag: SetTag | null;
  readonly note: string | null;
  /** 上一组保存的时间戳，用来算「距上一组」；本动作第一组为 null */
  readonly prevSetAt: number | null;
  /** 点「完成本组」的时间戳 */
  readonly doneAt: number;
  /** 反馈保存的时间戳 */
  readonly savedAt: number;
  /** savedAt − doneAt：记一组花了多久。第一道放行看的就是这个数 */
  readonly logMs: number;
  /** 打开面板时的预填值，用来看用户改了多少 */
  readonly prefill: WheelValues;
  readonly closedBy: SaveTrigger;
}

/** 点过「应用」之后，下一组的预填改用这两个值 */
export interface AppliedHint {
  /** 应用到该动作的第几组 */
  readonly setNo: number;
  readonly weight: number;
  readonly reps: number;
}

/** 当前挂在界面上的那条组间提示 */
export interface HintState {
  /** 对应 suggestions 表的一行 */
  readonly suggestionId: string;
  /** 这条提示是看着第几组给出来的 */
  readonly fromSetNo: number;
  /** 提示针对的是第几组 */
  readonly setNo: number;
  readonly ruleId: string;
  readonly kind: string;
  /** 提示的下一组重量 */
  readonly weight: number;
  /** 提示的下一组次数下限，点「应用」后用它预填 */
  readonly reps: number;
  /** 用户点过「应用」没有 */
  readonly applied: boolean;
}

/** 本次训练里的一个动作 */
export interface ActiveExercise {
  readonly exerciseId: string;
  /** 在本次训练里的顺序，从 0 起 */
  readonly position: number;
  /** 本次目标：开始训练时由 adjustForLayoff 处理过 */
  readonly target: Target;
  /**
   * 出过加重提示的那些组的 id。引擎的「每个动作每次训练最多提示一次加重」看它的长度；
   * 存成 id 而不是计数，是为了撤销某一组时能把对应的那次提示一并退掉。
   */
  readonly increaseHintSetIds: readonly string[];
  /** 当前挂着的提示；没有为 null */
  readonly hint: HintState | null;
}

/** 面板开着：已经点了「完成本组」，还没保存 */
export interface PendingSet {
  readonly exerciseId: string;
  readonly setNo: number;
  readonly doneAt: number;
  readonly prefill: WheelValues;
}

/** 一次进行中的训练 */
export interface ActiveSession {
  readonly id: string;
  readonly planId: string | null;
  /** 训练日期 YYYY-MM-DD */
  readonly date: string;
  readonly startedAt: number;
  readonly unit: 'kg' | 'lb';
  /** 减载周里的训练：引擎不出加重提示 */
  readonly deload: boolean;
  readonly currentExerciseId: string;
  readonly exercises: readonly ActiveExercise[];
  /** 全场已保存的组，按保存顺序；撤销掉的不在里面 */
  readonly sets: readonly LoggedSet[];
  /** 面板开着时的待保存组；没开面板为 null */
  readonly pending: PendingSet | null;
  readonly endedAt: number | null;
}

/**
 * 状态机吐出来的待写事件：存储层照单执行即可。
 * 这样「算什么」和「写哪张表」分开，纯逻辑可以单测，存储实现可以换。
 */
export type StoreEvent =
  | { readonly kind: 'session_started'; readonly session: ActiveSession }
  /** 点了「完成本组」，面板打开：立刻落库，App 这时候被杀掉也不丢这一组的起点 */
  | { readonly kind: 'set_begun'; readonly pending: PendingSet }
  | { readonly kind: 'set_saved'; readonly set: LoggedSet }
  | { readonly kind: 'pending_cleared' }
  | { readonly kind: 'set_undone'; readonly setId: string }
  | { readonly kind: 'exercise_state_changed'; readonly exercise: ActiveExercise }
  | { readonly kind: 'current_exercise_changed'; readonly exerciseId: string }
  | { readonly kind: 'suggestion_shown'; readonly suggestion: ShownSuggestion }
  | {
      readonly kind: 'suggestion_decided';
      readonly suggestionId: string;
      readonly decision: SuggestionDecision;
      readonly decidedAt: number;
    }
  | { readonly kind: 'session_ended'; readonly endedAt: number };

/** 用户拿这条建议做了什么；写回 suggestions 表用来回溯和调参 */
export type SuggestionDecision = 'shown' | 'applied' | 'modified' | 'ignored';

/** 显示过的建议：组间提示（intra）和训练后下次目标（post）都走这一张表 */
export interface ShownSuggestion {
  readonly id: string;
  readonly exerciseId: string;
  readonly scope: 'intra' | 'post';
  /** intra：这条提示是看着哪一组给出来的 */
  readonly setId: string | null;
  readonly ruleVersion: string;
  readonly ruleId: string;
  readonly kind: string;
  /** post 的原因码；intra 没有原因码，为 null */
  readonly reason: string | null;
  /** intra 没出加重提示时的原因 */
  readonly blockedBy: string | null;
  /** 完整的 SetHint / Suggestion，序列化后原样存下来 */
  readonly payload: string;
  readonly decision: SuggestionDecision;
  readonly createdAt: number;
}

/** 一个动作的推荐组间歇，用来决定计时什么时候变成「已进入推荐区间」 */
export interface RestRange {
  readonly minSec: number;
  readonly maxSec: number;
}

/** 状态机每次都返回「新状态 + 要写库的事件」 */
export interface Transition {
  readonly session: ActiveSession;
  readonly events: readonly StoreEvent[];
}
