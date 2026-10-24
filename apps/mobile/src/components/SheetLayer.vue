<script setup lang="ts">
/**
 * 底部弹层的外壳：遮罩 + 把手 + 圆角面板。
 * 点遮罩和点把手区域都算「关闭」—— 反馈面板关闭时照样保存，由调用方决定怎么处理。
 */
withDefaults(defineProps<{ visible: boolean; dim?: number }>(), { dim: 0.36 });

const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <view v-if="visible" class="layer">
    <view class="dimmer" :style="{ backgroundColor: `rgba(0, 0, 0, ${dim})` }" @click="emit('close')" />
    <view class="sheet">
      <view class="grabber" @click="emit('close')">
        <view class="handle" />
      </view>
      <slot />
    </view>
  </view>
</template>

<style scoped>
.layer {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 100;
}

.dimmer {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
}

.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  max-height: 88%;
  background-color: var(--color-sheet);
  border-top-left-radius: var(--radius-28);
  border-top-right-radius: var(--radius-28);
  overflow: hidden;
}

.grabber {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  flex-shrink: 0;
}

.handle {
  width: 36px;
  height: 5px;
  border-radius: var(--radius-999);
  background-color: var(--color-line);
}
</style>
