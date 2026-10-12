import { describe, expect, it } from "vitest";
import type { LintIssue } from "./lint-issue.ts";
import { classifySetupFailure, runnerSchema } from "./runner-file.ts";
import { samplePythonRunner, sampleStaticRunner, sampleViteRunner } from "./sample-templates.ts";
import { validateRunner } from "./validate-runner.ts";

type Raw = Record<string, unknown>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const rules = (issues: LintIssue[]) => issues.map((issue) => issue.rule);
const rulesOf = (raw: unknown) => rules(validateRunner(raw).errors);

// 在样例上改一处，其余保持合法
function vite(patch: (runner: Raw) => void): Raw {
  const runner = clone(sampleViteRunner) as Raw;
  patch(runner);
  return runner;
}
function python(patch: (runner: Raw) => void): Raw {
  const runner = clone(samplePythonRunner) as Raw;
  patch(runner);
  return runner;
}
const runCommand = (runner: Raw) => (runner.run as { command: unknown }).command;
const setRunCommand = (runner: Raw, command: unknown) => {
  (runner.run as Raw).command = command;
};

describe("运行器的完整示例（runner-format.md）作为夹具", () => {
  it("vite、python-file、静态页面三个示例都通过校验，没有任何错误和警告", () => {
    for (const sample of [sampleViteRunner, samplePythonRunner, sampleStaticRunner]) {
      const result = validateRunner(sample);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.value).toBeDefined();
    }
  });

  it("校验返回的值与直接用 zod 解析的结果一致（默认值已套用）", () => {
    expect(validateRunner(sampleViteRunner).value).toEqual(runnerSchema.parse(sampleViteRunner));
  });
});

