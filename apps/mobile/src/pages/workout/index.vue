<script setup lang="ts">
/**
 * 记录页：MF03（84:1056）、MF04 反馈面板（84:1148）、MF05 下一组提示（84:14472）、
 * MF05a 已应用（102:3475）都是这一页的不同状态。
 *
 * 一条主线：点「完成本组」→ 三个滚轮确认 → 保存 → 看到下一组提示。
 * 计时只存时间戳，界面每秒从时间戳重算；加重减重一律问引擎，这里不算。
 */
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { setVolume, type SetHint } from '@xunlu/engine';
import {
  applyHint,
  beginSet,
  elapsedSince,
  endSession,
  formatElapsed,
  hintForSet,
  inRestRange,
  nextSetNo,
  prefillFor,
  recordHintShown,
  repOptions,
  restoreSession,
  rirOptions,
  saveSet,
  setsOf,
  switchExercise,
  undoLastSet,
  undoRemainingSeconds,
  weightOptions,
  type ActiveSession,
  type LoggedSet,
  type SaveTrigger,
  type WheelValues,
} from '@xunlu/session';
import AppButton from '@/components/AppButton.vue';
import FeedbackSheet from '@/components/FeedbackSheet.vue';
import NextSetHint from '@/components/NextSetHint.vue';
import SavedCard from '@/components/SavedCard.vue';
import SheetLayer from '@/components/SheetLayer.vue';
import { PUSH_DAY, metaOf } from '@/data/push-day';
import { t } from '@/locale';
import { applyEvents, openStore, type LastSets, type Store } from '@/storage';
import { keepScreenOn, tapFeedback } from '@/services/device';
import { nowTick, releaseTicker, startTicker, useNow } from '@/services/ticker';
import {
  formatMonthDay,
  formatRestRange,
  formatRir,
  formatSeconds,
  formatSet,
  formatVolume,
  formatWeight,
  trimNumber,
  type Unit,
} from '@/utils/format';
import { hintCopy } from '@/utils/hint-text';
import { createId } from '@/utils/id';

const now = useNow();
const session = ref<ActiveSession | null>(null);
const lastSetsByExercise = ref<Record<string, LastSets | null>>({});

/** 面板开着时的滚轮当前值与选项；选项在面板打开那一刻定好，中途不变 */
const sheetOpen = ref(false);
const wheelValues = ref<WheelValues>({ weight: 0, reps: 0, rir: null });
const wheelWeights = ref<number[]>([]);
const wheelReps = ref<number[]>(repOptions());
const wheelRirs = ref<number[]>(rirOptions());
const pendingNote = ref<string | null>(null);

/** 下一组提示：持久化的只有决定，卡片内容每次由引擎现算 */
const hintView = ref<SetHint | null>(null);
const hintFromSet = ref<LoggedSet | null>(null);
/** 刚保存的那一组，用来显示 5 秒撤销 */
const savedFlash = ref<LoggedSet | null>(null);

let store: Store | null = null;

// --- 读状态 ---------------------------------------------------------------

const unit = computed<Unit>(() => session.value?.unit ?? 'kg');
const current = computed(() =>
  session.value?.exercises.find((e) => e.exerciseId === session.value?.currentExerciseId),
);
const meta = computed(() => (current.value === undefined ? undefined : metaOf(current.value.exerciseId)));
const doneSets = computed<LoggedSet[]>(() =>
  session.value === null || current.value === undefined ? [] : setsOf(session.value, current.value.exerciseId),
);
const upcomingSetNo = computed(() =>
  session.value === null || current.value === undefined ? 1 : nextSetNo(session.value, current.value.exerciseId),
);
const exerciseIndex = computed(() =>
  current.value === undefined ? 1 : PUSH_DAY.findIndex((m) => m.config.id === current.value?.exerciseId) + 1,
);
const lastSameSet = computed(() => {
  if (current.value === undefined) return null;
  const history = lastSetsByExercise.value[current.value.exerciseId];
  if (history === null || history === undefined) return null;
  const match = history.sets.find((s) => s.setNo === upcomingSetNo.value) ?? history.sets[history.sets.length - 1];
  return match === undefined ? null : { date: history.date, set: match };
});

const totalElapsed = computed(() =>
  session.value === null ? 0 : formatElapsed(elapsedSince(session.value.startedAt, now.value)),
);
/** 距上一组：切换动作后计时继续，所以看的是全场最后保存的那一组 */
const restSince = computed(() => {
  const sets = session.value?.sets ?? [];
  const last = sets.length > 0 ? sets[sets.length - 1] : undefined;
  return last?.savedAt ?? session.value?.startedAt ?? now.value;
});
const restMs = computed(() => elapsedSince(restSince.value, now.value));
const restReached = computed(() => (meta.value === undefined ? false : inRestRange(restMs.value, meta.value.rest)));

