<script setup lang="ts">
/**
 * MF02 开始训练弹层（设计稿第 11 页 84:895 / 84:14099）。
 *
 * 首页这一版不做，所以弹层背后只放训练日那张卡 —— 本周日历、上次推日和标签栏都没有。
 * 「开始记录」才建训练：先给每个动作过一遍 adjustForLayoff（很久没练的先减重），
 * 再把这次的目标写进库，然后跳到记录页。
 */
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { adjustForLayoff, daysBetween, type LayoffResult } from '@xunlu/engine';
import { startSession, type ActiveExercise } from '@xunlu/session';
import AppButton from '@/components/AppButton.vue';
import SheetLayer from '@/components/SheetLayer.vue';
import { PUSH_DAY, PUSH_DAY_ID, PUSH_DAY_SETS } from '@/data/push-day';
import { t } from '@/locale';
import { applyEvents, openStore, type Store } from '@/storage';
import { todayLocal } from '@/utils/date';
import { createId } from '@/utils/id';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type DayOption = {
  readonly id: string;
  readonly nameKey: string;
  readonly ready: boolean;
};

const DAY_OPTIONS: readonly DayOption[] = [
  { id: PUSH_DAY_ID, nameKey: 'plan.push', ready: true },
  { id: 'pull', nameKey: 'plan.pull', ready: false },
  { id: 'legs', nameKey: 'plan.legs', ready: false },
  { id: 'free', nameKey: 'plan.free', ready: false },
];

const sheetVisible = ref(true);
const selected = ref(PUSH_DAY_ID);
const daysSinceLast = ref<number | null>(null);
const today = ref(todayLocal());
const starting = ref(false);

let store: Store | null = null;

onLoad(async () => {
  store = await openStore();
  today.value = todayLocal();

  daysSinceLast.value = await computeDaysSinceLast(store, today.value);

  // App 被系统关掉后重开：上次的训练还没结束就先问一句
  const active = await store.loadActiveSession();
  if (active !== null) {
    sheetVisible.value = false;
    askResume(active.id);
  }
});

/** 继续上次训练，或者就地结束它 */
function askResume(sessionId: string): void {
  uni.showModal({
    title: t('resume.title'),
    content: t('resume.body'),
    confirmText: t('resume.confirm'),
    cancelText: t('resume.discard'),
    success: async (res) => {
      if (res.confirm) {
        uni.redirectTo({ url: '/pages/workout/index' });
        return;
      }
      if (store === null) return;
      await store.endSession(sessionId, Date.now());
      sheetVisible.value = true;
      daysSinceLast.value = await computeDaysSinceLast(store, todayLocal());
    },
  });
}

/** 推日里任何一个动作最近练过的那天，距今多少天 */
async function computeDaysSinceLast(db: Store, date: string): Promise<number | null> {
  const dates = await Promise.all(PUSH_DAY.map((meta) => db.lastSessionDate(meta.config.id, null)));
  const latest = dates.filter((d): d is string => d !== null).sort().pop();
  return latest === undefined ? null : daysBetween(latest, date);
}

function dateLine(): string {
  const d = new Date();
  return t('format.dateLine', {
    month: d.getMonth() + 1,
    day: d.getDate(),
    weekday: t(`weekday.${WEEKDAY_KEYS[d.getDay()] ?? 'sun'}`),
  });
}

function optionSubtitle(option: DayOption): string {
  if (!option.ready) return t('start.notReady');
  if (daysSinceLast.value === null) {
    return t('start.recommendedFirst', { exercises: PUSH_DAY.length, sets: PUSH_DAY_SETS });
  }
  return t('start.recommended', {
    days: daysSinceLast.value,
    exercises: PUSH_DAY.length,
    sets: PUSH_DAY_SETS,
  });
}

function choose(option: DayOption): void {
  if (option.ready) selected.value = option.id;
}

type Plan = { readonly position: number; readonly exerciseId: string; readonly layoff: LayoffResult };

