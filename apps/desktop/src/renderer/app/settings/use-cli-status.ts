import { useCallback, useEffect, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../../shared/library-state.ts";
import type {
  AgentSkillStatus,
  AgentSkillTarget,
  CliCommandStatus,
  SupervisorStatus,
} from "../../../shared/settings-bridge.ts";

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
  openGuide: (locale: "en" | "zh-CN") => void;
  installSkill: (target: AgentSkillTarget) => void;
  stopSupervisor: () => void;
}

// “命令行与智能体”里几项的状态和动作：打开设置页时各读一次；命令行持有的运行个数随资源库的运行变化重读。
export function useCliStatus(bridge: DesktopBridge, library: LibraryState | null): CliStatusView {
  const [guideFailed, setGuideFailed] = useState(false);
  const [command, setCommand] = useState<CliCommandStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [skills, setSkills] = useState<AgentSkillStatus | null>(null);
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

  return {
    guideFailed,
    openGuide: (locale) => {
      setGuideFailed(false);
      void bridge.call("agents.openGuide", locale).then(
        (result) => setGuideFailed(!result.ok),
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
    installSkill: (target) =>
      void bridge.call("agents.install", target).then(
        (status) => setSkills(status),
        () => {},
      ),
    stopSupervisor: () =>
      void bridge.call("supervisor.stop").then(
        (status) => setSupervisor(status),
        () => {},
      ),
  };
}
