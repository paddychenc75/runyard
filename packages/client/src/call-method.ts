import {
  type MethodName,
  type MethodParams,
  type MethodResult,
  methodRegistry,
} from "@runyard/protocol";
import { clientError } from "./client-error.ts";
import type { Connection } from "./connection.ts";

// 带类型的一次调用：类型来自方法登记表。握手之后的版本比对（还没有 RunyardClient）和
// RunyardClient.call 共用这一处。
export async function callMethod<M extends MethodName>(
  connection: Connection,
  method: M,
  params: MethodParams<M>,
): Promise<MethodResult<M>> {
  const raw = await connection.request(method, params);
  const parsed = methodRegistry[method].result.safeParse(raw);
  if (!parsed.success) {
    // 出参不合登记表是管理进程或协议定义的缺陷，不是用户能处理的错误
    throw clientError("INTERNAL", {}, `result of ${method} does not match the registry`);
  }
  return parsed.data as MethodResult<M>;
}
