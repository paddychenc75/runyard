import { type ChildProcess, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

// Vue 语言服务的冒烟脚本（#411，决策记录 0021），只在开发和 CI 用。
//   node tooling/scripts/vue-language-service-smoke.ts --app <Runyard.app>
//   node tooling/scripts/vue-language-service-smoke.ts --electron <可执行文件> --service-dir <语言服务目录>
// 从打包产物里的语言服务目录，用 ELECTRON_RUN_AS_NODE=1 加 --permission（只给项目文件夹和语言服务目录的读权限）
// 起 Vue 语言服务器和带 Vue 插件的 tsserver，对测试组件做一次模板属性名补全，拿到 title、count 即通过。
// 两个进程的协议细节照证据 vue-intellisense.md“踩到的坑”：tsserver/request 的参数多包一层、回复的是响应的 body。
// 进程管理的正式实现是 #412；这里只验证“目录里的文件够用”，不是它的雏形。

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const app = option("--app");
const electron =
  option("--electron") ?? (app ? join(app, "Contents", "MacOS", "Runyard") : undefined);
const serviceDir =
  option("--service-dir") ??
  (app ? join(app, "Contents", "Resources", "vue-language-service") : undefined);
if (!electron || !serviceDir) {
  console.error(
    "用法：--app <Runyard.app>，或 --electron <可执行文件> --service-dir <语言服务目录>",
  );
  process.exit(2);
}
const service = realpathSync(resolve(serviceDir));

// 每次在新的临时目录里跑；HOME 也指到临时目录，万一权限参数没生效也碰不到真实数据
const work = realpathSync(mkdtempSync(join(tmpdir(), "ry-vue-smoke-")));
const project = join(work, "project");
cpSync(join(import.meta.dirname, "vue-smoke-fixture"), project, { recursive: true });
// 项目里要有真实的 vue 类型（Vue 语言服务读的是项目自己的 node_modules）：把仓库里装的 vue 及其依赖里的类型声明拷过来。
// 权限模型只放行项目文件夹，所以必须是真实文件，不能是指向仓库的符号链接
const copied = new Set<string>();
function copyTypes(name: string, from: string) {
  if (copied.has(name)) return;
  copied.add(name);
  // 沿目录向上找 node_modules/<name>；pnpm 的依赖是符号链接，所以从真实目录起找
  let dir = from;
  while (!existsSync(join(dir, "node_modules", name, "package.json"))) {
    if (dirname(dir) === dir) throw new Error(`找不到 ${name}`);
    dir = dirname(dir);
  }
  const source = realpathSync(join(dir, "node_modules", name));
  cpSync(source, join(project, "node_modules", name), {
    recursive: true,
    filter: (path) =>
      path === source ||
      (statSync(path).isDirectory()
        ? !path.endsWith(`${sep}node_modules`)
        : path.endsWith("package.json") || /\.d\.[cm]?ts$/.test(path)),
  });
  const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  for (const dependency of Object.keys(manifest.dependencies ?? {})) copyTypes(dependency, source);
}
copyTypes("vue", import.meta.dirname);

const guard = join(work, "net-guard.cjs");
writeFileSync(
  guard,
  // 联网守卫的最小版：只证明被守卫挡住的写法不影响语言服务；正式的守卫脚本随 #412
  'const net=require("node:net");const deny=()=>{throw new Error("network disabled")};net.connect=net.createConnection=deny;net.Socket.prototype.connect=deny;globalThis.fetch=deny;\n',
);

const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1", HOME: work };
const permission = [
  "--permission",
  `--allow-fs-read=${project}`,
  `--allow-fs-read=${service}`,
  `--allow-fs-read=${work}`,
  "--require",
  guard,
];
const tsdk = join(service, "typescript", "lib");

const children: ChildProcess[] = [];
function stopAll() {
  for (const child of children) child.kill();
}
process.on("exit", stopAll);
const timer = setTimeout(() => {
  console.error("冒烟超时（60 秒）");
  stopAll();
  process.exit(1);
}, 60_000);

// ---- 协议 ----
interface Message {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  request_seq?: number;
  body?: unknown;
  type?: string;
}

function frames(onMessage: (message: Message) => void) {
  let buffer = Buffer.alloc(0);
  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const match = /Content-Length: (\d+)\r\n\r\n/.exec(buffer.toString("latin1"));
      if (!match) return;
      const start = match.index + match[0].length;
      const end = start + Number(match[1]);
      if (buffer.length < end) return;
      onMessage(JSON.parse(buffer.subarray(start, end).toString("utf8")) as Message);
      buffer = buffer.subarray(end);
    }
  };
}

