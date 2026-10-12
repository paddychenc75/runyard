import { describe, expect, it } from "vitest";
import { sampleTemplate } from "./sample-templates.ts";
import { type Template, templateSchema } from "./template-file.ts";
import {
  checkTemplateFiles,
  findPlaceholders,
  type TemplateFiles,
} from "./validate-template-files.ts";

// 内存里的 files/：路径到文本
function folder(files: Record<string, string>): TemplateFiles {
  return {
    has: (path) => Object.hasOwn(files, path),
    text: (path) => files[path],
  };
}
const template = (patch: Partial<Template> = {}): Template =>
  templateSchema.parse({ ...sampleTemplate, ...patch });

describe("需要看 files/ 内容的规则", () => {
  it("样例模板配上齐全的文件：没有问题；{{name}} 与已声明的 {{title}} 都不报", () => {
    const files = folder({
      "src/App.tsx": "export {}",
      "index.html": "<title>{{title}} - {{name}}</title>",
    });
    expect(checkTemplateFiles(template(), files)).toEqual([]);
  });

  it("[TEMPLATES-FORMAT-09] 入口文件不存在报 entry-missing", () => {
    const issues = checkTemplateFiles(template(), folder({ "index.html": "" }));
    expect(issues).toEqual([expect.objectContaining({ rule: "entry-missing", path: "entry" })]);
  });

  it("[TEMPLATES-FORMAT-08] 变量没有声明报 variable-undeclared；{{name}} 不触发", () => {
    const files = folder({
      "src/App.tsx": "",
      "index.html": "{{color}} and {{name}} and {{title}}",
    });
    const issues = checkTemplateFiles(template(), files);
    expect(issues).toEqual([
      expect.objectContaining({ rule: "variable-undeclared", path: "substitute.0" }),
    ]);
    expect(issues[0]?.message).toContain("{{color}}");
  });

  it("只检查 substitute 里列出的文件：没列出的文件里的 {{x}} 不管", () => {
    const files = folder({
      "src/App.tsx": "{{undeclared}}",
      "index.html": "{{title}}",
      "other.txt": "{{another}}",
    });
    expect(checkTemplateFiles(template(), files)).toEqual([]);
  });

  it("没有 variables 时，{{name}} 之外的占位符都算没声明", () => {
    const bare = template({ variables: undefined });
    const issues = checkTemplateFiles(
      bare,
      folder({ "src/App.tsx": "", "index.html": "{{title}}{{name}}" }),
    );
    expect(issues.map((issue) => issue.rule)).toEqual(["variable-undeclared"]);
  });

  it("substitute 里的文件不存在也不通过（报 template-json-invalid，路径指向那一项）", () => {
    const issues = checkTemplateFiles(template(), folder({ "src/App.tsx": "" }));
    expect(issues).toEqual([
      expect.objectContaining({ rule: "template-json-invalid", path: "substitute.0" }),
    ]);
  });

  it("逃逸路径交给 path-escape，这里不再重复报文件不存在", () => {
    // 逃逸的路径过不了 zod，所以这里绕过解析直接构造
    const escaping = { ...template(), substitute: ["../x"] };
    expect(checkTemplateFiles(escaping, folder({ "src/App.tsx": "" }))).toEqual([]);
  });

  it("同一个未声明的变量在一个文件里出现多次，只报一次", () => {
    const issues = checkTemplateFiles(
      template(),
      folder({ "src/App.tsx": "", "index.html": "{{c}}{{c}}{{c}}" }),
    );
    expect(issues).toHaveLength(1);
  });
});

describe("占位符是字面的 {{名字}}", () => {
  it("只认花括号里是变量名的写法：没有空格、表达式、条件", () => {
    expect(findPlaceholders("{{a}} {{ b }} {{c.d}} {{#if x}} {{e + 1}} {{f_1}}")).toEqual([
      "a",
      "f_1",
    ]);
    expect(findPlaceholders("no placeholders, {single} and {{")).toEqual([]);
  });
});
