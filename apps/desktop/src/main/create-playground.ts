import type { Notice } from "@runyard/protocol";
import type { CreateRequest } from "../shared/desktop-bridge.ts";
import type { DesktopError } from "../shared/library-state.ts";
import { toDesktopError } from "./desktop-error.ts";
import type { LibraryClient } from "./library-controller.ts";

export type CreatedPlayground =
  | { ok: true; id: string; name: string; notices: readonly Notice[] }
  | { ok: false; error: DesktopError };

/** 向管理进程创建项目（创建者是用户）；没写备注、没开自动清理的就不传，项目是“已保留”。被拒绝的错误交回，不抛 */
export async function createPlayground(
  client: LibraryClient,
  request: CreateRequest,
): Promise<CreatedPlayground> {
  try {
    const result = await client.call("playground.create", {
      template: request.template,
      name: request.name,
      ...(request.note === "" ? {} : { note: request.note }),
      ...(request.autoClean === null ? {} : { autoClean: request.autoClean }),
      ifExists: "fail",
      createdBy: { kind: "user" },
    });
    return {
      ok: true,
      id: result.playground.id,
      name: result.playground.name,
      notices: result.notices ?? [],
    };
  } catch (error) {
    return { ok: false, error: toDesktopError(error) };
  }
}
