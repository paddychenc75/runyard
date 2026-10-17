import { absPath } from "@runyard/platform";
import { decideVersionAction, type RunyardError } from "@runyard/protocol";
import { callMethod } from "./call-method.ts";
import { ClientError, clientError, unavailable } from "./client-error.ts";
import {
  type ConnectOptions,
  RECONNECT_BACKOFF_MS,
  type ResolvedOptions,
  resolveOptions,
} from "./connect-options.ts";
import { discoveredProcessAlive, sameDiscovery } from "./discovery.ts";
import { launchSupervisor } from "./launch-supervisor.ts";
import { attemptSession, type SessionAttempt } from "./open-session.ts";
import { RunyardClient, type VersionOutcome } from "./runyard-client.ts";

// 找到管理进程并连上（技术设计 §5.1、§5.4；规格 SUPERVISOR-LIFECYCLE-07、10，PROTOCOL-HANDSHAKE-01 到 14）：
// 读发现文件 → 连得上就握手 → 否则拉起并按 50/100/200 毫秒退避重连（最多 3 秒）→ 按版本表决定用、换还是报错。

type Ready = Extract<SessionAttempt, { kind: "ready" }>;

/** 连上管理进程；必要时先拉起它。失败抛 ClientError，成功返回握手和版本比对都通过的客户端 */
export async function connectSupervisor(options: ConnectOptions): Promise<RunyardClient> {
  const ctx = resolveOptions(options);
  const attempt = await attemptSession(ctx);
  // 有人在监听却过不了握手：别的进程占住了连接点，或是冒充者。不拉起（拉起也会失败），也没有发过口令
  if (attempt.kind === "rejected") throw unavailable("handshake with the listener failed");
  if (attempt.kind === "ready") return settle(ctx, attempt, { launched: false, mayReplace: true });
  return settle(ctx, await launchAndWait(ctx), { launched: true, mayReplace: true });
}

// 拉起之后，在上限内反复尝试连接。每次都重新读发现文件，因为新进程会换一个口令。
async function launchAndWait(ctx: ResolvedOptions): Promise<Ready> {
  const { clock, timeouts } = ctx;
  await launchSupervisor(ctx);
  const startedAt = clock.now();
  let lastRejected: Ready["file"] | undefined;
  for (let step = 0; ; step++) {
    const attempt = await attemptSession(ctx);
    if (attempt.kind === "ready") return attempt;
    if (attempt.kind === "rejected") {
      // 旧的发现文件对着刚起来的新进程会过不了握手，等文件换成新的再试；同一个文件连着两次不过就是冒充者
      if (lastRejected !== undefined && sameDiscovery(lastRejected, attempt.file)) {
        throw unavailable("handshake with the listener failed");
      }
      lastRejected = attempt.file;
    }
    const remaining = timeouts.launchMs - (clock.now() - startedAt);
    if (remaining <= 0) throw unavailable("the supervisor did not become reachable in time");
    const delay = RECONNECT_BACKOFF_MS[Math.min(step, RECONNECT_BACKOFF_MS.length - 1)] as number;
    await clock.sleep(Math.min(delay, remaining));
  }
}

interface SettleState {
  launched: boolean;
  /** 只换一次：换完之后无论结论如何都不再换，避免和别的客户端来回抢 */
  mayReplace: boolean;
  /** 这次连接是在换新之后连上的，结论要报 replaced 而不是 current */
  replaced?: boolean;
}

async function settle(
  ctx: ResolvedOptions,
  ready: Ready,
  state: SettleState,
): Promise<RunyardClient> {
  try {
    return await decide(ctx, ready, state);
  } catch (error) {
    ready.connection.close();
    throw error;
  }
}

