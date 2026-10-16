import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { writeZip } from "./zip-writer.ts";

/** 测试用的 zip 读取：从末尾的目录读出每个文件（文本），验证写出的包是合法的 zip */
export function readZip(bytes: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(bytes);
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("not a zip: no end record");
  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("bad central header");
    const packedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    const localName = buffer.readUInt16LE(localOffset + 26);
    const localExtra = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localName + localExtra;
    files.set(name, inflateRawSync(buffer.subarray(start, start + packedSize)).toString("utf8"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

describe("writeZip", () => {
  it("写出的包能被读回：文件名（含中文）和内容一致", () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    const zip = writeZip([
      { name: "a.json", data: encode('{"a":1}') },
      { name: "runs/日志.log", data: encode("第一行\n".repeat(200)) },
      { name: "empty.txt", data: encode("") },
    ]);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(["a.json", "runs/日志.log", "empty.txt"]);
    expect(files.get("a.json")).toBe('{"a":1}');
    expect(files.get("runs/日志.log")).toBe("第一行\n".repeat(200));
    expect(files.get("empty.txt")).toBe("");
  });

  it("同样的内容得到同样的字节", () => {
    const entries = [{ name: "a", data: new TextEncoder().encode("x") }];
    expect([...writeZip(entries)]).toEqual([...writeZip(entries)]);
  });
});