/** 本次每个动作的目标：先用写死的起始目标，再让引擎按距上次训练的天数给减重建议 */
async function buildPlans(db: Store, date: string): Promise<Plan[]> {
  const plans: Plan[] = [];
  for (const [position, meta] of PUSH_DAY.entries()) {
    const lastDate = await db.lastSessionDate(meta.config.id, null);
    const layoff: LayoffResult =
      lastDate === null
        ? { target: meta.startTarget, previous: meta.startTarget, adjusted: false, gapDays: 0, cut: 0 }
        : adjustForLayoff({
            exercise: meta.config,
            target: meta.startTarget,
            lastSessionDate: lastDate,
            today: date,
          });
    plans.push({ position, exerciseId: meta.config.id, layoff });
  }
  return plans;
}

/**
 * 很久没练：引擎只给建议，减不减由用户定（规则 2.0.0 的 notice: 'reduce_or_retest'）。
 * 第 11 页没画这一屏，先用系统弹窗加词典文案。
 */
function askReduce(plans: readonly Plan[]): Promise<boolean> {
  const days = Math.max(...plans.map((p) => p.layoff.gapDays));
  return new Promise((resolve) => {
    uni.showModal({
      title: t('layoff.title', { count: plans.length }),
      content: t('layoff.body', { days }),
      confirmText: t('layoff.reduce'),
      cancelText: t('layoff.retest'),
      success: (res) => resolve(res.confirm),
      fail: () => resolve(true),
    });
  });
}

async function begin(): Promise<void> {
  if (store === null || starting.value) return;
  starting.value = true;
  try {
    const date = todayLocal();
    const plans = await buildPlans(store, date);
    const needAsk = plans.filter((p) => p.layoff.notice === 'reduce_or_retest');
    const reduce = needAsk.length === 0 ? true : await askReduce(needAsk);

    const exercises: ActiveExercise[] = plans.map((p) => ({
      exerciseId: p.exerciseId,
      position: p.position,
      target: reduce ? p.layoff.target : p.layoff.previous,
      hint: null,
    }));

    const { session, events } = startSession({
      id: createId('session'),
      planId: PUSH_DAY_ID,
      date,
      startedAt: Date.now(),
      exercises,
    });
    await applyEvents(store, session.id, events);
    uni.redirectTo({ url: '/pages/workout/index' });
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <view class="page">
    <!-- 弹层背后：首页这一版不做，只保留训练日这张卡 -->
    <view class="backdrop safe-top">
      <text class="date muted">{{ dateLine() }}</text>
      <text class="title">{{ $t('home.title') }}</text>

      <view class="card">
        <text class="card-label muted">{{ $t('home.nextDay') }}</text>
        <view class="col">
          <text class="day-name">{{ $t('plan.push') }}</text>
          <text class="day-sub muted">{{ $t('plan.pushSubtitle') }}</text>
        </view>
        <view class="stats">
          <view class="stat">
            <text class="stat-value num">{{ PUSH_DAY.length }}</text>
            <text class="stat-label muted">{{ $t('home.exercises') }}</text>
          </view>
          <view class="stat">
            <text class="stat-value num">{{ PUSH_DAY_SETS }}</text>
            <text class="stat-label muted">{{ $t('home.plannedSets') }}</text>
          </view>
          <view class="stat">
            <text class="stat-value num">
              {{ daysSinceLast === null ? $t('home.firstTime') : $t('format.days', { days: daysSinceLast }) }}
            </text>
            <text class="stat-label muted">{{ $t('home.sinceLast') }}</text>
          </view>
        </view>
        <AppButton :label="$t('home.start')" @tap="sheetVisible = true" />
      </view>

      <text class="local-only muted">{{ $t('home.localOnly') }}</text>
    </view>

    <!-- MF02 开始训练 -->
    <SheetLayer :visible="sheetVisible" @close="sheetVisible = false">
      <view class="sheet-head">
        <text class="sheet-title">{{ $t('start.title') }}</text>
        <text class="sheet-sub muted">{{ $t('start.subtitle') }}</text>
      </view>

      <scroll-view class="sheet-scroll" scroll-y>
        <view class="choice-list">
          <view v-for="(option, index) in DAY_OPTIONS" :key="option.id">
            <view v-if="index > 0" class="separator" />
            <view class="choice" :class="{ 'choice-off': !option.ready }" @click="choose(option)">
              <view class="choice-text">
                <text class="choice-name" :class="{ 'choice-name-on': selected === option.id }">
                  {{ $t(option.nameKey) }}
                </text>
                <text class="choice-sub muted">{{ optionSubtitle(option) }}</text>
              </view>
              <view class="radio" :class="{ 'radio-on': selected === option.id }">
                <text v-if="selected === option.id" class="radio-check">✓</text>
              </view>
            </view>
          </view>
        </view>
        <text class="sheet-note muted">{{ $t('start.note') }}</text>
      </scroll-view>

      <view class="sheet-actions safe-bottom">
        <!-- 安全提示固定出现，不随滚动走掉 -->
        <view class="warmup">
          <text class="warmup-title">{{ $t('safety.warmupTitle') }}</text>
          <text class="warmup-body">{{ $t('safety.warmupBody') }}</text>
        </view>
        <AppButton :label="$t('start.begin')" :disabled="starting" @tap="begin" />
        <AppButton :label="$t('start.cancel')" variant="secondary" @tap="sheetVisible = false" />
      </view>
    </SheetLayer>
  </view>
</template>

<style scoped>
.backdrop {
  display: flex;
  flex-direction: column;
  gap: var(--space-16);
  padding: var(--space-4) var(--space-20) var(--space-12);
}

.date {
  font-size: var(--font-13);
  line-height: 19px;
}

.title {
  font-size: var(--font-34);
  font-weight: var(--weight-medium);
  line-height: 48px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
  padding: var(--space-20);
  border-radius: var(--radius-24);
  background-color: var(--color-surface);
}

.card-label {
  font-size: var(--font-13);
  line-height: 19px;
}

.day-name {
  font-size: var(--font-34);
  font-weight: var(--weight-medium);
  line-height: 48px;
}

.day-sub {
  font-size: var(--font-13);
  line-height: 19px;
}

.stats {
  display: flex;
  justify-content: space-between;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1 1 0;
}

.stat-value {
  font-size: var(--font-28);
  font-weight: var(--weight-semibold);
  line-height: 31px;
}

.stat-label {
  font-size: var(--font-12);
  line-height: 17px;
}

.local-only {
  font-size: var(--font-11);
  line-height: 16px;
}

.sheet-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  padding: var(--space-12) var(--space-20) var(--space-20);
}

.sheet-title {
  font-size: var(--font-24);
  font-weight: var(--weight-medium);
  line-height: 34px;
}

.sheet-sub {
  font-size: var(--font-13);
  line-height: 19px;
}

.sheet-scroll {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 var(--space-20);
  box-sizing: border-box;
}

.choice-list {
  border-radius: var(--radius-20);
  background-color: var(--color-surface);
  overflow: hidden;
}

.choice {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  padding: var(--space-16);
}

.choice-off {
  opacity: 0.45;
}

.choice-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1 1 0;
}

