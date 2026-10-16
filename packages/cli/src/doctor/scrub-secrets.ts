// 诊断包会被贴到公开的 issue 里（技术设计 §5.3），所以打包前去掉两样东西：
// 握手口令，和任何网址里的账号密码（设置里代理地址的写法 http://user:pass@host:port）。
// 不依赖设置文件里代理字段的名字（还没定）：所有进包的文本一律过一遍。

const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@"'\\]+@/gi;
const REMOVED = "[removed]";

/** 去掉网址里的账号密码，保留主机和端口 */
export function stripUrlCredentials(text: string): string {
  return text.replace(URL_USERINFO, "$1");
}

/** supervisor.json：去掉 token 字段；解析不了时按文本把 token 的值抹掉 */
export function scrubSupervisorFile(text: string): { text: string; token: string | undefined } {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const { token, ...rest } = parsed as Record<string, unknown>;
      return {
        text: `${JSON.stringify(rest, null, 2)}\n`,
        token: typeof token === "string" ? token : undefined,
      };
    }
  } catch {
    // 落到下面的文本处理
  }
  const token = /"token"\s*:\s*"([^"]*)"/.exec(text)?.[1];
  return { text: text.replace(/("token"\s*:\s*)"[^"]*"/, `$1"${REMOVED}"`), token };
}

/** 其他文本：把已知的口令原样抹掉（它不该出现，出现了就是日志里漏的），再去网址里的账号密码 */
export function scrubText(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret !== "") result = result.split(secret).join(REMOVED);
  }
  return stripUrlCredentials(result);
}
