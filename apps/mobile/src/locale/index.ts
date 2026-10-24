/**
 * 界面文字。目前只有简体中文；英文界面暂缓，但词条已经分好，补一份 en-US 就能开。
 */
import { createI18n } from 'vue-i18n';
import zhHans from './zh-Hans';

export type Messages = typeof zhHans;

export const DEFAULT_LOCALE = 'zh-Hans';

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: { [DEFAULT_LOCALE]: zhHans },
});

/** 在 setup 外面也要取文案时用它（例如 uni.showModal 的标题） */
export const t = i18n.global.t;