describe("运行器的字段和按类别的约束", () => {
  it("[TEMPLATES-FORMAT-12] 服务必须有就绪判断", () => {
    const result = validateRunner(
      vite((r) => {
        delete r.ready;
      }),
    );
    expect(rules(result.errors)).toEqual(["runner-invalid"]);
    expect(result.errors[0]?.path).toBe("ready");
    expect(result.value).toBeUndefined();
  });

  it("[TEMPLATES-FORMAT-13] 脚本不许有就绪", () => {
    const result = validateRunner(
      python((r) => {
        r.ready = { port: {} };
      }),
    );
    expect(rules(result.errors)).toEqual(["runner-invalid"]);
    expect(result.errors[0]?.path).toBe("ready");
  });

  it("[TEMPLATES-FORMAT-14] watch 模式和类别要对得上", () => {
    const serverRerun = validateRunner(
      vite((r) => {
        r.watch = { mode: "rerun" };
      }),
    );
    expect(rules(serverRerun.errors)).toEqual(["runner-invalid"]);
    expect(serverRerun.errors[0]?.path).toBe("watch.mode");
    const scriptRestart = validateRunner(
      python((r) => {
        r.watch = { mode: "restart" };
      }),
    );
    expect(rules(scriptRestart.errors)).toEqual(["runner-invalid"]);
    // 对得上的组合不报：服务 restart、脚本 rerun
    expect(
      validateRunner(
        vite((r) => {
          r.watch = { mode: "restart" };
        }),
      ).errors,
    ).toEqual([]);
  });

  it("static 不许有 run 命令；服务和脚本必须有", () => {
    expect(rulesOf({ ...sampleStaticRunner, run: { command: ["node", "server.js"] } })).toEqual([
      "runner-invalid",
    ]);
    expect(
      rulesOf(
        vite((r) => {
          delete r.run;
        }),
      ),
    ).toEqual(["runner-invalid"]);
  });

  it("[TEMPLATES-FORMAT-15] setup.errors 里不认识的原因被拒绝", () => {
    const result = validateRunner(
      vite((r) => {
        (r.setup as { errors: unknown[] }).errors = [{ match: "x", reason: "SOMETHING_ELSE" }];
      }),
    );
    expect(rules(result.errors)).toEqual(["runner-invalid"]);
    expect(result.errors[0]?.path).toBe("setup.errors.0.reason");
  });

  it("setup.errors 的匹配串必须是合法的正则", () => {
    expect(
      rulesOf(
        vite((r) => {
          (r.setup as { errors: unknown[] }).errors = [{ match: "(", reason: "DEPS_OFFLINE" }];
        }),
      ),
    ).toEqual(["runner-invalid"]);
  });

  it("[TEMPLATES-FORMAT-16] 安装失败按特征分类，没有匹配就是 SETUP_FAILED", () => {
    const { errors } = runnerSchema.parse(sampleViteRunner).setup ?? { errors: [] };
    expect(classifySetupFailure(errors, "ERR_PNPM_NO_OFFLINE_TARBALL  not cached")).toBe(
      "DEPS_OFFLINE",
    );
    expect(classifySetupFailure(errors, "The specified module could not be found")).toBe(
      "RUNTIME_MISSING",
    );
    expect(classifySetupFailure(errors, "something unrelated broke")).toBe("SETUP_FAILED");
    // 一条都没登记的运行器，任何输出都是 SETUP_FAILED
    expect(classifySetupFailure([], "ENOTFOUND")).toBe("SETUP_FAILED");
  });

  it("[TEMPLATES-FORMAT-17] 保留字段 detect 和 actions 被接受，对解析结果之外没有影响", () => {
    const withReserved = vite((r) => {
      r.detect = { anything: [1, 2] };
      r.actions = ["later"];
    });
    const result = validateRunner(withReserved);
    expect(result.errors).toEqual([]);
    expect(result.value?.kind).toBe("server");
  });

  it("没有 slowAfterMs 时缺省 30000", () => {
    const result = validateRunner(
      vite((r) => {
        r.ready = { http: { path: "/" } };
      }),
    );
    expect(result.value?.ready).toMatchObject({ slowAfterMs: 30000 });
  });

  it("ready 的三种写法：http、port、log", () => {
    for (const ready of [
      { http: { path: "/health" }, slowAfterMs: 5000 },
      { port: {} },
      { log: { match: "ready in \\d+ ms" } },
    ])
      expect(
        validateRunner(
          vite((r) => {
            r.ready = ready;
          }),
        ).errors,
      ).toEqual([]);
    expect(
      rulesOf(
        vite((r) => {
          r.ready = { http: { path: "/" }, port: {} };
        }),
      ),
    ).toEqual(["runner-invalid"]);
  });

  it("多余的字段和写错的类别被拒绝，错误指向该字段", () => {
    const extra = validateRunner(
      vite((r) => {
        r.hooks = ["postcreate.sh"];
      }),
    );
    expect(rules(extra.errors)).toEqual(["runner-invalid"]);
    const badKind = validateRunner(
      vite((r) => {
        r.kind = "daemon";
      }),
    );
    expect(badKind.errors[0]).toMatchObject({ rule: "runner-invalid", path: "kind" });
  });

  it("预览类型只有 web、request、console", () => {
    expect(
      rulesOf(
        vite((r) => {
          r.preview = { type: "terminal" };
        }),
      ),
    ).toEqual(["runner-invalid"]);
  });

  it("不是对象的内容被拒绝", () => {
    for (const raw of [null, "runner", 3, []]) expect(rulesOf(raw)).toEqual(["runner-invalid"]);
  });

  it("[TEMPLATES-FORMAT-11] 比认识的更新的版本：只报 format-version-unsupported", () => {
    const result = validateRunner(
      vite((r) => {
        r.formatVersion = 2;
        r.unknownFutureField = true;
      }),
    );
    expect(result.errors).toEqual([
      expect.objectContaining({ rule: "format-version-unsupported", path: "formatVersion" }),
    ]);
    expect(result.value).toBeUndefined();
  });
});

