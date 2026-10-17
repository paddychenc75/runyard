import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { platformError } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { LARGE_FILE_BYTES, MAX_OPEN_BYTES } from "../../shared/editor-files.ts";
import { makeTestProject, PROJECT } from "./test-project.ts";

// 文件服务的读、写、新建、改名、移到废纸篓、列目录（用真实文件系统的临时目录；废纸篓用假的，不碰 ~/.Trash）

function ok<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value;
}

describe("列目录", () => {
  it("文件树不显示 .runyard 和 .git，依赖目录照常列出，文件夹在前、同类按名称排序", async () => {
    const p = makeTestProject();
    for (const rel of [
      ".runyard/state.json",
      ".git/HEAD",
      "node_modules/react/index.js",
      "src/App.tsx",
      "b.md",
      "A.md",
      "file10.ts",
      "file2.ts",
    ]) {
      p.put(rel, "x");
    }
    const entries = ok(await p.service.list(PROJECT, ""));
    expect(entries.map((e) => `${e.kind}:${e.name}`)).toEqual([
      "folder:node_modules",
      "folder:src",
      "file:A.md",
      "file:b.md",
      "file:file2.ts",
      "file:file10.ts",
    ]);
    expect(entries.find((e) => e.name === "src")?.path).toBe("src");
  });

  it("依赖目录点开时才读它的内容，子项带完整的相对路径", async () => {
    const p = makeTestProject();
    p.put("node_modules/react/index.js", "x");
    const entries = ok(await p.service.list(PROJECT, "node_modules"));
    expect(entries).toEqual([
      { name: "react", path: "node_modules/react", kind: "folder", symlink: false },
    ]);
  });

  it("嵌套的 .git 也不显示；对文件列目录是 EDITOR_NOT_A_FOLDER，不存在是 EDITOR_NOT_FOUND", async () => {
    const p = makeTestProject();
    p.put("sub/.git/HEAD", "x");
    p.put("sub/a.txt", "x");
    expect(ok(await p.service.list(PROJECT, "sub")).map((e) => e.name)).toEqual(["a.txt"]);
    expect(await p.service.list(PROJECT, "sub/a.txt")).toMatchObject({
      ok: false,
      error: { code: "EDITOR_NOT_A_FOLDER" },
    });
    expect(await p.service.list(PROJECT, "nope")).toMatchObject({
      ok: false,
      error: { code: "EDITOR_NOT_FOUND", params: { path: "nope" } },
    });
  });

  it("不认识的项目 id 失败而不是抛异常", async () => {
    const p = makeTestProject();
    expect(await p.service.list("other", "")).toEqual({
      ok: false,
      error: { code: "EDITOR_PROJECT_UNKNOWN", params: { project: "other" } },
    });
  });
});

