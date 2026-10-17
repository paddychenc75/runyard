import { isPlatformError } from "@runyard/platform";
import type {
  EditorFileError,
  EditorFileErrorCode,
  EditorFileErrors,
  EditorFileResult,
} from "../../shared/editor-files.ts";

// 服务内部用抛出传递失败，最外层（run）统一折成结果；界面永远拿不到异常。

export class EditorFileFailure extends Error {
  readonly error: EditorFileError;
  constructor(error: EditorFileError) {
    super(error.code);
    this.name = "EditorFileFailure";
    this.error = error;
  }
}

export function fail<C extends EditorFileErrorCode>(
  code: C,
  params: EditorFileErrors[C],
): EditorFileFailure {
  return new EditorFileFailure({ code, params } as EditorFileError);
}

/** 执行并把失败折成结果。没预料到的异常归为 EDITOR_IO_FAILED，细节只进诊断，不给界面 */
export async function run<T>(path: string, action: () => Promise<T>): Promise<EditorFileResult<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    if (error instanceof EditorFileFailure) return { ok: false, error: error.error };
    return { ok: false, error: { code: "EDITOR_IO_FAILED", params: { path } } };
  }
}

export function errnoOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** 平台层抛出的 PATH_LOCKED（被占用或没权限）也算没权限 */
export function isPermissionError(error: unknown): boolean {
  const code = errnoOf(error);
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") return true;
  return isPlatformError(error) && error.error.code === "PATH_LOCKED";
}
