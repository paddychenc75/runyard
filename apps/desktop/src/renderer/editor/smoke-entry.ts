import { loadEditorRuntime } from "./editor-loader.ts";
import { runEditorSelfCheck } from "./self-check.ts";

// 编辑器冒烟页的脚本（构建成 dist/renderer/editor-smoke.js，页面是 editor-smoke.html，
// 内容安全策略与 index.html 完全相同，由构建从它派生）。结果放在 window.__editorSmoke，主进程轮询读取。
// 违反策略的事件在这里就记下，主进程还会另外看控制台，两边都要为零。

interface SmokeResult {
  done: boolean;
  error?: string;
  violations: string[];
  check?: Awaited<ReturnType<typeof runEditorSelfCheck>>;
}

const result: SmokeResult = { done: false, violations: [] };
(window as unknown as { __editorSmoke: SmokeResult }).__editorSmoke = result;
document.addEventListener("securitypolicyviolation", (event) => {
  result.violations.push(`${event.violatedDirective} ${event.blockedURI}`);
});

const host = document.getElementById("root");
if (host === null) throw new Error("missing #root");
loadEditorRuntime()
  .then((runtime) => runEditorSelfCheck(runtime, host))
  .then((check) => {
    result.check = check;
  })
  .catch((error: unknown) => {
    result.error = String(error);
  })
  .finally(() => {
    result.done = true;
  });
