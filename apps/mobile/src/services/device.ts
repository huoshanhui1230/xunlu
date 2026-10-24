/**
 * 碰平台的那几件小事：训练中屏幕常亮、完成一组短震动。
 * H5 下这些 API 可能不存在，一律吞掉异常，别让预览炸掉。
 */

export function keepScreenOn(on: boolean): void {
  try {
    uni.setKeepScreenOn({ keepScreenOn: on });
  } catch {
    // H5 下没有这个能力，忽略
  }
}

/** 完成一组时震一下，确认「记下了」 */
export function tapFeedback(): void {
  try {
    uni.vibrateShort({});
  } catch {
    // 浏览器里没有震动，忽略
  }
}
