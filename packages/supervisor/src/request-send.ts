import http from "node:http";
import {
  REQUEST_TIMEOUT_MS,
  type RequestFailureReason,
  type RequestHeader,
  type RequestResult,
  type RequestSpec,
} from "@runyard/protocol";
import type { SupervisorClock } from "./supervisor-clock.ts";

// 请求面板的一次请求（规格 DESKTOP-REQUEST-PANEL-02 至 07）。
// 安全边界：主机固定写成 127.0.0.1，端口是调用方从运行里取的；调用方只给路径，
// 用 `http.request` 的选项分开传主机、端口、路径，而不是拼成 URL 再解析——
// 所以路径里写 `//example.com/x` 或 `@evil/` 都只是路径，改变不了目标。

/** 响应体最多收这么多，再多按失败处理：面板只是看一眼，不是下载器 */
export const REQUEST_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

// 这两个头由我们按请求体算，用户填的丢掉，免得和实际发出的字节数对不上
const MANAGED_HEADERS = new Set(["content-length", "transfer-encoding"]);

export interface SendOptions {
  readonly port: number;
  readonly request: RequestSpec;
  readonly clock: SupervisorClock;
}

export function sendLocalRequest(options: SendOptions): Promise<RequestResult> {
  const { port, request, clock } = options;
  const startedAt = clock.now();
  return new Promise<RequestResult>((resolve) => {
    let settled = false;
    let timer: number | undefined;
    let outgoing: http.ClientRequest | undefined;
    const settle = (result: RequestResult | RequestFailureReason) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clock.clearTimeout(timer);
      outgoing?.destroy();
      const durationMs = Math.max(0, clock.now() - startedAt);
      resolve(
        typeof result === "string"
          ? { outcome: "failed", reason: result, durationMs }
          : { ...result, durationMs },
      );
    };

    const sendsBody = request.method !== "GET" && request.payload !== "";
    const payload = sendsBody ? Buffer.from(request.payload, "utf8") : undefined;
    const headers: Record<string, string | string[]> = {};
    for (const { name, value } of request.headers) {
      if (MANAGED_HEADERS.has(name.toLowerCase())) continue;
      const key = name.toLowerCase();
      const existing = headers[key];
      headers[key] =
        existing === undefined
          ? value
          : Array.isArray(existing)
            ? [...existing, value]
            : [existing, value];
    }
    if (payload !== undefined) headers["content-length"] = String(payload.length);

    try {
      outgoing = http.request({
        host: "127.0.0.1",
        port,
        method: request.method,
        path: request.path,
        headers,
        // 不复用连接：服务重载后旧连接已经死了，复用会得到一次莫名的断开
        agent: false,
      });
    } catch {
      // 头名、头值或路径里有 Node 不接受的字符
      settle("invalid-request");
      return;
    }
    timer = clock.setTimeout(() => settle("timeout"), REQUEST_TIMEOUT_MS);
    outgoing.on("error", (error: NodeJS.ErrnoException) => {
      settle(error.code === "ECONNREFUSED" ? "unreachable" : "disconnected");
    });
    outgoing.on("response", (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > REQUEST_MAX_RESPONSE_BYTES) {
          settle("too-large");
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", () => settle("disconnected"));
      // 对方在发完之前关了连接：complete 为 false
      response.on("close", () => {
        if (!response.complete) settle("disconnected");
      });
      response.on("end", () => {
        const status = response.statusCode ?? 0;
        const raw = response.rawHeaders;
        const responseHeaders: RequestHeader[] = [];
        for (let i = 0; i + 1 < raw.length; i += 2) {
          responseHeaders.push({ name: raw[i] as string, value: raw[i + 1] as string });
        }
        settle({
          outcome: "response",
          status,
          statusText: response.statusMessage || http.STATUS_CODES[status] || "",
          durationMs: 0,
          size,
          headers: responseHeaders,
          payload: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    outgoing.end(payload);
  });
}
