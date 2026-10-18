// 编辑器里的语言服务不读项目自己的 tsconfig，也不加载 node_modules 里的 @types/node（依赖文件夹不扫描，
// 新建的项目又还没装依赖），所以服务端模板里的 process.env.PORT 会报“找不到 process”（issue #443）。
// 这里内置一份最小的 Node 全局声明：只是让 process、Buffer 这些写服务和脚本必用的全局不误报，也有补全；
// 完整的 Node 类型等以后读项目依赖的类型时再说。
export const NODE_GLOBALS_PATH = "file:///node_modules/@runyard/node-globals/index.d.ts";

export const NODE_GLOBALS_SOURCE = `
interface RunyardNodeProcess {
  readonly env: Record<string, string | undefined>;
  readonly argv: string[];
  readonly platform: string;
  readonly pid: number;
  readonly version: string;
  readonly versions: Record<string, string>;
  exitCode?: number | string | null;
  cwd(): string;
  exit(code?: number): never;
  uptime(): number;
  on(event: string, listener: (...args: any[]) => void): this;
  once(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
  readonly stdout: { write(text: string | Uint8Array): boolean; readonly isTTY?: boolean };
  readonly stderr: { write(text: string | Uint8Array): boolean; readonly isTTY?: boolean };
}
declare var process: RunyardNodeProcess;
declare class Buffer extends Uint8Array {
  static from(data: string | ArrayLike<number> | ArrayBuffer, encoding?: string): Buffer;
  static alloc(size: number): Buffer;
  static concat(list: readonly Uint8Array[]): Buffer;
  toString(encoding?: string): string;
}
`;
