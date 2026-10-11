import { homedir } from "node:os";
import { readHookInput } from "./hook-input.ts";

// 执行命令前的钩子（PreToolUse，匹配 Bash）：拦下删除用户真实数据目录的命令（技术设计 §9.3）。
// 真实的 ~/Runyard（用户的项目）和 ~/.runyard（设置和状态）不属于这个仓库，
// 开发和测试只许用临时目录。这是防手滑的保险，不是安全边界：换一种写法就能绕过。
// “不许在模板目录里跑包管理器”那一条随 M1 建 templates/ 时加进来。

const DESTRUCTIVE = /(^|[\s;&|(])(rm|rmdir|unlink|shred|trash|mv|Remove-Item|del|rd)\b|-delete\b/i;

// 命令里是否提到了真实的数据目录：~、$HOME、${HOME}、%USERPROFILE% 或主目录的绝对路径
export function touchesUserData(command: string, home: string): boolean {
  const escaped = home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = `(?:~|\\$HOME|\\$\\{HOME\\}|%USERPROFILE%|${escaped})`;
  // 目录名后面不能再接字母、数字、连字符、点（否则是别的目录，比如 ~/Runyard-notes）
  return new RegExp(`${prefix}[\\\\/](?:Runyard|\\.runyard)(?![\\w.-])`, "i").test(command);
}

export function blockReason(command: string, home: string): string | undefined {
  if (!DESTRUCTIVE.test(command) || !touchesUserData(command, home)) return undefined;
  return "已拦下：这条命令会删除或移动用户真实的 ~/Runyard 或 ~/.runyard。它们是用户自己的项目和设置，不是测试数据。开发和测试请用系统临时目录；确实需要动它们，请停下来让用户自己执行。";
}

if (import.meta.main) {
  const reason = blockReason(readHookInput().tool_input?.command ?? "", homedir());
  if (reason !== undefined) {
    process.stderr.write(`${reason}\n`);
    process.exit(2);
  }
}
