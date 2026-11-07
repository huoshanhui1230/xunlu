<script setup lang="ts">
/**
 * MF04 反馈面板（设计稿第 11 页 84:1148 / 84:14317），第 1 组的样子看 BR05（102:2807）。
 *
 * 三个滚轮：重量、次数、还能再做几次。数值已经预填好，不动也能直接确认。
 * 点确认、关闭面板都按当前值保存，不丢组 —— 面板本身不判断，
 * 只把当前值报上去，由页面决定 closedBy 记成哪一种。
 *
 * RIR 这一列：每个动作第 1 组不预填，所以多一行「—」表示还没填；
 * 设置里关掉「RIR 显示」时整列不出现。点选中带上的重量数字可以键盘输入。
 */
import { computed, ref, watch } from 'vue';
import { optionIndex, type WheelValues } from '@xunlu/session';
import AppButton from './AppButton.vue';
import AppIcon from './AppIcon.vue';
import WheelPicker from './WheelPicker.vue';
import type { WheelColumn } from './wheel';
import { t } from '@/locale';
import { trimNumber } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    setNo: number;
    exerciseName: string;
    /** 含杆总重、单只重量 */
    loadLabel: string;
    /** 重量 / kg、单只 / kg */
    weightColumnLabel: string;
    values: WheelValues;
    weightOptions: number[];
    repOptions: number[];
    rirOptions: number[];
    rirEnabled?: boolean;
  }>(),
  { rirEnabled: true },
);

const emit = defineEmits<{
  (e: 'update:values', values: WheelValues): void;
  (e: 'confirm'): void;
  (e: 'close'): void;
  (e: 'note'): void;
  (e: 'type-weight'): void;
}>();

/** 第一行是「还没填」，后面才是 0、1、2… */
const rirValues = computed<(number | null)[]>(() => [null, ...props.rirOptions]);

const columns = computed<WheelColumn[]>(() => {
  const list: WheelColumn[] = [
    { key: 'weight', label: props.weightColumnLabel, options: props.weightOptions.map(trimNumber) },
    { key: 'reps', label: t('feedback.columnReps'), options: props.repOptions.map(String) },
  ];
  if (props.rirEnabled) {
    list.push({
      key: 'rir',
      label: t('feedback.columnRir'),
      options: rirValues.value.map((v) => (v === null ? t('feedback.rirEmpty') : String(v))),
    });
  }
  return list;
});

function wheelIndexes(): number[] {
  const list = [
    optionIndex(props.weightOptions, props.values.weight),
    optionIndex(props.repOptions, props.values.reps),
  ];
  if (props.rirEnabled) {
    list.push(props.values.rir === null ? 0 : 1 + optionIndex(props.rirOptions, props.values.rir));
  }
  return list;
}

/** 面板打开时定一次；键盘输入重量后选项换了一批，再定一次。滚动时不回写，见 WheelPicker */
const indexes = ref(wheelIndexes());
watch(
  () => props.weightOptions,
  () => {
    indexes.value = wheelIndexes();
  },
);

const rirMissing = computed(() => props.rirEnabled && props.values.rir === null);

const footnote = computed(() => {
  if (!props.rirEnabled) return props.loadLabel;
  return props.values.rir === null
    ? t('feedback.footnoteNoRir', { load: props.loadLabel, setNo: props.setNo })
    : t('feedback.footnote', { load: props.loadLabel, rir: props.values.rir });
});

function onWheel(next: number[]): void {
  emit('update:values', {
    weight: props.weightOptions[next[0] ?? 0] ?? props.values.weight,
    reps: props.repOptions[next[1] ?? 0] ?? props.values.reps,
    rir: props.rirEnabled ? (rirValues.value[next[2] ?? 0] ?? null) : null,
  });
}

function onTapSelected(key: string): void {
  if (key === 'weight') emit('type-weight');
}
</script>

<template>
  <view class="sheet-body">
    <view class="row-between">
      <text class="title">{{ $t('feedback.title', { setNo }) }}</text>
      <view class="close" @click="emit('close')">
        <AppIcon name="close" :size="14" />
      </view>
    </view>

    <text class="exercise muted">{{ exerciseName }}</text>

    <WheelPicker
      :columns="columns"
      :model-value="indexes"
      @update:model-value="onWheel"
      @tap-selected="onTapSelected"
    />

    <text class="footnote muted">{{ footnote }}</text>

    <view class="row-between">
      <text class="note-action accent" @click="emit('note')">{{ $t('feedback.addNote') }}</text>
      <text class="note-hint muted">
        {{ rirMissing ? $t('feedback.prefilledNoRir') : $t('feedback.prefilled') }}
      </text>
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
  padding: var(--space-12) var(--space-20) calc(max(var(--safe-bottom), var(--space-8)) + var(--space-12));
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
}
</style>
