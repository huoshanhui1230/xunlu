<script setup lang="ts">
/**
 * 「已保存 · 第 N 组」卡（设计稿 102:3135）。
 *
 * 设计稿这张卡上没有撤销入口 —— 第 11 页的旁注写着「撤销时限与自动消失不做原型」。
 * CLAUDE.md 要求保存后 5 秒内可撤销，所以在同一张卡上加了一个「撤销」，并显示剩余秒数。
 * 5 秒一过卡片自己消失，回到设计稿上 MF05 的样子。
 */
defineProps<{ title: string; summary: string; seconds: number }>();

const emit = defineEmits<{ (e: 'undo'): void }>();
</script>

<template>
  <view class="saved">
    <view class="row-between">
      <text class="saved-title">{{ title }}</text>
      <text class="saved-undo" @click="emit('undo')">
        {{ $t('saved.undo') }} {{ seconds }}
      </text>
    </view>
    <text class="saved-summary muted">{{ summary }}</text>
  </view>
</template>

<style scoped>
.saved {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  padding: var(--space-12);
  border-radius: var(--radius-20);
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
  font-size: var(--font-13);
  font-weight: var(--weight-medium);
  line-height: 19px;
  padding: 10px 8px;
  margin: -10px -8px;
}

.saved-summary {
  font-size: var(--font-12);
  line-height: 17px;
}
</style>
