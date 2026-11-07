<script setup lang="ts">
/**
 * 保存后 5 秒的撤销条。
 *
 * 设计稿的主线上没有这个元素 —— 第 11 页旁注写着「撤销时限与自动消失不做原型」。
 * 样式借「本组已保存」卡（102:3135）。它浮在主按钮上方，不占内容的位置：
 * 放进内容流的话，提示卡会被顶下去，5 秒后又跳回来，正好是用户要点「应用」的时候。
 */
defineProps<{ title: string; seconds: number }>();

const emit = defineEmits<{ (e: 'undo'): void }>();
</script>

<template>
  <view class="saved">
    <text class="saved-title">{{ title }}</text>
    <text class="saved-undo" @click="emit('undo')">{{ $t('saved.undo') }} {{ seconds }}</text>
  </view>
</template>

<style scoped>
.saved {
  position: absolute;
  left: var(--space-20);
  right: var(--space-20);
  bottom: calc(100% + var(--space-8));
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-12);
  border-radius: var(--radius-16);
  background-color: var(--color-soft);
}

.saved-title {
  color: var(--color-accent);
  font-size: var(--font-15);
  font-weight: var(--weight-medium);
  line-height: 21px;
}

.saved-undo {
  color: var(--color-accent);
  font-size: var(--font-15);
  font-weight: var(--weight-medium);
  line-height: 21px;
  font-variant-numeric: tabular-nums;
  padding: 12px;
  margin: -12px;
}
</style>
