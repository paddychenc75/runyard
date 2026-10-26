// 右键菜单要补一条置灰的“格式化文档”（features/editor/format-menu.ts）：公开接口只能隐藏菜单项、不能置灰，
// 所以用 Monaco 内部的菜单登记表。这两个模块没有类型声明，只声明用到的那一小部分；升级 Monaco 时核对。

declare module "monaco-editor/platform/contextkey/common/contextkey.js" {
  export interface ContextKeyExpression {
    readonly type: number;
  }
  export const ContextKeyExpr: {
    false(): ContextKeyExpression;
    equals(key: string, value: unknown): ContextKeyExpression;
  };
}
declare module "monaco-editor/platform/actions/common/actions.js" {
  import type { ContextKeyExpression } from "monaco-editor/platform/contextkey/common/contextkey.js";
  export const MenuId: { readonly EditorContext: object };
  export const MenuRegistry: {
    appendMenuItem(
      menu: object,
      item: {
        command: { id: string; title: string; precondition?: ContextKeyExpression };
        when?: ContextKeyExpression;
        group?: string;
        order?: number;
      },
    ): { dispose(): void };
  };
}
