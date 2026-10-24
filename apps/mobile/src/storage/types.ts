/**
 * 本地存储的接口。MVP 没有账号和服务器，数据全部存在手机本地。
 *
 * App 端用 SQLite（plus.sqlite），H5 端用内存实现，接口是同一个，页面感觉不到区别。
 * 每次「完成本组」、保存反馈都立刻落库，所以 App 被系统杀掉后重开能接着记。
 */
import type { LoadType } from '@xunlu/engine';
import type {
  ActiveExercise,
  ActiveSession,
  LoggedSet,
  PendingSet,
  RestoreInput,
  ShownSuggestion,
  SuggestionDecision,
} from '@xunlu/session';

/** 动作库的一行。动作名不进库，界面按 id 去词典里取 */
export interface ExerciseRow {
  readonly id: string;
  readonly loadType: LoadType;
  readonly increment: number;
  readonly repMin: number;
  readonly repMax: number;
  readonly maxIncreasePct: number;
  readonly compound: boolean;
  readonly plannedSets: number | null;
  readonly primaryMuscles: readonly string[];
  readonly secondaryMuscles: readonly string[];
  readonly restMinSec: number;
  readonly restMaxSec: number;
  readonly thumb: string | null;
}

/** 某个动作上一次练的记录，用于记录页的「上次同组对照」 */
export interface LastSets {
  readonly date: string;
  readonly sets: readonly LoggedSet[];
}

/** 第一道放行要看的数：每组从点「完成本组」到保存用了多久 */
export interface SetTiming {
  readonly exerciseId: string;
  readonly setNo: number;
  readonly logMs: number;
  readonly closedBy: string;
  /** 用户有没有改过预填值 */
  readonly changedPrefill: boolean;
}

/** 已经结束的训练，用来灌演示数据或测试 */
export interface HistorySession {
  readonly id: string;
  readonly planId: string | null;
  readonly date: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly sets: readonly LoggedSet[];
}

export interface Store {
  /** 建表、补齐动作库；重复调用安全 */
  init(): Promise<void>;

  listExercises(): Promise<ExerciseRow[]>;

  // 一次训练 -------------------------------------------------------------
  startSession(session: ActiveSession): Promise<void>;
  setCurrentExercise(sessionId: string, exerciseId: string): Promise<void>;
  saveExerciseState(sessionId: string, exercise: ActiveExercise): Promise<void>;
  endSession(sessionId: string, endedAt: number): Promise<void>;
  /** 还没结束的那次训练；没有就是 null */
  loadActiveSession(): Promise<RestoreInput | null>;

  // 待保存的组（点了完成本组、面板还开着） -------------------------------
  savePending(sessionId: string, pending: PendingSet): Promise<void>;
  clearPending(sessionId: string): Promise<void>;

  // 记录组 ---------------------------------------------------------------
  insertSet(sessionId: string, set: LoggedSet): Promise<void>;
  /** 撤销不物理删除，只打标记，方便回溯 */
  markSetUndone(setId: string): Promise<void>;

  // 建议 -----------------------------------------------------------------
  insertSuggestion(sessionId: string, suggestion: ShownSuggestion): Promise<void>;
  decideSuggestion(id: string, decision: SuggestionDecision, decidedAt: number): Promise<void>;

  // 历史 -----------------------------------------------------------------
  /** 这个动作上一次是哪天练的（不含 exceptSessionId 那次），给 adjustForLayoff 用 */
  lastSessionDate(exerciseId: string, exceptSessionId: string | null): Promise<string | null>;
  /** 这个动作上一次的全部组 */
  lastSets(exerciseId: string, exceptSessionId: string | null): Promise<LastSets | null>;

  // 调试与测试 -----------------------------------------------------------
  setTimings(sessionId: string): Promise<SetTiming[]>;
  importHistory(sessions: readonly HistorySession[]): Promise<void>;
  /** 有没有任何训练记录，用来决定要不要灌演示数据 */
  hasAnySession(): Promise<boolean>;
}