.choice-name {
  font-size: var(--font-17);
  line-height: 24px;
}

.choice-name-on {
  color: var(--color-accent);
  font-weight: var(--weight-medium);
}

.choice-sub {
  font-size: var(--font-13);
  line-height: 19px;
}

.radio {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: var(--radius-999);
  background-color: var(--color-inactive);
  display: flex;
  align-items: center;
  justify-content: center;
}

.radio-on {
  background-color: var(--color-accent);
}

.radio-check {
  color: var(--color-on-accent);
  font-size: var(--font-13);
  line-height: 1;
}

.separator {
  height: 0.5px;
  margin-left: var(--space-16);
  background-color: var(--color-line);
}

.sheet-note {
  display: block;
  padding: var(--space-20) 0 var(--space-24);
  font-size: var(--font-13);
  line-height: 19px;
}

.sheet-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  padding: var(--space-8) var(--space-20) 0;
}

.warmup {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-12);
  border-radius: var(--radius-16);
  background-color: var(--color-warning-soft);
}

.warmup-title {
  color: var(--color-warning);
  font-size: var(--font-15);
  font-weight: var(--weight-medium);
  line-height: 21px;
}

.warmup-body {
  color: var(--color-ink);
  font-size: var(--font-13);
  line-height: 19px;
}
</style>
