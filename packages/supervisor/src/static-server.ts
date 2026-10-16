import { readFile, realpath } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { StaticServer } from "@runyard/core";
import { type Disposable, type Platform, posixRelPath } from "@runyard/platform";
import { contentTypeOf } from "./static-mime.ts";
import { resolveStaticFile } from "./static-path.ts";
import { injectReloadScript, RELOAD_EVENTS_PATH } from "./static-reload.ts";

// 静态页面服务（规格 TEMPLATES-RUNNERS-08 到 11；技术设计 §4.4、§4.5）：`static` 运行器不起子进程，
// 页面由管理进程自己托管。只绑 127.0.0.1；每次请求都现读文件，不缓存；文件变了经 SSE 通知页面刷新。

const LOOPBACK = "127.0.0.1";
/** 这些目录里的变化不触发刷新：应用自己的数据、依赖和版本库 */
const WATCH_IGNORE = [".runyard", "node_modules", ".git"].map(posixRelPath);

const COMMON_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function plain(response: ServerResponse, status: number, allow?: string): void {
  response.writeHead(status, {
    ...COMMON_HEADERS,
    "Content-Type": "text/plain; charset=utf-8",
    ...(allow === undefined ? {} : { Allow: allow }),
  });
  response.end();
}

async function serveFile(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
): Promise<void> {
  const resolved = await resolveStaticFile(root, request.url ?? "/");
  if (resolved.status !== "file") return plain(response, resolved.status);
  const type = contentTypeOf(resolved.file);
  let body: Buffer;
  try {
    const bytes = await readFile(resolved.file);
    body = type.startsWith("text/html")
      ? Buffer.from(injectReloadScript(bytes.toString("utf8")), "utf8")
      : bytes;
  } catch {
    return plain(response, 404); // 检查之后文件被删了
  }
  response.writeHead(200, {
    ...COMMON_HEADERS,
    "Content-Type": type,
    "Content-Length": body.length,
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

export function createStaticServer(deps: {
  readonly platform: Pick<Platform, "watch">;
}): StaticServer {
  return ({ folder, port }) =>
    async () => {
      const root = await realpath(folder);
      const listeners = new Set<ServerResponse>();

      const server = createServer((request, response) => {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return plain(response, 405, "GET, HEAD");
        }
        if (request.url?.split("?", 1)[0] === RELOAD_EVENTS_PATH) {
          response.writeHead(200, {
            ...COMMON_HEADERS,
            "Content-Type": "text/event-stream; charset=utf-8",
            Connection: "keep-alive",
          });
          response.write(": connected\n\n");
          listeners.add(response);
          response.on("close", () => void listeners.delete(response));
          return;
        }
        serveFile(request, response, root).catch(() => {
          if (!response.headersSent) plain(response, 500);
          else response.destroy();
        });
      });

      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen({ port, host: LOOPBACK, exclusive: true }, () => {
          server.off("error", reject);
          resolve();
        });
      });

      // 监听失败只是没有自动刷新，页面照常可用
      const watcher: Disposable | undefined = await deps.platform
        .watch(folder, { ignore: WATCH_IGNORE }, () => {
          for (const listener of listeners) listener.write("data: reload\n\n");
        })
        .catch(() => undefined);

      let disposed: Promise<void> | undefined;
      return {
        dispose: () => {
          // 先断开所有连接再等 close：SSE 连接不会自己结束，不断开 close 永远不返回
          disposed ??= (async () => {
            await watcher?.dispose();
            for (const listener of listeners) listener.end();
            listeners.clear();
            await new Promise<void>((resolve) => {
              server.close(() => resolve());
              server.closeAllConnections();
            });
          })();
          return disposed;
        },
      };
    };
}
