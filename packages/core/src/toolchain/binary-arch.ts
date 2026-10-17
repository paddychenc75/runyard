import type { AbsPath, Platform } from "@runyard/platform";

// 读可执行文件开头的 Mach-O 头，得出它是为哪种芯片编的（设置页“运行环境”表的“芯片架构”列，
// 规格 DESKTOP-SETTINGS-15）。只认 macOS 的 Mach-O（单一架构和通用二进制）；脚本、读不出来的都是 undefined。
// 同一个文件夹里 arm64 的 Mac 上跑 x64 的 Node（Rosetta）是常见的坑，所以要看文件本身，不是看本机芯片。

const MACH_O_MAGIC_64 = 0xfeedfacf;
const MACH_O_MAGIC_32 = 0xfeedface;
const FAT_MAGIC = 0xcafebabe;
const FAT_MAGIC_64 = 0xcafebabf;
const CPU_ARM64 = 0x0100000c;
const CPU_X64 = 0x01000007;

export type BinaryArch = "arm64" | "x64" | "universal";

/** 头部够用的长度：通用二进制最多列几个架构，每项 32 字节 */
export const BINARY_HEAD_BYTES = 8 + 32 * 8;

function archOf(cpu: number): "arm64" | "x64" | undefined {
  if (cpu === CPU_ARM64) return "arm64";
  if (cpu === CPU_X64) return "x64";
  return undefined;
}

export function parseBinaryArch(head: Uint8Array): BinaryArch | undefined {
  if (head.length < 8) return undefined;
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const magicLittle = view.getUint32(0, true);
  if (magicLittle === MACH_O_MAGIC_64 || magicLittle === MACH_O_MAGIC_32) {
    return archOf(view.getUint32(4, true));
  }
  const magic = view.getUint32(0, false);
  if (magic !== FAT_MAGIC && magic !== FAT_MAGIC_64) return undefined;
  // Java 的 class 文件也以 cafebabe 开头，后面是版本号；架构个数不合理就不是通用二进制
  const count = view.getUint32(4, false);
  if (count === 0 || count > 8) return undefined;
  const entry = magic === FAT_MAGIC ? 20 : 32;
  const found = new Set<"arm64" | "x64">();
  for (let index = 0; index < count; index += 1) {
    const at = 8 + index * entry;
    if (at + 4 > head.length) break;
    const arch = archOf(view.getUint32(at, false));
    if (arch !== undefined) found.add(arch);
  }
  if (found.size === 0) return undefined;
  return found.size === 2 ? "universal" : [...found][0];
}

export async function detectBinaryArch(
  fs: Pick<Platform["fs"], "readHead">,
  path: AbsPath,
): Promise<BinaryArch | undefined> {
  try {
    const head = await fs.readHead(path, BINARY_HEAD_BYTES);
    return head === null ? undefined : parseBinaryArch(head);
  } catch {
    return undefined;
  }
}
