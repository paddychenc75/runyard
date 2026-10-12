import { describe, expect, it } from "vitest";
import {
  CONTRACT_DIR,
  checkPlatformContract,
  INTERFACE_FILE,
  listPlatformMembers,
  platformContract,
} from "./platform-contract.ts";
import { makeRepo } from "./test-helpers.ts";

// 与 packages/platform/src/platform.ts 同样的写法：只读属性、分组、带内联对象参数的方法、注释
const INTERFACE = `
import type { X } from "./x.ts";

/** 不是成员的注释：fake.member; */
export interface Platform {
  readonly id: "darwin" | "linux";
  readonly caps: {
    /** 注释里的 fake.thing 不算 */
    readonly gracefulStop: "graceful" | "none";
    readonly symlinks: boolean;
  };
  readonly exec: {
    which(name: string): Promise<string | null>;
    spawn(spec: { argv: string[]; cwd: string }): X;
    optional?: number;
  };
  watch(
    root: string,
    cb: (events: X[]) => void,
  ): Promise<void>;
}
export interface Other { readonly notMine: string; }
`;
const MEMBERS = [
  "id",
  "caps.gracefulStop",
  "caps.symlinks",
  "exec.which",
  "exec.spawn",
  "exec.optional",
  "watch",
];
const FULL_CONTRACT = MEMBERS.map((member) => `describe("${member}", () => {});`).join("\n");

describe("listPlatformMembers", () => {
  it("列出直接成员，分组展开成 分组.成员，注释和别的接口不算", () => {
    expect(listPlatformMembers(INTERFACE)).toEqual(MEMBERS);
  });

  it("找不到 Platform 接口时返回 undefined", () => {
    expect(listPlatformMembers("export interface Other { a: 1; }")).toBeUndefined();
  });
});

describe("checkPlatformContract", () => {
  it("每个成员都在契约测试里出现时通过", () => {
    expect(checkPlatformContract(INTERFACE, [FULL_CONTRACT])).toEqual([]);
  });

  it("成员分散在多个契约文件里也算出现", () => {
    const [first = "", ...rest] = FULL_CONTRACT.split("\n");
    expect(checkPlatformContract(INTERFACE, [first, rest.join("\n")])).toEqual([]);
  });

  it("缺一个成员就报错并点名（失败样例）", () => {
    const without = FULL_CONTRACT.replace('describe("exec.spawn", () => {});', "");
    const errors = checkPlatformContract(INTERFACE, [without]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("exec.spawn");
    expect(errors[0]).toContain(CONTRACT_DIR);
  });

  it("只出现在注释或别的字符串里的子串不算：必须是恰好等于成员名的字符串", () => {
    const sloppy = `// exec.which exec.spawn\nit("测 exec.which 和 watch 的行为", () => {});`;
    expect(checkPlatformContract(INTERFACE, [sloppy]).join()).toContain("exec.which");
  });

  it("接口文件解析不出来时报错，不会静默通过", () => {
    expect(checkPlatformContract("export const x = 1;", [FULL_CONTRACT]).join()).toContain(
      INTERFACE_FILE,
    );
  });
});

describe("platformContract 检查", () => {
  it("平台包还没建时通过", () => {
    expect(platformContract.run(makeRepo({ "README.md": "x" }))).toEqual([]);
  });

  it("读仓库里的接口和契约目录", () => {
    const good = makeRepo({
      [INTERFACE_FILE]: INTERFACE,
      [`${CONTRACT_DIR}all.contract.ts`]: FULL_CONTRACT,
    });
    expect(platformContract.run(good)).toEqual([]);

    const bad = makeRepo({
      [INTERFACE_FILE]: INTERFACE,
      [`${CONTRACT_DIR}some.contract.ts`]: 'describe("id", () => {});',
    });
    expect(platformContract.run(bad)).toHaveLength(MEMBERS.length - 1);
  });

  it("契约目录之外的文件里出现成员名不算", () => {
    const repo = makeRepo({
      [INTERFACE_FILE]: INTERFACE,
      "packages/platform/src/elsewhere.ts": FULL_CONTRACT,
    });
    expect(platformContract.run(repo)).toHaveLength(MEMBERS.length);
  });
});
