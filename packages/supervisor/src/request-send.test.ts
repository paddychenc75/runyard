import http from "node:http";
import type { AddressInfo } from "node:net";
import type { RequestSpec } from "@runyard/protocol";
import { FakeClock } from "@runyard/testing";
import { afterEach, describe, expect, it } from "vitest";
import { sendLocalRequest } from "./request-send.ts";

// 请求面板的一次请求：对着真实的本机 http 服务，时钟用假的（超时不真等 30 秒）。

interface Seen {
  method: string | undefined;
  url: string | undefined;
  headers: http.IncomingHttpHeaders;
  body: string;
}

const servers: http.Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

async function serve(
  handler: (req: http.IncomingMessage, res: http.ServerResponse, seen: Seen) => void,
): Promise<{ port: number; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const entry: Seen = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      seen.push(entry);
      handler(req, res, entry);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, seen };
}

const get = (path: string): RequestSpec => ({ method: "GET", path, headers: [], payload: "" });

describe("请求面板发请求", () => {
  it("[DESKTOP-REQUEST-PANEL-03] GET 拿到状态、原因、响应头和响应体", async () => {
    const { port } = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('[{"id":1}]');
    });
    const result = await sendLocalRequest({
      port,
      request: get("/todos"),
      clock: new FakeClock(),
    });
    expect(result).toMatchObject({
      outcome: "response",
      status: 200,
      statusText: "OK",
      size: 10,
      payload: '[{"id":1}]',
    });
    if (result.outcome !== "response") throw new Error("unreachable");
    expect(result.headers).toContainEqual({ name: "content-type", value: "application/json" });
  });

  it("[DESKTOP-REQUEST-PANEL-04] POST 带上请求头和请求体，服务原样收到", async () => {
    const { port, seen } = await serve((_req, res) => res.end("ok"));
    await sendLocalRequest({
      port,
      request: {
        method: "POST",
        path: "/todos",
        headers: [{ name: "content-type", value: "application/json" }],
        payload: '{"title":"中文 it\'s"}',
      },
      clock: new FakeClock(),
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      method: "POST",
      url: "/todos",
      body: '{"title":"中文 it\'s"}',
    });
    expect(seen[0]?.headers["content-type"]).toBe("application/json");
    // 长度按字节算，不是按字符数
    expect(seen[0]?.headers["content-length"]).toBe(
      String(Buffer.byteLength('{"title":"中文 it\'s"}')),
    );
  });

  it("[DESKTOP-REQUEST-PANEL-04] GET 不带请求体，用户填的 content-length 被丢掉", async () => {
    const { port, seen } = await serve((_req, res) => res.end("ok"));
    await sendLocalRequest({
      port,
      request: {
        method: "GET",
        path: "/",
        headers: [{ name: "Content-Length", value: "999" }],
        payload: "ignored",
      },
      clock: new FakeClock(),
    });
    expect(seen[0]?.body).toBe("");
    expect(seen[0]?.headers["content-length"]).toBeUndefined();
  });

  it("[DESKTOP-REQUEST-PANEL-02] 路径里写别的主机也只是路径，请求仍发到 127.0.0.1 的这个端口", async () => {
    const { port, seen } = await serve((_req, res) => res.end("ok"));
    const clock = new FakeClock();
    for (const path of ["//example.com/x", "/@evil.example/x", "/http://example.com/"]) {
      const result = await sendLocalRequest({ port, request: get(path), clock });
      expect(result.outcome).toBe("response");
    }
    expect(seen.map((s) => s.url)).toEqual([
      "//example.com/x",
      "/@evil.example/x",
      "/http://example.com/",
    ]);
  });

  it("[DESKTOP-REQUEST-PANEL-02] 路径里夹带换行或空格这类能拆出第二个请求的字符：拒绝发送", async () => {
    const { port, seen } = await serve((_req, res) => res.end("ok"));
    const result = await sendLocalRequest({
      port,
      request: get("/a HTTP/1.1\r\nHost: example.com\r\n\r\nGET /b"),
      clock: new FakeClock(),
    });
    expect(result).toMatchObject({ outcome: "failed", reason: "invalid-request" });
    expect(seen).toHaveLength(0);
  });

  it("[DESKTOP-REQUEST-PANEL-07] 服务不响应也不断开：满 30 秒报超时，不带任何响应", async () => {
    const { port } = await serve(() => undefined);
    const clock = new FakeClock();
    const pending = sendLocalRequest({ port, request: get("/hang"), clock });
    // 推进到 29.999 秒：还没超时
    await clock.advance(29_999);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    await clock.advance(1);
    expect(await pending).toEqual({ outcome: "failed", reason: "timeout", durationMs: 30_000 });
  });

  it("连不上本机端口：unreachable", async () => {
    const { port } = await serve((_req, res) => res.end());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const server = servers.pop() as http.Server;
    await new Promise((resolve) => server.close(resolve));
    const result = await sendLocalRequest({ port, request: get("/"), clock: new FakeClock() });
    expect(result).toMatchObject({ outcome: "failed", reason: "unreachable" });
  });

  it("[DESKTOP-REQUEST-PANEL-07] 服务中途断开：disconnected，不是之前的响应", async () => {
    const { port } = await serve((req) => req.socket.destroy());
    const result = await sendLocalRequest({ port, request: get("/"), clock: new FakeClock() });
    expect(result).toMatchObject({ outcome: "failed", reason: "disconnected" });
  });

  it("响应发到一半断开：disconnected", async () => {
    const { port } = await serve((_req, res) => {
      res.writeHead(200, { "content-length": "100" });
      res.write("partial");
      setTimeout(() => res.socket?.destroy(), 10);
    });
    const result = await sendLocalRequest({ port, request: get("/"), clock: new FakeClock() });
    expect(result).toMatchObject({ outcome: "failed", reason: "disconnected" });
  });
});