describe("命令是参数数组，不经过 shell", () => {
  it("[TEMPLATES-FORMAT-18] 一整行字符串被拒绝", () => {
    const result = validateRunner(
      vite((r) => {
        setRunCommand(r, "node server.js");
      }),
    );
    expect(rules(result.errors)).toEqual(["runner-invalid"]);
    expect(result.errors[0]?.path).toBe("run.command");
  });

  it("[TEMPLATES-FORMAT-19] shell 运算符作为元素、以 ~ 开头的元素：每处都报 command-shell-syntax", () => {
    const result = validateRunner(
      vite((r) => {
        (r.setup as { variants: Raw }).variants = {
          pnpm: { command: ["pnpm", "install", "&&", "pnpm", "build"] },
          npm: { command: ["~/bin/tool", "install"] },
        };
      }),
    );
    expect(result.errors).toEqual([
      expect.objectContaining({
        rule: "command-shell-syntax",
        path: "setup.variants.pnpm.command.2",
      }),
      expect.objectContaining({
        rule: "command-shell-syntax",
        path: "setup.variants.npm.command.0",
      }),
    ]);
  });

  it.each(["&&", "||", ";", "|", "&", ">", ">>", "<"])(
    "单独的 %s 元素是 shell 语法",
    (operator) => {
      const result = validateRunner(
        vite((r) => {
          setRunCommand(r, ["node", "a.js", operator, "b"]);
        }),
      );
      expect(rules(result.errors)).toEqual(["command-shell-syntax"]);
    },
  );

  it("[TEMPLATES-FORMAT-20] 参数内部的分号不误判", () => {
    // 样例里的 python 检查命令就是这种写法
    const check = (samplePythonRunner.check as { command: string[] }).command;
    expect(check[2]).toContain(";");
    const result = validateRunner(samplePythonRunner);
    expect(result.errors).toEqual([]);
    expect(rules(result.errors)).not.toContain("command-shell-syntax");
    // 元素内部含 | 和 > 但整体是一个参数，同样不算
    expect(
      validateRunner(
        python((r) => {
          setRunCommand(r, ["python", "-c", "print(1 > 0 or 2 | 3)", "{entry}"]);
        }),
      ).errors,
    ).toEqual([]);
  });

  it("占位符 {port}、{entry}、{dir}、{name} 不触发任何规则", () => {
    expect(
      validateRunner(
        vite((r) => {
          setRunCommand(r, [
            "node",
            "{dir}/x.js",
            "--name={name}",
            "--entry",
            "{entry}",
            "--port",
            "{port}",
          ]);
        }),
      ).errors,
    ).toEqual([]);
  });

  it("空命令和空元素被拒绝", () => {
    for (const command of [[], ["node", ""]])
      expect(
        rulesOf(
          vite((r) => {
            setRunCommand(r, command);
          }),
        ),
      ).toEqual(["runner-invalid"]);
  });

  it("[TEMPLATES-FORMAT-18] 命令里的元素不是字符串也被拒绝", () => {
    const result = validateRunner(
      vite((r) => {
        setRunCommand(r, ["node", 3]);
      }),
    );
    expect(rules(result.errors)).toEqual(["runner-invalid"]);
  });
});

