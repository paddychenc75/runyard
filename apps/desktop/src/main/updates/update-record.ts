import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// 检查更新的记录：哪天查过、查到的新版本、用户对哪个版本点过“以后再说”。
// 存在应用自己的数据目录里的一个小文件，只是界面状态；读不了或内容不对当作没有。

export interface UpdateRecord {
  /** 上次发出检查请求的本地日期，写成 YYYY-MM-DD */
  checkedOn: string;
  /** 上次查到的比当时的版本更新的正式版；没有是 null */
  latest: { version: string; url: string } | null;
  /** 点过“以后再说”的版本 */
  dismissed: string | null;
  /** 成功请求浏览器打开下载页的版本；旧记录没有此字段，不把旧“以后再说”当处理。 */
  handledVersion?: string | null;
}

export interface UpdateStore {
  load(): Promise<UpdateRecord | null>;
  save(record: UpdateRecord): Promise<void>;
}

function parse(raw: string): UpdateRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { checkedOn, latest, dismissed, handledVersion } = value as Record<string, unknown>;
  if (typeof checkedOn !== "string") return null;
  let found: UpdateRecord["latest"] = null;
  if (typeof latest === "object" && latest !== null) {
    const { version, url } = latest as Record<string, unknown>;
    if (typeof version === "string" && typeof url === "string") found = { version, url };
  }
  return {
    checkedOn,
    latest: found,
    dismissed: typeof dismissed === "string" ? dismissed : null,
    handledVersion: typeof handledVersion === "string" ? handledVersion : null,
  };
}

export class FileUpdateStore implements UpdateStore {
  readonly #file: string;

  constructor(file: string) {
    this.#file = file;
  }

  async load(): Promise<UpdateRecord | null> {
    try {
      return parse(await readFile(this.#file, "utf8"));
    } catch {
      return null;
    }
  }

  /** 先写临时文件再改名，中途被结束也不会留下写了一半的记录 */
  async save(record: UpdateRecord): Promise<void> {
    try {
      await mkdir(dirname(this.#file), { recursive: true });
      const temp = `${this.#file}.tmp`;
      await writeFile(temp, JSON.stringify(record), "utf8");
      await rename(temp, this.#file);
    } catch {
      // 记不下来最坏是多查一次，不影响使用
    }
  }
}
