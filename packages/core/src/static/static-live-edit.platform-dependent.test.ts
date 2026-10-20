import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { absPath, getPlatform } from "@runyard/platform";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RELOAD_EVENTS_PATH } from "./static-reload.ts";
import { createStaticServer } from "./static-server.ts";

// 编辑器保存与外部写入对静态页面的效果（DESKTOP-EDITOR-47，以及 DESKTOP-EDITOR-51 的预览一半；
// 51 的编辑器一半依赖外部修改的重新加载 DESKTOP-EDITOR-31，随 #260，所以 51 仍留在待实现清单里）：真实的文件系统监听加真实的 HTTP。
// 编辑器保存走平台层的原子写入（临时文件加改名），外部写入是直接覆盖；两者都要在 2 秒内通知页面刷新，
// 刷新后读到的是新内容。

const WITHIN_SPEC_MS = 2000;

let dir: string;
let port: number;
let stopServer: (() => Promise<void>) | undefined;
let events: string[];
let closeStream: (() => void) | undefined;
const platform = getPlatform({
  home: absPath(realpathSync(mkdtempSync(join(tmpdir(), "ry-live-")))),
});

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

function get(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, path }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    })
      .on("error", reject)
      .end();
  });
}

beforeEach(async () => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "ry-live-html-")));
  mkdirSync(join(dir, ".runyard"));
  writeFileSync(join(dir, "index.html"), "<html><body><h1>Hello</h1></body></html>");
  port = await freePort();
  const served = await createStaticServer({ platform })({ folder: absPath(dir), port })();
  stopServer = () => Promise.resolve(served.dispose());
  // 页面里注入的脚本做的事：订阅刷新通知
  events = [];
  const req = request({ host: "127.0.0.1", port, path: RELOAD_EVENTS_PATH }, (res) => {
    res.on("data", (chunk: Buffer) => events.push(chunk.toString("utf8")));
  });
  req.end();
  closeStream = () => req.destroy();
  // 等订阅建立、监听就绪（原子写入之前系统可能还在送建目录的事件）
  await new Promise((resolve) => setTimeout(resolve, 300));
  events.length = 0;
});

afterEach(async () => {
  closeStream?.();
  await stopServer?.();
});

const reloaded = () => events.some((chunk) => chunk.includes("reload"));
const poll = { timeout: WITHIN_SPEC_MS, interval: 20 };

describe("静态页面：保存后预览自动刷新", () => {
  it("[DESKTOP-EDITOR-47] 编辑器保存（原子写入）把 Hello 改成 Hi：2 秒内通知刷新，刷新后读到 Hi", async () => {
    await platform.fs.writeAtomic(
      absPath(join(dir, "index.html")),
      "<html><body><h1>Hi</h1></body></html>",
    );
    await expect.poll(reloaded, poll).toBe(true);
    expect(await get("/")).toContain("<h1>Hi</h1>");
  });

  it("DESKTOP-EDITOR-51 预览一半：命令行直接改写 index.html：与编辑器保存同样 2 秒内通知刷新并读到新内容", async () => {
    writeFileSync(join(dir, "index.html"), "<html><body><h1>From CLI</h1></body></html>");
    await expect.poll(reloaded, poll).toBe(true);
    expect(await get("/")).toContain("<h1>From CLI</h1>");
  });
});
