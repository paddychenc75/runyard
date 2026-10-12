import { describe, expect, it } from "vitest";
import { captureScript, markersFor, WARM_UP_TOOLS } from "./shell-script.ts";

const markers = markersFor("0123456789abcdef");

describe("captureScript：交给登录 shell 的脚本", () => {
  for (const kind of ["zsh", "bash", "fish"] as const) {
    it(`${kind}：脚本文本里不含完整的标记（被回显或报错时也不会冒充输出）`, () => {
      for (const mode of ["env", "path"] as const) {
        const script = captureScript(kind, markers, mode);
        expect(script).not.toContain(markers.start);
        expect(script).not.toContain(markers.end);
        expect(script).toContain("0123456789abcdef");
      }
    });

    it(`${kind}：env 模式用 env -0 打印，path 模式只用内建打印 PATH`, () => {
      expect(captureScript(kind, markers, "env")).toContain("/usr/bin/env -0");
      const path = captureScript(kind, markers, "path");
      expect(path).not.toContain("env -0");
      expect(path).toContain("PATH=%s");
    });

    it(`${kind}：预热列出的每个工具`, () => {
      const script = captureScript(kind, markers, "env");
      for (const tool of WARM_UP_TOOLS) expect(script).toContain(tool);
    });
  }

  it("zsh 手动跑 precmd 和 precmd_functions；bash 跑 PROMPT_COMMAND；fish 发 fish_prompt 事件", () => {
    expect(captureScript("zsh", markers, "env")).toContain("precmd_functions");
    expect(captureScript("bash", markers, "env")).toContain("PROMPT_COMMAND");
    expect(captureScript("fish", markers, "env")).toContain("emit fish_prompt");
  });

  it("zsh 和 bash 先关掉 nounset 与 errexit（启动文件可能留着它们）", () => {
    for (const kind of ["zsh", "bash"] as const) {
      expect(captureScript(kind, markers, "env").startsWith("set +u +e")).toBe(true);
    }
  });

  it("fish 用 fish 的语法：for … end、string join，没有 POSIX 的 case/esac 和 $(…)", () => {
    const script = captureScript("fish", markers, "path");
    expect(script).toContain("string join : $PATH");
    expect(script).toContain("; end");
    expect(script).not.toContain("esac");
    expect(script).not.toContain("$(");
  });

  it("整条命令是单行（要能作为 -c 的参数，也要能原样写进 stdin）", () => {
    for (const kind of ["zsh", "bash", "fish"] as const) {
      expect(captureScript(kind, markers, "env")).not.toContain("\n");
    }
  });
});
