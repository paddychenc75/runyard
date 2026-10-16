import { join } from "node:path";
import { type AbsPath, absPath, type Platform } from "@runyard/platform";
import { createFakePlatform, type MemoryFs } from "@runyard/testing";
import { describe, expect, it } from "vitest";
import { isLibraryError } from "../library/library-error.ts";
import { saveTemplate } from "./save-template.ts";

function setup() {
  const fake = createFakePlatform();
  const { platform, fs } = fake;
  const projectDir = absPath(join(platform.paths.defaultLibrary, "pricing-table"));
  const userDir = absPath(join(platform.paths.stateDir, "templates"));
  const write = (rel: string, data: string | Uint8Array) =>
    fs.writeFile(absPath(join(projectDir, rel)), data);
  const read = (dir: AbsPath, rel: string) => fs.readText(absPath(join(dir, rel)));
  const input = {
    projectDir,
    projectName: "pricing-table",
    userDir,
    reservedIds: new Set(["react19", "html"]),
    runner: "vite",
    requires: { node: ">=22.18 <27", pnpm: ">=10" },
    entry: "src/App.tsx",
    nonce: () => "n1",
  } as const;
  return { fake, platform, fs, projectDir, userDir, write, read, input };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return isLibraryError(error) ? error.error.code : "other";
  }
  return "no-error";
}

function snapshot(fs: MemoryFs, dir: AbsPath): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const walk = (current: AbsPath) => {
    for (const name of fs.list(current)) {
      const path = absPath(join(current, name));
      if (fs.readText(path) === null) walk(path);
      else out[path] = fs.readText(path);
    }
  };
  walk(dir);
  return out;
}

