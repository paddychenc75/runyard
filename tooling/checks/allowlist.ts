// security/allowlist.toml 的解析与校验（技术设计 §8.6.3）。
// 格式是固定的，所以只实现这个子集：[[allow]] 表头、字符串值、日期值、# 注释。
// 遇到别的写法直接报错，不猜。

export interface AllowEntry {
  id: string;
  scope: string;
  package: string;
  reason: string;
  expires: string;
  owner_approved?: string;
  // 第四种情况“修复版已发布但未满发布期”专用：修复版的发布日期
  fix_released?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// 修复版本要发布满这么多天才能装（技术设计 §8.1 规则 2）；第四种情况的条目最迟到这一天
const RELEASE_AGE_DAYS = 15;
const REQUIRED = ["id", "scope", "package", "reason", "expires"] as const;
const VALUE = /^([a-z_]+)\s*=\s*(?:"([^"\\]*)"|(\d{4}-\d{2}-\d{2}))\s*(?:#.*)?$/;

export function parseAllowlist(text: string): {
  entries: Record<string, string>[];
  errors: string[];
} {
  const entries: Record<string, string>[] = [];
  const errors: string[] = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    if (line === "[[allow]]") {
      entries.push({});
      return;
    }
    const match = VALUE.exec(line);
    const current = entries.at(-1);
    if (match === null || current === undefined) {
      errors.push(
        `security/allowlist.toml 第 ${index + 1} 行无法识别：${line}。只支持 [[allow]] 表头和 键 = "字符串" / 键 = 日期 两种写法。`,
      );
      return;
    }
    current[match[1] as string] = (match[2] ?? match[3]) as string;
  });
  return { entries, errors };
}

// 校验允许清单：字段齐全、未过期、期限不超上限。
// 条目里没有严重度字段，所以统一按最严的上限 30 天；
// 带 owner_approved（必须指向 §12 的某一项）的条目放宽到 60 天。
// 第四种情况“修复版已发布但未满发布期”写 fix_released（修复版发布日）：必须同时带 owner_approved，
// expires 不得晚于发布日加 15 天（满 15 天就该升级并删条目），所以它的期限比 60 天更严，不会借此变松。
export function checkAllowlist(text: string, today: Date): string[] {
  const { entries, errors } = parseAllowlist(text);
  entries.forEach((entry, i) => {
    const label = `security/allowlist.toml 第 ${i + 1} 个条目（${entry.id ?? "缺 id"}）`;
    const missing = REQUIRED.filter((key) => !entry[key]);
    if (missing.length > 0) {
      errors.push(
        `${label}缺少字段：${missing.join("、")}。补全后再提交，字段说明见技术设计 §8.6.3。`,
      );
      return;
    }
    if (!/^(GHSA(-[2-9cfghjmpqrvwx]{4}){3}|CVE-\d{4}-\d{4,})$/i.test(entry.id as string)) {
      errors.push(`${label}的 id 不是 GHSA 或 CVE 编号。改成公告的真实编号。`);
    }
    const approved = entry.owner_approved;
    if (approved !== undefined && !/^§12 第 \d+ 项/.test(approved)) {
      errors.push(
        `${label}的 owner_approved 必须指向 §12 的某一项（如“§12 第 30 项，日期”）。别的条目不能借用这个字段。`,
      );
    }
    const expires = new Date(`${entry.expires}T00:00:00Z`);
    if (Number.isNaN(expires.getTime())) {
      errors.push(`${label}的 expires 不是 YYYY-MM-DD 日期。`);
      return;
    }
    const startOfToday = new Date(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
    const daysLeft = Math.round((expires.getTime() - startOfToday.getTime()) / DAY_MS);
    const limit = approved !== undefined && /^§12 第 \d+ 项/.test(approved) ? 60 : 30;
    const fixReleased = entry.fix_released;
    if (fixReleased !== undefined) {
      const released = new Date(`${fixReleased}T00:00:00Z`);
      if (Number.isNaN(released.getTime()) || released.getTime() > startOfToday.getTime()) {
        errors.push(`${label}的 fix_released 必须是已经过去的 YYYY-MM-DD 日期（修复版的发布日）。`);
      } else if (limit !== 60) {
        errors.push(
          `${label}写了 fix_released（修复版未满发布期的临时放行），必须同时有指向 §12 某一项的 owner_approved。`,
        );
      } else if (expires.getTime() > released.getTime() + RELEASE_AGE_DAYS * DAY_MS) {
        errors.push(
          `${label}的 expires 晚于修复版发布日 ${fixReleased} 加 ${RELEASE_AGE_DAYS} 天。这种放行到修复版满 ${RELEASE_AGE_DAYS} 天为止，到期就升级并删掉条目。`,
        );
      }
    }
    if (daysLeft < 0) {
      errors.push(
        `${label}已于 ${entry.expires} 过期。重新审：上游已修复就删掉条目并升级，仍无法修复就续期并写明原因。`,
      );
    } else if (daysLeft > limit) {
      errors.push(
        `${label}的期限超过上限（还有 ${daysLeft} 天，上限 ${limit} 天）。把 expires 改到 ${limit} 天以内，见技术设计 §8.6.3。`,
      );
    }
  });
  return errors;
}
