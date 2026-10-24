<script setup lang="ts">
/**
 * 主按钮。仿 Apple 的 Button / Large / Bordered-Prominent，不引 iOS 套件。
 * 颜色只用 tokens 变量，高度和圆角用 px。
 */
withDefaults(
  defineProps<{
    label: string;
    variant?: 'primary' | 'secondary';
    disabled?: boolean;
    block?: boolean;
  }>(),
  { variant: 'primary', disabled: false, block: true },
);

const emit = defineEmits<{ (e: 'tap'): void }>();
</script>

<template>
  <view
    class="btn"
    :class="[`btn-${variant}`, { 'btn-disabled': disabled, 'btn-block': block }]"
    :hover-class="disabled ? 'none' : 'btn-hover'"
    hover-stay-time="60"
    @click="disabled ? undefined : emit('tap')"
  >
    <text class="btn-label">{{ label }}</text>
  </view>
</template>

<style scoped>
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 52px;
  padding: 0 20px;
  border-radius: var(--radius-999);
  box-sizing: border-box;
}

.btn-block {
  width: 100%;
}

.btn-label {
  font-size: var(--font-17);
  font-weight: var(--weight-semibold);
  line-height: 24px;
}

.btn-primary {
  background-color: var(--color-accent);
}

.btn-primary .btn-label {
  color: var(--color-on-accent);
}

.btn-secondary {
  background-color: var(--color-inactive);
}

.btn-secondary .btn-label {
  color: var(--color-accent);
}

.btn-disabled {
  background-color: var(--color-inactive);
}

.btn-disabled .btn-label {
  color: var(--color-muted);
}

.btn-hover {
  opacity: 0.82;
}
</style>
