import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { vueServiceUsable } from "./format-support.ts";
import { registerVueCompletion } from "./vue-completion-provider.ts";
import { registerVueFormatting } from "./vue-format-provider.ts";
import { registerVueInspection } from "./vue-inspection-provider.ts";
import type { VueModelRequestInput } from "./vue-model-requests.ts";

export function createVueEditorServices(
  input: VueModelRequestInput & {
    runtime: EditorRuntime;
    models(): Iterable<Monaco.editor.ITextModel>;
    /** Vue 语言服务能不能用变了（重启中或放弃了就不能用）：格式化据此在菜单里显示成不可用 */
    onUsableChange?(usable: boolean): void;
  },
): Monaco.IDisposable & { canOpen(path: string): boolean; usable(): boolean } {
  const completion = registerVueCompletion(input);
  const inspection = registerVueInspection(input);
  // 服务不可用时把格式化提供者撤掉：Monaco 自带的“格式化文档”就不再出现在菜单里，
  // 由编辑器宿主补一条带原因的不可用项（规格 DESKTOP-EDITOR-98）
  let formatting: Monaco.IDisposable | null = registerVueFormatting(input);
  let usable = true;
  const unsubscribe = input.bridge.status((state) => {
    const next = vueServiceUsable(state);
    if (next === usable) return;
    usable = next;
    if (usable) formatting = registerVueFormatting(input);
    else {
      formatting?.dispose();
      formatting = null;
    }
    input.onUsableChange?.(usable);
  });
  return {
    canOpen: inspection.canOpen,
    usable: () => usable,
    dispose() {
      unsubscribe();
      formatting?.dispose();
      completion.dispose();
      inspection.dispose();
    },
  };
}
