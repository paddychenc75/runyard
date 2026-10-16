import { describe, expect, it } from "vitest";
import { z } from "zod";
import { protocolDefs } from "./generate.ts";
import { type ProtocolDefs, renderCodes, renderProtocol } from "./render-reference.ts";

// 用真实的协议定义生成，再对生成结果做结构上的检查：登记表里有的，文档里都有

describe("协议参考文档", () => {
  const protocol = renderProtocol(protocolDefs);
  const codes = renderCodes(protocolDefs);

  it("每个方法和每个事件在参考文档里各有一节", () => {
    for (const name of Object.keys(protocolDefs.methods))
      expect(protocol).toContain(`#### \`${name}\``);
    for (const name of Object.keys(protocolDefs.events))
      expect(protocol).toContain(`#### \`${name}\``);
  });

  it("只占名字的方法写明回 NOT_SUPPORTED，不编造入参出参", () => {
    const section = protocol.slice(protocol.indexOf("#### `request.send`"));
    expect(section.slice(0, 300)).toContain("只占名字");
  });

  it("带名字的共用类型各有一节", () => {
    for (const name of ["Playground", "RunSnapshot", "Owner", "LogEntry", "Settings"]) {
      expect(protocol).toContain(`### \`${name}\``);
    }
  });

  it("错误码表覆盖登记表里的每个错误码，退出码表按退出码分组", () => {
    for (const [name, def] of Object.entries(protocolDefs.errors)) {
      expect(codes).toContain(`| ${def.exit} | \`${name}\` |`);
    }
    expect(codes).toContain(
      "| 9 | `NAME_EXISTS`、`BUSY`、`PATH_LOCKED`、`PATH_TOO_LONG`、`TRASH_UNAVAILABLE`、`PORT_IN_USE` |",
    );
  });

  it("提示码和枚举也在登记表文档里", () => {
    for (const name of Object.keys(protocolDefs.notices))
      expect(codes).toContain(`| \`${name}\` |`);
    expect(codes).toContain("| `runStates` | `checking`、");
  });

  it("同样的定义生成同样的文字（不依赖时间、顺序或系统）", () => {
    expect(renderProtocol(protocolDefs)).toBe(protocol);
    expect(renderCodes(protocolDefs)).toBe(codes);
    expect(protocol).not.toContain("\r");
  });

  it("定义变了，文字就变：新增一个方法，参考文档里多出一节", () => {
    const extra: ProtocolDefs = {
      ...protocolDefs,
      methods: {
        ...protocolDefs.methods,
        "run.extra": {
          group: "run",
          summary: "测试用",
          params: z.object({ a: z.string() }),
          result: z.object({}),
          errors: [],
          status: "defined",
        },
      },
    };
    const changed = renderProtocol(extra);
    expect(changed).not.toBe(protocol);
    expect(changed).toContain("#### `run.extra`");
  });
});
