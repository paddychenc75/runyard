import type { TemplateRecord, TemplateRunnerSummary, ToolCheck } from "@runyard/protocol";
import type { DesktopError } from "../shared/library-state.ts";
import type {
  SaveTemplatePlanResult,
  SaveTemplateRequest,
  SaveTemplateResult,
  TemplateDetailView,
  TemplatePageRow,
  TemplateRunView,
  TemplateToolRow,
} from "../shared/templates-view.ts";
import type { LibraryClient } from "./controller-hosts.ts";
import { toDesktopError } from "./desktop-error.ts";
import { displayPath } from "./library-root.ts";
import { planProjectFiles } from "./save-template-plan.ts";

// 模板页和另存为模板弹窗背后的逻辑（规格 desktop/templates-view）。
// 数据都来自管理进程：template.list、template.get、toolchain.check（只读缓存）、template.save；
// 这里只做整理，不重新实现另存或检测。

export interface TemplatesViewHost {
  client: LibraryClient;
  /** 在访达里选中这个路径（只发请求） */
  reveal: (path: string) => void;
  home: string;
  /** 模板变了：重读资源库状态，选择器的“我的”分组据此更新 */
  refresh: () => Promise<void>;
}

const sourceKey = (record: Pick<TemplateRecord, "id" | "source">): string =>
  `${record.source}:${record.id}`;

export class TemplatesView {
  readonly #host: TemplatesViewHost;

  constructor(host: TemplatesViewHost) {
    this.#host = host;
  }

  /** 每次都重读：手写的模板放进约定位置后，再打开模板页就在（规格 DESKTOP-TEMPLATES-VIEW-01 的“不用重启”） */
  async list(): Promise<TemplatePageRow[]> {
    const records = await this.#host.client.call("template.list", {});
    // 重读选择器用的状态：手写的模板同样要进选择器的“我的”分组
    void this.#host.refresh();
    return Promise.all(records.map((record) => this.#rowOf(record)));
  }

  async #rowOf(record: TemplateRecord): Promise<TemplatePageRow> {
    return {
      key: sourceKey(record),
      id: record.id,
      source: record.source,
      name: record.name,
      description: record.description,
      category: record.source === "user" ? "mine" : record.category,
      valid: record.valid,
      unmaintained: record.tags.includes("unmaintained"),
      problem: record.valid ? null : await this.#problemOf(record),
    };
  }

  async #problemOf(record: TemplateRecord): Promise<TemplatePageRow["problem"]> {
    const detail = await this.#host.client
      .call("template.get", { id: record.id })
      .catch(() => undefined);
    // 管理进程按标识取模板时内置的优先：取到的不是这份，说明它是被内置的标识挡住的
    if (detail === undefined || detail.template.source !== record.source) {
      return { rule: "template-id-reserved", path: "id" };
    }
    return detail.problems[0] ?? null;
  }

  async #cachedTools(id: string): Promise<ToolCheck[]> {
    // 只读缓存：打开详情不触发任何检测（规格 DESKTOP-TEMPLATES-VIEW-04）；读不到就当都没检测过
    const report = await this.#host.client
      .call("toolchain.check", { template: id, cachedOnly: true })
      .catch(() => undefined);
    return report?.tools ?? [];
  }

  async detail(id: string, source: "builtin" | "user"): Promise<TemplateDetailView | null> {
    const found = await this.#host.client.call("template.get", { id }).catch(() => undefined);
    if (found === undefined || found.template.source !== source) return null;
    const checks = await this.#cachedTools(id);
    const tools: TemplateToolRow[] = Object.entries(found.template.requires).map(([tool, need]) => {
      const check = checks.find((candidate) => candidate.tool === tool);
      return {
        tool,
        required: need.version,
        fallback: need.fallback ?? null,
        version: check?.version ?? null,
        status: check?.status ?? "unknown",
      };
    });
    return {
      row: await this.#rowOf(found.template),
      tags: found.template.tags,
      path: found.path,
      tools,
      run: runViewOf(found.runner, checks),
      files: found.files,
    };
  }

  async reveal(id: string, source: "builtin" | "user"): Promise<void> {
    const found = await this.#host.client.call("template.get", { id }).catch(() => undefined);
    if (found !== undefined && found.template.source === source) this.#host.reveal(found.path);
  }

  async savePlan(playgroundId: string): Promise<SaveTemplatePlanResult> {
    try {
      const playground = (await this.#host.client.call("playground.list", {})).find(
        (candidate) => candidate.id === playgroundId,
      );
      if (playground === undefined) return notFound(playgroundId);
      if (playground.missingSince !== undefined) {
        return { ok: false, error: { code: "FOLDER_MISSING", params: { name: playground.name } } };
      }
      const folder = playground.path;
      const [records, plan] = await Promise.all([
        this.#host.client.call("template.list", {}),
        planProjectFiles(folder),
      ]);
      const original = records.find(
        (record) =>
          record.id === playground.template.id && record.source === playground.template.source,
      );
      return {
        ok: true,
        plan: {
          projectName: playground.name,
          files: plan.files,
          excluded: plan.excluded,
          templateName: original?.name ?? null,
          requires: Object.entries(original?.requires ?? {}).map(([tool, need]) => ({
            tool,
            version: need.version,
          })),
          takenIds: records.map((record) => record.id),
          userDir: displayPath(userTemplatesDir(this.#host.home), this.#host.home),
        },
      };
    } catch (error) {
      return { ok: false, error: toDesktopError(error) };
    }
  }

  async save(request: SaveTemplateRequest): Promise<SaveTemplateResult> {
    try {
      const saved = await this.#host.client.call("template.save", {
        playground: request.playground,
        as: request.id,
        name: request.name.trim() === "" ? request.id : request.name.trim(),
        description: request.description.trim(),
        replaceName: request.replaceName,
        include: request.include,
        exclude: request.exclude,
      });
      await this.#host.refresh();
      return { ok: true, id: saved.id };
    } catch (error) {
      return { ok: false, error: toDesktopError(error) };
    }
  }
}

function notFound(playgroundId: string): { ok: false; error: DesktopError } {
  return { ok: false, error: { code: "PLAYGROUND_NOT_FOUND", params: { name: playgroundId } } };
}

// 用户模板放在状态目录下的 templates/（storage.md 第 1 节），状态目录是主目录下的 .runyard；
// 只用来在弹窗底部写“保存位置”，真正的位置由管理进程定，保存结果里带它
function userTemplatesDir(home: string): string {
  return `${home.endsWith("/") ? home.slice(0, -1) : home}/.runyard/templates`;
}

function runViewOf(
  runner: TemplateRunnerSummary | null,
  checks: readonly ToolCheck[],
): TemplateRunView | null {
  if (runner === null) return null;
  // 有几种包管理器的安装命令时，先写本机检测到的那一种，都没检测到就写第一种
  const variants = Object.entries(runner.setup);
  const detected = variants.find(([tool]) =>
    checks.some((check) => check.tool === tool && check.status === "found"),
  );
  const install = detected ?? variants[0];
  return {
    install: install === undefined ? null : install[1].join(" "),
    start: runner.run === null ? null : runner.run.join(" "),
    ready: runner.ready,
  };
}