const undoSeconds = computed(() =>
  savedFlash.value === null ? 0 : undoRemainingSeconds(savedFlash.value.savedAt, now.value),
);
const hintApplied = computed(() => current.value?.hint?.applied === true);

const targetReps = computed(() => {
  const target = current.value?.target;
  if (target === undefined) return '';
  return target.repRange.min === target.repRange.max
    ? t('format.reps', { reps: target.repRange.max })
    : t('format.repsRange', { low: target.repRange.min, high: target.repRange.max });
});

const hintText = computed(() => {
  if (hintView.value === null || current.value === undefined || meta.value === undefined) return null;
  return hintCopy({
    hint: hintView.value,
    unit: unit.value,
    rir: hintFromSet.value?.rir ?? null,
    plannedSets: meta.value.startTarget.sets,
    doneSets: doneSets.value.length,
    applied: hintApplied.value,
  });
});

const savedSummary = computed(() => {
  if (savedFlash.value === null || session.value === null) return '';
  const own = setsOf(session.value, savedFlash.value.exerciseId).length;
  const volume = session.value.sets.reduce((sum, s) => {
    const config = metaOf(s.exerciseId)?.config;
    return config === undefined ? sum : sum + setVolume(config, { weight: s.weight, reps: s.reps, rir: s.rir });
  }, 0);
  return t('saved.summary', {
    exerciseSets: own,
    totalSets: session.value.sets.length,
    volume: formatVolume(volume, unit.value),
  });
});

// --- 生命周期 -------------------------------------------------------------

onLoad(async () => {
  store = await openStore();
  const restored = await store.loadActiveSession();
  if (restored === null) {
    uni.redirectTo({ url: '/pages/start/index' });
    return;
  }
  session.value = restoreSession(restored);
  await loadHistory();
  reopenPending();
  rebuildHint();
});

onShow(() => {
  nowTick();
  startTicker();
  keepScreenOn(true);
});

onHide(() => {
  releaseTicker();
  keepScreenOn(false);
});

onUnload(() => {
  releaseTicker();
  keepScreenOn(false);
});

/** 每个动作「上次同组」的对照数据 */
async function loadHistory(): Promise<void> {
  if (store === null || session.value === null) return;
  const sessionId = session.value.id;
  const entries = await Promise.all(
    PUSH_DAY.map(async (m) => [m.config.id, await store!.lastSets(m.config.id, sessionId)] as const),
  );
  lastSetsByExercise.value = Object.fromEntries(entries);
}

/** 被杀掉时面板还开着：重开后接着记这一组 */
function reopenPending(): void {
  const pending = session.value?.pending;
  if (pending === undefined || pending === null) return;
  openSheetWith(pending.prefill);
}

/** 恢复时把挂着的提示重新算一遍，内容和被杀掉之前一致 */
function rebuildHint(): void {
  const active = current.value;
  if (session.value === null || active === undefined || active.hint === null || meta.value === undefined) return;
  const source = doneSets.value.find((s) => s.setNo === active.hint?.fromSetNo);
  if (source === undefined) return;
  hintView.value = hintForSet({
    session: session.value,
    exercise: meta.value.config,
    set: source,
    settings: { conservative: false },
  });
  hintFromSet.value = source;
}

// --- 记一组 ---------------------------------------------------------------

function openSheetWith(values: WheelValues): void {
  wheelValues.value = values;
  wheelWeights.value = meta.value === undefined ? [values.weight] : weightOptions(meta.value.config, values.weight);
  wheelReps.value = repOptions();
  wheelRirs.value = rirOptions();
  sheetOpen.value = true;
}

/** 点「完成本组」：面板没开就开，开着就按当前值保存，不丢组 */
async function onDoneSet(): Promise<void> {
  if (session.value === null || store === null || meta.value === undefined) return;
  if (sheetOpen.value) {
    await save('done_again');
    return;
  }
  const { session: next, events } = beginSet(session.value, {
    exercise: meta.value.config,
    doneAt: Date.now(),
  });
  session.value = next;
  await applyEvents(store, next.id, events);
  tapFeedback();
  nowTick();
  if (next.pending !== null) openSheetWith(next.pending.prefill);
}

