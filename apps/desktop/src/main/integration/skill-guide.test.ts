import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { skillGuidePath } from "./skill-guide.ts";

it("[DESKTOP-SETTINGS-44] 源码构建和打包各自打开固定目录，文件名按语言选择", () => {
  const root = resolve("skill guide fixture");
  const repo = join(root, "repo");
  const resources = join(root, "resources");
  const source = {
    kind: "source",
    moduleUrl: pathToFileURL(join(repo, "apps", "desktop", "dist", "main", "index.mjs")).href,
  } as const;
  expect(skillGuidePath(source, "zh-CN")).toBe(
    join(repo, "apps", "desktop", "dist", "skill-guide", "SKILL.zh-CN.md"),
  );
  const packaged = { kind: "packaged", resourcesPath: resources } as const;
  expect(skillGuidePath(packaged, "en")).toBe(
    join(resources, "runyard", "skill-guide", "SKILL.md"),
  );
  expect(skillGuidePath(packaged, "zh-CN")).toBe(
    join(resources, "runyard", "skill-guide", "SKILL.zh-CN.md"),
  );
});
