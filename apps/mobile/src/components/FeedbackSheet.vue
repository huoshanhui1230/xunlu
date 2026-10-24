<script setup lang="ts">
/**
 * MF04 反馈面板（设计稿第 11 页 84:1148 / 84:14317）。
 *
 * 只有三个滚轮：重量、次数、还能再做几次。数值已经预填好，不动也能直接确认。
 * 点确认、点关闭、再点一次「完成本组」都按当前值保存，不丢组 —— 面板本身不判断，
 * 只负责把当前值报上去，由页面决定 closedBy 记成哪一种。
 */
import { computed } from 'vue';
import { optionIndex, type WheelValues } from '@xunlu/session';
import AppButton from './AppButton.vue';
import WheelPicker from './WheelPicker.vue';
import type { WheelColumn } from './wheel';
import { t } from '@/locale';
import { trimNumber, type Unit } from '@/utils/format';

const props = defineProps<{
  setNo: number;
  exerciseName: string;
  loadTypeLabel: string;
  unit: Unit;
  values: WheelValues;
  weightOptions: number[];
  repOptions: number[];
  rirOptions: number[];
}>();

const emit = defineEmits<{
  (e: 'update:values', values: WheelValues): void;
  (e: 'confirm'): void;
  (e: 'note'): void;
}>();

const columns = computed<WheelColumn[]>(() => [
  {
    key: 'weight',
    label: t('feedback.columnWeight', { unit: t(`unit.${props.unit}`) }),
    options: props.weightOptions.map(trimNumber),
  },
  { key: 'reps', label: t('feedback.columnReps'), options: props.repOptions.map(String) },
  { key: 'rir', label: t('feedback.columnRir'), options: props.rirOptions.map(String) },
]);

const indexes = computed<number[]>(() => [
  optionIndex(props.weightOptions, props.values.weight),
  optionIndex(props.repOptions, props.values.reps),
  optionIndex(props.rirOptions, props.values.rir),
]);

const footnote = computed(() =>
  props.values.rir === null
    ? t('feedback.footnoteNoRir', { loadType: props.loadTypeLabel })
    : t('feedback.footnote', { loadType: props.loadTypeLabel, rir: props.values.rir }),
);

function onWheel(next: number[]): void {
  emit('update:values', {
    weight: props.weightOptions[next[0] ?? 0] ?? props.values.weight,
    reps: props.repOptions[next[1] ?? 0] ?? props.values.reps,
    rir: props.rirOptions[next[2] ?? 0] ?? props.values.rir,
  });
}
</script>

<template>
  <view class="sheet-body safe-bottom">
    <view class="row-between">
      <text class="title">{{ $t('feedback.title', { setNo }) }}</text>
      <view class="close" @click="emit('confirm')">
        <text class="close-mark">✕</text>
      </view>
    </view>

    <text class="exercise muted">{{ exerciseName }}</text>

    <WheelPicker :columns="columns" :model-value="indexes" @update:model-value="onWheel" />

    <text class="footnote muted">{{ footnote }}</text>

    <view class="row-between">
      <text class="note-action accent" @click="emit('note')">{{ $t('feedback.addNote') }}</text>
      <text class="note-hint muted">{{ $t('feedback.prefilled') }}</text>
    </view>

    <AppButton :label="$t('feedback.confirm')" @tap="emit('confirm')" />
    <text class="close-note muted">{{ $t('feedback.closeSaves') }}</text>
  </view>
</template>

<style scoped>
.sheet-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
  padding: var(--space-12) var(--space-20) 0;
}

.title {
  font-size: var(--font-22);
  font-weight: var(--weight-medium);
  line-height: 31px;
}

.close {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-999);
  background-color: var(--color-inactive);
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-mark {
  font-size: var(--font-13);
  line-height: 1;
  color: var(--color-muted);
}

.exercise {
  font-size: var(--font-15);
  line-height: 21px;
}

.footnote {
  font-size: var(--font-13);
  line-height: 19px;
}

.note-action {
  font-size: var(--font-13);
  line-height: 19px;
  padding: 8px 4px;
  margin: -8px -4px;
}

.note-hint {
  font-size: var(--font-11);
  line-height: 16px;
}

.close-note {
  font-size: var(--font-11);
  line-height: 16px;
  padding-bottom: var(--space-8);
}

</style>
