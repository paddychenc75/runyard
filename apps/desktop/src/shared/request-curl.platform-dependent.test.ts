import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { absPath, getPlatform } from "@runyard/platform";
import type { RequestSpec } from "@runyard/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { buildCurl } from "./request-model.ts";

// 用本机的 sh 和 curl 真的运行复制出来的命令（只在有 sh 的系统上跑，见测试指南的平台相关测试）
const platform = getPlatform();

// 经平台层起 sh 运行复制出来的整条命令（命令里有引号和管道符，必须过 shell，所以这是个测试里才有的例外）
async function runShell(command: string): Promise<void> {
  const child = platform.exec.spawn({
    argv: ["sh", "-c", command],
    cwd: absPath(tmpdir()),
    env: { ...platform.env.runDefaults(), PATH: process.env.PATH ?? "" },
    stdin: false,
  });
  const exit = await child.exited;
  expect(exit.exitCode).toBe(0);
}

describe("复制为 curl", () => {
  const servers: http.Server[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  async function receive(): Promise<{ port: number; seen: Promise<Record<string, unknown>> }> {
    let deliver!: (value: Record<string, unknown>) => void;
    const seen = new Promise<Record<string, unknown>>((resolve) => {
      deliver = resolve;
    });
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        deliver({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
        res.end("ok");
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { port: (server.address() as AddressInfo).port, seen };
  }

  it("[DESKTOP-REQUEST-PANEL-11] 命令在 shell 里运行：服务收到同样的方法、路径、头和请求体（含单引号、中文、$ 和反引号）", async () => {
    const { port, seen } = await receive();
    const spec: RequestSpec = {
      method: "POST",
      path: "/todos?q=a&x[]=1",
      headers: [
        { name: "content-type", value: "application/json" },
        { name: "x-note", value: "it's `$HOME`" },
      ],
      payload: `{"title":"it's 中文 $HOME \`x\`"}`,
    };
    await runShell(buildCurl(spec, port));
    const got = await seen;
    expect(got).toMatchObject({ method: "POST", url: "/todos?q=a&x[]=1", body: spec.payload });
    const headers = got.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-note"]).toBe("it's `$HOME`");
  });

  it("[DESKTOP-REQUEST-PANEL-11] 没写 content-type 的请求体不会被 curl 偷偷加上表单类型；@ 开头的请求体不当文件读", async () => {
    const { port, seen } = await receive();
    await runShell(
      buildCurl({ method: "PUT", path: "/", headers: [], payload: "@/etc/hostname" }, port),
    );
    const got = await seen;
    expect(got.body).toBe("@/etc/hostname");
    expect((got.headers as Record<string, string>)["content-type"]).toBeUndefined();
  });
});