describe("saveTemplate", () => {
  it("[TEMPLATES-CUSTOM-01] 另存一个项目：改过的文件进 files/，runner 和 requires 沿用项目记下的", async () => {
    const { platform, write, read, input, userDir } = setup();
    write("src/App.tsx", "export const edited = 1;\n");
    write(".runyard/playground.json", "{}");
    const saved = await saveTemplate(platform, { ...input, id: "my-pricing", name: "My pricing" });
    expect(saved).toMatchObject({ id: "my-pricing", name: "My pricing", source: "user" });
    expect(saved.path).toBe(join(userDir, "my-pricing"));
    expect(saved.files).toEqual(["src/App.tsx"]);
    expect(read(saved.path, "files/src/App.tsx")).toBe("export const edited = 1;\n");
    const json = JSON.parse(read(saved.path, "template.json") ?? "");
    expect(json).toMatchObject({
      id: "my-pricing",
      runner: "vite",
      requires: { node: { version: ">=22.18 <27" }, pnpm: { version: ">=10" } },
      entry: "src/App.tsx",
    });
  });

  it("[TEMPLATES-CUSTOM-03] 标识写法不对报 NAME_INVALID，没有生成任何文件夹", async () => {
    const { platform, input, fs, userDir } = setup();
    for (const id of ["My_Template", "-a", "a-"]) {
      expect(await codeOf(saveTemplate(platform, { ...input, id }))).toBe("NAME_INVALID");
    }
    expect(fs.list(userDir)).toEqual([]);
  });

  it("[TEMPLATES-CUSTOM-04] 标识已被用户模板或内置模板占用报 NAME_EXISTS，已有文件不动", async () => {
    const { platform, input, write, fs, userDir } = setup();
    write("src/App.tsx", "a");
    await saveTemplate(platform, { ...input, id: "my-pricing" });
    const before = snapshot(fs, userDir);
    write("src/App.tsx", "changed");
    expect(await codeOf(saveTemplate(platform, { ...input, id: "my-pricing" }))).toBe(
      "NAME_EXISTS",
    );
    expect(await codeOf(saveTemplate(platform, { ...input, id: "react19" }))).toBe("NAME_EXISTS");
    expect(snapshot(fs, userDir)).toEqual(before);
  });

  it("[TEMPLATES-CUSTOM-05] requires 取项目记下的值，与内置模板现在的无关", async () => {
    const { platform, input, write, read } = setup();
    write("src/App.tsx", "a");
    const saved = await saveTemplate(platform, {
      ...input,
      id: "old-env",
      requires: { node: ">=20 <23" },
    });
    expect(JSON.parse(read(saved.path, "template.json") ?? "").requires).toEqual({
      node: { version: ">=20 <23" },
    });
  });

  it("[TEMPLATES-CUSTOM-06] 写到一半失败：模板目录下没有新文件夹，也没有临时目录", async () => {
    const { platform, input, write, fs, userDir } = setup();
    write("src/App.tsx", "a");
    write("src/other.ts", "b");
    const failing: Platform = {
      ...platform,
      fs: {
        ...platform.fs,
        writeFile: async (file, data) => {
          if (String(file).endsWith("other.ts")) throw new Error("disk full");
          return platform.fs.writeFile(file, data);
        },
      },
    };
    await expect(saveTemplate(failing, { ...input, id: "half" })).rejects.toThrow("disk full");
    expect(fs.list(userDir)).toEqual([]);
  });

  it("[TEMPLATES-CUSTOM-07] 不改动原项目：所有文件逐字节相同", async () => {
    const { platform, input, write, fs, projectDir } = setup();
    write("src/App.tsx", "pricing-table");
    write(".runyard/playground.json", '{"id":"x"}');
    write("logo.png", new Uint8Array([0, 1, 2, 255]));
    const before = snapshot(fs, projectDir);
    await saveTemplate(platform, { ...input, id: "copy", replaceName: true });
    expect(snapshot(fs, projectDir)).toEqual(before);
  });

  const withDefaults = () => {
    const ctx = setup();
    for (const path of [
      "node_modules/a/index.js",
      "dist/out.js",
      ".next/x",
      "__pycache__/m.pyc",
      ".env",
      ".env.local",
      ".git/HEAD",
      ".runyard/playground.json",
      "pnpm-lock.yaml",
      "src/main.ts",
      "src/secret.ts",
    ]) {
      ctx.write(path, "x");
    }
    return ctx;
  };

  it("[TEMPLATES-CUSTOM-09] 默认排除依赖、构建产物、.env、.git 和 .runyard，只留锁文件和源码", async () => {
    const { platform, input } = withDefaults();
    const saved = await saveTemplate(platform, { ...input, id: "defaults" });
    expect(saved.files).toEqual(["pnpm-lock.yaml", "src/main.ts", "src/secret.ts"]);
  });

  it("[TEMPLATES-CUSTOM-10] --include 把 .env 加进来，其他默认排除项仍不在", async () => {
    const { platform, input } = withDefaults();
    const saved = await saveTemplate(platform, { ...input, id: "env", include: [".env"] });
    expect(saved.files).toEqual([".env", "pnpm-lock.yaml", "src/main.ts", "src/secret.ts"]);
  });

  it("--include 点名默认排除目录里的文件时只进那一个文件", async () => {
    const { platform, input, write } = withDefaults();
    write("node_modules/a/other.js", "y");
    const saved = await saveTemplate(platform, {
      ...input,
      id: "dep",
      include: ["node_modules/a/index.js"],
    });
    expect(saved.files).toContain("node_modules/a/index.js");
    expect(saved.files).not.toContain("node_modules/a/other.js");
  });

  it("[TEMPLATES-CUSTOM-11] .runyard 无法加入，也不报错", async () => {
    const { platform, input } = withDefaults();
    const saved = await saveTemplate(platform, {
      ...input,
      id: "runyard",
      include: [".runyard/playground.json", ".runyard"],
    });
    expect(saved.files.some((path) => path.startsWith(".runyard"))).toBe(false);
  });

  it("[TEMPLATES-CUSTOM-12] --exclude 去掉一个默认会进的文件", async () => {
    const { platform, input } = withDefaults();
    const saved = await saveTemplate(platform, {
      ...input,
      id: "ex",
      exclude: ["src/secret.ts"],
    });
    expect(saved.files).toEqual(["pnpm-lock.yaml", "src/main.ts"]);
  });

  it("[TEMPLATES-CUSTOM-14] --replace-name 把项目名换成 {{name}} 并登记进 substitute", async () => {
    const { platform, input, write, read } = setup();
    write("src/App.tsx", "x");
    write("index.html", "<title>pricing-table</title>");
    const saved = await saveTemplate(platform, { ...input, id: "my-pricing", replaceName: true });
    expect(read(saved.path, "files/index.html")).toBe("<title>{{name}}</title>");
    expect(JSON.parse(read(saved.path, "template.json") ?? "").substitute).toEqual(["index.html"]);
  });

  it("[TEMPLATES-CUSTOM-15] 不带开关不替换", async () => {
    const { platform, input, write, read } = setup();
    write("src/App.tsx", "x");
    write("index.html", "<title>pricing-table</title>");
    const saved = await saveTemplate(platform, { ...input, id: "plain" });
    expect(read(saved.path, "files/index.html")).toBe("<title>pricing-table</title>");
    expect(JSON.parse(read(saved.path, "template.json") ?? "").substitute).toBeUndefined();
  });

  it("[TEMPLATES-CUSTOM-16] 二进制文件逐字节不变，也不登记进 substitute", async () => {
    const { platform, input, write, fs } = setup();
    write("src/App.tsx", "x");
    const name = new TextEncoder().encode("pricing-table");
    const image = new Uint8Array([0x89, 0x50, 0x00, ...name, 0xff, 0xfe]);
    write("logo.png", image);
    const saved = await saveTemplate(platform, { ...input, id: "bin", replaceName: true });
    const copy = fs.readBytes(absPath(join(saved.path, "files", "logo.png")));
    expect([...(copy ?? [])]).toEqual([...image]);
    expect(
      JSON.parse(fs.readText(absPath(join(saved.path, "template.json"))) ?? "").substitute,
    ).toBeUndefined();
  });
});