async function save(closedBy: SaveTrigger): Promise<void> {
  if (session.value === null || store === null || meta.value === undefined) return;
  const config = meta.value.config;
  const { session: next, events } = saveSet(session.value, {
    id: createId('set'),
    values: wheelValues.value,
    savedAt: Date.now(),
    closedBy,
    note: pendingNote.value,
  });
  if (events.length === 0) return;

  session.value = next;
  await applyEvents(store, next.id, events);
  sheetOpen.value = false;
  pendingNote.value = null;
  tapFeedback();
  nowTick();

  const saved = next.sets[next.sets.length - 1];
  if (saved === undefined) return;
  savedFlash.value = saved;
  logTiming(saved);

  // 下一组提示：内容全部由引擎决定
  const hint = hintForSet({ session: next, exercise: config, set: saved, settings: { conservative: false } });
  const shown = recordHintShown(next, {
    exerciseId: config.id,
    fromSet: saved,
    suggestionId: createId('sug'),
    ruleId: hint.ruleId,
    kind: hint.kind,
    weight: hint.weight,
    reps: hint.reps.low,
    ruleVersion: hint.ruleVersion,
    blockedBy: hint.increaseBlockedBy ?? null,
    payload: JSON.stringify(hint),
    createdAt: saved.savedAt,
  });
  session.value = shown.session;
  await applyEvents(store, shown.session.id, shown.events);
  hintView.value = hint;
  hintFromSet.value = saved;
}

/** 第一道放行要看的数：每组从点完成本组到保存用了多久 */
function logTiming(set: LoggedSet): void {
  const changed =
    set.weight !== set.prefill.weight || set.reps !== set.prefill.reps || set.rir !== set.prefill.rir;
  console.log(
    `[训录] ${set.exerciseId} 第 ${set.setNo} 组 ${t('format.logSeconds', {
      seconds: formatSeconds(set.logMs),
    })}（${set.closedBy}${changed ? '，改过预填' : '，直接确认'}）`,
  );
}

async function onApplyHint(): Promise<void> {
  if (session.value === null || store === null || current.value === undefined) return;
  const { session: next, events } = applyHint(session.value, current.value.exerciseId, Date.now());
  if (events.length === 0) return;
  session.value = next;
  await applyEvents(store, next.id, events);
}

async function onUndo(): Promise<void> {
  if (session.value === null || store === null) return;
  const { session: next, events } = undoLastSet(session.value, Date.now());
  if (events.length === 0) return;
  session.value = next;
  await applyEvents(store, next.id, events);
  savedFlash.value = null;
  hintView.value = null;
  hintFromSet.value = null;
  nowTick();
  uni.showToast({ title: t('saved.undone'), icon: 'none' });
}

// --- 其他操作 -------------------------------------------------------------

function onNote(): void {
  uni.showModal({
    title: t('feedback.addNote'),
    editable: true,
    placeholderText: '',
    success: (res) => {
      if (res.confirm) pendingNote.value = (res.content ?? '').trim() || null;
    },
  });
}

/**
 * 切换动作：BR01 的选择弹层这一版不做，先按计划顺序切到下一个动作。
 * 已练的组保留，计时继续。
 */
async function onSwitchExercise(): Promise<void> {
  if (session.value === null || store === null || current.value === undefined || sheetOpen.value) return;
  const nextPosition = (current.value.position + 1) % session.value.exercises.length;
  const target = session.value.exercises.find((e) => e.position === nextPosition);
  if (target === undefined) return;
  const { session: next, events } = switchExercise(session.value, target.exerciseId);
  session.value = next;
  await applyEvents(store, next.id, events);
  hintView.value = null;
  hintFromSet.value = null;
  savedFlash.value = null;
  rebuildHint();
  uni.showToast({ title: t(`exercise.${target.exerciseId}`), icon: 'none' });
}

function onEnd(): void {
  uni.showModal({
    title: t('workout.endTitle'),
    content: t('workout.endBody'),
    confirmText: t('workout.endConfirm'),
    cancelText: t('workout.endCancel'),
    success: async (res) => {
      if (!res.confirm || session.value === null || store === null) return;
      const { session: next, events } = endSession(session.value, Date.now());
      session.value = next;
      await applyEvents(store, next.id, events);
      uni.redirectTo({ url: '/pages/start/index' });
    },
  });
}

function notReady(): void {
  uni.showToast({ title: t('workout.notInThisRound'), icon: 'none' });
}
</script>

