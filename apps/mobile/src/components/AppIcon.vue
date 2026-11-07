<script setup lang="ts">
/**
 * 设计稿的图标（symbol/more、swap、close、check）。
 *
 * SVG 里的颜色是写死的，所以每个图标有浅色、深色两份，都是从设计稿对应主题的画板导出的，
 * 跟随系统切换，和 tokens.css 的判断方式一样。
 */
defineProps<{ name: 'more' | 'swap' | 'close' | 'check'; size: number }>();
</script>

<template>
  <view class="icon" :style="{ width: `${size}px`, height: `${size}px` }">
    <image class="icon-img icon-light" :src="`/static/icons/${name}.svg`" mode="aspectFit" />
    <image class="icon-img icon-dark" :src="`/static/icons/${name}-dark.svg`" mode="aspectFit" />
  </view>
</template>

<style scoped>
.icon {
  flex-shrink: 0;
}

.icon-img {
  display: block;
  width: 100%;
  height: 100%;
}

.icon-dark {
  display: none;
}

@media (prefers-color-scheme: dark) {
  .icon-light {
    display: none;
  }

  .icon-dark {
    display: block;
  }
}
</style>
