import type { z } from "zod";

// 磁盘文件的版本与升级链框架（技术设计 §4.2；docs/architecture/storage.md 第 3 节）。
// 只有纯函数：读文件、写文件、改名留存坏文件、加锁都不在这里，由 core、supervisor 做。
//
// 规则：
// - 每种文件有整数 formatVersion 和一条升级链：migrations[N] 把 vN 升到 vN+1，读入时在内存里
//   逐级升到最新，下次写入才落盘。
// - 读到比程序认识的更新的版本：返回 newer，调用方只读不写（不升、不降、不重写），
//   并提示需要更新版本的 Runyard。这样旧命令行不会把新应用写的文件改坏。
// - 解析失败（不是 JSON、不是对象、版本号不对、升级抛错、形状不合法）：返回 corrupt，
//   由调用方按 recovery 处理（改名留存坏文件，再重建或回到默认）。

export type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

// 坏文件的处理方式，对应 storage.md 第 3 节的“解析失败”：
// rescan：索引从磁盘重扫；defaults：回到默认并提示一次；discard：这是缓存或临时记录，丢掉重来；
// skip：这一个文件不可用，其余照常（调用方报告，不重写它）
export type Recovery = "rescan" | "defaults" | "discard" | "skip";

export interface FileFormat<S extends z.ZodType = z.ZodType> {
  // 文件名，只用于日志和错误现场
  name: string;
  currentVersion: number;
  // 最新版本的形状，必须含 formatVersion: currentVersion
  schema: S;
  // 键 N 表示 vN 到 vN+1；必须恰好覆盖 1 到 currentVersion-1
  migrations: Readonly<Record<number, Migration>>;
  recovery: Recovery;
}

export function defineFileFormat<S extends z.ZodType>(format: FileFormat<S>): FileFormat<S> {
  if (!Number.isInteger(format.currentVersion) || format.currentVersion < 1)
    throw new RangeError(`${format.name}: currentVersion must be a positive integer`);
  const keys = Object.keys(format.migrations)
    .map(Number)
    .sort((a, b) => a - b);
  const expected = Array.from({ length: format.currentVersion - 1 }, (_, i) => i + 1);
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i]))
    throw new RangeError(
      `${format.name}: migrations must cover exactly v1 to v${format.currentVersion - 1}`,
    );
  return format;
}

export type CorruptReason =
  | "not-json"
  | "not-object"
  | "bad-version"
  | "migration-failed"
  | "invalid";

export type ReadResult<T> =
  | {
      status: "ok";
      value: T;
      // 文件里原来的版本；比当前旧时才有，写入时才落盘
      upgradedFrom?: number;
    }
  | {
      // 文件比程序认识的更新：不解析内容，只读不写
      status: "newer";
      readOnly: true;
      fileVersion: number;
      supportedVersion: number;
      raw: Record<string, unknown>;
    }
  | {
      status: "corrupt";
      reason: CorruptReason;
      recovery: Recovery;
      // 给日志看的诊断，不是用户文案；形如 "路径: 原因"
      details: string[];
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// JSON 值的深拷贝：迁移函数拿到的是副本，改它不会影响调用方手里的原始数据
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function readVersioned<S extends z.ZodType>(
  format: FileFormat<S>,
  raw: unknown,
): ReadResult<z.output<S>> {
  const corrupt = (reason: CorruptReason, details: string[] = []): ReadResult<z.output<S>> => ({
    status: "corrupt",
    reason,
    recovery: format.recovery,
    details,
  });
  if (!isPlainObject(raw)) return corrupt("not-object");
  const version = raw.formatVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1)
    return corrupt("bad-version");
  if (version > format.currentVersion) {
    return {
      status: "newer",
      readOnly: true,
      fileVersion: version,
      supportedVersion: format.currentVersion,
      raw,
    };
  }

  let data: Record<string, unknown> = cloneJson(raw);
  for (let from = version; from < format.currentVersion; from++) {
    try {
      const next = format.migrations[from]?.(data);
      if (!isPlainObject(next)) return corrupt("migration-failed", [`v${from}: not an object`]);
      // formatVersion 由框架盖章，迁移函数不用也不许自己写错
      data = { ...next, formatVersion: from + 1 };
    } catch (error) {
      return corrupt("migration-failed", [`v${from}: ${String(error)}`]);
    }
  }

  const parsed = format.schema.safeParse(data);
  if (!parsed.success) {
    return corrupt(
      "invalid",
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  return version < format.currentVersion
    ? { status: "ok", value: parsed.data, upgradedFrom: version }
    : { status: "ok", value: parsed.data };
}

// 文件内容是文本时用这个：JSON 解析失败也是 corrupt
export function readVersionedText<S extends z.ZodType>(
  format: FileFormat<S>,
  text: string,
): ReadResult<z.output<S>> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      status: "corrupt",
      reason: "not-json",
      recovery: format.recovery,
      details: [String(error)],
    };
  }
  return readVersioned(format, raw);
}

// 只有读入成功（ok）的才能写回；newer 和 corrupt 一律不许写，防止旧程序改坏新文件
export function canWrite(result: ReadResult<unknown>): boolean {
  return result.status === "ok";
}

// 序列化：校验后缩进 2 格、结尾换行。值必须是最新版本的形状；schema 里放行的未知字段原样带出
export function serializeVersioned<S extends z.ZodType>(
  format: FileFormat<S>,
  value: z.input<S>,
): string {
  const checked = format.schema.parse(value);
  return `${JSON.stringify(checked, null, 2)}\n`;
}

// 坏文件改名留存时用的新名字；时间由调用方给（这里不读时钟）
export function quarantineFileName(name: string, at: number): string {
  return `${name}.corrupt-${at}`;
}
