import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { absPath, getPlatform } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { EditorFileService } from "./file-service.ts";

// 项目改名之后文件服务跟着走（规格 DESKTOP-EDITOR-75）：之后的保存写进新文件夹，旧文件夹不会被重新创建，
// 文件监听放掉后能在新文件夹上重新开。用真实文件系统的临时目录，改名用 fs.renameSync 代替管理进程。

describe("改名后的文件服务", () => {
  it("[DESKTOP-EDITOR-75] 文件夹改名、项目记录指向新文件夹之后：保存写进新文件夹，旧文件夹不存在也没被重新创建；监听放掉后在新文件夹上接回", async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "ry-rename-")));
    const home = join(root, "home");
    const oldFolder = join(root, "demo");
    const newFolder = join(root, "demo2");
    mkdirSync(home);
    mkdirSync(join(oldFolder, "src"), { recursive: true });
    let folder = oldFolder;
    const real = getPlatform({ home: absPath(home) });
    const service = new EditorFileService({
      platform: { fs: real.fs, watch: real.watch } as never,
      projectFolder: (id) => (id === "demo" ? folder : null),
      onChange: () => {},
    });
    expect((await service.watch("demo")).ok).toBe(true);
    expect(service.isWatching("demo")).toBe(true);

    // 改名前的顺序：放监听 → 文件夹改名 → 项目记录指向新文件夹 → 接回监听
    await service.unwatch("demo");
    expect(service.isWatching("demo")).toBe(false);
    renameSync(oldFolder, newFolder);
    folder = newFolder;
    expect((await service.watch("demo")).ok).toBe(true);
    expect(service.isWatching("demo")).toBe(true);

    const saved = await service.write("demo", "src/App.tsx", "改名后输入的内容");
    expect(saved.ok).toBe(true);
    expect(readFileSync(join(newFolder, "src", "App.tsx"), "utf8")).toBe("改名后输入的内容");
    expect(existsSync(oldFolder)).toBe(false);

    // 记录还指着已经不存在的旧文件夹时保存失败，而不是把旧文件夹建出来
    folder = oldFolder;
    expect((await service.write("demo", "src/App.tsx", "x")).ok).toBe(false);
    expect(existsSync(oldFolder)).toBe(false);
    await service.dispose();
  });
});
