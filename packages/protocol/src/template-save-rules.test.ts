import { describe, expect, it } from "vitest";
import { templateDefaultExclusion } from "./template-save-rules.ts";

describe("templateDefaultExclusion", () => {
  it("依赖目录在任何深度都是依赖，构建产物目录只在项目根", () => {
    expect(templateDefaultExclusion("node_modules", true)).toBe("dependencies");
    expect(templateDefaultExclusion("packages/a/node_modules", true)).toBe("dependencies");
    expect(templateDefaultExclusion("dist", true)).toBe("build");
    expect(templateDefaultExclusion("src/build", true)).toBeNull();
  });

  it(".env 和 .env.local 是密钥文件，.envrc 之类不是；目录名叫 .env 不算", () => {
    expect(templateDefaultExclusion(".env", false)).toBe("secret");
    expect(templateDefaultExclusion("config/.env.local", false)).toBe("secret");
    expect(templateDefaultExclusion(".envrc", false)).toBeNull();
    expect(templateDefaultExclusion(".env", true)).toBeNull();
  });

  it("普通源码文件不排除", () => {
    expect(templateDefaultExclusion("src/index.ts", false)).toBeNull();
  });
});
