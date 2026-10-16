import type { HandlerMap } from "./dispatch.ts";
import type { LibraryContext } from "./library-context.ts";
import type { LibraryService } from "./library-service.ts";
import { methodFailure } from "./method-failure.ts";

// 资源库、设置、模板（读）、自动清理的方法登记。参数已按登记表校验；失败抛 MethodFailure 或 core 的 LibraryError。

export function createLibraryHandlers(ctx: LibraryContext, service: LibraryService): HandlerMap {
  return {
    "playground.list": ({ filter }) => service.list(filter),
    "playground.get": ({ playground }) => service.get(playground),
    "playground.create": (params) => service.create(params),
    "playground.rename": ({ playground, newName }) => service.rename(playground, newName),
    "playground.update": (params) => service.update(params),
    "playground.trash": ({ playground }) => service.trash(playground),
    "playground.relocate": ({ playground, path }) => service.relocate(playground, path),
    "playground.forget": async ({ playground }) => {
      await service.forget(playground);
      return {};
    },
    "playground.released": ({ playgroundId }, { session }) => {
      ctx.release.released(session.id, playgroundId);
      return {};
    },
    "library.rescan": async () => {
      await service.rescan();
      return {};
    },
    "clean.due": () => service.due(),
    "clean.ackReminder": async ({ playgroundId }) => {
      await service.ackReminder(playgroundId);
      return {};
    },
    "clean.keep": async ({ playgroundId }) => {
      await service.keep(playgroundId);
      return {};
    },
    "settings.get": () => ctx.settings.get(),
    "settings.set": async (patch) => {
      const settings = await ctx.settings.set(patch);
      ctx.api.publish("settings.changed", {});
      return settings;
    },
    "template.list": async () => [...((await ctx.seams().templates?.list()) ?? [])],
    "template.get": async ({ id }) => {
      const detail = await ctx.seams().templates?.get(id);
      if (detail === undefined) {
        throw methodFailure("TEMPLATE_NOT_FOUND", { template: id }, `no template ${id}`);
      }
      return detail;
    },
  };
}
