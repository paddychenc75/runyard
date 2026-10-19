import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, get as httpGet } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStaticServer, RELOAD_EVENTS_PATH } from "../../packages/core/src/index.ts";
import { absPath, getPlatform } from "../../packages/platform/src/index.ts";
import type { Template } from "../../packages/protocol/src/index.ts";

// 静态页面模板（运行器 static，如 html）的冒烟：用管理进程自己的页面服务托管模板，
// 确认首页可取且带自动刷新脚本、改入口文件后新内容可取并经 SSE 通知刷新、只监听 127.0.0.1、停止后端口释放。
// 不需要网络，也没有依赖要装。入口是 template-smoke.ts。

const repoRoot = join(import.meta.dirname, "..", "..");
const log = (step: string, detail = ""): void =>
  console.log(`[smoke] ${step}${detail === "" ? "" : `：${detail}`}`);

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function fetchText(
  host: string,
  port: number,
  path: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpGet({ host, port, path, timeout: 2000 }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

// 订阅刷新事件，返回“收到 reload”的 promise 和关闭函数
function listenReload(port: number): { reloaded: Promise<void>; close(): void } {
  let close = () => {};
  const reloaded = new Promise<void>((resolve, reject) => {
    const req = httpGet({ host: "127.0.0.1", port, path: RELOAD_EVENTS_PATH }, (res) => {
      res.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("reload")) resolve();
      });
    });
    req.on("error", reject);
    close = () => req.destroy();
    setTimeout(() => reject(new Error("10 秒内没有收到刷新通知")), 10_000).unref();
  });
  return { reloaded, close: () => close() };
}

export async function smokeStatic(id: string): Promise<void> {
  const templateDir = join(repoRoot, "templates", "builtin", id);
  const template = JSON.parse(readFileSync(join(templateDir, "template.json"), "utf8")) as Template;
  const work = mkdtempSync(join(tmpdir(), `runyard-smoke-${id}-`));
  let stopServer: (() => Promise<void>) | undefined;
  try {
    cpSync(join(templateDir, "files"), work, { recursive: true });
    for (const file of template.substitute ?? []) {
      const path = join(work, file);
      writeFileSync(path, readFileSync(path, "utf8").replaceAll("{{name}}", "smoke"));
    }
    const platform = getPlatform({ home: absPath(join(work, ".home")) });
    const port = await freePort();
    const handle = await createStaticServer({ platform })({ folder: absPath(work), port })();
    stopServer = () => handle.dispose();

    const first = await fetchText("127.0.0.1", port, "/");
    if (first.status !== 200 || !first.body.includes("smoke"))
      throw new Error(`首页不对：${first.status}`);
    if (!first.body.includes(RELOAD_EVENTS_PATH)) throw new Error("首页没有注入自动刷新脚本");
    log("就绪", `GET / 返回 ${first.status}，带自动刷新脚本`);

    const onIpv6 = await fetchText("::1", port, "/").then(
      () => true,
      () => false,
    );
    if (onIpv6) throw new Error("服务还监听了 ::1，应该只监听 127.0.0.1");
    log("监听地址", "只在 127.0.0.1");

    const entry = join(work, template.entry);
    const listener = listenReload(port);
    // 订阅建立之后再改文件，避免通知先于订阅发生
    await new Promise((resolve) => setTimeout(resolve, 500));
    writeFileSync(entry, readFileSync(entry, "utf8").replace("Clicked", "Pressed"));
    await listener.reloaded.finally(() => listener.close());
    const second = await fetchText("127.0.0.1", port, `/${template.entry}`);
    if (!second.body.includes("Pressed")) throw new Error("改入口文件后内容没有更新");
    log("自动刷新", `${template.entry} 改后收到刷新通知，新内容已可取`);

    await handle.dispose();
    stopServer = undefined;
    const released = await fetchText("127.0.0.1", port, "/").then(
      () => false,
      () => true,
    );
    if (!released) throw new Error("停止后端口还在响应");
    log("停止", "端口已释放");
    log("全部通过", id);
  } finally {
    await stopServer?.();
    rmSync(work, { recursive: true, force: true }); // delete-allow: 冒烟自己建的临时目录
  }
}
