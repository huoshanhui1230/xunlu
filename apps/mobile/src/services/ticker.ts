/**
 * 每秒重绘一次的「现在」。
 *
 * 计时只存时间戳，界面上的数字全部由 now 和存下来的时间戳现算；
 * 回到前台调一次 nowTick() 立刻重算，不靠累加计数器，切后台再回来数字也是对的。
 */
import { ref, type Ref } from 'vue';

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
let users = 0;

export function useNow(): Ref<number> {
  return now;
}

/** 立刻重算一次：onShow、保存一组之后都该调 */
export function nowTick(): void {
  now.value = Date.now();
}

/** 页面显示时开始走表；每个调用方记得配一次 releaseTicker */
export function startTicker(): void {
  users += 1;
  nowTick();
  if (timer === null) timer = setInterval(nowTick, 1000);
}

export function releaseTicker(): void {
  users = Math.max(0, users - 1);
  if (users === 0 && timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}
