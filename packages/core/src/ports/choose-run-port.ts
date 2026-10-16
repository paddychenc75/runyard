import type { Platform } from "@runyard/platform";
import type { PortFallback } from "@runyard/protocol";
import type { PortRange } from "./port-range.ts";

// 一次运行用哪个端口（规格 RUN-PORTS-05 到 08）。
// 先试想要的端口（项目登记的，或命令行 --port 给的）；空闲就用。被占用或被系统保留时，
// 往后找下一个既空闲、又没登记给别的项目的端口，只用于这一次——调用方不得把它写回登记。
// 判断空闲只靠平台层的 ports.isFree（它只在回环地址上试绑，并查连接表发现 0.0.0.0 上的占用者）。

export type PortChoice = {
  readonly port: number;
  /** 想要的端口没用上时才有：原端口、原因和占用者（查得到时） */
  readonly portFallback?: PortFallback;
};

export type ChoosePortInput = {
  readonly platform: Pick<Platform, "ports">;
  readonly wanted: number;
  readonly range: PortRange;
  /** 登记给其他项目的端口，回退时要躲开 */
  readonly registeredByOthers: ReadonlySet<number>;
};

/** wanted 之后先往上到范围末尾，再从范围开头绕回来；范围外的 wanted 从范围开头起 */
function* fallbackCandidates(wanted: number, range: PortRange): Generator<number> {
  for (let port = Math.max(wanted + 1, range.min); port <= range.max; port += 1) yield port;
  for (let port = range.min; port < Math.min(wanted, range.max + 1); port += 1) yield port;
}

/** 范围内一个可用的端口都没有时返回 null，由调用方报告启动失败 */
export async function chooseRunPort(input: ChoosePortInput): Promise<PortChoice | null> {
  const { platform, wanted, range, registeredByOthers } = input;
  const status = await platform.ports.isFree(wanted);
  if (status === "free") return { port: wanted };

  const occupant = status === "in-use" ? await platform.ports.occupant(wanted) : null;
  for (const candidate of fallbackCandidates(wanted, range)) {
    if (registeredByOthers.has(candidate)) continue;
    if ((await platform.ports.isFree(candidate)) !== "free") continue;
    return {
      port: candidate,
      portFallback: {
        wanted,
        reason: status === "reserved" ? "PORT_RESERVED" : "PORT_OCCUPIED",
        ...(occupant === null ? {} : { occupant }),
      },
    };
  }
  return null;
}
