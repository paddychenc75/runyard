// 八个运行器各自的最小项目。项目文件在运行时写进临时目录，不放进仓库：
// 这些只是被启动、被停止的靶子，版本取自技术设计 §8.6.5（被 14 天规则挡住的退到同一条线上最新的可装版本，见 README）。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const isWin = process.platform === "win32";

// 每个临时项目自带的 pnpm 设置：14 天规则照旧；安装脚本一个都不跑（false = 明确跳过，不是放行）。
const pnpmWorkspace = (storeRoot) => `packages:
  - "."
minimumReleaseAge: 20160
savePrefix: ""
allowBuilds:
  esbuild: false
  sharp: false
  "@parcel/watcher": false
  unrs-resolver: false
  "@swc/core": false
  core-js: false
  vue-demi: false
# 仓库和缓存都放在临时目录里：不碰用户自己的 pnpm 仓库，中途强杀也伤不到它
storeDir: ${JSON.stringify(join(storeRoot, "_pnpm", "store"))}
cacheDir: ${JSON.stringify(join(storeRoot, "_pnpm", "cache"))}
`;

// 所有靶子都提供 /slow：10 秒后才回应，用来制造“请求进行中”的停止。
const SLOW_MS = 10000;

const NODE_SERVER = (banner) => `import { createServer } from "node:http";
const port = Number(process.env.PORT);
createServer((req, res) => {
  if (req.url === "/slow") { setTimeout(() => res.end("slow"), ${SLOW_MS}); return; }
  res.setHeader("content-type", "text/html");
  res.end("<h1>${banner}</h1>");
}).listen(port, "127.0.0.1", () => console.log("listening", port));
`;

const VITE_ARGS = ["--port", "{port}", "--strictPort", "--host", "127.0.0.1"];

export const RUNNERS = {
  // 设计里静态页面由管理进程自己托管、不起进程（§4.4 kind=static）。这里另起一个 node 进程当替身，只为量一棵最简单的树；
  // 进程内托管的版本见 run.mjs 的 static-inproc。
  static: {
    files: { "server.mjs": NODE_SERVER("static"), "index.html": "<h1>static</h1>" },
    run: ["node", "server.mjs"],
  },
  vite: {
    files: {
      "package.json": JSON.stringify(
        {
          name: "k2-vite",
          private: true,
          type: "module",
          dependencies: { react: "19.3.0", "react-dom": "19.3.0" },
          devDependencies: { vite: "8.3.1", "@vitejs/plugin-react": "6.1.1" },
        },
        null,
        2,
      ),
      "vite.config.js": `import react from "@vitejs/plugin-react";
const slow = { name: "k2-slow", configureServer(server) {
  server.middlewares.use("/slow", (_req, res) => setTimeout(() => res.end("slow"), ${SLOW_MS}));
} };
export default { plugins: [react(), slow] };
`,
      "index.html": `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`,
      "src/main.jsx": `import { createRoot } from "react-dom/client";
createRoot(document.getElementById("root")).render(<h1>vite</h1>);
`,
    },
    setup: ["pnpm", "install", "--prefer-offline"],
    // §4.4：直接用 node 跑 Vite 的入口文件，不经过 pnpm
    run: ["node", "node_modules/vite/bin/vite.js", ...VITE_ARGS],
    variants: { "vite-via-pnpm": ["pnpm", "exec", "vite", ...VITE_ARGS] },
    caches: ["node_modules/.vite"],
  },
  next: {
    files: {
      "package.json": JSON.stringify(
        {
          name: "k2-next",
          private: true,
          dependencies: { next: "16.3.6", react: "19.3.0", "react-dom": "19.3.0" },
        },
        null,
        2,
      ),
      "app/layout.js": `export default function Layout({ children }) { return <html><body>{children}</body></html>; }
`,
      "app/page.js": `export default function Page() { return <h1>next</h1>; }
`,
      "app/slow/route.js": `export async function GET() { await new Promise((r) => setTimeout(r, ${SLOW_MS})); return new Response("slow"); }
`,
    },
    setup: ["pnpm", "install", "--prefer-offline"],
    run: ["node", "node_modules/next/dist/bin/next", "dev", "-p", "{port}", "-H", "127.0.0.1"],
    caches: [".next"],
  },
  nuxt4: nuxt("4.5.2", "app/app.vue"),
  nuxt3: nuxt("3.21.11", "app.vue"),
  "node-ts": {
    files: {
      "main.ts": NODE_SERVER("node-ts").replace("const port = Number", "const port: number = Number"),
    },
    run: ["node", "main.ts"],
    variants: { "node-watch": ["node", "--watch", "main.ts"] },
  },
  python: {
    files: {
      "main.py": `import os, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/slow":
            time.sleep(${SLOW_MS / 1000})
        self.send_response(200)
        self.send_header("content-type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h1>python</h1>")
    def log_message(self, *a):
        pass

port = int(os.environ["PORT"])
print("listening", port, flush=True)
ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
`,
    },
    // 附录 A 第 20 行：python -u main.py。Windows 上没有 python3 这个名字（§7.2 第 10 行）
    run: [isWin ? "python" : "python3", "-u", "main.py"],
    variants: { "uv-run": ["uv", "run", "--no-project", "main.py"] },
  },
  go: {
    files: {
      "go.mod": "module k2go\n\ngo 1.26\n",
      "main.go": `package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

func main() {
	http.HandleFunc("/slow", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(${SLOW_MS} * time.Millisecond)
		fmt.Fprint(w, "slow")
	})
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "text/html")
		fmt.Fprint(w, "<h1>go</h1>")
	})
	addr := "127.0.0.1:" + os.Getenv("PORT")
	fmt.Println("listening", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}
`,
    },
    // go run 先编译，再把编译出的程序当子进程启动：经典的“孤儿进程”场景
    run: ["go", "run", "."],
  },
  hono: {
    files: {
      "package.json": JSON.stringify(
        {
          name: "k2-hono",
          private: true,
          type: "module",
          dependencies: { hono: "4.13.9", "@hono/node-server": "2.1.1" },
        },
        null,
        2,
      ),
      "src/index.ts": `import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();
app.get("/", (c) => c.html("<h1>hono</h1>"));
app.get("/slow", async (c) => { await new Promise((r) => setTimeout(r, ${SLOW_MS})); return c.text("slow"); });
const port: number = Number(process.env.PORT);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => console.log("listening", port));
`,
    },
    setup: ["pnpm", "install", "--prefer-offline"],
    run: ["node", "src/index.ts"],
  },
  // 对照组，不是运行器：用来证明“检查残留”的手段确实查得出残留，并量出每种停止办法的边界。
  // orphan：根进程起一个中间进程，中间进程起孙进程后自己退出，孙进程占着端口和输出管道。
  //   Windows 上 taskkill /T 顺着父进程号找不到它；POSIX 上它还在同一个进程组里。
  // escape：孙进程另起会话（detached），离开了进程组。
  orphan: { files: { "root.mjs": controlRoot(false) }, run: ["node", "root.mjs"], control: true },
  escape: { files: { "root.mjs": controlRoot(true) }, run: ["node", "root.mjs"], control: true },
};