async function decide(
  ctx: ResolvedOptions,
  ready: Ready,
  state: SettleState,
): Promise<RunyardClient> {
  const { connection, file, peer } = ready;
  const versions = {
    client: { protocol: ctx.protocol, minProtocol: ctx.minProtocol, build: ctx.client.build },
    supervisor: { protocol: peer.protocol, minProtocol: peer.minProtocol, build: peer.build },
  };
  // 客户端低于管理进程的最低要求时一个请求也不发（规格 PROTOCOL-HANDSHAKE-14）；这一行与运行个数无关
  const early = decideVersionAction({ ...versions, runs: 0, executableExists: true });
  if (early.action === "reject" && early.error.code === "CLIENT_OUTDATED") {
    throw clientError("CLIENT_OUTDATED", {}, "client protocol is below the supervisor minimum");
  }

  const info = await callMethod(connection, "supervisor.info", {});
  const decision = decideVersionAction({
    ...versions,
    runs: info.runs,
    executableExists: await ctx.platform.fs.exists(absPath(file.execPath)),
  });
  const summary = {
    protocol: peer.protocol,
    minProtocol: peer.minProtocol,
    version: info.version,
    build: peer.build,
    startedBy: info.startedBy,
    runs: info.runs,
  };
  const finish = (outcome: VersionOutcome) =>
    new RunyardClient(connection, {
      supervisor: summary,
      outcome,
      launched: state.launched,
      diagnostic: ctx.onDiagnostic,
    });

  switch (decision.action) {
    case "use":
      return finish(state.replaced ? { kind: "replaced" } : { kind: "current" });
    case "use-outdated":
      return finish({ kind: "outdated", reason: decision.reason, runs: info.runs });
    case "reject":
      throw new ClientError({
        ...decision.error,
        debug: "version table rejected the supervisor",
      } as RunyardError);
    case "replace":
      // 已经换过一次还是“该换”，说明拉起来的仍不是想要的版本：不再换，照用
      if (!state.mayReplace) return finish({ kind: "replaced" });
      return replace(ctx, ready, info.runs, state);
  }
}

// 没有运行时请旧的退出，等它真的退出（锁释放）后拉起自己带的（规格 PROTOCOL-HANDSHAKE-08、11）。
// 管理进程有桌面应用连着时会拒绝退出（#358），这里就沿用它
async function replace(
  ctx: ResolvedOptions,
  ready: Ready,
  runs: number,
  state: SettleState,
): Promise<RunyardClient> {
  const { connection, file, peer } = ready;
  const answer = await callMethod(connection, "supervisor.shutdown", {
    ifIdle: true,
    reason: "upgrade",
  });
  if (!answer.closing) {
    // 刚好在这一刻有了运行，或有桌面应用连着（管理进程拒绝被换，#358）：沿用旧的，不停任何运行。重新问一次运行个数
    const info = await callMethod(connection, "supervisor.info", {});
    const blockedByApp = info.runs === 0;
    // 被应用挡住、而旧的又低于自己要求的最低协议版本：没法兼容使用，也不能换，如实报错
    if (blockedByApp && peer.protocol < ctx.minProtocol) {
      throw clientError(
        "SUPERVISOR_OUTDATED",
        { runs: 0 },
        "an app is using an incompatible supervisor",
      );
    }
    return new RunyardClient(connection, {
      supervisor: { ...peerSummary(peer, info), runs: info.runs },
      outcome: {
        kind: "outdated",
        reason: peer.protocol < ctx.protocol ? "protocol-older" : "build-differs",
        runs: Math.max(info.runs, runs),
        ...(blockedByApp ? { blockedByApp: true as const } : {}),
      },
      launched: state.launched,
      diagnostic: ctx.onDiagnostic,
    });
  }
  connection.close();
  await waitForExit(ctx, file);
  return settle(ctx, await launchAndWait(ctx), {
    launched: true,
    mayReplace: false,
    replaced: true,
  });
}

function peerSummary(
  peer: Ready["peer"],
  info: { version: string; startedBy: "app" | "cli" },
): {
  protocol: number;
  minProtocol: number;
  version: string;
  build: string;
  startedBy: "app" | "cli";
} {
  return {
    protocol: peer.protocol,
    minProtocol: peer.minProtocol,
    version: info.version,
    build: peer.build,
    startedBy: info.startedBy,
  };
}

// 内核锁随进程退出才释放；连接断开早于锁释放，这时拉起新的会撞上 BUSY 而安静退出
// pid 被别的进程占用（启动时间对不上）就是旧的已经退出
async function waitForExit(ctx: ResolvedOptions, file: Ready["file"]): Promise<void> {
  const { clock, platform, timeouts } = ctx;
  const startedAt = clock.now();
  while (await discoveredProcessAlive(platform, file)) {
    if (clock.now() - startedAt >= timeouts.replaceMs) {
      throw unavailable("the old supervisor did not exit in time");
    }
    await clock.sleep(50);
  }
}
