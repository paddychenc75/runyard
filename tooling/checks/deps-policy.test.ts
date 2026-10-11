import { describe, expect, it } from "vitest";
import { depsPolicy } from "./deps-policy.ts";
import { GOOD_WORKSPACE, makeRepo } from "./test-helpers.ts";

const ALLOWLIST = "# 空\n";

function repo(workspace: string, rootPackage: object = {}, allowlist = ALLOWLIST): string {
  return makeRepo({
    "pnpm-workspace.yaml": workspace,
    "package.json": { name: "root", packageManager: "pnpm@11.28.0", ...rootPackage },
    "security/allowlist.toml": allowlist,
  });
}

const failures = (root: string) => depsPolicy.run(root);

describe("deps-policy 检查", () => {
  it("合规配置通过", () => {
    expect(failures(repo(GOOD_WORKSPACE))).toEqual([]);
  });

  it("minimumReleaseAge 过小或缺失", () => {
    expect(failures(repo(GOOD_WORKSPACE.replace("20160", "1440")))[0]).toContain(
      "minimumReleaseAge",
    );
    expect(failures(repo(GOOD_WORKSPACE.replace("minimumReleaseAge: 20160\n", "")))[0]).toContain(
      "minimumReleaseAge",
    );
  });

  it("strictDepBuilds 被关、dangerouslyAllowAllBuilds 出现、allowBuilds 通配", () => {
    expect(failures(repo(`${GOOD_WORKSPACE}strictDepBuilds: false\n`)).join()).toContain(
      "strictDepBuilds",
    );
    expect(failures(repo(`${GOOD_WORKSPACE}dangerouslyAllowAllBuilds: true\n`)).join()).toContain(
      "dangerouslyAllowAllBuilds",
    );
    expect(failures(repo(`${GOOD_WORKSPACE}  "*": true\n`)).join()).toContain("通配");
  });

  it("savePrefix 不是空串", () => {
    expect(
      failures(repo(GOOD_WORKSPACE.replace('savePrefix: ""', 'savePrefix: "^"'))).join(),
    ).toContain("savePrefix");
  });

  it("minimumReleaseAgeExclude 要带版本号和注释", () => {
    const noComment = `${GOOD_WORKSPACE}minimumReleaseAgeExclude:\n  - vite@7.3.7\n`;
    expect(failures(repo(noComment)).join()).toContain("没有注释");
    const noVersion = `${GOOD_WORKSPACE}minimumReleaseAgeExclude:\n  # GHSA-rq7h-c2jc-7f22\n  - vite\n`;
    expect(failures(repo(noVersion)).join()).toContain("没有写精确版本");
    const good = `${GOOD_WORKSPACE}minimumReleaseAgeExclude:\n  # GHSA-rq7h-c2jc-7f22\n  - vite@7.3.7\n`;
    expect(failures(repo(good))).toEqual([]);
  });

  it("package.json 里的 ^、~、latest、范围都拒绝", () => {
    for (const spec of ["^1.2.3", "~1.2.3", "latest", ">=1.0.0", "1.x"]) {
      const root = repo(GOOD_WORKSPACE, { dependencies: { demo: spec } });
      expect(failures(root).join(), spec).toContain("不是精确版本");
    }
    expect(
      failures(repo(GOOD_WORKSPACE, { dependencies: { demo: "1.2.3", zod: "catalog:" } })),
    ).toEqual([]);
  });

  it("peerDependencies 允许范围", () => {
    expect(failures(repo(GOOD_WORKSPACE, { peerDependencies: { demo: "^1.0.0" } }))).toEqual([]);
  });

  it("packageManager 必须是精确版本", () => {
    expect(failures(repo(GOOD_WORKSPACE, { packageManager: "pnpm@^11" })).join()).toContain(
      "packageManager",
    );
  });

  it("catalog 引用不存在的条目", () => {
    expect(failures(repo(GOOD_WORKSPACE, { dependencies: { nope: "catalog:" } })).join()).toContain(
      "catalog 里没有它",
    );
  });

  it("缺少 allowlist.toml", () => {
    const root = makeRepo({
      "pnpm-workspace.yaml": GOOD_WORKSPACE,
      "package.json": { name: "root", packageManager: "pnpm@11.28.0" },
    });
    expect(failures(root).join()).toContain("allowlist.toml");
  });
});
