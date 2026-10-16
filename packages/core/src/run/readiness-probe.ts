import { cleanLogText } from "../logs/clean-log-text.ts";
import { nodeProbeIo, type ProbeIo } from "./probe-io.ts";
import type { RunClock } from "./run-clock.ts";
import type { ReadinessContext, ReadinessProbe } from "./run-types.ts";

// 就绪探测（规格 RUN-PORTS-13、14；技术设计 §4.5）。三种判断，由运行器的 `ready` 选：
//   http  收到任何低于 500 的响应就绪（Next、Nuxt 先开端口、后编译页面，只连上端口不算数）；
//         5xx 说明服务还没好，继续等。
//   port  端口能连上就绪。
//   log   日志里出现匹配的一行就绪（匹配前先按读取时的规则清洗，颜色码不会挡住匹配）。
// 直连 127.0.0.1，不读代理。轮询用注入的时钟，所以单元测试不真的等。

export const READY_POLL_MS = 100;
/** 低于它的 HTTP 状态码都算服务已经在应答 */
export const READY_STATUS_BELOW = 500;

export type ReadinessProbeDeps = {
  readonly clock: RunClock;
  readonly io?: ProbeIo;
  readonly pollMs?: number;
};

export function createReadinessProbe(deps: ReadinessProbeDeps): ReadinessProbe {
  const io = deps.io ?? nodeProbeIo;
  const pollMs = deps.pollMs ?? READY_POLL_MS;

  // check 为真就绪；否则隔 pollMs 再试。信号中止后不再试，也不 resolve
  function poll(check: () => Promise<boolean>, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      let timer: number | undefined;
      const attempt = () => {
        timer = undefined;
        if (signal.aborted) return;
        void check().then((ok) => {
          if (signal.aborted) return;
          if (ok) resolve();
          else timer = deps.clock.setTimeout(attempt, pollMs);
        });
      };
      signal.addEventListener("abort", () => {
        if (timer !== undefined) deps.clock.clearTimeout(timer);
      });
      attempt();
    });
  }

  function waitForLog(match: string, context: ReadinessContext): Promise<void> {
    const pattern = new RegExp(match);
    return new Promise((resolve) => {
      const stop = context.onLine((entry) => {
        if (entry.kind !== "stdout" && entry.kind !== "stderr") return;
        const text = cleanLogText(entry.text);
        if (text === null || !pattern.test(text)) return;
        stop();
        resolve();
      });
      context.signal.addEventListener("abort", stop);
    });
  }

  return {
    waitReady(context) {
      const { ready, port } = context.plan;
      if (ready === undefined) return Promise.resolve();
      if ("log" in ready) return waitForLog(ready.log.match, context);
      // 没有端口就没有可探测的东西：不会就绪，由超时或退出收场
      if (port === undefined) return new Promise(() => undefined);
      if ("http" in ready) {
        const path = ready.http.path;
        return poll(async () => {
          const status = await io.httpStatus(port, path);
          return status !== null && status < READY_STATUS_BELOW;
        }, context.signal);
      }
      return poll(() => io.tcpOpen(port), context.signal);
    },
  };
}
