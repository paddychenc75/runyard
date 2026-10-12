import { describe, expect, it } from "vitest";
import type { LintIssue } from "./lint-issue.ts";
import { sampleKnownTools, sampleTemplate } from "./sample-templates.ts";
import { templateSchema } from "./template-file.ts";
import { validateTemplate } from "./validate-template.ts";

type Raw = Record<string, unknown>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const tpl = (patch: (template: Raw) => void): Raw => {
  const template = clone(sampleTemplate) as Raw;
  patch(template);
  return template;
};
const rules = (issues: LintIssue[]) => issues.map((issue) => issue.rule);
const options = { knownTools: sampleKnownTools };
const requireNode = (version: string) =>
  tpl((t) => {
    t.requires = { node: { version } };
  });

describe("template.json 的字段和校验", () => {
  it("样例模板通过，没有警告；内置模板带维护者也通过", () => {
    const result = validateTemplate(sampleTemplate, { ...options, builtin: true });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.value).toEqual(templateSchema.parse(sampleTemplate));
  });

  it("名称写成纯字符串，说明可以为空串", () => {
    const result = validateTemplate(
      tpl((t) => {
        t.name = "React";
        t.description = "";
      }),
      options,
    );
    expect(result.errors).toEqual([]);
  });

  it("[TEMPLATES-FORMAT-05] 名称缺少英文报 name-missing-en；写成纯字符串则通过", () => {
    const missing = validateTemplate(
      tpl((t) => {
        t.name = { "zh-CN": "静态页面" };
      }),
      options,
    );
    expect(missing.errors).toEqual([
      expect.objectContaining({ rule: "name-missing-en", path: "name" }),
    ]);
    expect(missing.value).toBeUndefined();
    const plain = validateTemplate(
      tpl((t) => {
        t.name = "静态页面";
      }),
      options,
    );
    expect(plain.errors).toEqual([]);
  });

  it("说明缺少英文同样不通过（报 template-json-invalid，路径指向 description）", () => {
    const result = validateTemplate(
      tpl((t) => {
        t.description = { "zh-CN": "说明" };
      }),
      options,
    );
    expect(result.errors).toEqual([
      expect.objectContaining({ rule: "template-json-invalid", path: "description" }),
    ]);
  });

  it("[TEMPLATES-FORMAT-06] 缺必填字段报 template-json-invalid，路径指向缺的字段", () => {
    for (const field of [
      "runner",
      "id",
      "name",
      "description",
      "category",
      "entry",
      "formatVersion",
    ]) {
      const result = validateTemplate(
        tpl((t) => {
          delete t[field];
        }),
        options,
      );
      expect(result.errors).toEqual([
        expect.objectContaining({ rule: "template-json-invalid", path: field }),
      ]);
    }
  });

  it.each(["My_Template", "-a", "a-", "A", "a b", "a.b", ""])(
    "[TEMPLATES-FORMAT-07] 模板标识 %j 写法不对，报 template-json-invalid",
    (id) => {
      const result = validateTemplate(
        tpl((t) => {
          t.id = id;
        }),
        options,
      );
      expect(result.errors).toEqual([
        expect.objectContaining({ rule: "template-json-invalid", path: "id" }),
      ]);
    },
  );

  it.each(["a", "react19", "node-ts", "my-pricing-2", "0x"])("模板标识 %s 合法", (id) => {
    expect(
      validateTemplate(
        tpl((t) => {
          t.id = id;
        }),
        options,
      ).errors,
    ).toEqual([]);
  });

  it("[TEMPLATES-FORMAT-10] 内置模板缺 maintainer 报 maintainer-missing；用户模板不报", () => {
    const without = tpl((t) => {
      delete t.maintainer;
    });
    expect(validateTemplate(without, { ...options, builtin: true }).errors).toEqual([
      expect.objectContaining({ rule: "maintainer-missing", path: "maintainer" }),
    ]);
    expect(validateTemplate(without, options).errors).toEqual([]);
    expect(validateTemplate(without, { ...options, builtin: false }).errors).toEqual([]);
  });

  it("分类和标签是固定的标识；nuxt3 用的 unmaintained 合法", () => {
    expect(
      validateTemplate(
        tpl((t) => {
          t.tags = ["unmaintained"];
        }),
        options,
      ).errors,
    ).toEqual([]);
    for (const patch of [{ category: "games" }, { tags: ["hot"] }])
      expect(rules(validateTemplate({ ...sampleTemplate, ...patch }, options).errors)).toEqual([
        "template-json-invalid",
      ]);
  });

  it("模板不含命令也没有钩子：多出来的字段（如 scripts、hooks）被拒绝", () => {
    for (const field of ["scripts", "hooks", "postcreate", "run", "command"])
      expect(
        rules(
          validateTemplate(
            tpl((t) => {
              t[field] = ["postcreate.sh"];
            }),
            options,
          ).errors,
        ),
      ).toEqual(["template-json-invalid"]);
  });

  it("变量名只能是字母、数字、下划线，默认值是字符串", () => {
    expect(
      rules(
        validateTemplate(
          tpl((t) => {
            t.variables = { "bad-name": "x" };
          }),
          options,
        ).errors,
      ),
    ).toEqual(["template-json-invalid"]);
    expect(
      rules(
        validateTemplate(
          tpl((t) => {
            t.variables = { title: 3 };
          }),
          options,
        ).errors,
      ),
    ).toEqual(["template-json-invalid"]);
  });

  it("不是对象的内容被拒绝", () => {
    for (const raw of [null, "template", 7, []])
      expect(rules(validateTemplate(raw, options).errors)).toEqual(["template-json-invalid"]);
  });
});

