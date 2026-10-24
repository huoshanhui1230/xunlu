<script setup lang="ts">
/**
 * 下一组提示卡。一张卡要盖住四种状态：
 *   MF05  84:14572   保持 / 加重 / 加次数 —— 带「应用」
 *   MF05a 102:3475   已应用
 *   S06   185:4037   只提醒方向 —— 没有按钮，也不改预填
 *   S09   185:4117   提示补填 RIR —— 按钮是「补填」
 *
 * 内容全部来自引擎的 suggestNextSet，这张卡只负责显示。
 */
import AppButton from './AppButton.vue';

defineProps<{
  title: string;
  sub: string;
  /** 按钮文字；没有按钮时为 null */
  action: string | null;
  /** 已经应用过：按钮变成不可点的「已应用」 */
  applied: boolean;
}>();

const emit = defineEmits<{ (e: 'act'): void }>();
</script>

<template>
  <view class="hint">
    <text class="hint-title">{{ title }}</text>
    <text class="hint-sub muted">{{ sub }}</text>
    <AppButton
      v-if="action !== null"
      :label="action"
      :variant="applied ? 'secondary' : 'primary'"
      :disabled="applied"
      @tap="emit('act')"
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
