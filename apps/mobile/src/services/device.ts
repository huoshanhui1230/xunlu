/**
 * 碰平台的那几件小事：训练中屏幕常亮、完成一组短震动。
 *
 * 这两个 API 在浏览器里都可能被拒（没有 Wake Lock 权限、没有震动马达）。
 * 一定要传 fail 回调：uni 只有在没有回调时才返回 Promise，不传就会多出一个没人接的 rejection。
 */

function ignore(): void {
  // 没有这个能力就算了，不该影响记录
}

export function keepScreenOn(on: boolean): void {
  try {
    uni.setKeepScreenOn({ keepScreenOn: on, success: ignore, fail: ignore });
  } catch {
    ignore();
  }
}

/** 完成一组时震一下，确认「记下了」 */
export function tapFeedback(): void {
  try {
    uni.vibrateShort({ success: ignore, fail: ignore });
  } catch {
    ignore();
  }
}
