import { discoveryFilePath, type Platform } from "@runyard/platform";
import { readVersionedText, type SupervisorFile, supervisorFileFormat } from "@runyard/protocol";

// 读发现文件。读不到、读到的不是合法的发现文件（半个文件、乱写的、版本不认识的）都一样：
// 当作“没有发现文件”，客户端没有口令，不发任何握手消息（规格 PROTOCOL-HANDSHAKE-03）。
export async function readDiscoveryFile(platform: Platform): Promise<SupervisorFile | undefined> {
  const text = await platform.fs.readText(discoveryFilePath(platform.paths.stateDir));
  if (text === null) return undefined;
  // 走升级链：上一版格式写的文件也读得出来
  const result = readVersionedText(supervisorFileFormat, text);
  return result.status === "ok" ? result.value : undefined;
}

/**
 * 发现文件记的那个管理进程还活着吗：pid 加启动时间都对得上才算。
 * 文件里没有启动时间（上一版格式写的）时退回只看 pid，和以前一样。
 */
export async function discoveredProcessAlive(
  platform: Platform,
  file: Pick<SupervisorFile, "pid" | "processStart">,
): Promise<boolean> {
  const found = await platform.proc.identity(file.pid);
  if (found === null) return false;
  return file.processStart === undefined || found.startTime === file.processStart;
}

export function sameDiscovery(a: SupervisorFile, b: SupervisorFile): boolean {
  return a.pid === b.pid && a.token === b.token;
}
