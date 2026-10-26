import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { type FormatBlock, type FormatMenuLabels, formatSupport } from "./format-support.ts";

// 右键菜单里“格式化文档”不可用时的那一条（规格 DESKTOP-EDITOR-96、98）。
// Monaco 自带的“格式化文档”在没有格式化器时整条隐藏，没法告诉用户为什么；这里补一条置灰的、
// 文字里带原因的同位置菜单项。公开接口只能做“隐藏”不能做“置灰”，所以经运行时用 Monaco 内部的菜单登记表
// （见 editor/runtime-menu.ts，升级 Monaco 时一并核对）。

const BLOCKS: readonly FormatBlock[] = ["python", "go", "other", "vue"];
let counter = 0;

export interface FormatMenu extends Monaco.IDisposable {
  /** 当前显示的文件换了或 Vue 服务状态变了：重新决定显示哪一条（或都不显示） */
  update(languageId: string | null, vueUsable: boolean): void;
}

export function createFormatMenu(
  runtime: EditorRuntime,
  editor: Monaco.editor.IStandaloneCodeEditor,
  labels: FormatMenuLabels,
): FormatMenu {
  // 菜单登记表是全局的，同一个页面里可能有好几个编辑器：键名和命令号带上序号，各管各的
  const id = counter++;
  const keyName = `runyardFormatBlock${id}`;
  const key = editor.createContextKey<string>(keyName, "");
  const disposables: Monaco.IDisposable[] = [];
  for (const block of BLOCKS) {
    const command = `runyard.formatBlocked.${id}.${block}`;
    disposables.push(
      runtime.monaco.editor.registerCommand(command, () => {}),
      runtime.menu.appendDisabledItem({
        command,
        title: labels[block],
        whenKey: keyName,
        whenValue: block,
        group: "1_modification",
        order: 1.3,
      }),
    );
  }
  return {
    update(languageId, vueUsable) {
      const support =
        languageId === null ? { ok: true as const } : formatSupport(languageId, vueUsable);
      key.set(support.ok ? "" : support.block);
    },
    dispose() {
      key.reset();
      for (const item of disposables) item.dispose();
    },
  };
}
