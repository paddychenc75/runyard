import { absPath, joinPath, posixRelPath } from "@runyard/platform";
import { toCliError } from "../cli-error.ts";
import { cliInstallInfo } from "../doctor/cli-install-info.ts";
import { collectBundle } from "../doctor/diagnostic-bundle.ts";
import { readDoctorSettings } from "../doctor/read-settings.ts";
import { toolReport } from "../doctor/tool-report.ts";
import { writeZip } from "../doctor/zip-writer.ts";
import { templateLocations } from "../templates/template-locations.ts";
import type { CommandContext } from "./command-context.ts";
import type { CommandHandler } from "./command-spec.ts";

// doctor [--template <id>] [--bundle]（规格 CLI-COMMANDS-23、63 到 67）。
// 管理进程连不上时照常输出其余部分，不因此失败；工具检测、安装来源、资源库位置都在本进程里查。

async function supervisorPart(context: CommandContext): Promise<Record<string, unknown>> {
  try {
    const client = await context.client();
    const info = await client.call("supervisor.info", {});
    return { running: true, ...info };
  } catch (error) {
    // 原因只给错误码：给人看的句子在文案包里，--json 里不放
    return { running: false, reason: toCliError(error).code };
  }
}

function humanLines(context: CommandContext, report: Record<string, unknown>) {
  const { t } = context;
  const cli = report.cli as Awaited<ReturnType<typeof cliInstallInfo>>;
  const supervisor = report.supervisor as Record<string, string | number | boolean>;
  const tools = report.tools as Awaited<ReturnType<typeof toolReport>>;
  const library = report.library as { root: string };
  const system = report.system as { os: string; version: string; arch: string };
  const lines = [
    t("cli.doctor.cli.body", { version: cli.version, kind: cli.kind, path: cli.path }),
  ];
  if (cli.other !== null) {
    lines.push(
      t("cli.doctor.other.body", {
        kind: cli.other.kind,
        version: cli.other.version ?? "?",
        path: cli.other.path,
      }),
    );
  }
  lines.push(
    supervisor.running === true
      ? t("cli.doctor.supervisorRunning.body", {
          version: String(supervisor.version),
          runs: Number(supervisor.runs),
          startedBy: String(supervisor.startedBy),
        })
      : t("cli.doctor.supervisorDown.body", { reason: String(supervisor.reason) }),
  );
  for (const tool of tools) {
    const name = { tool: tool.tool };
    const version = tool.version ?? "";
    lines.push(
      tool.status === "found"
        ? t("cli.doctor.toolFound.body", { ...name, version, path: tool.path ?? "" })
        : tool.status === "missing"
          ? t("cli.doctor.toolMissing.body", name)
          : tool.status === "too-old"
            ? t("cli.doctor.toolTooOld.body", { ...name, version, required: tool.required ?? "" })
            : t("cli.doctor.toolUnknown.body", name),
    );
    for (const hint of tool.install ?? []) {
      if (hint.command !== undefined) {
        lines.push(t("cli.doctor.installCommand.body", { command: hint.command.join(" ") }));
      }
      if (hint.url !== undefined) lines.push(t("cli.doctor.installUrl.body", { url: hint.url }));
    }
  }
  lines.push(t("cli.doctor.library.body", { root: library.root }));
  lines.push(t("cli.doctor.system.body", system));
  return lines;
}

export const doctor: CommandHandler = async (context) => {
  const { platform, host } = context;
  const locations = templateLocations(platform, host);
  const settings = await readDoctorSettings(platform);
  const report = {
    cli: await cliInstallInfo(platform, host, context.env),
    supervisor: await supervisorPart(context),
    tools: await toolReport(context, locations, context.value("template")),
    library: { root: settings.libraryRoot ?? platform.paths.defaultLibrary },
    system: { os: platform.id, version: platform.system.release(), arch: platform.arch },
  };

  if (!context.flag("bundle")) {
    context.out.result(report, humanLines(context, report));
    return;
  }
  const { entries, files } = await collectBundle({ platform, report, system: report.system });
  // 默认写在系统临时目录；文件名带时间，反复导出不会盖掉上一份
  const stamp = new Date(context.host.clock.now()).toISOString().replace(/[-:]/g, "").slice(0, 15);
  const path = absPath(joinPath(host.tempDir, posixRelPath(`runyard-doctor-${stamp}.zip`)));
  await platform.fs.makeDir(host.tempDir);
  await platform.fs.writeFile(path, writeZip(entries));
  context.out.result({ bundle: path, files }, [context.t("cli.doctor.bundle.body", { path })]);
};
