/** 滚轮的一列：标题 + 已经排好版的选项文字 */
export interface WheelColumn {
  readonly key: string;
  readonly label: string;
  /** 例如 82.5、8、2 */
  readonly options: readonly string[];
}