<template>
  <view v-if="session !== null && current !== undefined && meta !== undefined" class="page">
    <scroll-view class="main safe-top" scroll-y>
      <!-- 训练工具栏 -->
      <view class="row-between toolbar">
        <text class="toolbar-plan">{{ $t('plan.push') }}</text>
        <text class="toolbar-time muted num">{{ totalElapsed }}</text>
        <text class="toolbar-end accent" @click="onEnd">{{ $t('workout.end') }}</text>
      </view>

      <!-- 当前动作 -->
      <view class="row-between exercise">
        <view class="row exercise-left">
          <view class="thumb">
            <image class="thumb-img" src="/static/thumbs/placeholder.svg" mode="aspectFit" />
          </view>
          <view class="col">
            <text class="exercise-meta muted">
              {{
                $t('workout.exerciseMeta', {
                  index: exerciseIndex,
                  total: PUSH_DAY.length,
                  loadType: $t(`loadType.${meta.config.loadType}`),
                })
              }}
            </text>
            <text class="exercise-name">{{ $t(`exercise.${meta.config.id}`) }}</text>
          </view>
        </view>
        <text class="more muted" @click="notReady">···</text>
      </view>

      <!-- 本次目标 -->
      <view class="col target">
        <text class="target-label muted">{{ $t('workout.setTarget', { setNo: upcomingSetNo }) }}</text>
        <view class="target-line">
          <text class="target-weight num">{{ trimNumber(current.target.weight) }}</text>
          <text class="target-unit muted">{{ $t(`unit.${unit}`) }}</text>
          <text class="target-reps">× {{ targetReps }}</text>
        </view>
        <text class="target-rir muted">
          {{ $t('workout.targetRir', { rir: current.target.targetRir }) }}
        </text>
      </view>

      <!-- 上次同组对照：出提示卡时让位给提示 -->
      <view v-if="lastSameSet !== null && hintText === null" class="card compare">
        <text class="compare-label muted">
          {{
            $t('workout.lastSameSet', {
              date: formatMonthDay(lastSameSet.date),
              setNo: lastSameSet.set.setNo,
            })
          }}
        </text>
        <view class="row-between">
          <text class="compare-value num">{{ formatSet(lastSameSet.set.weight, lastSameSet.set.reps, unit) }}</text>
          <text class="compare-rir muted">{{ formatRir(lastSameSet.set.rir) }}</text>
        </view>
      </view>

      <!-- 间隔计时：正向走表，进入推荐区间变色，不倒计时也不催促 -->
      <view class="timer" :class="{ 'timer-compact': hintText !== null }">
        <text class="timer-label muted">{{ $t('workout.sinceLastSet') }}</text>
        <text class="timer-value num" :class="{ 'timer-in-range': restReached }">
          {{ formatElapsed(restMs) }}
        </text>
        <text class="timer-advice muted">
          {{ $t('workout.restAdvice', { range: formatRestRange(meta.rest.minSec, meta.rest.maxSec) }) }}
        </text>
        <text v-if="hintText === null" class="timer-note muted">{{ $t('workout.restNote') }}</text>
      </view>

      <!-- 已完成的组 -->
      <view class="col done">
        <view class="row-between">
          <text class="done-title">{{ $t('workout.doneSets', { count: doneSets.length }) }}</text>
          <text class="done-modify accent" @click="notReady">{{ $t('workout.modify') }}</text>
        </view>
        <view v-if="doneSets.length > 0" class="card set-list">
          <view v-for="(set, index) in doneSets" :key="set.id">
            <view v-if="index > 0" class="set-separator" />
            <view class="set-row">
              <text class="set-no muted num">{{ set.setNo }}</text>
              <text class="set-value num">{{ formatSet(set.weight, set.reps, unit) }}</text>
              <text class="set-rir muted">{{ formatRir(set.rir) }}</text>
            </view>
          </view>
        </view>
        <text v-else class="muted empty">{{ $t('workout.noSets') }}</text>
      </view>

      <!-- 保存后 5 秒可撤销 -->
      <SavedCard
        v-if="savedFlash !== null && undoSeconds > 0"
        :title="$t('saved.title', { setNo: savedFlash.setNo })"
        :summary="savedSummary"
        :seconds="undoSeconds"
        @undo="onUndo"
      />

      <!-- 下一组提示 -->
      <NextSetHint
        v-if="hintText !== null"
        :title="hintText.title"
        :sub="hintText.sub"
        :applied="hintApplied"
        @apply="onApplyHint"
      />

      <view class="tail" />
    </scroll-view>

    <!-- 固定记录操作：这一页只有一个主按钮 -->
    <view class="actions safe-bottom">
      <view class="switch" @click="onSwitchExercise">
        <text class="switch-icon">⇄</text>
        <text class="switch-label muted">{{ $t('workout.switchExercise') }}</text>
      </view>
      <view class="main-action">
        <AppButton :label="$t('workout.doneSet')" @tap="onDoneSet" />
      </view>
    </view>

    <!-- MF04 反馈面板：关闭也保存 -->
    <SheetLayer :visible="sheetOpen" :dim="0.28" @close="save('dismiss')">
      <FeedbackSheet
        :set-no="session.pending?.setNo ?? upcomingSetNo"
        :exercise-name="$t(`exercise.${meta.config.id}`)"
        :load-type-label="$t(`loadType.${meta.config.loadType}`)"
        :unit="unit"
        :values="wheelValues"
        :weight-options="wheelWeights"
        :rep-options="wheelReps"
        :rir-options="wheelRirs"
        @update:values="(v) => (wheelValues = v)"
        @confirm="save('confirm')"
        @note="onNote"
      />
    </SheetLayer>
  </view>
