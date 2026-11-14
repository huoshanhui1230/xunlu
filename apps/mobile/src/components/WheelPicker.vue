<script setup lang="ts">
/**
 * 三列滚轮（设计稿 MF04 的「Three-column native wheel」）。
 *
 * 用 uni-app 的 picker-view。注意它在 App 的 vue 页面里不是系统原生控件，
 * 而是 webview 里用 JS 模拟的滚轮，手感要在真机上确认。
 *
 * modelValue 只在打开面板（或选项换了一批）时定一次位置，滚动时不回写：
 * App 端事件要在视图层和逻辑层之间跑一个来回，边滚边回写的话，
 * 回来的旧值可能把用户正在滚的另一列拽回去。
 *
 * 选中带的底色是垫在滚轮后面的 .band（indicator 画在文字上面，给了底色会盖住数字）；
 * 上下渐隐用一层覆盖的渐变做，跟着 --color-sheet 走，深色模式下不会出现一层白雾。
 */
import { getCurrentInstance } from 'vue';
import type { WheelColumn } from './wheel';

const props = defineProps<{ columns: readonly WheelColumn[]; modelValue: number[] }>();

const emit = defineEmits<{
  (e: 'update:modelValue', indexes: number[]): void;
  /** 点了选中带上的数字（点别的行 uni 会把滚轮滚过去，不走这里） */
  (e: 'tap-selected', key: string): void;
}>();

/**
 * 选中带的底色由下面那层 .band 画，这里不给：picker-view 的 indicator 画在文字上面，
 * 给了底色就把选中的数字盖住了。默认的上下两条线也不要。
 */
const INDICATOR_STYLE = 'height: 34px; background-color: transparent;';
const INDICATOR_CLASS = 'wheel-indicator';
const MASK_STYLE = 'background-image: none; background-color: transparent;';
const BAND_HALF_HEIGHT = 17;

const instance = getCurrentInstance();

function onChange(event: { detail: { value: number[] } }): void {
  emit('update:modelValue', event.detail.value);
}

function onTap(event: MouseEvent): void {
  // uni 把点击位置放在 detail 里（视口坐标）
  const { x, y } = event.detail as unknown as { x: number; y: number };
  uni
    .createSelectorQuery()
    .in(instance?.proxy)
    .select('.picker-wrap')
    .boundingClientRect((rect) => {
      const box = rect as UniApp.NodeInfo | null;
      if (!box || box.top === undefined || box.left === undefined || !box.height || !box.width) return;
      if (Math.abs(y - (box.top + box.height / 2)) > BAND_HALF_HEIGHT) return;
      const column = props.columns[Math.floor(((x - box.left) / box.width) * props.columns.length)];
      if (column !== undefined) emit('tap-selected', column.key);
    })
    .exec();
}
</script>

<template>
  <view class="wheel">
    <view class="labels">
      <view v-for="column in columns" :key="column.key" class="label-cell">
        <text class="label muted">{{ column.label }}</text>
      </view>
    </view>

    <view class="picker-wrap" @click="onTap">
      <view class="band" />
      <picker-view
        class="picker"
        :value="modelValue"
        :indicator-style="INDICATOR_STYLE"
        :indicator-class="INDICATOR_CLASS"
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

<style>
/* picker-view 默认在选中行上下各画一条线，设计稿只有底色带。indicator 不在 scoped 范围里 */
.wheel-indicator::before,
.wheel-indicator::after {
  display: none;
}
</style>
