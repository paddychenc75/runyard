/// <reference types="node" />
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker as NodeWorker } from "node:worker_threads";

// 测试里的真后台线程：把和正式构建同一份 ts.worker 打成 CommonJS，放进 node 的 worker_threads 里跑，
// 再用一层小壳把 Monaco 用的 Web Worker 接口（postMessage、addEventListener、onmessage）接上去。
// 这样补全、跳转、诊断、改名走的是真的 TypeScript 语言服务，不是假的（jsdom 自己起不了线程）。
// 产物放在 node_modules/.cache（已被 git 忽略、每次覆盖同一个文件），不在系统临时目录里留东西。

const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), "..");

// 线程内的壳：self、postMessage、addEventListener、onmessage 都转给 parentPort
const SHIM = `
const { parentPort } = require("node:worker_threads");
globalThis.self = globalThis;
globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
let handler = null;
Object.defineProperty(globalThis, "onmessage", {
  get: () => handler,
  set: (fn) => { handler = fn; },
});
parentPort.on("message", (data) => {
  if (handler) handler({ data });
});
globalThis.addEventListener = (type, fn) => {
  if (type === "message") parentPort.on("message", (data) => fn({ data }));
};
`;

let built: Promise<Record<string, string>> | undefined;

/**
 * 打出各个 worker 的测试版（名字到文件路径）；同一个进程里只打一次。
 * esbuild 在 jsdom 环境里加载不了（TextEncoder 的类型对不上），所以放进 node 的一个线程里打，那里没有 jsdom。
 */
function buildWorkers(): Promise<Record<string, string>> {
  built ??= new Promise((resolve, reject) => {
    const script = join(dirname(fileURLToPath(import.meta.url)), "monaco-test-worker-build.ts");
    const builder = new NodeWorker(script, { workerData: { desktop: DESKTOP, shim: SHIM } });
    builder.once("message", (files: Record<string, string>) => resolve(files));
    builder.once("error", reject);
  });
  return built;
}

/** 把全局的 Worker 换成 node 线程版：Monaco 按地址里的名字（ts.worker、css.worker……）起对应的真线程 */
export async function installRealWorkers(): Promise<void> {
  const files = await buildWorkers();
  (globalThis as unknown as { Worker: unknown }).Worker = class extends NodeBackedWorker {
    constructor(url: string | URL) {
      const name = String(url).split("/").pop()?.replace(/\.js$/, "") ?? "";
      const file = files[name];
      if (file === undefined) throw new Error(`没有这个 worker 的测试版：${String(url)}`);
      super(file);
    }
  };
}

type Listener = (event: { data: unknown }) => void;

/** Monaco 眼里的 Web Worker，背后是 node 线程 */
export class NodeBackedWorker {
  readonly #thread: NodeWorker;
  readonly #listeners = new Set<Listener>();
  onmessage: Listener | null = null;

  constructor(file: string) {
    this.#thread = new NodeWorker(file);
    this.#thread.on("message", (data: unknown) => {
      this.onmessage?.({ data });
      for (const listener of this.#listeners) listener({ data });
    });
    this.#thread.on("error", (error: unknown) => console.error("test ts worker error", error));
  }

  postMessage(message: unknown): void {
    this.#thread.postMessage(message);
  }

  addEventListener(type: string, listener: Listener): void {
    if (type === "message") this.#listeners.add(listener);
  }

  removeEventListener(_type: string, listener: Listener): void {
    this.#listeners.delete(listener);
  }

  terminate(): void {
    void this.#thread.terminate();
  }
}