describe("停止方式、监听地址和端口", () => {
  it("[TEMPLATES-FORMAT-22] 信号名：多出的 signal 字段，和 mode 写成信号名，都报 stop-signal-name", () => {
    const extraField = validateRunner(
      vite((r) => {
        r.stop = { mode: "graceful", signal: "SIGTERM" };
      }),
    );
    expect(extraField.errors).toEqual([
      expect.objectContaining({ rule: "stop-signal-name", path: "stop" }),
    ]);
    const asMode = validateRunner(
      vite((r) => {
        r.stop = { mode: "SIGKILL" };
      }),
    );
    expect(asMode.errors).toEqual([expect.objectContaining({ rule: "stop-signal-name" })]);
    for (const name of ["SIGINT", "SIGTERM", "SIGHUP"])
      expect(
        rulesOf(
          vite((r) => {
            r.stop = { mode: name };
          }),
        ),
      ).toEqual(["stop-signal-name"]);
  });

  it("[TEMPLATES-FORMAT-22] 别的不认识的 mode 是 runner-invalid，不是信号名", () => {
    const result = validateRunner(
      vite((r) => {
        r.stop = { mode: "kill-it" };
      }),
    );
    expect(rules(result.errors)).toEqual(["runner-invalid"]);
    expect(result.errors[0]?.path).toBe("stop.mode");
  });

  it("[TEMPLATES-FORMAT-23] graceMs 缺省是 2000", () => {
    const result = validateRunner(
      vite((r) => {
        r.stop = { mode: "graceful" };
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.value?.stop).toEqual({ mode: "graceful", graceMs: 2000 });
  });

  it.each([-1, 0, 1.5, "2000"])("graceMs 为 %j 被拒绝（必须是正整数）", (graceMs) => {
    const result = validateRunner(
      vite((r) => {
        r.stop = { mode: "graceful", graceMs };
      }),
    );
    expect(rules(result.errors)).toEqual(["runner-invalid"]);
    expect(result.errors[0]?.path).toBe("stop.graceMs");
  });

  it("interrupt 是合法的 mode", () => {
    expect(
      validateRunner(
        vite((r) => {
          r.stop = { mode: "interrupt", graceMs: 5000 };
        }),
      ).errors,
    ).toEqual([]);
  });

  it("[TEMPLATES-FORMAT-24] 监听地址：0.0.0.0 和 localhost 都报 bind-address，127.0.0.1 不报", () => {
    const host = (value: string) =>
      vite((r) => {
        setRunCommand(r, ["node", "server.js", "--host", value]);
      });
    expect(validateRunner(host("0.0.0.0")).errors).toEqual([
      expect.objectContaining({ rule: "bind-address", path: "run.command.3" }),
    ]);
    expect(rulesOf(host("localhost"))).toEqual(["bind-address"]);
    expect(validateRunner(host("127.0.0.1")).errors).toEqual([]);
    // 带前缀、协议、端口的写法也认得
    for (const element of ["--host=0.0.0.0", "http://localhost:3000", "0.0.0.0:8080"])
      expect(
        rulesOf(
          vite((r) => {
            setRunCommand(r, ["node", "server.js", element]);
          }),
        ),
      ).toEqual(["bind-address"]);
  });

  it("[TEMPLATES-FORMAT-24] 环境变量里的监听地址同样被拒绝", () => {
    const result = validateRunner(
      vite((r) => {
        (r.run as Raw).env = { HOST: "0.0.0.0", NAME: "my localhost app" };
      }),
    );
    expect(result.errors).toEqual([
      expect.objectContaining({ rule: "bind-address", path: "run.env.HOST" }),
    ]);
  });

  it("[TEMPLATES-FORMAT-25] 写死的端口：--port 后面是数字报 port-hardcoded，{port} 通过", () => {
    const port = (...args: string[]) =>
      vite((r) => {
        setRunCommand(r, ["node", "server.js", ...args]);
      });
    expect(validateRunner(port("--port", "3000")).errors).toEqual([
      expect.objectContaining({ rule: "port-hardcoded", path: "run.command.3" }),
    ]);
    expect(rulesOf(port("-p", "8080"))).toEqual(["port-hardcoded"]);
    expect(rulesOf(port("--port=3000"))).toEqual(["port-hardcoded"]);
    expect(validateRunner(port("--port", "{port}")).errors).toEqual([]);
    // 别的参数后面的数字不是端口
    expect(validateRunner(port("--retries", "3")).errors).toEqual([]);
  });

  it("[TEMPLATES-FORMAT-26] --no-color 报 runner-invalid", () => {
    const result = validateRunner(
      vite((r) => {
        setRunCommand(r, [...(runCommand(r) as string[]), "--no-color"]);
      }),
    );
    expect(rules(result.errors)).toEqual(["runner-invalid"]);
    expect(result.errors[0]?.message).toContain("--no-color");
  });

  it("一次报全：同时有 && 、信号名、写死端口、缺 ready 时四项都在", () => {
    const result = validateRunner(
      vite((r) => {
        delete r.ready;
        setRunCommand(r, ["node", "a.js", "&&", "--port", "3000"]);
        r.stop = { mode: "graceful", signal: "SIGTERM" };
      }),
    );
    expect(rules(result.errors).sort()).toEqual(
      ["command-shell-syntax", "port-hardcoded", "runner-invalid", "stop-signal-name"].sort(),
    );
  });
});
