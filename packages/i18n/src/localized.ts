declare const localizedBrand: unique symbol;

// 带标记的字符串：只有翻译函数和格式化函数能产出（技术设计 §6.8 第 2、3 层）。
// 界面和命令行的输出口只收它，传普通字符串类型检查就报错。
export type Localized = string & { readonly [localizedBrand]: true };

// 包内使用；不从入口导出，别的包拿不到“把任意字符串标成已翻译”的办法
export function markLocalized(text: string): Localized {
  return text as Localized;
}
