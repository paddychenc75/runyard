import { crc32, deflateRawSync } from "node:zlib";

// 最小的 zip 写入器：只写诊断包要的东西（文本文件，deflate 压缩，UTF-8 文件名）。
// 不加依赖：格式很小，写在这里比引入一个包更容易审。不支持 zip64，诊断包不会大到需要它。

export interface ZipEntry {
  /** 包内路径，用 / 分隔 */
  readonly name: string;
  readonly data: Uint8Array;
}

const UTF8_FLAG = 0x0800;
const VERSION = 20;
// 固定的时间戳（1980-01-01），让同样的内容得到同样的字节，测试好比较
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}
function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.from(entry.data);
    const packed = deflateRawSync(raw);
    const checksum = crc32(raw);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(VERSION),
      u16(UTF8_FLAG),
      u16(8),
      u16(DOS_TIME),
      u16(DOS_DATE),
      u32(checksum),
      u32(packed.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      name,
      packed,
    ]);
    central.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(VERSION),
        u16(VERSION),
        u16(UTF8_FLAG),
        u16(8),
        u16(DOS_TIME),
        u16(DOS_DATE),
        u32(checksum),
        u32(packed.length),
        u32(raw.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    parts.push(local);
    offset += local.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(directory.length),
    u32(offset),
    u16(0),
  ]);
  return new Uint8Array(Buffer.concat([...parts, directory, end]));
}
