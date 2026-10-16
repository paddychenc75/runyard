import { describe, expect, it } from "vitest";
import {
  checkNoPermanentDelete,
  noPermanentDelete,
  ORIGINAL_REMOVAL_SITE,
} from "./no-permanent-delete.ts";
import { makeRepo } from "./test-helpers.ts";

const check = (path: string, code: string) => checkNoPermanentDelete(path, code).join("\n");
const CORE = "packages/core/src/library/a.ts";
const PLATFORM = "packages/platform/src/posix/b.ts";

describe("no-permanent-delete 检查", () => {
  it("[LIBRARY-PLAYGROUNDS-24] 坏样例：资源库代码里的 fs.rm、rmSync、rmdir 都被报出来，指向 fs.trash", () => {
    const bad = `import * as fs from "node:fs";
import { rm } from "node:fs/promises";
export async function drop(dir: string) {
  await fs.promises.rm(dir, { recursive: true });
  fs.rmSync(dir, { recursive: true, force: true });
  await fs.promises.rmdir(dir);
  await rm(dir, { recursive: true });
}`;
    const out = check(CORE, bad);
    expect(out).toContain(`${CORE}:4 调用了 fs.promises.rm(…)`);
    expect(out).toContain(`${CORE}:5 调用了 fs.rmSync(…)`);
    expect(out).toContain(`${CORE}:6 调用了 fs.promises.rmdir(…)`);
    expect(out).toContain(`${CORE}:7 调用了 rm(…)`);
    expect(out).toContain("platform.fs.trash");
    expect(out).toContain(ORIGINAL_REMOVAL_SITE);
  });

  it("[LIBRARY-PLAYGROUNDS-24] 好样例：只经平台层 fs.trash 的资源库代码一行不报", () => {
    const good = `import type { Platform } from "@runyard/platform";
// 说明里提到 fs.rm 和 rmSync 不算调用
export async function remove(platform: Pick<Platform, "fs">, dir: string) {
  const note = "rm -rf 不会被执行";
  return platform.fs.trash(dir as never);
}
export const command = { name: "rm" };`;
    expect(checkNoPermanentDelete(CORE, good)).toEqual([]);
  });

  it("改名导入、unlink、同步版本、命名空间导入都认", () => {
    expect(check(CORE, `import { rm as remove } from "fs/promises";\nremove(p);`)).toContain(
      ":2 调用了 rm(…)",
    );
    expect(check(CORE, `import { unlinkSync } from "node:fs";\nunlinkSync(p);`)).toContain(
      "unlinkSync",
    );
    expect(check(CORE, `import fs from "node:fs";\nfs.unlink(p, cb);`)).toContain("fs.unlink(…)");
    expect(check(CORE, `const fsp = require("node:fs/promises");\nfsp.rm(p);`)).toContain(
      "fsp.rm(…)",
    );
  });

  it("经进程删除：参数数组以 rm 开头、spawn/exec 的第一个实参是 rm", () => {
    expect(
      check(CORE, `platform.exec.spawn({ argv: ["rm", "-rf", dir], cwd, env, stdin: false });`),
    ).toContain('参数数组以 "rm" 开头');
    expect(check(CORE, `execFile("/bin/rm", ["-rf", dir]);`)).toContain('execFile("/bin/rm…")');
    expect(check(CORE, `exec("rm -rf " + dir);`)).toContain("exec(");
    expect(check(CORE, `execSync("sudo rm x");`)).toBe("");
    // 命令行的子命令叫 rm，不是删除
    expect(check(CORE, `const commands = ["add", "rm", "ls"];\nprogram.command("rm");`)).toBe("");
  });

  it("[LIBRARY-PLAYGROUNDS-24] 以 rm 开头的名字列表不是删除；真正拿来当命令的数组照样报", () => {
    // 命令声明里的名字列表（issue #108 的误报）
    expect(check(CORE, `export const names = ["rm"];`)).toBe("");
    expect(check(CORE, `defineCommand({ name: "rm", aliases: ["rm", "remove"] });`)).toBe("");
    expect(check(CORE, `const commands = ["rm", "run", "stop"];`)).toBe("");
    // 真正的删除：带选项、拼进路径、写在 argv 上或直接交给 spawn
    expect(check(CORE, `const x = ["rm", "-rf", dir];`)).toContain('参数数组以 "rm" 开头');
    expect(check(CORE, `const x = ["rm", dir];`)).toContain('参数数组以 "rm" 开头');
    expect(check(CORE, `run({ argv: ["rm"], cwd });`)).toContain('参数数组以 "rm" 开头');
    expect(check(CORE, `spawn(["rm"]);`)).toContain('参数数组以 "rm" 开头');
    expect(check(CORE, `platform.exec.spawn({ argv: ["/bin/rm", "x"] });`)).toContain("/bin/rm");
  });

  it("delete-allow 放行同一行或上一行，理由必填", () => {
    expect(check(CORE, `// delete-allow: 管理进程自己的 pid 文件\nunlinkSync(p);`)).toBe("");
    expect(
      check(CORE, `import fs from "node:fs";\nfs.unlinkSync(p); // delete-allow: 日志轮转`),
    ).toBe("");
    expect(check(CORE, `// delete-allow:\nfs.unlinkSync(p);`)).toContain("没有写理由");
    expect(check(CORE, `// delete-allow: 理由\n\nfs.unlinkSync(p);`)).toContain(
      "调用了 fs.unlinkSync",
    );
    expect(check(CORE, `/* delete-allow: 块注释也行 */\nfs.rmSync(p);`)).toBe("");
  });

  it("平台层里可能递归删除的调用只许出现在复制兜底的那个文件里，加 delete-allow 也不行", () => {
    const code = `// delete-allow: 我觉得可以\nawait fs.rm(dir, { recursive: true });`;
    const out = check(PLATFORM, code);
    expect(out).toContain("只许出现在");
    expect(out).toContain(ORIGINAL_REMOVAL_SITE);
    expect(check(ORIGINAL_REMOVAL_SITE, code)).toBe("");
    // 在那个文件里没写理由照样被拦
    expect(check(ORIGINAL_REMOVAL_SITE, `await fs.rm(dir, { recursive: true });`)).toContain(
      "调用了",
    );
  });

  it("平台层里删单个条目（unlink、不带选项的 rmdir）写了理由就行；带选项的 rmdir 算递归", () => {
    expect(
      check(
        PLATFORM,
        `// delete-allow: 自己刚建的临时文件\nawait unlink(temp);`.replace(
          "await unlink",
          "await fs.unlink",
        ),
      ),
    ).toBe("");
    expect(check(PLATFORM, `// delete-allow: 空占位\nawait fs.rmdir(p);`)).toBe("");
    expect(
      check(PLATFORM, `// delete-allow: 理由\nawait fs.rmdir(p, { recursive: true });`),
    ).toContain("只许出现在");
  });

  it("别的包里递归删除写了理由就行（如管理进程自己的临时目录）", () => {
    expect(
      check(
        "packages/supervisor/src/tmp.ts",
        `// delete-allow: 本次运行的 GOTMPDIR\nawait fs.rm(tmp, { recursive: true });`,
      ),
    ).toBe("");
  });

  it("整个仓库扫描：只报产品源码，测试文件里的 rmSync 不报", () => {
    const root = makeRepo({
      "packages/core/src/library/a.ts": `import { rmSync } from "node:fs";\nrmSync(p);\n`,
      "packages/core/src/library/a.test.ts": `import { rmSync } from "node:fs";\nrmSync(tmp, { recursive: true });\n`,
      "packages/testing/src/x.ts": `import { rmSync } from "node:fs";\nrmSync(tmp);\n`,
    });
    const errors = noPermanentDelete.run(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("packages/core/src/library/a.ts:2");
  });
});
