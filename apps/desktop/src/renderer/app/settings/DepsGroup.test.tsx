// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App.tsx";
import { type World, world } from "./settings-world.ts";

afterEach(cleanup);

async function openDeps(w: World) {
  const user = userEvent.setup();
  w.bridge.bootstrap.windowKind = "settings";
  render(<App bridge={w.bridge} />);
  await screen.findByRole("heading", { name: "依赖与网络" });
  return user;
}
const sets = (w: World) => w.calls.filter((c) => c.method === "settings.set").map((c) => c.param);
const input = (name: string) => screen.getByRole("textbox", { name }) as HTMLInputElement;

describe("依赖与网络", () => {
  it("[DESKTOP-SETTINGS-02] 包管理器改成 npm 立即保存，没有“保存”按钮", async () => {
    const w = world();
    const user = await openDeps(w);
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "npm" }));
    await waitFor(() => expect(w.settings().packageManager).toBe("npm"));
    expect(sets(w)).toEqual([{ packageManager: "npm" }]);
  });

  it("[DESKTOP-SETTINGS-12] 在“npm 镜像源”里填地址，离开输入框就保存，之后依赖安装用它", async () => {
    const w = world();
    const user = await openDeps(w);
    await user.type(input("npm 镜像源"), "https://registry.npmmirror.com");
    await user.tab();
    await waitFor(() =>
      expect(sets(w)).toEqual([
        { network: { noProxyLocal: true, registry: "https://registry.npmmirror.com" } },
      ]),
    );
    expect(w.settings().network.registry).toBe("https://registry.npmmirror.com");
  });

  it("[DESKTOP-SETTINGS-12] 按回车也保存，不合法之外的地址原样保存（含端口和路径）", async () => {
    const w = world();
    const user = await openDeps(w);
    await user.type(input("代理"), "http://127.0.0.1:7890{Enter}");
    await waitFor(() =>
      expect(sets(w)).toEqual([
        { network: { noProxyLocal: true, proxy: "http://127.0.0.1:7890" } },
      ]),
    );
  });

  it("[DESKTOP-SETTINGS-13] 没单独指定时输入框显示本机 .npmrc 的值并标为沿用；清空单独指定的值就恢复沿用", async () => {
    const w = world({
      initial: { network: { registry: "https://b.example", noProxyLocal: true } },
      on: { "settings.localNetwork": () => ({ registry: "https://a.example" }) },
    });
    const user = await openDeps(w);
    await waitFor(() => expect(input("npm 镜像源").value).toBe("https://b.example"));
    expect(input("npm 镜像源").hasAttribute("data-inherited")).toBe(false);

    await user.clear(input("npm 镜像源"));
    await user.tab();
    await waitFor(() => expect(sets(w)).toEqual([{ network: { noProxyLocal: true } }]));
    await waitFor(() => expect(input("npm 镜像源").value).toBe("https://a.example"));
    expect(input("npm 镜像源").hasAttribute("data-inherited")).toBe(true);
    expect(screen.getByText("正在沿用本机 .npmrc 的配置")).toBeTruthy();
  });

  it("[DESKTOP-SETTINGS-14] 代理填 not a url：行内提示地址不合法，设置没有被改，输入框里的字还在", async () => {
    const w = world();
    const user = await openDeps(w);
    await user.type(input("代理"), "not a url");
    await user.tab();
    const alert = await screen.findByText(/地址不合法/);
    expect(alert).toBeTruthy();
    expect(input("代理").value).toBe("not a url");
    expect(input("代理").getAttribute("aria-invalid")).toBe("true");
    expect(sets(w)).toEqual([]);
  });

  it("[DESKTOP-SETTINGS-14] 镜像源缺协议同样不保存；改回合法的地址后提示消失并保存", async () => {
    const w = world();
    const user = await openDeps(w);
    await user.type(input("npm 镜像源"), "registry.npmmirror.com");
    await user.tab();
    expect(await screen.findByText(/地址不合法/)).toBeTruthy();
    expect(sets(w)).toEqual([]);
    await user.clear(input("npm 镜像源"));
    await user.type(input("npm 镜像源"), "https://registry.npmmirror.com");
    expect(screen.queryByText(/地址不合法/)).toBeNull();
    await user.tab();
    await waitFor(() => expect(sets(w)).toHaveLength(1));
  });

  it("“检测本机服务时不走代理”默认开，关掉写进设置", async () => {
    const w = world();
    const user = await openDeps(w);
    const toggle = screen.getByRole("switch", { name: "检测本机服务时不走代理" });
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    await user.click(toggle);
    await waitFor(() => expect(sets(w)).toEqual([{ network: { noProxyLocal: false } }]));
    expect(
      within(screen.getByRole("region", { name: "设置" })).getAllByRole("switch").length,
    ).toBeGreaterThan(0);
  });
});
