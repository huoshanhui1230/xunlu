<script setup lang="ts">
/**
 * 下一组提示卡（MF05 84:14572，应用后是 MF05a 102:3475）。
 *
 * 内容全部来自引擎的 suggestNextSet —— 这张卡只负责显示，点「应用」也只改下一组的预填，
 * 已经保存的组一个都不动。
 */
import AppButton from './AppButton.vue';

defineProps<{ title: string; sub: string; applied: boolean }>();

const emit = defineEmits<{ (e: 'apply'): void }>();
</script>

<template>
  <view class="hint">
    <text class="hint-title">{{ title }}</text>
    <text class="hint-sub muted">{{ sub }}</text>
    <AppButton
      :label="applied ? $t('hint.applied') : $t('hint.apply')"
      :variant="applied ? 'secondary' : 'primary'"
      :disabled="applied"
      @tap="emit('apply')"
    />
  </view>
</template>

<style scoped>
.hint {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  padding: var(--space-12);
  border-radius: var(--radius-20);
  background-color: var(--color-soft);
}

.hint-title {
  color: var(--color-accent);
  font-size: var(--font-15);
  font-weight: var(--weight-medium);
  line-height: 21px;
}

.hint-sub {
  font-size: var(--font-12);
  line-height: 17px;
}
</style>
