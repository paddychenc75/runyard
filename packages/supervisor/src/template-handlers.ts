import { saveTemplate } from "@runyard/core";
import { absPath } from "@runyard/platform";
import { templateIdSchema } from "@runyard/protocol";
import { createAsyncMutex } from "./async-mutex.ts";
import type { HandlerMap } from "./dispatch.ts";
import type { LibraryContext } from "./library-context.ts";
import { methodFailure } from "./method-failure.ts";
import type { TemplateLibrary } from "./template-library.ts";

// 模板组方法（规格 templates/custom、cli/commands“模板命令”）。参数已按登记表校验；
// 但 template.save 的 as 登记表只要求非空，标识写法在这里校验，这样回的是规格要求的 NAME_INVALID 而不是 USAGE。

export function createTemplateHandlers(
  ctx: LibraryContext,
  templates: TemplateLibrary,
): HandlerMap {
  // 另存的“查重名、写临时目录、改名”不许交错：同一个标识同时另存两次，只有一次成功，另一次报 NAME_EXISTS
  const saving = createAsyncMutex();

  return {
    "template.list": () => templates.list(),
    "template.get": async ({ id }) => {
      const detail = await templates.get(id);
      if (detail === undefined) {
        throw methodFailure("TEMPLATE_NOT_FOUND", { template: id }, `no template ${id}`);
      }
      return detail;
    },
    "template.save": (params) =>
      saving.run(async () => {
        if (!templateIdSchema.safeParse(params.as).success) {
          throw methodFailure(
            "NAME_INVALID",
            { name: params.as, kind: "template" },
            `invalid template id: ${params.as}`,
          );
        }
        const { library } = await ctx.open();
        // 项目不存在、文件夹找不到分别报 PLAYGROUND_NOT_FOUND、FOLDER_MISSING
        const item = library.requireFolder(params.playground);
        const read = await library.readFile(item);
        if (read.status === "newer") {
          throw methodFailure(
            "DATA_FROM_NEWER_VERSION",
            { file: "playground.json", found: read.found, supported: read.supported },
            "playground.json was written by a newer version",
          );
        }
        if (read.status !== "ok") {
          throw methodFailure(
            "FOLDER_MISSING",
            { name: item.name },
            `playground.json is ${read.status}`,
          );
        }
        const file = read.value;
        return saveTemplate(ctx.api.platform, {
          projectDir: absPath(item.entry.path),
          projectName: item.name,
          userDir: templates.locations.userDir,
          reservedIds: await templates.builtinIds(),
          id: params.as,
          // 运行器和运行环境沿用项目里记下的，不重新检测
          runner: file.runner,
          requires: file.requires,
          ...(params.name === undefined ? {} : { name: params.name }),
          ...(params.description === undefined ? {} : { description: params.description }),
          ...(file.entry === undefined ? {} : { entry: file.entry }),
          ...(file.open === undefined ? {} : { open: file.open }),
          ...(params.replaceName === undefined ? {} : { replaceName: params.replaceName }),
          ...(params.include === undefined ? {} : { include: params.include }),
          ...(params.exclude === undefined ? {} : { exclude: params.exclude }),
        });
      }),
  };
}