</template>

<style scoped>
.main {
  flex: 1 1 0;
  min-height: 0;
  padding: var(--space-4) var(--space-20) var(--space-12);
  box-sizing: border-box;
}

.toolbar {
  padding-bottom: var(--space-16);
}

.toolbar-plan {
  font-size: var(--font-15);
  font-weight: var(--weight-medium);
  line-height: 21px;
}

.toolbar-time {
  font-size: var(--font-15);
  line-height: 17px;
}

.toolbar-end {
  font-size: var(--font-15);
  line-height: 21px;
  padding: 12px 4px;
  margin: -12px -4px;
}

.exercise {
  padding-bottom: var(--space-16);
}

.exercise-left {
  gap: var(--space-12);
  flex: 1 1 0;
  min-width: 0;
}

.thumb {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: var(--radius-12);
  background-color: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted);
}

.thumb-img {
  width: 40px;
  height: 40px;
}

.exercise-meta {
  font-size: var(--font-11);
  line-height: 16px;
}

.exercise-name {
  font-size: var(--font-24);
  font-weight: var(--weight-medium);
  line-height: 34px;
}

.more {
  font-size: var(--font-22);
  line-height: 22px;
  padding: 12px 4px;
  margin: -12px -4px;
}

.target {
  gap: 2px;
  padding-bottom: var(--space-16);
}

.target-label {
  font-size: var(--font-11);
}

.target-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.target-weight {
  font-size: var(--font-32);
  line-height: 1.1;
}

.target-unit {
  font-size: var(--font-17);
}

.target-reps {
  font-size: var(--font-17);
}

.target-rir {
  font-size: var(--font-11);
}

.card {
  padding: var(--space-16);
  border-radius: var(--radius-24);
  background-color: var(--color-surface);
}

.compare {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-bottom: var(--space-16);
}

.compare-label {
  font-size: var(--font-12);
  line-height: 17px;
}

.compare-value {
  font-size: var(--font-17);
  line-height: 19px;
}

.compare-rir {
  font-size: var(--font-13);
  line-height: 19px;
}

.timer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-12) 0 36px;
}

.timer-compact {
  padding: var(--space-8) 0 var(--space-12);
}

.timer-label {
  font-size: var(--font-13);
}

.timer-value {
  font-size: var(--font-96);
  line-height: 1.1;
  color: var(--color-timer);
}

/* 进入推荐组间歇就变绿；不倒计时、不催促 */
.timer-in-range {
  color: var(--color-success);
}

.timer-advice {
  font-size: var(--font-13);
}

.timer-note {
  font-size: var(--font-11);
  line-height: 16px;
}

.done {
  gap: var(--space-8);
  padding-bottom: var(--space-16);
}

.done-title {
  font-size: var(--font-15);
  font-weight: var(--weight-medium);
  line-height: 21px;
}

.done-modify {
  font-size: var(--font-13);
  line-height: 19px;
  padding: 12px 4px;
  margin: -12px -4px;
}

.set-list {
  border-radius: var(--radius-20);
}

.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
  height: 40px;
}

.set-no {
  font-size: var(--font-15);
  line-height: 17px;
  min-width: 16px;
}

.set-value {
  font-size: var(--font-17);
  line-height: 19px;
}

.set-rir {
  font-size: var(--font-13);
  line-height: 19px;
}

.set-separator {
  height: 0.5px;
  background-color: var(--color-line);
}

.empty {
  font-size: var(--font-13);
  line-height: 19px;
}

.tail {
  height: var(--space-16);
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  padding: var(--space-8) var(--space-20) 0;
}

.switch {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: var(--radius-999);
  background-color: var(--color-inactive);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.switch-icon {
  font-size: var(--font-17);
  line-height: 20px;
  color: var(--color-muted);
}

.switch-label {
  font-size: var(--font-11);
  line-height: 14px;
}

.main-action {
  flex: 1 1 0;
}
</style>
