import { describe, expect, it } from "vitest";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import { bridgeProjectSource, isScriptPath, MAX_SCRIPT_BYTES } from "./project-source.ts";

describe("项目文件来源", () => {
  it("只认 TS、JS 脚本（.vue 只有着色，不进语言服务）", () => {
    expect(
      ["a.ts", "a.tsx", "a.mts", "a.js", "a.jsx", "a.mjs", "a.cjs", "src/x.d.ts"].every(
        isScriptPath,
      ),
    ).toBe(true);
    expect(["a.vue", "a.css", "a.json", "ts", "src.ts/readme", ".ts"].some(isScriptPath)).toBe(
      false,
    );
  });

  it("列脚本时跳过 node_modules、.git、.runyard、dist 和符号链接文件夹，读不了的文件夹忽略", async () => {
    const tree: Record<
      string,
      { name: string; path: string; kind: "file" | "folder"; symlink: boolean }[]
    > = {
      "": [
        { name: "src", path: "src", kind: "folder", symlink: false },
        { name: "node_modules", path: "node_modules", kind: "folder", symlink: false },
        { name: ".git", path: ".git", kind: "folder", symlink: false },
        { name: ".runyard", path: ".runyard", kind: "folder", symlink: false },
        { name: "dist", path: "dist", kind: "folder", symlink: false },
        { name: "link", path: "link", kind: "folder", symlink: true },
        { name: "broken", path: "broken", kind: "folder", symlink: false },
        { name: "index.js", path: "index.js", kind: "file", symlink: false },
        { name: "readme.md", path: "readme.md", kind: "file", symlink: false },
      ],
      src: [
        { name: "App.tsx", path: "src/App.tsx", kind: "file", symlink: false },
        { name: "App.vue", path: "src/App.vue", kind: "file", symlink: false },
      ],
    };
    const visited: string[] = [];
    const bridge = {
      call: async (method: string, param: { path: string }) => {
        if (method !== "files.list") throw new Error(method);
        visited.push(param.path);
        const entries = tree[param.path];
        if (entries === undefined) throw new Error("无法读取");
        return { ok: true, value: entries };
      },
    } as unknown as DesktopBridge;
    const found = await bridgeProjectSource(bridge, "p").listScripts();
    expect(found.sort()).toEqual(["index.js", "src/App.tsx"]);
    expect(visited.sort()).toEqual(["", "broken", "src"]);
  });

  it("读内容：去掉 BOM；二进制、读失败、太大都是 null", async () => {
    const bridge = {
      call: async (_method: string, param: { path: string }) => {
        if (param.path === "a.ts")
          return {
            ok: true,
            value: {
              kind: "text",
              content: "\uFEFFlet a = 1;",
              eol: "none",
              size: 12,
              large: false,
            },
          };
        if (param.path === "big.ts")
          return {
            ok: true,
            value: {
              kind: "text",
              content: "x",
              eol: "none",
              size: MAX_SCRIPT_BYTES + 1,
              large: false,
            },
          };
        if (param.path === "bin.ts") return { ok: true, value: { kind: "binary", size: 3 } };
        throw new Error("io");
      },
    } as unknown as DesktopBridge;
    const source = bridgeProjectSource(bridge, "p");
    expect(await source.read("a.ts")).toBe("let a = 1;");
    expect(await source.read("big.ts")).toBeNull();
    expect(await source.read("bin.ts")).toBeNull();
    expect(await source.read("gone.ts")).toBeNull();
  });
});
