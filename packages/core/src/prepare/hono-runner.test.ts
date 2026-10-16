import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateRunner, validateTemplate } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import {
  at,
  createPrepareHarness,
  installArgv,
  installOk,
  spawnedArgvs,
  stopRun,
} from "./prepare-harness.test.ts";

// 用仓库里真实的 hono 运行器和模板的数据跑准备阶段（规格 templates/runners 的 Hono 一节）。
// 重启本身（保存后停了再起）是管理进程的事，不在准备阶段，由 supervisor 的测试覆盖。

const templates = join(import.meta.dirname, "..", "..", "..", "..", "templates");
const read = (path: string): unknown => JSON.parse(readFileSync(join(templates, path), "utf8"));
function valid<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("hono 运行器或模板不合格");
  return value;
}
const runner = valid(validateRunner(read("runners/hono/runner.json")).value);
const template = valid(validateTemplate(read("builtin/hono/template.json")).value);

function harness() {
  const h = createPrepareHarness({
    runner,
    requires: template.requires,
    registeredPort: 7104,
    tools: ["node", "pnpm", "npm"],
  });
  h.fake.tools.install("pnpm", { version: "10.34.6" });
  h.fake.tools.install("node", { version: "22.18.0" });
  Object.assign(h.subject, { entry: template.entry });
  h.fake.fs.writeFile(at(template.entry), "// entry");
  return h;
}

describe("hono 运行器", () => {
  it("声明：服务类、保存后由管理进程重启、预览是请求面板、就绪看 HTTP 响应", () => {
    expect(runner.kind).toBe("server");
    expect(runner.watch.mode).toBe("restart");
    expect(runner.preview.type).toBe("request");
    expect(runner.ready).toMatchObject({ http: { path: "/" } });
    expect(template.category).toBe("service");
  });

  it("node 直接运行入口文件，不经包管理器、没有监听参数；端口通过 PORT 环境变量给出，最终 ready", async () => {
    const h = harness();
    h.fake.processes.when(installArgv, installOk);
    h.fake.processes.when(["/fake/bin/node", "src/index.ts"], {
      listenOn: { port: 7104, atMs: 100 },
    });
    const { run } = h.engine.start(h.request());
    await h.advance(500);
    expect(run.state).toBe("ready");
    const server = h.fake.processes.spawned.find((s) => s.argv.includes("src/index.ts"));
    expect(server?.argv).toEqual(["/fake/bin/node", "src/index.ts"]);
    expect(server?.env.PORT).toBe("7104");
    expect(spawnedArgvs(h).filter((argv) => !argv.endsWith("--version"))).toEqual([
      installArgv.join(" "),
      "/fake/bin/node src/index.ts",
    ]);
    await stopRun(h, run);
  });
});