describe("读", () => {
  it("文本：内容原样，报告换行符和大小", async () => {
    const p = makeTestProject();
    p.put("a.js", "one\r\ntwo\r\nthree");
    expect(ok(await p.service.read(PROJECT, "a.js"))).toEqual({
      kind: "text",
      content: "one\r\ntwo\r\nthree",
      eol: "crlf",
      size: 15,
      large: false,
    });
  });

  it("不是文本的文件不当文本返回（含 NUL，或不是合法 UTF-8）", async () => {
    const p = makeTestProject();
    p.put("img.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 1]));
    p.put("latin1.txt", new Uint8Array([0x63, 0x61, 0x66, 0xe9]));
    expect(ok(await p.service.read(PROJECT, "img.png"))).toEqual({ kind: "binary", size: 7 });
    expect(ok(await p.service.read(PROJECT, "latin1.txt")).kind).toBe("binary");
  });

  it("超过 5 MB 的文本照常读出但标为 large，超过 50 MB 不读内容", async () => {
    const p = makeTestProject();
    p.put("big.txt", "a".repeat(LARGE_FILE_BYTES + 1));
    p.put("small.txt", "a".repeat(LARGE_FILE_BYTES));
    p.put("huge.txt", "");
    truncateSync(p.at("huge.txt"), MAX_OPEN_BYTES + 1);
    const big = ok(await p.service.read(PROJECT, "big.txt"));
    expect(big).toMatchObject({ kind: "text", large: true });
    expect(ok(await p.service.read(PROJECT, "small.txt"))).toMatchObject({ large: false });
    expect(ok(await p.service.read(PROJECT, "huge.txt"))).toEqual({
      kind: "too-large",
      size: MAX_OPEN_BYTES + 1,
    });
  });

  it("不存在、是文件夹都给明确的失败", async () => {
    const p = makeTestProject();
    p.put("src/a.ts", "x");
    expect(await p.service.read(PROJECT, "gone.ts")).toMatchObject({
      error: { code: "EDITOR_NOT_FOUND" },
    });
    expect(await p.service.read(PROJECT, "src")).toMatchObject({
      error: { code: "EDITOR_NOT_A_FILE" },
    });
  });
});

describe("写", () => {
  it("[DESKTOP-EDITOR-30] 原样保留换行符：CRLF 文件改一行保存后仍全是 CRLF、末尾仍没有换行、其余字节不变", async () => {
    const p = makeTestProject();
    const original = "const a = 1;\r\nconst b = 2;\r\nconst c = 3;";
    p.put("legacy.js", original);
    const read = ok(await p.service.read(PROJECT, "legacy.js"));
    expect(read).toMatchObject({ kind: "text", eol: "crlf" });
    // 编辑器内部用 LF，改第二行
    const edited = "const a = 1;\nconst b = 22;\nconst c = 3;";
    ok(await p.service.write(PROJECT, "legacy.js", edited, "crlf"));
    const after = readFileSync(p.at("legacy.js"));
    expect(after.toString("utf8")).toBe("const a = 1;\r\nconst b = 22;\r\nconst c = 3;");
    expect(after.includes(Buffer.from("\n\n"))).toBe(false);
    expect(after.at(-1)).toBe(";".charCodeAt(0));
  });

  it("[DESKTOP-EDITOR-30] LF 文件和末尾换行同样原样保留，BOM 不丢", async () => {
    const p = makeTestProject();
    p.put("a.txt", "﻿x\ny\n");
    const read = ok(await p.service.read(PROJECT, "a.txt"));
    if (read.kind !== "text") throw new Error("text expected");
    ok(
      await p.service.write(
        PROJECT,
        "a.txt",
        read.content.replace("x", "z"),
        read.eol === "lf" ? "lf" : undefined,
      ),
    );
    expect(readFileSync(p.at("a.txt"), "utf8")).toBe("﻿z\ny\n");
  });

  it("[DESKTOP-EDITOR-29] 文件在磁盘上变成只读：保存失败并写明原因，磁盘内容不变；改回可写后再保存成功", async () => {
    const p = makeTestProject();
    p.put("App.tsx", "old");
    chmodSync(p.at("App.tsx"), 0o444);
    expect(await p.service.write(PROJECT, "App.tsx", "new")).toEqual({
      ok: false,
      error: { code: "EDITOR_SAVE_FAILED", params: { path: "App.tsx", reason: "read-only" } },
    });
    expect(readFileSync(p.at("App.tsx"), "utf8")).toBe("old");
    chmodSync(p.at("App.tsx"), 0o644);
    expect(ok(await p.service.write(PROJECT, "App.tsx", "new"))).toEqual({ size: 3 });
    expect(readFileSync(p.at("App.tsx"), "utf8")).toBe("new");
  });

  it("[DESKTOP-EDITOR-29] 写的过程中失败（目录不可写，建不了临时文件）：旧内容完好，目录里没有留下半个文件", async () => {
    const p = makeTestProject();
    p.put("src/a.ts", "old");
    chmodSync(p.at("src"), 0o555);
    try {
      expect(await p.service.write(PROJECT, "src/a.ts", "new")).toMatchObject({
        ok: false,
        error: { code: "EDITOR_SAVE_FAILED", params: { path: "src/a.ts", reason: "permission" } },
      });
      expect(readFileSync(p.at("src/a.ts"), "utf8")).toBe("old");
      expect(readdirSync(p.at("src"))).toEqual(["a.ts"]);
    } finally {
      chmodSync(p.at("src"), 0o755);
    }
  });

  it("文件被外部删掉后保存会重新创建；上级文件夹也没了就失败，不替用户建文件夹", async () => {
    const p = makeTestProject();
    mkdirSync(p.at("src"));
    ok(await p.service.write(PROJECT, "src/old.ts", "again"));
    expect(readFileSync(p.at("src/old.ts"), "utf8")).toBe("again");
    expect(await p.service.write(PROJECT, "gone/old.ts", "x")).toMatchObject({
      error: { code: "EDITOR_NOT_FOUND" },
    });
    expect(existsSync(p.at("gone"))).toBe(false);
  });

  it("对文件夹写入是 EDITOR_NOT_A_FILE", async () => {
    const p = makeTestProject();
    mkdirSync(p.at("src"));
    expect(await p.service.write(PROJECT, "src", "x")).toMatchObject({
      error: { code: "EDITOR_NOT_A_FILE" },
    });
  });
});

describe("新建", () => {
  it("[DESKTOP-EDITOR-05] 在文件夹下新建空文件", async () => {
    const p = makeTestProject();
    mkdirSync(p.at("src"));
    expect(ok(await p.service.create(PROJECT, "src", "file", "utils.ts"))).toEqual({
      path: "src/utils.ts",
    });
    expect(readFileSync(p.at("src/utils.ts"), "utf8")).toBe("");
  });

  it("[DESKTOP-EDITOR-06] 在项目根新建空文件夹", async () => {
    const p = makeTestProject();
    expect(ok(await p.service.create(PROJECT, "", "folder", "lib"))).toEqual({ path: "lib" });
    expect(readdirSync(p.at("lib"))).toEqual([]);
  });

  it("[DESKTOP-EDITOR-07] 同名时不创建也不覆盖：已有文件内容不变，文件夹同名也一样", async () => {
    const p = makeTestProject();
    p.put("src/utils.ts", "keep me");
    mkdirSync(p.at("src/lib"));
    expect(await p.service.create(PROJECT, "src", "file", "utils.ts")).toEqual({
      ok: false,
      error: { code: "EDITOR_NAME_EXISTS", params: { name: "utils.ts" } },
    });
    expect(await p.service.create(PROJECT, "src", "folder", "utils.ts")).toMatchObject({
      error: { code: "EDITOR_NAME_EXISTS" },
    });
    expect(await p.service.create(PROJECT, "src", "file", "lib")).toMatchObject({
      error: { code: "EDITOR_NAME_EXISTS" },
    });
    expect(readFileSync(p.at("src/utils.ts"), "utf8")).toBe("keep me");
  });

  it("[DESKTOP-EDITOR-08] 不合法的名字被拒绝：磁盘上没有任何变化，也没有在项目之外建出东西", async () => {
    const p = makeTestProject();
    mkdirSync(p.at("src"));
    p.put("src/a.ts", "x");
    const before = readdirSync(p.root).sort();
    for (const name of ["", "a/b", ".", "..", "../outside"]) {
      const result = await p.service.create(PROJECT, "src", "file", name);
      expect(result).toMatchObject({ ok: false, error: { code: "EDITOR_NAME_INVALID" } });
      const folder = await p.service.create(PROJECT, "", "folder", name);
      expect(folder).toMatchObject({ ok: false, error: { code: "EDITOR_NAME_INVALID" } });
      const renamed = await p.service.rename(PROJECT, "src/a.ts", name);
      expect(renamed).toMatchObject({ ok: false, error: { code: "EDITOR_NAME_INVALID" } });
    }
    expect(await p.service.create(PROJECT, "src", "file", "")).toEqual({
      ok: false,
      error: { code: "EDITOR_NAME_INVALID", params: { name: "", reason: "empty" } },
    });
    expect(readdirSync(p.at("src"))).toEqual(["a.ts"]);
    expect(readdirSync(p.folder)).toEqual(["src"]);
    expect(readdirSync(p.root).sort()).toEqual(before);
  });

  it("上级不是文件夹或不存在时失败", async () => {
    const p = makeTestProject();
    p.put("a.ts", "x");
    expect(await p.service.create(PROJECT, "a.ts", "file", "b")).toMatchObject({
      error: { code: "EDITOR_NOT_A_FOLDER" },
    });
    expect(await p.service.create(PROJECT, "nope", "file", "b")).toMatchObject({
      error: { code: "EDITOR_NOT_FOUND" },
    });
  });
});

describe("改名", () => {
  it("[DESKTOP-EDITOR-09] 文件改名：磁盘上只剩新名字，内容不变；之后往新路径保存写进新文件", async () => {
    const p = makeTestProject();
    p.put("src/App.tsx", "export {}");
    expect(ok(await p.service.rename(PROJECT, "src/App.tsx", "Main.tsx"))).toEqual({
      path: "src/Main.tsx",
    });
    expect(readdirSync(p.at("src"))).toEqual(["Main.tsx"]);
    ok(await p.service.write(PROJECT, "src/Main.tsx", "edited"));
    expect(readFileSync(p.at("src/Main.tsx"), "utf8")).toBe("edited");
    expect(readdirSync(p.at("src"))).toEqual(["Main.tsx"]);
  });

  it("[DESKTOP-EDITOR-10] 文件夹改名：里面的文件到了新路径，内容不变", async () => {
    const p = makeTestProject();
    p.put("src/components/Button.tsx", "button");
    expect(ok(await p.service.rename(PROJECT, "src/components", "ui"))).toEqual({
      path: "src/ui",
    });
    expect(readFileSync(p.at("src/ui/Button.tsx"), "utf8")).toBe("button");
    expect(existsSync(p.at("src/components"))).toBe(false);
  });

  it("[DESKTOP-EDITOR-07] 改名成已有的名字：两边都原样，不覆盖", async () => {
    const p = makeTestProject();
    p.put("a.ts", "A");
    p.put("b.ts", "B");
    mkdirSync(p.at("d1"));
    mkdirSync(p.at("d2"));
    p.put("d2/inner.txt", "inner");
    expect(await p.service.rename(PROJECT, "a.ts", "b.ts")).toEqual({
      ok: false,
      error: { code: "EDITOR_NAME_EXISTS", params: { name: "b.ts" } },
    });
    expect(await p.service.rename(PROJECT, "d1", "d2")).toMatchObject({
      error: { code: "EDITOR_NAME_EXISTS" },
    });
    expect(readFileSync(p.at("a.ts"), "utf8")).toBe("A");
    expect(readFileSync(p.at("b.ts"), "utf8")).toBe("B");
    expect(readFileSync(p.at("d2/inner.txt"), "utf8")).toBe("inner");
    expect(existsSync(p.at("d1"))).toBe(true);
  });

  it("改成自己的名字什么都不做；项目根和不存在的路径不能改名", async () => {
    const p = makeTestProject();
    p.put("a.ts", "A");
    expect(ok(await p.service.rename(PROJECT, "a.ts", "a.ts"))).toEqual({ path: "a.ts" });
    expect(await p.service.rename(PROJECT, "", "x")).toMatchObject({
      error: { code: "EDITOR_PATH_OUTSIDE" },
    });
    expect(await p.service.rename(PROJECT, "gone.ts", "x")).toMatchObject({
      error: { code: "EDITOR_NOT_FOUND" },
    });
  });
});

describe("移到废纸篓", () => {
  it("[DESKTOP-EDITOR-11] 文件进了废纸篓，原处不再有它，不需要任何确认参数", async () => {
    const p = makeTestProject();
    p.put("src/old.ts", "bye");
    expect(ok(await p.service.trash(PROJECT, "src/old.ts"))).toEqual({ restorable: false });
    expect(existsSync(p.at("src/old.ts"))).toBe(false);
    expect(p.trashCalls).toEqual([p.at("src/old.ts")]);
    expect(readdirSync(p.trashDir).map((n) => readFileSync(join(p.trashDir, n), "utf8"))).toEqual([
      "bye",
    ]);
  });

  it("[DESKTOP-EDITOR-11] 文件夹整个进废纸篓", async () => {
    const p = makeTestProject();
    p.put("src/dir/a.ts", "a");
    ok(await p.service.trash(PROJECT, "src/dir"));
    expect(existsSync(p.at("src/dir"))).toBe(false);
    expect(p.trashCalls).toHaveLength(1);
  });

  it("[DESKTOP-EDITOR-12] 有未保存的修改时先写入，废纸篓里的文件含有那些修改", async () => {
    const p = makeTestProject();
    p.put("src/old.ts", "disk version");
    ok(await p.service.trash(PROJECT, "src/old.ts", "unsaved edits"));
    const [name] = readdirSync(p.trashDir);
    expect(readFileSync(join(p.trashDir, name ?? ""), "utf8")).toBe("unsaved edits");
    expect(existsSync(p.at("src/old.ts"))).toBe(false);
  });

  it("[DESKTOP-EDITOR-12] 先写入失败（只读文件）就不移走：文件留在原处", async () => {
    const p = makeTestProject();
    p.put("old.ts", "disk version");
    chmodSync(p.at("old.ts"), 0o444);
    expect(await p.service.trash(PROJECT, "old.ts", "edits")).toMatchObject({
      error: { code: "EDITOR_SAVE_FAILED", params: { reason: "read-only" } },
    });
    expect(p.trashCalls).toEqual([]);
    expect(readFileSync(p.at("old.ts"), "utf8")).toBe("disk version");
  });

  it("[DESKTOP-EDITOR-13] 放不进废纸篓时失败：文件仍在原处、内容不变，服务没有尝试任何别的删除办法", async () => {
    const attempts: string[] = [];
    const p = makeTestProject({
      trash: async (path) => {
        attempts.push(path);
        throw platformError("TRASH_UNAVAILABLE", { name: "locked.ts" }, "no trash");
      },
    });
    p.put("src/locked.ts", "precious");
    expect(await p.service.trash(PROJECT, "src/locked.ts")).toEqual({
      ok: false,
      error: { code: "EDITOR_TRASH_FAILED", params: { path: "src/locked.ts" } },
    });
    expect(readFileSync(p.at("src/locked.ts"), "utf8")).toBe("precious");
    expect(attempts).toEqual([p.at("src/locked.ts")]);
  });

  it("[DESKTOP-EDITOR-13] 平台层抛出任何错误都按失败处理，不退到永久删除", async () => {
    const p = makeTestProject({
      trash: async () => {
        throw new Error("boom");
      },
    });
    p.put("a.ts", "keep");
    expect(await p.service.trash(PROJECT, "a.ts")).toMatchObject({
      error: { code: "EDITOR_TRASH_FAILED" },
    });
    expect(readFileSync(p.at("a.ts"), "utf8")).toBe("keep");
  });

  it("项目根不能被移走，不存在的路径给 EDITOR_NOT_FOUND", async () => {
    const p = makeTestProject();
    expect(await p.service.trash(PROJECT, "")).toMatchObject({
      error: { code: "EDITOR_PATH_OUTSIDE" },
    });
    expect(await p.service.trash(PROJECT, "nope")).toMatchObject({
      error: { code: "EDITOR_NOT_FOUND" },
    });
    expect(p.trashCalls).toEqual([]);
  });
});

describe("路径限制在项目文件夹内", () => {
  it("带 .. 的、绝对的、含反斜杠的路径都被拒绝，所有方法一样", async () => {
    const p = makeTestProject();
    writeFileSync(join(p.root, "secret.txt"), "secret");
    for (const path of [
      "../secret.txt",
      "/etc/hosts",
      "a/../../secret.txt",
      "a\\b",
      "./a",
      "a//b",
    ]) {
      expect(await p.service.read(PROJECT, path)).toMatchObject({
        error: { code: "EDITOR_PATH_OUTSIDE" },
      });
      expect(await p.service.write(PROJECT, path, "x")).toMatchObject({
        error: { code: "EDITOR_PATH_OUTSIDE" },
      });
      expect(await p.service.list(PROJECT, path)).toMatchObject({
        error: { code: "EDITOR_PATH_OUTSIDE" },
      });
      expect(await p.service.create(PROJECT, path, "file", "x")).toMatchObject({
        error: { code: "EDITOR_PATH_OUTSIDE" },
      });
      expect(await p.service.rename(PROJECT, path, "x")).toMatchObject({
        error: { code: "EDITOR_PATH_OUTSIDE" },
      });
      expect(await p.service.trash(PROJECT, path)).toMatchObject({
        error: { code: "EDITOR_PATH_OUTSIDE" },
      });
    }
    expect(readFileSync(join(p.root, "secret.txt"), "utf8")).toBe("secret");
    expect(p.trashCalls).toEqual([]);
  });

  it("指向项目外的符号链接（文件、文件夹、还不存在的目标）读、写、列、建都被拒绝，项目外的东西不变", async () => {
    const p = makeTestProject();
    const outside = join(p.root, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "secret.txt"), "secret");
    symlinkSync(outside, p.at("linkdir"));
    symlinkSync(join(outside, "secret.txt"), p.at("linkfile"));
    symlinkSync(join(outside, "not-yet.txt"), p.at("dangling"));
    const esc = { ok: false, error: { code: "EDITOR_PATH_OUTSIDE" } };
    expect(await p.service.read(PROJECT, "linkfile")).toMatchObject(esc);
    expect(await p.service.read(PROJECT, "linkdir/secret.txt")).toMatchObject(esc);
    expect(await p.service.write(PROJECT, "linkfile", "pwn")).toMatchObject(esc);
    expect(await p.service.write(PROJECT, "linkdir/new.txt", "pwn")).toMatchObject(esc);
    expect(await p.service.write(PROJECT, "dangling", "pwn")).toMatchObject(esc);
    expect(await p.service.list(PROJECT, "linkdir")).toMatchObject(esc);
    expect(await p.service.create(PROJECT, "linkdir", "file", "x")).toMatchObject(esc);
    expect(readFileSync(join(outside, "secret.txt"), "utf8")).toBe("secret");
    expect(readdirSync(outside)).toEqual(["secret.txt"]);
  });

  it("指向项目内的符号链接可以用；列目录时标出是链接，指向项目外的链接也列出（但不能读写）", async () => {
    const p = makeTestProject();
    p.put("real/a.txt", "inside");
    symlinkSync(p.at("real"), p.at("inner-link"));
    symlinkSync(join(p.root, "home"), p.at("outer-link"));
    expect(ok(await p.service.read(PROJECT, "inner-link/a.txt"))).toMatchObject({
      content: "inside",
    });
    const entries = ok(await p.service.list(PROJECT, ""));
    expect(
      entries
        .filter((e) => e.symlink)
        .map((e) => `${e.name}:${e.kind}`)
        .sort(),
    ).toEqual(["inner-link:folder", "outer-link:folder"]);
  });

  it("改名和移到废纸篓处理的是链接本身，不碰它指向的项目外目标", async () => {
    const p = makeTestProject();
    const outside = join(p.root, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "secret.txt"), "secret");
    symlinkSync(outside, p.at("linkdir"));
    expect(ok(await p.service.rename(PROJECT, "linkdir", "renamed"))).toEqual({ path: "renamed" });
    expect(readFileSync(join(outside, "secret.txt"), "utf8")).toBe("secret");
    ok(await p.service.trash(PROJECT, "renamed"));
    expect(p.trashCalls).toEqual([p.at("renamed")]);
    expect(readFileSync(join(outside, "secret.txt"), "utf8")).toBe("secret");
  });
});
