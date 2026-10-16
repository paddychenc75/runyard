import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findTemplateReaders,
  TEMPLATE_READERS,
  templateReaderArgs,
  touchesTemplates,
} from "./template-readers.ts";

const repoRoot = join(import.meta.dirname, "..", "..");

describe("读模板数据的包清单（#149）", () => {
  it("清单和源码里真的读 templates/ 的包一致，新增读模板的包必须登记", () => {
    expect([...TEMPLATE_READERS].sort()).toEqual(findTemplateReaders(repoRoot));
  });

  it("只改了模板文件时，--affected 换成对读模板的包的 --filter", () => {
    const args = templateReaderArgs(["--affected"], ["templates/builtin/react19/template.json"]);
    expect(args).toEqual(TEMPLATE_READERS.map((name) => `--filter=${name}`));
  });

  it("其他参数原样保留", () => {
    const args = templateReaderArgs(["--affected", "--concurrency=1"], ["templates/a.json"]);
    expect(args?.[0]).toBe("--concurrency=1");
  });

  it("没改模板，或没带 --affected（已经是全量或指定包），不额外跑", () => {
    expect(templateReaderArgs(["--affected"], ["packages/core/src/a.ts"])).toBeUndefined();
    expect(templateReaderArgs([], ["templates/a.json"])).toBeUndefined();
    expect(templateReaderArgs(["--filter", "@runyard/core"], ["templates/a.json"])).toBeUndefined();
  });

  it("Windows 路径分隔符也认", () => {
    expect(touchesTemplates(["templates\\builtin\\html\\template.json"])).toBe(true);
    expect(touchesTemplates(["docs/templates/readme.md"])).toBe(false);
  });
});
