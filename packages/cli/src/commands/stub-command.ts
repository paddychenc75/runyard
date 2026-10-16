import { cliError } from "../cli-error.ts";
import type { CommandHandler } from "./command-spec.ts";

// 还没实现的命令：声明在，行为后补（#46 到 #49）。得到 NOT_SUPPORTED，退出码 10，
// 不假装成功；--help 照常显示，所以帮助快照已经包含完整的命令表。
export const notImplemented: CommandHandler = async () => {
  throw cliError("NOT_SUPPORTED", {});
};