describe("路径不许逃出 files/", () => {
  it.each(["../secret", "/etc/passwd", "a/../../b", "C:/x", "..\\x"])(
    "[TEMPLATES-FORMAT-04] entry 写成 %s 报 path-escape，不通过",
    (entry) => {
      const result = validateTemplate(
        tpl((t) => {
          t.entry = entry;
        }),
        options,
      );
      expect(result.errors).toEqual([
        expect.objectContaining({ rule: "path-escape", path: "entry" }),
      ]);
      expect(result.value).toBeUndefined();
    },
  );

  it("[TEMPLATES-FORMAT-04] 文件列表 substitute 里的逃逸路径也报，路径指向那一项", () => {
    const result = validateTemplate(
      tpl((t) => {
        t.substitute = ["index.html", "../secret", "/abs/file"];
      }),
      options,
    );
    expect(result.errors).toEqual([
      expect.objectContaining({ rule: "path-escape", path: "substitute.1" }),
      expect.objectContaining({ rule: "path-escape", path: "substitute.2" }),
    ]);
  });

  it("files/ 之内的子目录路径不算逃逸", () => {
    expect(
      validateTemplate(
        tpl((t) => {
          t.entry = "src/deep/main.ts";
          t.substitute = ["src/deep/main.ts", ".env.example"];
        }),
        options,
      ).errors,
    ).toEqual([]);
  });
});

describe("格式版本号", () => {
  it("[TEMPLATES-FORMAT-11] 比认识的更新的版本：只报 format-version-unsupported，不使用该文件", () => {
    const result = validateTemplate(
      tpl((t) => {
        t.formatVersion = 2;
        delete t.runner;
      }),
      options,
    );
    expect(result.errors).toEqual([
      expect.objectContaining({ rule: "format-version-unsupported", path: "formatVersion" }),
    ]);
    expect(result.value).toBeUndefined();
  });

  it("版本号不是正整数（0、1.5、字符串）是格式错误，不是“更新的版本”", () => {
    for (const formatVersion of [0, 1.5, "1", -1])
      expect(
        rules(
          validateTemplate(
            tpl((t) => {
              t.formatVersion = formatVersion;
            }),
            options,
          ).errors,
        ),
      ).toEqual(["template-json-invalid"]);
  });
});

