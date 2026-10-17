import type { RunSnapshot } from "@runyard/protocol";
import { latestRunByPlayground, previewUrlFor } from "./build-library-state.ts";
import type { PreviewHost } from "./controller-hosts.ts";

// 正显示着的页面所属的服务崩溃了：预览视图马上要销毁，先截下最后一帧留给“崩溃”画面（规格 DESKTOP-WORKSPACE-21）。
// 只有这一次读取让它从“有页面”变成“崩溃”才截；截不到是 null。
export async function frameBeforeCrash(
  preview: PreviewHost,
  playgroundId: string,
  before: readonly RunSnapshot[],
  after: readonly RunSnapshot[],
): Promise<string | null> {
  if (previewUrlFor(playgroundId, before) === null) return null;
  if (previewUrlFor(playgroundId, after) !== null) return null;
  if (latestRunByPlayground(after).get(playgroundId)?.state !== "crashed") return null;
  return preview.capture().catch(() => null);
}
