// 从 shell 的标准输出里取出环境。起止标记之外的字节全部忽略：启动文件的杂音、主题的转义序列、
// 长得像标记的文字（每次调用的标记含随机数，别的文字对不上）；值里的换行因为 env -0 按 NUL 分隔而完整保留。

/** 第一个起始标记之后、其后第一个结束标记之前的字节；还没出现完整的一对返回 null */
export function findBlock(output: Buffer, start: string, end: string): Buffer | null {
  const from = output.indexOf(start);
  if (from < 0) return null;
  const bodyStart = from + start.length;
  const to = output.indexOf(end, bodyStart);
  return to < 0 ? null : output.subarray(bodyStart, to);
}

export interface ParsedEnv {
  readonly env: Record<string, string>;
  /** 有值不是合法的 UTF-8，被替换成了 U+FFFD */
  readonly lossy: boolean;
}

export function parseEnvBlock(block: Buffer): ParsedEnv {
  const env: Record<string, string> = {};
  let lossy = false;
  let offset = 0;
  while (offset < block.length) {
    let next = block.indexOf(0, offset);
    if (next < 0) next = block.length;
    const entry = block.subarray(offset, next);
    offset = next + 1;
    const eq = entry.indexOf("=");
    if (eq <= 0) continue; // 没有等号或键为空：不是变量
    const text = entry.toString("utf8");
    if (!entry.equals(Buffer.from(text, "utf8"))) lossy = true;
    const split = text.indexOf("=");
    env[text.slice(0, split)] = text.slice(split + 1);
  }
  return { env, lossy };
}

// 会话专属的变量：带进子进程只会误导（工作目录、嵌套层数、我们自己的标记）
const SESSION_ONLY = new Set(["PWD", "OLDPWD", "SHLVL", "_", "RUNYARD_RESOLVING_ENV"]);

export function dropSessionVariables(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !SESSION_ONLY.has(key)));
}
