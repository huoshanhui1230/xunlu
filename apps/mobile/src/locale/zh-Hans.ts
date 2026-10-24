/**
 * 简体中文词典。界面上出现的每一个字都在这里，页面里不写死中文。
 *
 * 英文界面暂缓，但结构按多语言留好：以后加 en-US 只要照着补一份。
 *
 * 占位符用 {名字}。已经排好版的片段（例如「6–8 次」）由调用方先拼好再传进来，
 * 避免一句话拆成三四个词条。建议卡的文案按引擎的 ruleId 取，见 docs/engine-spec.md。
 */
export default {
  unit: {
    kg: 'kg',
    lb: 'lb',
  },

  format: {
    /** 80 kg */
    weight: '{value} {unit}',
    /** 8 次 */
    reps: '{reps} 次',
    /** 6–8 次 */
    repsRange: '{low}–{high} 次',
    /** 80 kg × 8 次 */
    weightByReps: '{weight} × {reps}',
    /** 还能做 2 次 */
    rir: '还能做 {rir} 次',
    rirUnknown: '未填余力',
    /** 2–3 分钟 */
    minutesRange: '{low}–{high} 分钟',
    /** 10/12 */
    monthDay: '{month}/{day}',
    /** 10 月 12 日 */
    monthDayCn: '{month} 月 {day} 日',
    /** 用时 2.4 秒：只打控制台，界面上不显示 */
    logSeconds: '用时 {seconds} 秒',
  },

  loadType: {
    total: '含杆总重',
    perSide: '每只',
    bodyweightPlus: '自重加负重',
    assisted: '助力',
  },

  exercise: {
    'barbell-bench-press': '杠铃卧推',
    'incline-dumbbell-press': '上斜哑铃卧推',
    'seated-dumbbell-shoulder-press': '坐姿哑铃推肩',
    'dumbbell-lateral-raise': '哑铃侧平举',
    'cable-triceps-pushdown': '绳索下压',
    'cable-overhead-triceps-extension': '绳索过顶臂屈伸',
  },

  plan: {
    push: '推日',
    pushSubtitle: '胸 · 肩 · 肱三头',
    pull: '拉日',
    legs: '腿日',
    free: '自由训练',
  },

  start: {
    title: '开始训练',
    subtitle: '选一个训练日，或按今天的状态自由安排。',
    /** 推荐 · 距上次 5 天 · 6 动作 / 17 组 */
    recommended: '推荐 · 距上次 {days} 天 · {exercises} 动作 / {sets} 组',
    recommendedFirst: '推荐 · 第一次练 · {exercises} 动作 / {sets} 组',
    sinceLast: '距上次 {days} 天',
    freeDescription: '从动作库添加，按动作保留对照与建议',
    notReady: '本轮只接入推日',
    note: '推荐只是默认选择，可任选或跳过某个训练日。',
    begin: '开始记录',
    cancel: '取消',
  },

  safety: {
    warmupTitle: '热身完成后再开始记录',
    warmupBody: '热身组不记录。训练中出现疼痛或不适，请立即停止该动作。',
  },

  workout: {
    end: '结束',
    /** 动作 1 / 6 · 杠铃含杆总重 */
    exerciseMeta: '动作 {index} / {total} · {loadType}',
    more: '更多',
    /** 第 3 组 · 本次目标 */
    setTarget: '第 {setNo} 组 · 本次目标',
    targetRir: '目标：还能再做 {rir} 次',
    targetRirUnknown: '目标：按当天状态',
    /** 上次同组 · 10/12 第 3 组 */
    lastSameSet: '上次同组 · {date} 第 {setNo} 组',
    sinceLastSet: '距上一组',
    restAdvice: '推荐组间歇 {range}',
    restNote: '间隔包含组间歇与做组时长',
    doneSets: '已完成 {count} 组',
    noSets: '还没有记录',
    modify: '修改',
    switchExercise: '切换动作',
    doneSet: '完成本组',
    endTitle: '结束本次训练？',
    endBody: '已记录的组都会保留。',
    endConfirm: '结束',
    endCancel: '继续训练',
    notInThisRound: '这一版还没做这一块',
  },

  feedback: {
    title: '记录第 {setNo} 组',
    close: '关闭',
    columnWeight: '重量 / {unit}',
    columnReps: '次数',
    columnRir: '还能再做',
    /** 含杆总重 · 当前还能再做 2 次 */
    footnote: '{loadType} · 当前还能再做 {rir} 次',
    footnoteNoRir: '{loadType} · 还能再做没填',
    addNote: '添加备注',
    prefilled: '数值已预填，可滑动修改',
    confirm: '确认',
    closeSaves: '关闭面板也会保存当前值',
  },

  saved: {
    /** 已保存 · 第 3 组 */
    title: '已保存 · 第 {setNo} 组',
    /** 本动作 3 组；全场 3 组，容量 1,920 kg。 */
    summary: '本动作 {exerciseSets} 组；全场 {totalSets} 组，容量 {volume}。',
    undo: '撤销',
    undone: '已撤销这一组',
  },

  /**
   * 组间提示。A4 用设计稿第 11 页的原文；A1、A2、A3 第 11 页没画，用 docs/engine-spec.md 的文案。
   * {reps} 传进来的是排好版的「6–8 次」或「6 次」。
   */
  hint: {
    A1: {
      title: '余力充足，下一组试试 {weight} × {reps}',
      sub: '这组能完成 {capacity} 次，到了加重门槛 {threshold} 次。',
    },
    A2: {
      title: '重量不变，下一组争取 {reps}',
      sub: '余力还有 {rir} 次，先把次数做上去。',
    },
    A3: {
      title: '这组没做到下限，下一组减到 {weight}',
      sub: '先回到能做满 {reps} 的重量。',
    },
    A4: {
      title: '下一组继续 {weight} × {reps}',
      subDone: '余力 {rir}，保持重量；计划 {planned} 组已完成。',
      subLeft: '余力 {rir}，保持重量；计划 {planned} 组，还差 {left} 组。',
      subDoneNoRir: '保持重量；计划 {planned} 组已完成。',
      subLeftNoRir: '保持重量；计划 {planned} 组，还差 {left} 组。',
    },
    apply: '应用',
    applied: '已应用',
    appliedTitle: '已应用 · 下一组 {weight} × {reps}',
    appliedSub: '仅更新下一组预填，已保存的 {count} 组保持不变。',
  },

  resume: {
    title: '继续上次训练',
    body: '上次的训练还没结束，要接着记吗？',
    confirm: '继续',
    discard: '结束它',
  },

  disclaimer: '以上为训练参考，不构成医疗建议。',
};
