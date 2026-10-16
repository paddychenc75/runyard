import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generate, protocolDefs, writeGenerated } from "../scripts/generate.ts";
import type { ProtocolDefs } from "../scripts/render-reference.ts";
import { generatedFresh } from "./generated-fresh.ts";
import { I18N_GOOD, makeRepo, TOKENS_GOOD } from "./test-helpers.ts";

const BEGIN = "<!-- generated:layers 开始（由 pnpm generate 生成，不要手改） -->";
const END = "<!-- generated:layers 结束 -->";
const LAYERS = {
  packages: {
    "@runyard/protocol": { path: "packages/protocol", allow: [] },
    "@runyard/core": { path: "packages/core", allow: ["@runyard/protocol"] },
  },
};

function repo(agents: string): string {
  return makeRepo({
    ...I18N_GOOD,
    ...TOKENS_GOOD,
    "AGENTS.md": agents,
    "tooling/checks/layers.json": LAYERS,
    "packages/protocol/package.json": { name: "@runyard/protocol" },
  });
}

describe("generated-fresh 检查", () => {
  it("生成一次之后通过，表里写明每个包建了没有", () => {
    const root = repo(`# x\n\n${BEGIN}\n${END}\n\n后文\n`);
    expect(generatedFresh.run(root).join()).toContain("生成内容过期了");
    writeGenerated(root, generate(root));
    expect(generatedFresh.run(root)).toEqual([]);
    const text = readFileSync(join(root, "AGENTS.md"), "utf8");
    expect(text).toContain("| `@runyard/protocol` | 无 | 已有 |");
    expect(text).toContain("| `@runyard/core` | `@runyard/protocol` | 还没建 |");
    expect(text).toContain("后文");
  });

  it("手改了生成的表", () => {
    const root = repo(`${BEGIN}\n| 包 | 可以导入 | 现状 |\n| 手改 | 的 | 行 |\n${END}\n`);
    expect(generatedFresh.run(root).join()).toContain("运行 pnpm generate");
  });

  it("生成标记被删掉", () => {
    expect(generatedFresh.run(repo("# 没有标记\n")).join()).toContain("找不到生成标记");
  });

  describe("docs/reference/ 里的协议参考", () => {
    const AGENTS = `${BEGIN}\n${END}\n`;
    const REFERENCE = [
      "docs/reference/protocol.md",
      "docs/reference/codes.md",
      "docs/reference/strings.md",
      "packages/i18n/generated/messages.d.ts",
      "packages/tokens/generated/tokens.css",
      "packages/tokens/generated/tokens.ts",
      "packages/tokens/generated/editor-themes.ts",
    ];

    function freshRepo(): string {
      const root = repo(AGENTS);
      writeGenerated(root, generate(root));
      return root;
    }

    it("还没生成：两份参考文档都报缺失，指出要运行 pnpm generate", () => {
      const errors = generatedFresh.run(repo(AGENTS));
      for (const path of REFERENCE) expect(errors.join("\n")).toContain(path);
      expect(errors.join("\n")).toContain("运行 pnpm generate");
    });

    it("生成之后通过，并且两份文档里有真实的协议内容", () => {
      const root = freshRepo();
      expect(generatedFresh.run(root)).toEqual([]);
      expect(readFileSync(join(root, "docs/reference/protocol.md"), "utf8")).toContain(
        "#### `run.start`",
      );
      expect(readFileSync(join(root, "docs/reference/codes.md"), "utf8")).toContain(
        "`NAME_EXISTS`",
      );
    });

    it("有人手改了生成的参考文档：报错并指出是哪个文件", () => {
      const root = freshRepo();
      const file = join(root, "docs/reference/protocol.md");
      writeFileSync(file, `${readFileSync(file, "utf8")}\n手写的一行\n`);
      const errors = generatedFresh.run(root);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("docs/reference/protocol.md");
      expect(errors[0]).toContain("不要手改这个文件");
    });

    it("生成的文件被删了：报错", () => {
      const root = freshRepo();
      rmSync(join(root, "docs/reference/codes.md"));
      expect(generatedFresh.run(root).join()).toContain("docs/reference/codes.md");
    });

    it("改了中文文案没重新生成：类型文件和文案对照表都过期", () => {
      const root = freshRepo();
      const file = join(root, "packages/i18n/locales/zh-CN/library.json");
      writeFileSync(
        file,
        JSON.stringify({
          ...JSON.parse(readFileSync(file, "utf8")),
          "library.rename.title": "改名 {name}",
        }),
      );
      const errors = generatedFresh.run(root).join("\n");
      expect(errors).toContain("packages/i18n/generated/messages.d.ts");
      expect(errors).toContain("docs/reference/strings.md");
      expect(errors).toContain("packages/i18n/locales/");
    });

    it("协议的定义变了而文档没重新生成：按新定义算，旧文档就是过期的", () => {
      const root = freshRepo();
      const { "run.stopAll": _removed, ...methods } = protocolDefs.methods;
      const changed: ProtocolDefs = { ...protocolDefs, methods };
      const stale = generate(root, changed).filter((file) => !file.fresh);
      expect(stale.map((file) => file.path)).toEqual(["docs/reference/protocol.md"]);
      expect(readFileSync(join(root, "docs/reference/strings.md"), "utf8")).toContain(
        "| library.empty.title | 还没有项目 | No playgrounds yet |",
      );
    });

    it("改了 tokens.json 没重新生成：三个生成文件和 tokens.md 的表都过期，并指向 tokens.json", () => {
      const root = freshRepo();
      const file = join(root, "packages/tokens/src/tokens.json");
      writeFileSync(
        file,
        readFileSync(file, "utf8").replace('"name": "radius-card",', '"name": "radius-card-x",'),
      );
      const errors = generatedFresh.run(root).join("\n");
      expect(errors).toContain("packages/tokens/generated/tokens.css");
      expect(errors).toContain("packages/tokens/generated/tokens.ts");
      expect(errors).toContain("docs/design/tokens.md");
      expect(errors).toContain("packages/tokens/src/tokens.json");
    });

    it("有人手改了 tokens.md 的生成段：报错", () => {
      const root = freshRepo();
      const file = join(root, "docs/design/tokens.md");
      writeFileSync(file, readFileSync(file, "utf8").replace("| Primary (", "| 手改 ("));
      expect(generatedFresh.run(root).join()).toContain("docs/design/tokens.md");
    });

    it("重新生成之后恢复通过", () => {
      const root = freshRepo();
      const file = join(root, "docs/reference/codes.md");
      writeFileSync(file, "过期了");
      expect(generatedFresh.run(root)).not.toEqual([]);
      expect(writeGenerated(root, generate(root))).toEqual(["docs/reference/codes.md"]);
      expect(generatedFresh.run(root)).toEqual([]);
    });
  });

  describe("界面包的图标表", () => {
    const SVG = '<svg viewBox="0 0 16 16"><path d="M1 1"/></svg>';

    function iconRepo(): string {
      const root = repo(`${BEGIN}\n${END}\n`);
      mkdirSync(join(root, "packages/ui/src/icons/svg"), { recursive: true });
      writeFileSync(join(root, "packages/ui/src/icons/svg/dot.svg"), SVG);
      return root;
    }

    it("有图标源文件但没生成图标表：报缺失", () => {
      expect(generatedFresh.run(iconRepo()).join("\n")).toContain(
        "packages/ui/src/icons/generated/icon-paths.ts",
      );
    });

    it("生成之后通过；加了一个图标源文件没重新生成：报过期", () => {
      const root = iconRepo();
      writeGenerated(root, generate(root));
      expect(generatedFresh.run(root)).toEqual([]);
      writeFileSync(join(root, "packages/ui/src/icons/svg/dot-two.svg"), SVG);
      expect(generatedFresh.run(root).join("\n")).toContain("icon-paths.ts");
    });
  });
});
