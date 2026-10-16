// 自动清理的判断：纯函数，不读时钟、不读写磁盘、不启动进程、不移动任何东西
// （规格 LIBRARY-AUTO-CLEAN-34）。输入是调用方读好的快照，输出是三份清单。
// 调用方把 `postponed` 记成 snoozedUntil、把 `remind` 的显示结果经 ackReminder 记下。

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 判断一个项目需要的字段：索引里的计时状态加 playground.json 里的自动清理设置 */
export interface AutoCleanCandidate {
  readonly id: string;
  readonly autoClean: { readonly enabled: boolean; readonly days?: number | undefined };
  readonly lastUsedAt: number;
  readonly remindedAt?: number | undefined;
  readonly snoozedUntil?: number | undefined;
  readonly missingSince?: number | undefined;
}

export interface AutoCleanInput {
  readonly now: number;
  /** 资源库根目录现在在不在（外置盘没挂上、网盘没同步完时为 false） */
  readonly rootPresent: boolean;
  readonly candidates: readonly AutoCleanCandidate[];
  /**
   * 现在有运行的项目 id。打开的标签页就是应用会话持有的一次运行（负责人规则：
   * 开标签页即运行，关标签页即停止），所以“正在运行或有标签页”只需要这一份；
   * 判断不认识标签页（规格措辞见 issue #73）。
   */
  readonly inUse: ReadonlySet<string>;
}

export interface AutoCleanVerdict {
  /** 待提醒：离到期不足 24 小时（含已过期），且提醒还没显示过 */
  readonly remind: readonly string[];
  /** 可清理：已到期，提醒已显示满 24 小时，没有在使用，没有在顺延期内 */
  readonly clean: readonly string[];
  /** 本该清理但正在使用：顺延到 until（一天后）再判断 */
  readonly postponed: readonly { readonly id: string; readonly until: number }[];
  /** 整轮跳过的原因；只有根目录不在一种 */
  readonly skipped?: "root-missing";
}

/** 到期时间 = 上次使用 + 天数；没有开自动清理（或天数不合法）返回 null */
export function dueAt(candidate: AutoCleanCandidate): number | null {
  const { enabled, days } = candidate.autoClean;
  if (!enabled || days === undefined || !Number.isInteger(days) || days <= 0) return null;
  return candidate.lastUsedAt + days * DAY_MS;
}

export function judgeAutoClean(input: AutoCleanInput): AutoCleanVerdict {
  // 根目录不在：整轮跳过，不提醒、不清理（找不到文件夹的标记也不在这里打）
  if (!input.rootPresent) return { remind: [], clean: [], postponed: [], skipped: "root-missing" };

  const remind: string[] = [];
  const clean: string[] = [];
  const postponed: { id: string; until: number }[] = [];
  for (const candidate of input.candidates) {
    if (candidate.missingSince !== undefined) continue;
    const due = dueAt(candidate);
    if (due === null) continue;

    if (candidate.remindedAt === undefined) {
      // 没有提醒记录的项目，哪怕早已过期，也先提醒、不直接清理
      if (due - input.now < DAY_MS) remind.push(candidate.id);
      continue;
    }
    if (input.now < due || input.now - candidate.remindedAt < DAY_MS) continue;
    if (candidate.snoozedUntil !== undefined && input.now < candidate.snoozedUntil) continue;
    if (input.inUse.has(candidate.id)) {
      postponed.push({ id: candidate.id, until: input.now + DAY_MS });
      continue;
    }
    clean.push(candidate.id);
  }
  return { remind, clean, postponed };
}
