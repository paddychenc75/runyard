import type { BrowserWindow } from "electron";
import { APP_ORIGIN } from "./app-protocol.ts";

// 编辑器冒烟（pnpm --filter @runyard/desktop smoke:editor）：窗口不显示，打开 editor-smoke.html
// （和 index.html 同一份内容安全策略），等页面里的自检跑完，要求 Monaco、TS 后台线程、Shiki 都工作，
// 并且页面事件和控制台里“违反内容安全策略”的记录为零。不连管理进程。只在本机手动跑（CI 的 Ubuntu 没有显示环境）。

const TIMEOUT_MS = 60_000;
const POLL_MS = 200;

interface PageResult {
  done: boolean;
  error?: string;
  violations: string[];
  check?: { tsWorkerSyntaxErrors: number; vueTokenKinds: number; editorRendered: boolean };
}

/** 判定自检结果；返回空数组表示通过。单独导出，方便不起 Electron 就测 */
export function judgeEditorSmoke(page: PageResult, consoleViolations: readonly string[]): string[] {
  const problems: string[] = [];
  if (page.error !== undefined) problems.push(`page error: ${page.error}`);
  if (page.violations.length > 0)
    problems.push(`page CSP violations: ${page.violations.join("; ")}`);
  if (consoleViolations.length > 0)
    problems.push(`console CSP violations: ${consoleViolations.join("; ")}`);
  const check = page.check;
  if (check === undefined) {
    if (page.error === undefined) problems.push("no self-check result");
    return problems;
  }
  if (check.tsWorkerSyntaxErrors < 1)
    problems.push("TS worker reported no syntax error for broken code");
  if (check.vueTokenKinds < 3)
    problems.push(`Shiki produced only ${check.vueTokenKinds} token kinds for Vue`);
  if (!check.editorRendered) problems.push("editor rendered no lines");
  return problems;
}

export async function runEditorSmoke(
  window: BrowserWindow,
  log: (line: string) => void,
): Promise<number> {
  const consoleViolations: string[] = [];
  window.webContents.on("console-message", (event) => {
    if (/content security policy/i.test(event.message)) consoleViolations.push(event.message);
  });
  try {
    await window.loadURL(`${APP_ORIGIN}/editor-smoke.html`);
    const deadline = Date.now() + TIMEOUT_MS;
    for (;;) {
      const page = (await window.webContents.executeJavaScript("window.__editorSmoke")) as
        | PageResult
        | undefined;
      if (page?.done === true) {
        log(`editor self-check ${JSON.stringify(page.check ?? null)}`);
        const problems = judgeEditorSmoke(page, consoleViolations);
        for (const problem of problems) log(`EDITOR SMOKE PROBLEM ${problem}`);
        log(problems.length === 0 ? "EDITOR SMOKE OK (0 CSP violations)" : "EDITOR SMOKE FAILED");
        return problems.length === 0 ? 0 : 1;
      }
      if (Date.now() > deadline) throw new Error("timed out waiting for the editor self-check");
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  } catch (error) {
    log(`EDITOR SMOKE FAILED ${String(error)}`);
    return 1;
  }
}