function nuxt(version, appFile) {
  return {
    files: {
      "package.json": JSON.stringify(
        { name: `k2-nuxt-${version[0]}`, private: true, type: "module", dependencies: { nuxt: version, vue: "3.5.43" } },
        null,
        2,
      ),
      // 与官方起步模板一致：开着 devtools（它会多起进程，正是要看的）
      "nuxt.config.js": `export default defineNuxtConfig({ compatibilityDate: "2026-07-01", devtools: { enabled: true } });
`,
      [appFile]: `<template><h1>nuxt</h1></template>
`,
      "server/api/slow.js": `export default defineEventHandler(async () => { await new Promise((r) => setTimeout(r, ${SLOW_MS})); return "slow"; });
`,
    },
    setup: ["pnpm", "install", "--prefer-offline"],
    run: ["node", "node_modules/nuxt/bin/nuxt.mjs", "dev", "--port", "{port}", "--host", "127.0.0.1"],
    slowPath: "/api/slow",
    caches: [".nuxt", "node_modules/.cache"],
  };
}

function controlRoot(detached) {
  return `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
writeFileSync("grandchild.mjs", ${JSON.stringify(NODE_SERVER("control"))});
// 中间进程：起孙进程（继承输出管道），然后立刻退出
writeFileSync("middle.mjs", \`import { spawn } from "node:child_process";
const c = spawn(process.execPath, ["grandchild.mjs"], { stdio: ["ignore", "inherit", "inherit"], detached: ${detached} });
c.unref();
setTimeout(() => process.exit(0), 300);
\`);
spawn(process.execPath, ["middle.mjs"], { stdio: "inherit" });
setInterval(() => {}, 1000);
`;
}

// 把一个运行器的项目写进 dir
export function writeFixture(runnerId, dir, storeRoot) {
  const runner = RUNNERS[runnerId];
  for (const [rel, content] of Object.entries(runner.files)) {
    const file = join(dir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  if (runner.setup) writeFileSync(join(dir, "pnpm-workspace.yaml"), pnpmWorkspace(storeRoot));
}
