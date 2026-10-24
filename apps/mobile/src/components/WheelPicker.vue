<script setup lang="ts">
/**
 * 三列滚轮（设计稿 MF04 的「Three-column native wheel」）。
 *
 * 用 uni-app 原生的 picker-view：App 端就是系统滚轮的手感，H5 下也能拖。
 * 选中带是 picker-view 自己的 indicator，上下渐隐用一层覆盖的渐变做，
 * 这样深色模式下也跟着 --color-sheet 走，不会出现一层白雾。
 */
import type { WheelColumn } from './wheel';

defineProps<{ columns: readonly WheelColumn[]; modelValue: number[] }>();

const emit = defineEmits<{ (e: 'update:modelValue', indexes: number[]): void }>();

/**
 * 选中带只定高度，不给底色 —— picker-view 的 indicator 画在文字上面，
 * 给了底色就把选中的那个数字盖住了。底色由下面那层 .band 画，垫在滚轮后面。
 */
const INDICATOR_STYLE = 'height: 34px; background-color: transparent; border: none;';
const MASK_STYLE = 'background-image: none; background-color: transparent;';

function onChange(event: { detail: { value: number[] } }): void {
  emit('update:modelValue', event.detail.value);
}
</script>

<template>
  <view class="wheel">
    <view class="labels">
      <view v-for="column in columns" :key="column.key" class="label-cell">
        <text class="label muted">{{ column.label }}</text>
      </view>
    </view>

    <view class="picker-wrap">
      <view class="band" />
      <picker-view
        class="picker"
        :value="modelValue"
        :indicator-style="INDICATOR_STYLE"
        :mask-style="MASK_STYLE"
        @change="onChange"
      >
        <picker-view-column v-for="column in columns" :key="column.key">
          <view v-for="option in column.options" :key="option" class="option">
            <text class="option-text num">{{ option }}</text>
          </view>
        </picker-view-column>
      </picker-view>
      <view class="fade fade-top" />
      <view class="fade fade-bottom" />
    </view>
  </view>
</template>

<style scoped>
.wheel {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

.labels {
  display: flex;
}

.label-cell {
  flex: 1 1 0;
  display: flex;
  justify-content: center;
}

.label {
  font-size: var(--font-13);
  line-height: 19px;
}

.picker-wrap {
  position: relative;
  height: 160px;
}

/* 选中带：垫在滚轮后面，这样选中的数字还在最上层 */
.band {
  position: absolute;
  left: 0;
  right: 0;
  top: 63px;
  height: 34px;
  border-radius: var(--radius-8);
  background-color: var(--color-inactive);
}

.picker {
  position: relative;
  height: 160px;
  width: 100%;
  background-color: transparent;
}

.option {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 34px;
}

.option-text {
  font-size: var(--font-24);
  line-height: 27px;
  color: var(--color-ink);
}

/* 上下渐隐：跟着弹层底色走，深色模式下不会变成白雾 */
.fade {
  position: absolute;
  left: 0;
  right: 0;
  height: 56px;
  pointer-events: none;
}

.fade-top {
  top: 0;
  background-image: linear-gradient(to bottom, var(--color-sheet), transparent);
}

.fade-bottom {
  bottom: 0;
  background-image: linear-gradient(to top, var(--color-sheet), transparent);
}
</style>
