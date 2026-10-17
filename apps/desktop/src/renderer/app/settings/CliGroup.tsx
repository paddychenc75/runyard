import { useT } from "@runyard/i18n/react";
import { Button, ConfirmDialog, CopyableCommand, Menu, UserText } from "@runyard/ui";
import { useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../../shared/library-state.ts";
import type {
  AgentSkillStatus,
  CliCommandStatus,
  SupervisorStatus,
} from "../../../shared/settings-bridge.ts";
import type { SettingsApi } from "../../bridge/use-settings.ts";
import styles from "./CliGroup.module.css";
import { SettingSwitch } from "./SettingSwitch.tsx";
import { SettingsGroup, SettingsRow } from "./SettingsGroup.tsx";
import { StatusLine } from "./StatusLine.tsx";
import { useCliStatus } from "./use-cli-status.ts";

export interface CliGroupProps {
  bridge: DesktopBridge;
  api: SettingsApi;
  library: LibraryState | null;
}

// 命令行与智能体（设计稿 Settings，规格 DESKTOP-SETTINGS-20 至 25）：runyard 命令、诊断信息、后台管理进程、
// 智能体技能包、内置模板免确认。命令行做的事（诊断包、技能包）由主进程让随包的命令行去做。
export function CliGroup({ bridge, api, library }: CliGroupProps) {
  const t = useT();
  const { settings, update } = api;
  const cli = useCliStatus(bridge, library);
  if (settings === null) return null;
  return (
    <SettingsGroup title={t("settings.cli.title")}>
      <CommandRow bridge={bridge} cli={cli} />
      <DiagnosticsRow cli={cli} />
      <SupervisorRow cli={cli} />
      <SkillsRow cli={cli} />
      <SettingsRow
        title={t("settings.builtinSkip.title")}
        hint={t("settings.builtinSkip.hint")}
        wrapHint
      >
        <SettingSwitch
          label={t("settings.builtinSkip.title")}
          checked={settings.urlNewSkipConfirmForBuiltin}
          onCheckedChange={(checked) => update({ urlNewSkipConfirmForBuiltin: checked })}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}

type Cli = ReturnType<typeof useCliStatus>;

function CommandRow({ bridge, cli }: { bridge: DesktopBridge; cli: Cli }) {
  const t = useT();
  const status = cli.command;
  if (status === null) return null;
  const installed = status.state === "installed";
  const label =
    status.state === "installed"
      ? t("settings.cli.available.label", { version: status.version })
      : status.state === "stale"
        ? t("settings.cli.stale.label")
        : status.state === "conflict"
          ? t("settings.cli.conflict.label")
          : status.state === "unavailable"
            ? t("settings.cli.unavailable.label")
            : t("settings.cli.missing.label");
  const hint =
    status.state === "unavailable"
      ? t("settings.cli.unavailable.hint")
      : status.state === "conflict"
        ? t("settings.cli.conflict.hint")
        : cli.failed
          ? t("settings.cli.failed.body")
          : undefined;
  return (
    <>
      <SettingsRow
        title={t("settings.cli.command.title")}
        hint={
          hint ?? (status.path === undefined ? undefined : <UserText mono>{status.path}</UserText>)
        }
        monoHint={hint === undefined}
      >
        <StatusLine tone={installed ? "ok" : status.state === "missing" ? "idle" : "warn"}>
          {label}
        </StatusLine>
        {installed ? (
          <Button size="md" onClick={cli.removeCommand}>
            {t("settings.cli.remove.action")}
          </Button>
        ) : status.state === "unavailable" || status.state === "conflict" ? null : (
          <Button size="md" onClick={cli.installCommand}>
            {t("settings.cli.install.action")}
          </Button>
        )}
      </SettingsRow>
      {installed && !status.onPath ? <PathHint bridge={bridge} status={status} /> : null}
    </>
  );
}

// 链接所在目录不在 PATH 上（规格 DESKTOP-SETTINGS-21）：写明，并给一行可复制的加入命令；应用不替用户改 shell 配置
function PathHint({ bridge, status }: { bridge: DesktopBridge; status: CliCommandStatus }) {
  const t = useT();
  const dir = (status.path ?? "").replace(/\/runyard$/, "");
  return (
    <div className={styles.pathHint} role="status">
      <p className={styles.pathText}>{t("settings.cli.notOnPath.body", { dir })}</p>
      <div className={styles.pathCommand}>
        <CopyableCommand
          label={t("settings.cli.copyCommand.action")}
          command={status.pathCommand}
          className={styles.command}
        />
        <Button size="md" onClick={() => void bridge.call("clipboard.copy", status.pathCommand)}>
          {t("settings.cli.copyCommand.action")}
        </Button>
      </div>
    </div>
  );
}

function DiagnosticsRow({ cli }: { cli: Cli }) {
  const t = useT();
  return (
    <SettingsRow title={t("settings.cli.diagnostics.title")}>
      {cli.diagnostics === "done" ? (
        <span className={styles.result}>{t("settings.cli.exportDone.label")}</span>
      ) : cli.diagnostics === "failed" ? (
        <span className={styles.failed}>{t("settings.cli.exportFailed.label")}</span>
      ) : null}
      <Button size="md" loading={cli.diagnostics === "busy"} onClick={cli.exportDiagnostics}>
        {t("settings.cli.diagnostics.action")}
      </Button>
    </SettingsRow>
  );
}

function SupervisorRow({ cli }: { cli: Cli }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const status: SupervisorStatus | null = cli.supervisor;
  if (status === null) return null;
  const stop = () => {
    // 有运行（命令行持有的或标签页持有的，管理进程一退出都会停）先确认，写明各停几个
    // （规格 DESKTOP-SETTINGS-23）；一个运行都没有就直接停
    if (status.cliRuns + status.tabRuns > 0) setConfirming(true);
    else cli.stopSupervisor();
  };
  return (
    <>
      <SettingsRow
        title={t("settings.supervisor.title")}
        hint={t("settings.supervisor.hint")}
        wrapHint
      >
        <StatusLine tone={status.running ? "ok" : "idle"}>
          {status.running
            ? t("settings.supervisor.running.label", { count: status.cliRuns })
            : t("settings.supervisor.stopped.label")}
        </StatusLine>
        <Button size="md" disabled={!status.running} onClick={stop}>
          {t("settings.supervisor.stop.action")}
        </Button>
      </SettingsRow>
      <ConfirmDialog
        open={confirming}
        icon="stop"
        tone="danger"
        title={t("settings.supervisor.confirm.title")}
        description={t("settings.supervisor.confirm.body", {
          cli: status.cliRuns,
          tab: status.tabRuns,
        })}
        cancelLabel={t("settings.dialog.cancel.action")}
        confirmLabel={t("settings.supervisor.stop.action")}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          cli.stopSupervisor();
        }}
      />
    </>
  );
}

function SkillsRow({ cli }: { cli: Cli }) {
  const t = useT();
  const skills: AgentSkillStatus | null = cli.skills;
  if (skills === null) return null;
  const label =
    skills.claude && skills.agents
      ? t("settings.skills.both.label")
      : skills.claude
        ? t("settings.skills.claude.label")
        : skills.agents
          ? t("settings.skills.agents.label")
          : t("settings.skills.none.label");
  return (
    <SettingsRow title={t("settings.skills.title")} hint={t("settings.skills.hint")} wrapHint>
      <StatusLine tone={skills.claude || skills.agents ? "ok" : "idle"}>{label}</StatusLine>
      <Menu
        label={t("settings.skills.other.action")}
        entries={[
          {
            id: "claude",
            label: t("settings.skills.claudeName.label"),
            checked: skills.claude,
          },
          {
            id: "agents",
            label: t("settings.skills.agentsName.label"),
            checked: skills.agents,
          },
        ]}
        onSelect={(id) => cli.installSkill(id === "claude" ? "claude" : "agents")}
        trigger={<Button size="md">{t("settings.skills.other.action")}</Button>}
      />
    </SettingsRow>
  );
}

export type { Cli };
