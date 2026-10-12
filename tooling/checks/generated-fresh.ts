import { generate } from "../scripts/generate.ts";
import type { Check } from "./workspace.ts";

// generated-fresh：改了定义却没重新生成（技术设计 §9.4）。
// 生成物：根 AGENTS.md 里的包依赖表（来自 layers.json 和各包是否已建），
// docs/reference/ 里的协议参考和登记表（来自 packages/protocol 的 zod 定义）。
// 文案类型、设计变量等生成物随各自的包加入时，在 tooling/scripts/generate.ts 里登记。

export const generatedFresh: Check = {
  name: "generated-fresh",
  run(root) {
    try {
      return generate(root)
        .filter((file) => !file.fresh)
        .map((file) =>
          file.whole
            ? `${file.path} 过期或不存在（定义改了，或有人手改了它）。运行 pnpm generate 重新生成并提交，不要手改这个文件，要改内容就改 packages/protocol 里的定义。`
            : `${file.path} 里的生成内容过期了（定义改了，或有人手改了生成的部分）。运行 pnpm generate 重新生成并提交，不要手改两行 generated 标记之间的内容。`,
        );
    } catch (error) {
      return [(error as Error).message];
    }
  },
};