describe("运行环境 requires", () => {
  it("[TEMPLATES-FORMAT-27] 没有声明 requires 报 requires-missing；写 {} 通过", () => {
    const missing = validateTemplate(
      tpl((t) => {
        delete t.requires;
      }),
      options,
    );
    expect(missing.errors).toEqual([
      expect.objectContaining({ rule: "requires-missing", path: "requires" }),
    ]);
    expect(
      validateTemplate(
        tpl((t) => {
          t.requires = {};
        }),
        options,
      ).errors,
    ).toEqual([]);
  });

  it("requires 写成别的类型是 template-json-invalid", () => {
    expect(
      rules(
        validateTemplate(
          tpl((t) => {
            t.requires = ["node"];
          }),
          options,
        ).errors,
      ),
    ).toEqual(["template-json-invalid"]);
  });

  it("[TEMPLATES-FORMAT-28] 范围写法：latest、^22 报 range-invalid；>=22.18 <27 通过", () => {
    for (const version of ["latest", "^22"]) {
      const result = validateTemplate(requireNode(version), options);
      expect(result.errors).toEqual([
        expect.objectContaining({ rule: "range-invalid", path: "requires.node.version" }),
      ]);
    }
    const ok = validateTemplate(requireNode(">=22.18 <27"), options);
    expect(ok.errors).toEqual([]);
    expect(ok.warnings).toEqual([]);
  });

  it("[TEMPLATES-FORMAT-29] 只有下限只是警告：通过，警告里有 range-no-upper", () => {
    const result = validateTemplate(requireNode(">=1.26"), options);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ rule: "range-no-upper", path: "requires.node.version" }),
    ]);
    expect(result.value).toBeDefined();
  });

  it("[TEMPLATES-FORMAT-30] 没有下限报 range-invalid", () => {
    const result = validateTemplate(requireNode("<27"), options);
    expect(result.errors).toEqual([expect.objectContaining({ rule: "range-invalid" })]);
    expect(result.warnings).toEqual([]);
  });

  it("[TEMPLATES-FORMAT-31] 不认识的工具报 tool-unknown；写了 install 则通过", () => {
    const unknown = tpl((t) => {
      t.requires = { zig: { version: ">=0.13 <1" } };
    });
    expect(validateTemplate(unknown, options).errors).toEqual([
      expect.objectContaining({ rule: "tool-unknown", path: "requires.zig" }),
    ]);
    const withInstall = tpl((t) => {
      t.requires = {
        zig: {
          version: ">=0.13 <1",
          install: { command: ["brew", "install", "zig"], url: "https://ziglang.org/download" },
        },
      };
    });
    expect(validateTemplate(withInstall, options).errors).toEqual([]);
  });

  it("[TEMPLATES-FORMAT-32] fallback 指向未知工具报 tool-unknown；指向已知工具通过", () => {
    const bad = tpl((t) => {
      t.requires = { pnpm: { version: ">=10.34.6 <12", fallback: "yarn" } };
    });
    expect(validateTemplate(bad, options).errors).toEqual([
      expect.objectContaining({ rule: "tool-unknown", path: "requires.pnpm.fallback" }),
    ]);
    expect(validateTemplate(sampleTemplate, options).errors).toEqual([]);
  });

  it("不给工具清单时不检查 tool-unknown（调用方没有工具定义可对）", () => {
    const unknown = tpl((t) => {
      t.requires = { zig: { version: ">=0.13 <1" } };
    });
    expect(validateTemplate(unknown).errors).toEqual([]);
  });

  it("install 至少要给命令或链接之一，链接必须是 https", () => {
    for (const install of [{}, { url: "http://example.com" }, { command: [] }])
      expect(
        rules(
          validateTemplate(
            tpl((t) => {
              t.requires = { zig: { version: ">=0.13 <1", install } };
            }),
            options,
          ).errors,
        ),
      ).toContain("template-json-invalid");
  });

  it("[TEMPLATES-FORMAT-38] 一次报全：缺 requires、名称缺英文、入口逃逸三处同时出现", () => {
    const result = validateTemplate(
      tpl((t) => {
        delete t.requires;
        t.name = { "zh-CN": "x" };
        t.entry = "../x";
      }),
      { ...options, builtin: true },
    );
    expect(rules(result.errors).sort()).toEqual(
      ["name-missing-en", "path-escape", "requires-missing"].sort(),
    );
    // 内置模板没有 maintainer 时是第四项
    const four = validateTemplate(
      tpl((t) => {
        delete t.requires;
        delete t.maintainer;
        t.entry = "../x";
      }),
      { ...options, builtin: true },
    );
    expect(rules(four.errors).sort()).toEqual(
      ["maintainer-missing", "path-escape", "requires-missing"].sort(),
    );
  });
});
