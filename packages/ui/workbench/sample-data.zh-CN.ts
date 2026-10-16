import type { SampleData } from "../src/index.ts";

// 工作台的示例文字（技术设计 §6.7）：样例文件里不写文字，由这里按语言提供
export const sampleText: Omit<SampleData, "iconLabel"> = {
  label: "创建并运行",
  longLabel: "把这个练习项目复制一份放到另一个文件夹里并立刻开始运行它，不要等待",
};

export const chromeText = {
  title: "组件工作台",
  components: "组件",
  theme: "主题",
  themeSystem: "跟随系统",
  themeLight: "浅色",
  themeDark: "深色",
  locale: "语言",
  localeEn: "English",
  localeZh: "简体中文",
};
