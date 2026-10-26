import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { MenuId, MenuRegistry } from "monaco-editor/platform/actions/common/actions.js";
import { ContextKeyExpr } from "monaco-editor/platform/contextkey/common/contextkey.js";

// 右键菜单要补一条置灰的菜单项（features/editor/format-menu.ts，规格 DESKTOP-EDITOR-96、98）。
// 公开接口只能隐藏菜单项、不能置灰，所以用 Monaco 内部的菜单登记表。登记表是 Monaco 脚本里的单例，
// 主界面脚本自己再引入一份就是另一份登记表（菜单看不到），所以这段必须和 Monaco 一起在编辑器脚本里，
// 经 EditorRuntime 交给界面。

export interface DisabledMenuItem {
  /** 命令号（要先用 monaco.editor.registerCommand 登记过） */
  command: string;
  title: string;
  /** 编辑器上下文键等于这个值时才显示 */
  whenKey: string;
  whenValue: string;
  group: string;
  order: number;
}

export interface EditorMenu {
  /** 在编辑器右键菜单里加一条置灰、不可点的菜单项 */
  appendDisabledItem(item: DisabledMenuItem): Monaco.IDisposable;
}

export const editorMenu: EditorMenu = {
  appendDisabledItem: (item) =>
    MenuRegistry.appendMenuItem(MenuId.EditorContext, {
      command: { id: item.command, title: item.title, precondition: ContextKeyExpr.false() },
      when: ContextKeyExpr.equals(item.whenKey, item.whenValue),
      group: item.group,
      order: item.order,
    }),
};
