import { discoveryFilePath, type Platform } from "@runyard/platform";
import { type SupervisorFile, supervisorFileSchema } from "@runyard/protocol";

// 读发现文件。读不到、读到的不是合法的发现文件（半个文件、乱写的、版本不认识的）都一样：
// 当作“没有发现文件”，客户端没有口令，不发任何握手消息（规格 PROTOCOL-HANDSHAKE-03）。
export async function readDiscoveryFile(platform: Platform): Promise<SupervisorFile | undefined> {
  const text = await platform.fs.readText(discoveryFilePath(platform.paths.stateDir));
  if (text === null) return undefined;
  try {
    const parsed = supervisorFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function sameDiscovery(a: SupervisorFile, b: SupervisorFile): boolean {
  return a.pid === b.pid && a.token === b.token;
}
