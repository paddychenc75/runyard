import { chmodSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { absPath } from "../../path-types.ts";
import { isPlatformError } from "../../platform-error.ts";
import { makeSandbox, type Sandbox } from "../../test-support/trash-sandbox.ts";
import { writeAtomic } from "./write-atomic.ts";

// 原子写（技术设计 §4.7，存储参考文档 supervisor.json 一行）：中途出错或进程死掉，旧文件完好，不留半个文件。

let box: Sandbox;
beforeEach(() => {
  box = makeSandbox();
});
afterEach(() => box.remove());

describe("writeAtomic", () => {
  it("新建和覆盖都得到完整的新内容，目录里不留临时文件", async () => {
    const file = box.at("state.json");
    await writeAtomic(absPath(file), '{"v":1}');
    await writeAtomic(absPath(file), '{"v":2}');
    expect(readFileSync(file, "utf8")).toBe('{"v":2}');
    expect(readdirSync(box.at())).toEqual(["state.json"]);
  });

  it("写完、改名之前出故障：旧文件内容完整保留，没有半个文件，临时文件被清掉", async () => {
    const file = box.at("state.json");
    writeFileSync(file, "OLD CONTENT");
    const fault = async (temp: string) => {
      // 故障发生时，新内容已经完整写在同目录的临时文件里，目标还是旧的
      expect(readFileSync(temp, "utf8")).toBe("NEW CONTENT");
      expect(readFileSync(file, "utf8")).toBe("OLD CONTENT");
      throw new Error("injected crash before rename");
    };
    await expect(
      writeAtomic(absPath(file), "NEW CONTENT", {}, { beforeRename: fault }),
    ).rejects.toThrow();
    expect(readFileSync(file, "utf8")).toBe("OLD CONTENT");
    expect(readdirSync(box.at())).toEqual(["state.json"]);
  });

  it("写完、改名之前出故障，目标原本不存在：不会凭空出现半个文件", async () => {
    const file = box.at("new.json");
    const fault = () => {
      throw new Error("injected crash before rename");
    };
    await expect(writeAtomic(absPath(file), "X", {}, { beforeRename: fault })).rejects.toThrow();
    expect(existsSync(file)).toBe(false);
    expect(readdirSync(box.at())).toEqual([]);
  });

  it("读的一方在连续改写期间只会读到完整的旧内容或完整的新内容", async () => {
    const file = box.at("state.json");
    const contents = ["a".repeat(200_000), "b".repeat(300_000), "c".repeat(100_000)];
    writeFileSync(file, contents[0] as string);
    let writing = true;
    const bad: number[] = [];
    const reader = (async () => {
      while (writing) {
        const text = readFileSync(file, "utf8");
        if (!contents.includes(text)) bad.push(text.length);
        await new Promise((resolve) => setImmediate(resolve));
      }
    })();
    for (let i = 0; i < 30; i++) await writeAtomic(absPath(file), contents[i % 3] as string);
    writing = false;
    await reader;
    expect(bad).toEqual([]);
  });

  it("private 为 true：只有本人能读写（0600）；创建时就是 0600，不是先宽后紧", async () => {
    const file = box.at("supervisor.json");
    let modeAtRename = 0;
    await writeAtomic(
      absPath(file),
      "token",
      { private: true },
      {
        beforeRename: (temp) => {
          modeAtRename = statSync(temp).mode & 0o777;
        },
      },
    );
    expect(modeAtRename).toBe(0o600);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("已有文件的权限原样保留；覆盖一个 0600 的文件不会变宽", async () => {
    const file = box.at("state.json");
    writeFileSync(file, "old");
    chmodSync(file, 0o600);
    await writeAtomic(absPath(file), "new");
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("新文件按普通文件（0644 再受 umask 收窄）", async () => {
    const file = box.at("plain.json");
    await writeAtomic(absPath(file), "x");
    expect(statSync(file).mode & 0o133).toBe(0);
  });

  it("父目录不存在：抛 INTERNAL，不建目录", async () => {
    const file = box.at("missing", "state.json");
    const error = await writeAtomic(absPath(file), "x").catch((e: unknown) => e);
    expect(isPlatformError(error) && error.error.code).toBe("INTERNAL");
    expect(existsSync(box.at("missing"))).toBe(false);
  });
});
