import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { absPath, type Disposable, type Platform, type WatchEvent } from "@runyard/platform";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStaticServer } from "./static-server.ts";

// 静态页面服务的单元测试：真实的临时文件夹和回环上的 HTTP，文件监听用替身（只关心“有变化就通知”）。
// 请求用 node:http 直接发，因为 fetch 会先把 `/../` 规整掉，测不到服务端自己的防护。

let root: string;
let served: Disposable | undefined;
let notify: ((events: WatchEvent[]) => void) | undefined;
let watchDisposed = false;

const platform: Pick<Platform, "watch"> = {
  watch: async (_root, _options, callback) => {
    notify = callback;
    return {
      dispose: async () => {
        watchDisposed = true;
      },
    };
  },
};

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

async function start(): Promise<number> {
  const port = await freePort();
  served = await createStaticServer({ platform })({ folder: absPath(root), port })();
  return port;
}

function get(
  port: number,
  target: string,
  method = "GET",
): Promise<{
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: target, method }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
          headers: res.headers,
        }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

beforeEach(() => {
  // 项目文件夹在临时目录的子文件夹里，上一层放“不该被看到”的 secret.txt
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "ry-static-")));
  writeFileSync(join(parent, "secret.txt"), "top-secret");
  root = join(parent, "project");
  mkdirSync(join(root, ".runyard"), { recursive: true });
  writeFileSync(join(root, ".runyard", "playground.json"), "{}");
  writeFileSync(join(root, "index.html"), "<html><body><h1>A</h1></body></html>");
  writeFileSync(join(root, "style.css"), "body{}");
  watchDisposed = false;
  notify = undefined;
});

afterEach(async () => {
  await served?.dispose();
  served = undefined;
  rmSync(join(root, ".."), { recursive: true, force: true }); // delete-allow: 测试自己建的临时目录
});

describe("静态页面服务", () => {
  it("[TEMPLATES-RUNNERS-09] 改动立即可见：改了 index.html 再请求一次，响应里就是新内容，且不允许缓存", async () => {
    const port = await start();
    expect((await get(port, "/")).body).toContain("<h1>A</h1>");
    writeFileSync(join(root, "index.html"), "<html><body><h1>B</h1></body></html>");
    const again = await get(port, "/");
    expect(again.body).toContain("<h1>B</h1>");
    expect(again.headers["cache-control"]).toBe("no-store");
  });

  it("[TEMPLATES-RUNNERS-10] 不泄露项目之外的文件：`..`、编码的 `..`、反斜杠都得不到 secret.txt", async () => {
    const port = await start();
    for (const target of [
      "/../secret.txt",
      "/%2e%2e/secret.txt",
      "/%2E%2E/secret.txt",
      "/a/../../secret.txt",
      "/..%5Csecret.txt",
      "/%2e%2e%2fsecret.txt",
      "/..%00/secret.txt",
    ]) {
      const response = await get(port, target);
      expect([400, 403, 404], target).toContain(response.status);
      expect(response.body, target).not.toContain("top-secret");
    }
  });

  it("[TEMPLATES-RUNNERS-10] .runyard/ 不对外提供，也不列目录", async () => {
    const port = await start();
    expect((await get(port, "/.runyard/playground.json")).status).toBe(404);
    expect((await get(port, "/.RUNYARD/playground.json")).status).toBe(404);
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "a.txt"), "a");
    const listing = await get(port, "/sub/");
    expect(listing.status).toBe(404);
    expect(listing.body).not.toContain("a.txt");
  });

  it("HTML 响应注入刷新脚本（插在 </body> 之前），其他文件原样返回", async () => {
    const port = await start();
    const page = await get(port, "/");
    expect(page.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(page.body).toMatch(/<h1>A<\/h1><script>.*EventSource.*<\/script><\/body>/);
    expect(page.headers["content-length"]).toBe(String(Buffer.byteLength(page.body)));
    expect((await get(port, "/style.css")).body).toBe("body{}");
    writeFileSync(join(root, "bare.html"), "<p>no body tag</p>");
    expect((await get(port, "/bare.html")).body).toMatch(/^<p>no body tag<\/p><script>/);
  });

  it("只接受 GET 和 HEAD；不存在的文件是 404", async () => {
    const port = await start();
    expect((await get(port, "/", "POST")).status).toBe(405);
    const head = await get(port, "/", "HEAD");
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
    expect((await get(port, "/nope.html")).status).toBe(404);
  });

  it("文件变化后，已连接的页面经 SSE 收到刷新事件", async () => {
    const port = await start();
    const received = await new Promise<string>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path: "/__runyard/reload" }, (res) => {
        expect(res.headers["content-type"]).toContain("text/event-stream");
        let text = "";
        res.on("data", (chunk: Buffer) => {
          text += chunk.toString("utf8");
          if (text.includes(": connected") && !text.includes("data:")) {
            notify?.([{ kind: "change", path: "index.html" as WatchEvent["path"] }]);
          }
          if (text.includes("data: reload")) {
            req.destroy();
            resolve(text);
          }
        });
      });
      req.on("error", (error) => {
        if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") reject(error);
      });
      req.end();
    });
    expect(received).toContain("data: reload");
  });

  it("[TEMPLATES-RUNNERS-11] 释放：已建立的连接（含 SSE）全部断开，端口立刻可重新绑定，监听也停了", async () => {
    const port = await start();
    const open = new Promise<void>((resolve) => {
      const req = request({ host: "127.0.0.1", port, path: "/__runyard/reload" }, (res) => {
        res.on("data", () => resolve());
        res.on("close", () => resolved.push("closed"));
      });
      req.on("error", () => undefined);
      req.end();
    });
    const resolved: string[] = [];
    await open;
    await served?.dispose();
    served = undefined;
    expect(watchDisposed).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(resolved).toEqual(["closed"]);
    const rebind = createServer();
    await new Promise<void>((resolve, reject) => {
      rebind.once("error", reject);
      rebind.listen(port, "127.0.0.1", resolve);
    });
    await new Promise((resolve) => rebind.close(resolve));
  });
});
