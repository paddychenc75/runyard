import type { Localized } from "@runyard/i18n";
import type { ReactNode } from "react";

// 样例文件（*.fixture.tsx）的约定（技术设计 §6.7“组件工作台和截图回归”）。
// 样例里不写任何文字：文字由工作台按语言从 workbench/sample-data.<语言>.ts 传进来，
// 所以同一个样例能截中文、英文、伪语言三种图，组件源码里也没有写死的界面文字。

/** 样例用的文字，工作台按当前语言提供；测试自己造 */
export interface SampleData {
  /** 一个词的短标签 */
  label: Localized;
  /** 长到会撑破容器的标签（“文字很长”的样例用） */
  longLabel: Localized;
  /** 四个互不相同的短标签（列表、导航、标签条的样例用） */
  items: readonly [Localized, Localized, Localized, Localized];
  /** 用户自己的内容（如项目名），不翻译，样例里用 <UserText> 显示 */
  userText: string;
  /** 图标的无障碍名字（图标本身没有文字） */
  iconLabel: Localized;
}

export interface FixtureMeta {
  /** 组件名，大驼峰，同文件夹名 */
  name: string;
  /** 所在层，见技术设计 §6.7 的分层表 */
  layer: "primitive" | "pattern";
  /** 对应哪些画板（docs/design/ 里的源文件名，不带扩展名） */
  boards: readonly string[];
  /** 样例背后垫什么：玻璃组件要垫一张固定的彩色底图才看得出模糊 */
  backdrop?: "colorful";
}

export interface FixtureSample {
  /** 状态名，英文连字符，如 primary-hover */
  name: string;
  render: (data: SampleData) => ReactNode;
}

export interface FixtureModule {
  meta: FixtureMeta;
  samples: readonly FixtureSample[];
}
