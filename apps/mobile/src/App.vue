<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app';
import { openStore } from '@/storage';
import { nowTick } from '@/services/ticker';

onLaunch(async () => {
  // 建表、补齐动作库；进行中的训练由记录页自己接手恢复
  await openStore();
});

onShow(() => {
  // 回到前台立刻按时间戳重算一次，计时不靠累加
  nowTick();
});

onHide(() => {
  // 计时只存时间戳，切后台不需要做任何事
});
</script>

<style>
@import '@xunlu/tokens/tokens.css';
</style>

<style lang="scss">
@import './styles/base.scss';
</style>
