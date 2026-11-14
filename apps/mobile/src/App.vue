<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app';
import { openStore } from '@/storage';
import { nowTick } from '@/services/ticker';

onLaunch(() => {
  // 建表、补齐动作库；出错时 openStore 自己提示，这里不用再管
  openStore().catch(() => undefined);
});

onShow(() => {
  // 回到前台立刻按时间戳重算一次；计时只存时间戳，所以切后台时什么都不用做
  nowTick();
});
</script>

<style>
@import '@xunlu/tokens/tokens.css';
</style>

<style lang="scss">
@use './styles/base.scss';
</style>
