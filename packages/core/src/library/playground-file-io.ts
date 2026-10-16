import { join } from "node:path";
import { type AbsPath, absPath, type Platform } from "@runyard/platform";
import {
  type PlaygroundFile,
  playgroundFileFormat,
  readVersionedText,
  serializeVersioned,
} from "@runyard/protocol";

// 项目文件夹里的 .runyard/playground.json 的读写。写入由调用方经平台层的 writeAtomic 完成，
// 这里只负责路径、解析和序列化。

export function playgroundFilePath(dir: AbsPath): AbsPath {
  return absPath(join(dir, ".runyard", "playground.json"));
}

export type PlaygroundFileRead =
  | { readonly status: "absent" }
  | { readonly status: "ok"; readonly value: PlaygroundFile }
  /** 更新版本写的：认得 id，但不改写 */
  | {
      readonly status: "newer";
      readonly id: string | null;
      readonly found: number;
      readonly supported: number;
    }
  | { readonly status: "corrupt" };

export async function readPlaygroundFile(
  fs: Pick<Platform["fs"], "readText">,
  dir: AbsPath,
): Promise<PlaygroundFileRead> {
  const text = await fs.readText(playgroundFilePath(dir));
  if (text === null) return { status: "absent" };
  const result = readVersionedText(playgroundFileFormat, text);
  if (result.status === "ok") return { status: "ok", value: result.value };
  if (result.status === "newer") {
    const id = result.raw.id;
    return {
      status: "newer",
      id: typeof id === "string" && id !== "" ? id : null,
      found: result.fileVersion,
      supported: result.supportedVersion,
    };
  }
  return { status: "corrupt" };
}

export function serializePlaygroundFile(file: PlaygroundFile): string {
  return serializeVersioned(playgroundFileFormat, file);
}