const tsserver = spawn(
  electron,
  [
    ...permission,
    join(tsdk, "tsserver.js"),
    "--globalPlugins",
    "@vue/typescript-plugin",
    "--pluginProbeLocations",
    service,
    "--disableAutomaticTypingAcquisition",
    "--suppressDiagnosticEvents",
    "--locale",
    "en",
  ],
  { cwd: project, env, stdio: ["pipe", "pipe", "pipe"] },
);
const vue = spawn(
  electron,
  [...permission, join(service, "server", "vue-language-server.cjs"), "--stdio", `--tsdk=${tsdk}`],
  { cwd: project, env, stdio: ["pipe", "pipe", "pipe"] },
);
children.push(tsserver, vue);
for (const [name, child] of [
  ["tsserver", tsserver],
  ["vue", vue],
] as const) {
  child.stderr?.on("data", (data: Buffer) => process.stderr.write(`[${name}] ${data}`));
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`${name} 进程异常退出，退出码 ${code}`);
      process.exit(1);
    }
  });
}

let tsSeq = 0;
const tsPending = new Map<number, (message: Message) => void>();
tsserver.stdout?.on(
  "data",
  frames((message) => {
    if (message.type === "response" && message.request_seq !== undefined) {
      tsPending.get(message.request_seq)?.(message);
    }
  }),
);
function tsRequest(command: string, argumentsOf: unknown): Promise<Message> {
  const seq = ++tsSeq;
  tsserver.stdin?.write(
    `${JSON.stringify({ seq, type: "request", command, arguments: argumentsOf })}\n`,
  );
  return new Promise((resolveRequest) => tsPending.set(seq, resolveRequest));
}

let lspId = 0;
const lspPending = new Map<number, (message: Message) => void>();
function lspSend(message: object) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }), "utf8");
  vue.stdin?.write(`Content-Length: ${body.length}\r\n\r\n`);
  vue.stdin?.write(body);
}
vue.stdout?.on(
  "data",
  frames((message) => {
    if (message.id !== undefined && message.method) {
      // 服务器发来的请求（取配置、注册能力）：配置给空，其余给 null
      const items = (message.params as { items?: unknown[] } | undefined)?.items;
      lspSend({
        id: message.id,
        result: message.method === "workspace/configuration" ? (items ?? []).map(() => null) : null,
      });
    } else if (message.id !== undefined) {
      lspPending.get(message.id)?.(message);
    } else if (message.method === "tsserver/request") {
      // 混合模式：Vue 服务器向 tsserver 要类型信息，由客户端转发，params 多包了一层
      const params = message.params as unknown[];
      const [id, command, commandArgs] = (Array.isArray(params[0]) ? params[0] : params) as [
        number,
        string,
        unknown,
      ];
      void tsRequest(command, commandArgs).then((response) => {
        lspSend({ method: "tsserver/response", params: [[id, response.body]] });
      });
    }
  }),
);
function lspRequest(method: string, params: unknown): Promise<Message> {
  const id = ++lspId;
  lspSend({ id, method, params });
  return new Promise((resolveRequest) => lspPending.set(id, resolveRequest));
}

// ---- 场景：<Child | /> 的属性名补全 ----
const file = join(project, "src", "Use.vue");
const uri = pathToFileURL(file).href;
const text = readFileSync(file, "utf8");
const offset = text.indexOf("<Child  />") + "<Child ".length;
const before = text.slice(0, offset).split("\n");
const position = { line: before.length - 1, character: before.at(-1)?.length ?? 0 };

await tsRequest("configure", { hostInfo: "runyard-smoke" });
await tsRequest("updateOpen", {
  openFiles: [{ file, fileContent: text, projectRootPath: project, scriptKindName: "TS" }],
});
await lspRequest("initialize", {
  processId: process.pid,
  rootUri: pathToFileURL(project).href,
  workspaceFolders: [{ uri: pathToFileURL(project).href, name: "project" }],
  capabilities: {
    textDocument: { completion: { completionItem: { snippetSupport: true } } },
    workspace: { configuration: true, workspaceFolders: true },
  },
  initializationOptions: { typescript: { tsdk } },
});
lspSend({ method: "initialized", params: {} });
lspSend({
  method: "textDocument/didOpen",
  params: { textDocument: { uri, languageId: "vue", version: 1, text } },
});

const started = performance.now();
const completion = await lspRequest("textDocument/completion", {
  textDocument: { uri },
  position,
});
const result = completion.result as { items?: { label: string }[] } | { label: string }[] | null;
const labels = ((Array.isArray(result) ? result : result?.items) ?? []).map((item) => item.label);
const wanted = ["title", "count"];
const missing = wanted.filter(
  (name) => !labels.some((label) => label.replace(/^[:@]|^v-bind:/, "") === name),
);

await lspRequest("shutdown", null);
lspSend({ method: "exit", params: null });
stopAll();
clearTimeout(timer);

if (missing.length > 0) {
  console.error(`补全里缺少 ${missing.join("、")}；拿到的候选：${labels.slice(0, 20).join(", ")}`);
  process.exit(1);
}
console.log(
  `通过：属性名补全含 ${wanted.join("、")}（${Math.round(performance.now() - started)} ms，语言服务目录 ${service}）`,
);
process.exit(0);
