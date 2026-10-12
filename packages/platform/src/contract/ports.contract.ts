import { Server } from "node:net";
import { basename } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { absPath } from "../path-types.ts";
import type { ContractContext } from "./context.ts";
import { ProcessLedger } from "./process-ledger.ts";
import { eventually, freePort, NetResources, startTree, WAIT_MS } from "./service-harness.ts";

// ports 的契约（规格 run/ports）。占用者用测试自己开的服务器或假程序进程。
export function portsContract(ctx: ContractContext): void {
  const platform = ctx.create(process.cwd());
  const cwd = absPath(process.cwd());

  let net: NetResources;
  let ledger: ProcessLedger;
  beforeEach(() => {
    net = new NetResources();
    ledger = new ProcessLedger(platform);
  });
  afterEach(async () => {
    await net.dispose();
    expect(await ledger.cleanup(), "测试结束时不应有进程遗留").toEqual([]);
  });

  describe("ports.isFree", () => {
    it("没人占用的端口是 free，探测完不留下监听", async () => {
      const port = await freePort();
      expect(await platform.ports.isFree(port)).toBe("free");
      expect(await platform.ports.isFree(port)).toBe("free");
      // 探测的套接字已关：自己还能绑上
      expect(await net.listen("127.0.0.1", port)).not.toBeNull();
    });

    it("占用者在 127.0.0.1 上：in-use", async () => {
      const held = await net.listen("127.0.0.1");
      expect(await platform.ports.isFree(held?.port ?? 0)).toBe("in-use");
    });

    it("[RUN-PORTS-11] 占用者监听在 0.0.0.0 上：in-use", async () => {
      const held = await net.listen("0.0.0.0");
      expect(held).not.toBeNull();
      expect(await platform.ports.isFree(held?.port ?? 0)).toBe("in-use");
    });

    it("占用者在 ::1 上：in-use（这台机器没有 IPv6 回环时不适用）", async () => {
      const held = await net.listen("::1");
      if (held === null) return;
      expect(await platform.ports.isFree(held.port)).toBe("in-use");
    });

    it("[RUN-PORTS-11] 探测本身只绑回环地址，从不绑 0.0.0.0 或所有地址", async () => {
      const busy = await net.listen("0.0.0.0");
      const free = await freePort();
      const listen = vi.spyOn(Server.prototype, "listen");
      try {
        await platform.ports.isFree(free);
        await platform.ports.isFree(busy?.port ?? 0);
        const hosts = listen.mock.calls.map((call) => {
          const first = call[0];
          return typeof first === "object" && first !== null
            ? (first as { host?: string }).host
            : undefined;
        });
        expect(hosts.length).toBeGreaterThan(0);
        for (const host of hosts) expect(["127.0.0.1", "::1"]).toContain(host);
      } finally {
        listen.mockRestore();
      }
    });
  });

  describe("ports.occupant", () => {
    it("返回占用者的进程号和名字", async () => {
      const port = await freePort();
      const tree = await startTree(platform, ledger, { listen: port }, cwd);
      const occupant = await platform.ports.occupant(port);
      expect(occupant?.pid).toBe(tree.proc.ref.pid);
      expect(occupant?.name).toBe(basename(process.execPath));
      await platform.proc.terminate(tree.proc.ref, { mode: "kill", graceMs: 0 });
    });

    it("占用者监听在 0.0.0.0 上也查得到（这里是测试进程自己）", async () => {
      const held = await net.listen("0.0.0.0");
      const occupant = await platform.ports.occupant(held?.port ?? 0);
      expect(occupant?.pid).toBe(process.pid);
    });

    it("端口空闲或查不到时返回 null", async () => {
      expect(await platform.ports.occupant(await freePort())).toBeNull();
    });
  });

  describe("ports.connections", () => {
    it("数已建立的连接（只数服务端那一侧），关闭后归零", async () => {
      const held = await net.listen("127.0.0.1");
      const port = held?.port ?? 0;
      expect(await platform.ports.connections(port)).toBe(0);
      const clients = [await net.connect(port), await net.connect(port), await net.connect(port)];
      await eventually(
        async () => (await platform.ports.connections(port)) === 3,
        WAIT_MS,
        "三条连接",
      );
      for (const client of clients) client.destroy();
      await eventually(
        async () => (await platform.ports.connections(port)) === 0,
        WAIT_MS,
        "连接归零",
      );
    });
  });

  describe("ports.loopbackOnly", () => {
    it("[RUN-PORTS-12] 只监听 127.0.0.1：true", async () => {
      const held = await net.listen("127.0.0.1");
      expect(await platform.ports.loopbackOnly(held?.port ?? 0)).toBe(true);
    });

    it("[RUN-PORTS-12] 监听在 0.0.0.0 上：false", async () => {
      const held = await net.listen("0.0.0.0");
      expect(await platform.ports.loopbackOnly(held?.port ?? 0)).toBe(false);
    });

    it("没有监听者：false（没有东西可以保证）", async () => {
      expect(await platform.ports.loopbackOnly(await freePort())).toBe(false);
    });
  });
}
