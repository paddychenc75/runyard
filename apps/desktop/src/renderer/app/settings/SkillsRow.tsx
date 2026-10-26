import { useLocale, useT } from "@runyard/i18n/react";
import { Button, ConfirmDialog, Icon, IconButton, Menu, type MenuEntry } from "@runyard/ui";
import { useState } from "react";
import type { AgentSkillTarget } from "../../../shared/settings-bridge.ts";
import { SettingsRow } from "./SettingsGroup.tsx";
import styles from "./SkillsRow.module.css";
import { StatusLine } from "./StatusLine.tsx";
import type { CliStatusView } from "./use-cli-status.ts";

const TARGETS: readonly AgentSkillTarget[] = ["claude", "agents"];
// 技能包放在这两个位置（界面上写在说明里，省掉主目录前缀）
const SKILL_DIRS: Record<AgentSkillTarget, string> = {
  claude: "~/.claude/skills",
  agents: "~/.agents/skills",
};

// 智能体技能包一行（设计稿方案 A，规格 DESKTOP-SETTINGS-24、54 至 59）：
// 状态加一个情境按钮（安装…、安装到 Codex、更新、重试）加“⋯”管理菜单；“查看说明”是说明末尾的链接。
export function SkillsRow({ cli }: { cli: CliStatusView }) {
  const t = useT();
  const locale = useLocale();
  const [removing, setRemoving] = useState<AgentSkillTarget | null>(null);
  const skills = cli.skills;
  if (skills === null) return null;
  const agentName = (target: AgentSkillTarget) =>
    target === "claude"
      ? t("settings.skills.claudeName.label")
      : t("settings.skills.agentsName.label");
  const installed = TARGETS.filter((target) => skills[target] !== "missing");
  const outdated = TARGETS.filter((target) => skills[target] === "outdated");
  const missing = TARGETS.filter((target) => skills[target] === "missing");
  const failure = cli.skillFailure;

  const label =
    installed.length === 2
      ? t("settings.skills.both.label")
      : installed[0] === "claude"
        ? t("settings.skills.claude.label")
        : installed[0] === "agents"
          ? t("settings.skills.agents.label")
          : t("settings.skills.none.label");
  const guide = (
    <button
      type="button"
      className={styles.link}
      onClick={() => cli.openGuide(locale === "zh-CN" ? "zh-CN" : "en")}
    >
      {t("settings.skills.guide.action")}
    </button>
  );
  const guideFailed = cli.guideFailed ? (
    <span role="alert"> {t("settings.skills.guideFailed.hint")}</span>
  ) : null;
  const hint = failure ? (
    <span className={styles.error} role="alert">
      {failureText(failure)}
    </span>
  ) : (
    <>
      {outdated.length > 0 ? t("settings.skills.outdated.hint") : t("settings.skills.hint")} {guide}
      {guideFailed}
    </>
  );

  function failureText(f: NonNullable<typeof failure>) {
    const params = { agent: agentName(f.target), dir: SKILL_DIRS[f.target] };
    if (f.action === "install")
      return f.reason === "permission"
        ? t("settings.skills.installPermission.hint", params)
        : t("settings.skills.installOther.hint", params);
    return f.reason === "permission"
      ? t("settings.skills.removePermission.hint", params)
      : f.reason === "foreign-files"
        ? t("settings.skills.removeForeign.hint", params)
        : t("settings.skills.removeOther.hint", params);
  }

  const entries: MenuEntry[] = [];
  for (const target of TARGETS) {
    if (entries.length > 0) entries.push({ type: "separator" });
    const state = skills[target];
    const params = { agent: agentName(target) };
    entries.push(
      state === "missing"
        ? {
            type: "group",
            label: t("settings.skills.groupMissing.label", params),
            items: [{ id: `install:${target}`, label: t("settings.skills.menuInstall.action") }],
          }
        : {
            type: "group",
            label:
              state === "outdated"
                ? t("settings.skills.groupOutdated.label", params)
                : t("settings.skills.groupInstalled.label", params),
            items: [
              { id: `install:${target}`, label: t("settings.skills.reinstall.action") },
              { id: `reveal:${target}`, label: t("settings.skills.reveal.action") },
              { id: `remove:${target}`, label: t("settings.skills.remove.action"), tone: "danger" },
            ],
          },
    );
  }
  const onMenu = (id: string) => {
    const [action, target] = id.split(":") as [string, AgentSkillTarget];
    if (action === "install") cli.installSkill(target);
    else if (action === "reveal") cli.revealSkill(target);
    else setRemoving(target);
  };

  const tone = failure
    ? "danger"
    : outdated.length > 0
      ? "warn"
      : installed.length > 0
        ? "ok"
        : "idle";
  const first = missing[0];
  const primary = failure ? (
    <Button
      loading={cli.skillBusy}
      onClick={() =>
        failure.action === "install"
          ? cli.installSkill(failure.target)
          : cli.removeSkill(failure.target)
      }
    >
      {t("settings.skills.retry.action")}
    </Button>
  ) : outdated.length > 0 ? (
    <Button loading={cli.skillBusy} onClick={() => cli.updateSkills(outdated)}>
      {t("settings.skills.update.action")}
    </Button>
  ) : installed.length === 0 ? (
    <Menu
      label={t("settings.skills.installTargets.label")}
      entries={TARGETS.map((target) => ({ id: `install:${target}`, label: agentName(target) }))}
      onSelect={onMenu}
      trigger={
        <Button loading={cli.skillBusy}>
          {t("settings.skills.install.action")}
          <Icon name="chevron-down" size={12} />
        </Button>
      }
    />
  ) : first === undefined ? null : (
    <Button loading={cli.skillBusy} onClick={() => cli.installSkill(first)}>
      {t("settings.skills.installTo.action", { agent: agentName(first) })}
    </Button>
  );
  const label2 = failure
    ? t("settings.skills.failed.label")
    : outdated.length > 0
      ? t("settings.skills.outdated.label")
      : label;

  return (
    <>
      <SettingsRow title={t("settings.skills.title")} hint={hint} wrapHint>
        <StatusLine quiet tone={tone}>
          {label2}
        </StatusLine>
        {primary}
        <Menu
          label={t("settings.skills.manage.label")}
          entries={entries}
          onSelect={onMenu}
          trigger={<IconButton icon="more" label={t("settings.skills.manage.label")} />}
        />
      </SettingsRow>
      <ConfirmDialog
        open={removing !== null}
        icon="trash"
        tone="danger"
        title={t("settings.skills.removeConfirm.title", {
          agent: removing === null ? "" : agentName(removing),
        })}
        description={t("settings.skills.removeConfirm.body", {
          dir: removing === null ? "" : SKILL_DIRS[removing],
        })}
        cancelLabel={t("settings.dialog.cancel.action")}
        confirmLabel={t("settings.skills.removeConfirm.action")}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing !== null) cli.removeSkill(removing);
          setRemoving(null);
        }}
      />
    </>
  );
}
