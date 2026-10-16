import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

// 在 127.0.0.1 上提供一个构建好的目录（只读）。截图用它而不用 file://：
// 模块脚本在 file:// 下被浏览器拦（跨源）。端口交给系统挑，用完就关。

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

export async function serveDirectory(
  dir: string,
): Promise<{ url: string; stop: () => Promise<void> }> {
  const root = resolve(dir);
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    const file = resolve(join(root, pathname === "/" ? "index.html" : pathname));
    // 解析后必须还在目录里面，挡住 ../ 之类的路径
    const inside = relative(root, file);
    if (inside.startsWith("..") || isAbsolute(inside)) {
      response.writeHead(403).end();
      return;
    }
    readFile(file).then(
      (body) => {
        response.writeHead(200, {
          "content-type": TYPES[extname(file)] ?? "application/octet-stream",
        });
        response.end(body);
      },
      () => response.writeHead(404).end(),
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("静态服务器没有拿到端口");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    stop: () =>
      new Promise<void>((done) => {
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}
