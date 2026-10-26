import { useCallback, useEffect, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../../shared/library-state.ts";
import type {
  AgentSkillStatus,
  AgentSkillTarget,
  CliCommandStatus,
  SkillFailureReason,
  SupervisorStatus,
} from "../../../shared/settings-bridge.ts";

/** 上一次装、更新或移除没做成：哪个位置、做的什么、什么原因（“重试”就重做这件事） */
export interface SkillFailure {
  target: AgentSkillTarget;
  action: "install" | "remove";
  reason: SkillFailureReason;
}

export interface CliStatusView {
  command: CliCommandStatus | null;
  /** 上一次安装或移除没成功（不是位置被占用） */
  failed: boolean;
  skills: AgentSkillStatus | null;
  supervisor: SupervisorStatus | null;
  diagnostics: "idle" | "busy" | "done" | "failed";
  installCommand: () => void;
  removeCommand: () => void;
  exportDiagnostics: () => void;
  guideFailed: boolean;
  guide: string | null;
  closeGuide: () => void;
  openGuide: (locale: "en" | "zh-CN") => void;
  skillFailure: SkillFailure | null;
  skillBusy: boolean;
  installSkill: (target: AgentSkillTarget) => void;
  /** 把旧版的位置都更新到随应用带的版本；一个失败就停下 */
  updateSkills: (targets: readonly AgentSkillTarget[]) => void;
  removeSkill: (target: AgentSkillTarget) => void;
  revealSkill: (target: AgentSkillTarget) => void;
  stopSupervisor: () => void;
}

// “命令行与智能体”里几项的状态和动作：打开设置页时各读一次；命令行持有的运行个数随资源库的运行变化重读。
export function useCliStatus(bridge: DesktopBridge, library: LibraryState | null): CliStatusView {
  const [guide, setGuide] = useState<string | null>(null);
  const [guideFailed, setGuideFailed] = useState(false);
  const [command, setCommand] = useState<CliCommandStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [skills, setSkills] = useState<AgentSkillStatus | null>(null);
  const [skillFailure, setSkillFailure] = useState<SkillFailure | null>(null);
  const [skillBusy, setSkillBusy] = useState(false);
  const [supervisor, setSupervisor] = useState<SupervisorStatus | null>(null);
  const [diagnostics, setDiagnostics] = useState<CliStatusView["diagnostics"]>("idle");

  useEffect(() => {
    let alive = true;
    void bridge.call("cli.status").then(
      (status) => alive && status !== undefined && setCommand(status),
      () => {},
    );
    void bridge.call("agents.status").then(
      (status) => alive && status !== undefined && setSkills(status),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [bridge]);

  // 命令行启动或停掉运行时，资源库的运行清单会变：跟着重读管理进程的状态
  const runsKey = (library?.runs ?? []).map((run) => `${run.runId}:${run.source.kind}`).join(",");
  useEffect(() => {
    let alive = true;
    void bridge.call("supervisor.status").then(
      (status) => alive && status !== undefined && setSupervisor(status),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [bridge, runsKey]);

  const change = useCallback(
    (method: "cli.install" | "cli.remove") => {
      void bridge.call(method).then(
        (outcome) => {
          setCommand(outcome.status);
          setFailed(outcome.result === "failed");
        },
        () => setFailed(true),
      );
    },
    [bridge],
  );

  // 装和移除都只经主进程让命令行去做；做完用返回的最新状态替换，失败带原因
  const changeSkill = useCallback(
    async (action: SkillFailure["action"], target: AgentSkillTarget): Promise<boolean> => {
      setSkillBusy(true);
      try {
        const outcome = await bridge.call(
          action === "install" ? "agents.install" : "agents.remove",
          target,
        );
        setSkills(outcome.status);
        setSkillFailure(outcome.failure === undefined ? null : { ...outcome.failure, action });
        return outcome.failure === undefined;
      } catch {
        setSkillFailure({ target, action, reason: "other" });
        return false;
      } finally {
        setSkillBusy(false);
      }
    },
    [bridge],
  );

  return {
    guideFailed,
    guide,
    closeGuide: () => setGuide(null),
    openGuide: (locale) => {
      setGuideFailed(false);
      void bridge.call("agents.openGuide", locale).then(
        (result) => {
          setGuideFailed(!result.ok || !result.content);
          setGuide(result.ok ? (result.content ?? null) : null);
        },
        () => setGuideFailed(true),
      );
    },
    command,
    failed,
    skills,
    supervisor,
    diagnostics,
    installCommand: () => change("cli.install"),
    removeCommand: () => change("cli.remove"),
    exportDiagnostics: () => {
      setDiagnostics("busy");
      void bridge.call("diagnostics.export").then(
        (outcome) => setDiagnostics(outcome.ok ? "done" : "failed"),
        () => setDiagnostics("failed"),
      );
    },
    skillFailure,
    skillBusy,
    installSkill: (target) => void changeSkill("install", target),
    updateSkills: (targets) =>
      void (async () => {
        for (const target of targets) if (!(await changeSkill("install", target))) break;
      })(),
    removeSkill: (target) => void changeSkill("remove", target),
    revealSkill: (target) => void bridge.call("agents.reveal", target).catch(() => {}),
    stopSupervisor: () =>
      void bridge.call("supervisor.stop").then(
        (status) => setSupervisor(status),
        () => {},
      ),
  };
}
