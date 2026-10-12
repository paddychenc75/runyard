import { describe, expect, it } from "vitest";
import { frameSchema, toKnownError } from "./frame.ts";
import { createLineDecoder } from "./ndjson.ts";

const valid = {
  req: { t: "req", id: 1, method: "supervisor.info", params: {} },
  resOk: { t: "res", id: 1, ok: true, result: { runs: 0 } },
  resErr: {
    t: "res",
    id: 2,
    ok: false,
    error: { code: "NAME_EXISTS", params: { name: "demo" }, debug: "exists" },
  },
  evt: { t: "evt", sub: 1, seq: 0, event: "run.state", data: { state: "ready" } },
};

describe("Frame", () => {
  it("四种帧的合法样例通过", () => {
    for (const frame of Object.values(valid)) {
      expect(frameSchema.safeParse(frame).success).toBe(true);
    }
  });

  it("非法样例被拒", () => {
    const bad: unknown[] = [
      null,
      "req",
      {},
      { t: "req", id: 1, params: {} }, // 缺 method
      { t: "req", id: 1.5, method: "x" }, // id 不是整数
      { t: "req", id: -1, method: "x" },
      { t: "req", id: "1", method: "x" },
      { t: "res", id: 1 }, // 缺 ok
      { t: "res", id: 1, ok: false }, // 失败响应缺 error
      { t: "res", id: 1, ok: false, error: { code: "", params: {}, debug: "" } },
      { t: "res", id: 1, ok: false, error: { code: "X", params: {} } }, // 缺 debug
      { t: "evt", sub: 1, event: "x" }, // 缺 seq
      { t: "evt", sub: 1, seq: -1, event: "x" },
      { t: "challenge", nonce: "x" }, // 握手消息不是帧
    ];
    for (const frame of bad) {
      expect(frameSchema.safeParse(frame).success, JSON.stringify(frame)).toBe(false);
    }
  });

  it("[PROTOCOL-HANDSHAKE-20] 帧里多出来的字段被忽略", () => {
    const parsed = frameSchema.parse({ ...valid.req, extra: 1 });
    expect(parsed).toEqual(valid.req);
  });

  it("[PROTOCOL-HANDSHAKE-17] 不认识的错误码仍是合法的响应帧，toKnownError 返回 undefined", () => {
    const frame = frameSchema.parse({
      t: "res",
      id: 3,
      ok: false,
      error: { code: "FUTURE_CODE", params: { x: 1 }, debug: "d" },
    });
    expect(frame.t === "res" && !frame.ok && toKnownError(frame.error)).toBeUndefined();
  });

  it("登记过的错误码被 toKnownError 收窄，参数不对则不算", () => {
    const frame = frameSchema.parse(valid.resErr);
    expect(frame.t === "res" && !frame.ok && toKnownError(frame.error)?.code).toBe("NAME_EXISTS");
    expect(toKnownError({ code: "NAME_EXISTS", params: {}, debug: "d" })).toBeUndefined();
  });

  it("经过分帧解码器再校验，端到端走通", () => {
    const decoder = createLineDecoder();
    const [first] = decoder.push(`${JSON.stringify(valid.evt)}\n`);
    expect(first?.ok && frameSchema.safeParse(first.value).success).toBe(true);
  });
});

describe("属性：任意 JSON 值不让帧校验抛错", () => {
  it("随机结构", () => {
    let seed = 7;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const gen = (depth: number): unknown => {
      const r = rand();
      if (depth <= 0 || r < 0.3)
        return [null, true, 1, -1, 1.5, "req", "res", "evt", ""][Math.floor(rand() * 9)];
      if (r < 0.5) return Array.from({ length: Math.floor(rand() * 3) }, () => gen(depth - 1));
      const keys = [
        "t",
        "id",
        "ok",
        "method",
        "params",
        "error",
        "code",
        "debug",
        "sub",
        "seq",
        "event",
        "result",
      ];
      return Object.fromEntries(
        Array.from({ length: Math.floor(rand() * 6) }, () => [
          keys[Math.floor(rand() * keys.length)],
          gen(depth - 1),
        ]),
      );
    };
    for (let i = 0; i < 3000; i++) {
      expect(() => frameSchema.safeParse(gen(3))).not.toThrow();
    }
  });
});
